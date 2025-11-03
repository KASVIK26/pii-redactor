/**
 * Live Redaction Editor Container
 * Main component that brings together PDF viewer, entity overlay, and sidebar
 */

'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { PDFViewerSimple } from '@/components/PDFViewerSimple';
import { EntityOverlay } from '@/components/EntityOverlay';
import { EntityListSidebar } from '@/components/EntityListSidebar';
import { useRedactionStore } from '@/stores/redactionStore';
import { Entity } from '@/types/redaction';
import { Button } from '@/components/ui/button';
import {
  AlertCircle,
  FileCheck,
  Undo2,
  Redo2,
  X,
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';

interface LiveRedactionEditorProps {
  documentId: string;
  pdfUrl: string;
  entities: Entity[];
  accessToken: string;
  onRedactionComplete?: (result: any) => void;
  onCancel?: () => void;
}

export const LiveRedactionEditor: React.FC<LiveRedactionEditorProps> = ({
  documentId,
  pdfUrl,
  entities,
  accessToken,
  onRedactionComplete,
  onCancel,
}) => {
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [redactionStats, setRedactionStats] = useState<{ totalRedacted: number; processingTimeMs: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const entitiesLoadedRef = useRef(false);

  // Use individual selectors for store values to prevent circular re-renders
  const currentPage = useRedactionStore((state) => state.currentPage);
  const totalPages = useRedactionStore((state) => state.totalPages);
  const zoomLevel = useRedactionStore((state) => state.zoomLevel);
  
  // Get functions from store (these don't change, so safe to select once)
  const undo = useRedactionStore((state) => state.undo);
  const redo = useRedactionStore((state) => state.redo);
  const canUndo = useRedactionStore((state) => state.canUndo);
  const canRedo = useRedactionStore((state) => state.canRedo);
  const getTotalRedactions = useRedactionStore((state) => state.getTotalRedactions);

  // Track approved and custom redaction counts to update totalRedactions when they change
  const approvedCount = useRedactionStore((state) => state.approvedEntityIds.size);
  const customCount = useRedactionStore((state) => state.customRedactions.size);

  // Memoize the total redactions calculation to prevent re-renders
  // Dependencies: [approvedCount, customCount] ensures recalculation when redactions change
  const totalRedactions = React.useMemo(() => getTotalRedactions(), [approvedCount, customCount]);

  // Track container size
  useEffect(() => {
    const handleResize = () => {
      if (pdfContainerRef.current) {
        const rect = pdfContainerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize store with entities when component mounts or entities change
  useEffect(() => {
    if (entities && entities.length > 0 && !entitiesLoadedRef.current) {
      console.log('[LiveRedactionEditor] Loading entities into store:', entities.length);
      useRedactionStore.getState().loadEntities(entities);
      entitiesLoadedRef.current = true;
    }
  }, [entities]);

  // Apply redaction
  const handleApplyRedaction = useCallback(async () => {
    try {
      setIsApplying(true);
      setError(null);

      // Get current state from store at call time
      const storeState = useRedactionStore.getState();
      const approvedEntities = storeState.getApprovedEntities();
      const customRedactionsList = Array.from(storeState.customRedactions.values());

      console.log('[LiveRedactionEditor] Applying redaction:', {
        documentId,
        approvedCount: approvedEntities.length,
        customCount: customRedactionsList.length,
      });

      const url = `http://localhost:8000/api/documents/${documentId}/apply-redaction`;
      console.log('[LiveRedactionEditor] Calling endpoint:', url);
      console.log('[LiveRedactionEditor] Auth token:', accessToken ? `Bearer ${accessToken.substring(0, 20)}...` : 'NO TOKEN');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          documentId,
          approvedEntityIds: approvedEntities.map((e) => e.id),
          customRedactions: customRedactionsList.map((c) => ({
            page: c.page,
            bbox: c.bbox,
            type: c.type,
            label: c.label,
          })),
        }),
      });

      console.log('[LiveRedactionEditor] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const text = await response.text();
        console.error('[LiveRedactionEditor] Error response:', text);
        try {
          const errData = JSON.parse(text);
          throw new Error(errData.detail || `HTTP ${response.status}: ${response.statusText}`);
        } catch {
          throw new Error(`HTTP ${response.status}: ${text}`);
        }
      }

      const result = await response.json();
      console.log('[LiveRedactionEditor] Redaction applied successfully:', result);
      
      // Trigger download of redacted PDF if download URL is available
      if (result.downloadUrl) {
        console.log('[LiveRedactionEditor] Downloading redacted document from:', result.downloadUrl);
        const downloadUrl = `http://localhost:8000${result.downloadUrl}`;
        
        try {
          // Fetch the file with authorization header
          console.log('[LiveRedactionEditor] Fetching redacted PDF with auth token...');
          const downloadResponse = await fetch(downloadUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/pdf'
            }
          });
          
          if (!downloadResponse.ok) {
            throw new Error(`Download failed with status ${downloadResponse.status}: ${downloadResponse.statusText}`);
          }
          
          // Convert response to blob and trigger download
          const blob = await downloadResponse.blob();
          console.log('[LiveRedactionEditor] Download complete. Blob size:', blob.size);
          
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `redacted_${documentId}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
          
          console.log('[LiveRedactionEditor] File downloaded successfully');
        } catch (downloadErr) {
          const msg = downloadErr instanceof Error ? downloadErr.message : 'Failed to download redacted PDF';
          console.error('[LiveRedactionEditor] Download error:', msg);
          console.warn('Download failed but redaction was applied:', msg);
        }
      }
      
      // Show success modal
      setError(null);
      setRedactionStats(result.stats || { totalRedacted: 0, processingTimeMs: 0 });
      setShowSuccessModal(true);
      
      onRedactionComplete?.(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to apply redaction';
      setError(msg);
      console.error('[LiveRedactionEditor] Error:', err);
    } finally {
      setIsApplying(false);
    }
  }, [documentId, accessToken, onRedactionComplete]);

  const handleZoomIn = () => {
    useRedactionStore.setState((state) => ({
      zoomLevel: Math.min(3, state.zoomLevel + 0.2),
    }));
  };

  const handleZoomOut = () => {
    useRedactionStore.setState((state) => ({
      zoomLevel: Math.max(0.5, state.zoomLevel - 0.2),
    }));
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      useRedactionStore.getState().setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      useRedactionStore.getState().setCurrentPage(currentPage + 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-gray-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-white">Redaction Editor</h1>
            <p className="text-xs text-gray-400">college_receipt.pdf</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {error && (
            <div className="bg-red-900/20 border border-red-700 text-red-200 px-3 py-1 rounded-md text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Error
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-md">
            <span className="text-xs font-semibold text-blue-400">{totalRedactions}</span>
            <span className="text-xs text-gray-400">to apply</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer Area */}
        <div className="flex-1 flex flex-col bg-slate-950 relative">
          {/* PDF Container */}
          <div
            ref={pdfContainerRef}
            className="flex-1 overflow-auto flex items-center justify-center relative bg-gradient-to-br from-slate-950 to-slate-900"
          >
            <PDFViewerSimple 
              pdfUrl={pdfUrl} 
              entities={entities}
              showOverlay={true}
            />
          </div>

          {/* Bottom Toolbar - PDF Controls */}
          <div className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex items-center justify-between">
            {/* Left: Page Navigation */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevPage}
                disabled={currentPage === 0}
                className="text-gray-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>

              <div className="bg-slate-800 rounded-md px-4 py-2">
                <span className="text-sm font-medium text-white">
                  {currentPage + 1} <span className="text-gray-500">/</span> {totalPages}
                </span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage === totalPages - 1}
                className="text-gray-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            {/* Center: Zoom Controls */}
            <div className="flex items-center gap-2 bg-slate-800 rounded-md p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                className="text-gray-400 hover:text-white hover:bg-slate-700"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <div className="bg-slate-700 rounded px-3 py-1 text-xs font-semibold text-white min-w-[50px] text-center">
                {Math.round(zoomLevel * 100)}%
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomIn}
                className="text-gray-400 hover:text-white hover:bg-slate-700"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            {/* Right: Editor Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={undo}
                disabled={!canUndo()}
                className="text-gray-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                title="Undo"
              >
                <Undo2 className="h-5 w-5" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={redo}
                disabled={!canRedo()}
                className="text-gray-400 hover:text-white hover:bg-slate-800 disabled:opacity-30"
                title="Redo"
              >
                <Redo2 className="h-5 w-5" />
              </Button>

              <div className="w-px h-6 bg-slate-700" />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="text-gray-400 hover:text-white hover:bg-slate-800"
                title="Toggle Sidebar"
              >
                <Maximize2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div
          className={`bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden transition-all duration-300 ${
            sidebarOpen ? 'w-96' : 'w-0'
          }`}
        >
          {sidebarOpen && (
            <>
              <div className="border-b border-slate-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Review Entities</h2>
                <p className="text-xs text-gray-400 mt-1">{entities.length} detected</p>
              </div>
              <div className="flex-1 overflow-hidden">
                <EntityListSidebar entities={entities} />
              </div>

              {/* Sidebar Footer - Apply Button */}
              <div className="border-t border-slate-800 p-4 space-y-2 bg-slate-800/50">
                <Button
                  onClick={handleApplyRedaction}
                  disabled={isApplying || totalRedactions === 0}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <FileCheck className="h-4 w-4" />
                      Apply Redactions
                    </>
                  )}
                </Button>
                <Button
                  onClick={onCancel}
                  variant="outline"
                  className="w-full text-gray-300 border-slate-700 hover:bg-slate-800"
                  disabled={isApplying}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error Modal */}
      {error && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-red-700 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-white">Error</h3>
            </div>
            <p className="text-gray-300 mb-6">{error}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
              <Button
                onClick={handleApplyRedaction}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Retry
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-green-700 rounded-lg p-8 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <FileCheck className="h-6 w-6 text-green-500" />
              <h3 className="text-lg font-semibold text-white">Success!</h3>
            </div>
            <div className="space-y-3 text-gray-300 mb-6">
              <p className="font-medium">✅ Redaction applied successfully!</p>
              <p>Redacted PDF has been downloaded.</p>
              {redactionStats && (
                <div className="bg-slate-800/50 rounded p-3 space-y-1 text-sm">
                  <p>📊 <span className="text-gray-400">Entities redacted:</span> <span className="text-green-400 font-semibold">{redactionStats.totalRedacted}</span></p>
                  <p>⏱️ <span className="text-gray-400">Processing time:</span> <span className="text-green-400 font-semibold">{redactionStats.processingTimeMs}ms</span></p>
                </div>
              )}
            </div>
            <Button
              onClick={() => {
                setShowSuccessModal(false);
                onCancel?.();
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              OK
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveRedactionEditor;
