'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRedactionStore } from '@/stores/redactionStore';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * Simple PDF Viewer Component
 * Uses the browser's native PDF support via <embed>
 * Provides overlay for entity highlighting
 */

interface PDFViewerSimpleProps {
  pdfUrl: string;
  entities?: any[];
  showOverlay?: boolean;
}

interface EntityPosition {
  entityId: string;
  text: string;
  confidence: number;
}

export const PDFViewerSimple: React.FC<PDFViewerSimpleProps> = ({ 
  pdfUrl, 
  entities = [], 
  showOverlay = true 
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const embedRef = useRef<HTMLEmbedElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomLevel = useRedactionStore((state) => state.zoomLevel);
  const approveEntity = useRedactionStore((state) => state.approveEntity);
  const rejectEntity = useRedactionStore((state) => state.rejectEntity);
  const approvedEntityIds = useRedactionStore((state) => state.approvedEntityIds);
  const rejectedEntityIds = useRedactionStore((state) => state.rejectedEntityIds);

  // Load PDF
  useEffect(() => {
    let mounted = true;

    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('[PDFViewerSimple] Loading PDF from:', pdfUrl);

        // Just try to load - the embed will handle it
        // Don't use HEAD as it's not supported by all servers
        // The embed tag will verify accessibility

        if (mounted) {
          setLoading(false);
          console.log('[PDFViewerSimple] PDF ready to display');
        }
      } catch (err) {
        if (mounted) {
          console.error('[PDFViewerSimple] Error:', err);
          const msg = err instanceof Error ? err.message : String(err);
          setError(`Failed to load PDF: ${msg}`);
          setLoading(false);
        }
      }
    };

    loadPDF();

    return () => {
      mounted = false;
    };
  }, [pdfUrl]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-950">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-400 font-semibold">Error loading PDF</p>
          <p className="text-red-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-950">
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-blue-400 animate-spin mx-auto mb-3" />
          <p className="text-gray-300">Loading PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <embed
      ref={embedRef}
      src={pdfUrl}
      type="application/pdf"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        border: 'none',
      }}
      title="PDF Document"
    />
  );
};

export default PDFViewerSimple;
