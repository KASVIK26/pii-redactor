'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRedactionStore } from '@/stores/redactionStore';
import { Loader2, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

interface PDFViewerProps {
  pdfUrl: string;
  entities?: any[];
  showOverlay?: boolean;
}

interface TextItem {
  str: string;
  x0: number;
  y0: number;
  width: number;
  height: number;
}

interface EntityPosition {
  entityId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  confidence: number;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ pdfUrl, entities = [], showOverlay = true }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [entityPositions, setEntityPositions] = useState<EntityPosition[]>([]);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const currentPage = useRedactionStore((state) => state.currentPage);
  const zoomLevel = useRedactionStore((state) => state.zoomLevel);
  const approveEntity = useRedactionStore((state) => state.approveEntity);
  const rejectEntity = useRedactionStore((state) => state.rejectEntity);
  const approvedEntityIds = useRedactionStore((state) => state.approvedEntityIds);
  const rejectedEntityIds = useRedactionStore((state) => state.rejectedEntityIds);

  // Load PDF document
  useEffect(() => {
    let mounted = true;

    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('[PDFViewer] Loading PDF from:', pdfUrl);

        // Set worker source JUST before loading - critical!
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          try {
            // Try to use the bundled worker from the library
            const workerBlob = new Blob(
              [
                `importScripts("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.11.0/pdf.worker.min.js");`,
              ],
              { type: 'application/javascript' }
            );
            const workerUrl = URL.createObjectURL(workerBlob);
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            console.log('[PDFViewer] Worker initialized');
          } catch (workerErr) {
            console.warn('[PDFViewer] Worker initialization warning:', workerErr);
          }
        }

        // Fetch PDF as array buffer
        const response = await fetch(pdfUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log('[PDFViewer] PDF fetched, size:', arrayBuffer.byteLength);

        if (!mounted) return;

        // Load PDF document
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        console.log('[PDFViewer] PDF loaded, pages:', pdf.numPages);

        if (mounted) {
          setPdfDocument(pdf);
          setNumPages(pdf.numPages);
          setCurrentPageIndex(0);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          console.error('[PDFViewer] Error loading PDF:', err);
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

  // Render current page to canvas
  useEffect(() => {
    if (!pdfDocument || !pageCanvasRef.current) return;

    let isMounted = true;

    const renderPage = async () => {
      try {
        const page = await pdfDocument.getPage(currentPageIndex + 1);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        const canvas = pageCanvasRef.current!;
        const context = canvas.getContext('2d')!;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        await page.render(renderContext).promise;

        // Extract text and positions for entity matching
        const textContent = await page.getTextContent();
        const items = (textContent.items as any[] || []).filter((item: any): item is TextItem => 
          'str' in item && 'x0' in item && 'y0' in item && 'width' in item && 'height' in item
        );

        console.log('[PDFViewer] Page rendered, extracted', items.length, 'text items');

        // Calculate entity positions based on text matching
        if (isMounted && showOverlay && entities.length > 0) {
          const positions = findEntityPositions(items, entities, viewport.height, viewport.width);
          setEntityPositions(positions);
        }
      } catch (err) {
        console.error('[PDFViewer] Error rendering page:', err);
      }
    };

    renderPage();

    return () => {
      isMounted = false;
    };
  }, [pdfDocument, currentPageIndex, entities, showOverlay]);

  // Find entity positions in extracted text
  const findEntityPositions = (
    textItems: TextItem[],
    entities: any[],
    viewportHeight: number,
    viewportWidth: number
  ): EntityPosition[] => {
    const positions: EntityPosition[] = [];

    // Build full text and character to position mapping
    let fullText = '';
    const charPositions: Array<{ item: TextItem; charIndex: number }> = [];

    textItems.forEach((item) => {
      const startIndex = fullText.length;
      fullText += item.str;

      for (let i = 0; i < item.str.length; i++) {
        charPositions.push({ item, charIndex: i });
      }
    });

    console.log('[findEntityPositions] Full text length:', fullText.length);
    console.log('[findEntityPositions] Looking for', entities.length, 'entities');

    // Search for each entity in the text
    entities.forEach((entity) => {
      const searchText = entity.text.toLowerCase();
      let searchIndex = fullText.toLowerCase().indexOf(searchText);

      if (searchIndex !== -1) {
        console.log(`[findEntityPositions] Found entity "${entity.text}" at index ${searchIndex}`);

        // Get first and last character positions
        const firstCharPos = charPositions[searchIndex];
        const lastCharPos = charPositions[searchIndex + entity.text.length - 1];

        if (firstCharPos && lastCharPos) {
          const x0 = firstCharPos.item.x0;
          const y0 = firstCharPos.item.y0;
          const x1 = lastCharPos.item.x0 + lastCharPos.item.width;
          const y1 = lastCharPos.item.y0 + lastCharPos.item.height;

          positions.push({
            entityId: entity.id,
            x: x0,
            y: y0,
            width: x1 - x0,
            height: y1 - y0,
            text: entity.text,
            confidence: entity.confidence || 1,
          });
        }
      } else {
        console.log(`[findEntityPositions] Entity "${entity.text}" NOT found in page text`);
      }
    });

    console.log('[findEntityPositions] Found', positions.length, 'entity positions');
    return positions;
  };

  // Draw overlay with entity boxes
  useEffect(() => {
    if (!overlayCanvasRef.current || !pageCanvasRef.current) return;

    const overlayCanvas = overlayCanvasRef.current;
    const pageCanvas = pageCanvasRef.current;

    overlayCanvas.width = pageCanvas.width;
    overlayCanvas.height = pageCanvas.height;

    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    console.log('[RedactionOverlay] Drawing', entityPositions.length, 'entity boxes');

    // Draw entity boxes
    entityPositions.forEach((pos) => {
      const isApproved = approvedEntityIds.has(pos.entityId);
      const isRejected = rejectedEntityIds.has(pos.entityId);

      // Determine color
      let color: string;
      let opacity: number;

      if (isApproved) {
        color = '#10b981'; // Green
        opacity = 0.4;
      } else if (isRejected) {
        color = '#ef4444'; // Red
        opacity = 0.4;
      } else {
        color = '#f59e0b'; // Amber
        opacity = 0.3;
      }

      // Draw filled box
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      ctx.fillRect(pos.x, pos.y, pos.width, pos.height);

      // Draw border
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);

      // Draw label
      ctx.font = '10px sans-serif';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.fillText(pos.text.substring(0, 20), pos.x + 2, pos.y - 2);
    });

    ctx.globalAlpha = 1;
  }, [entityPositions, approvedEntityIds, rejectedEntityIds]);

  // Handle overlay canvas click
  const handleOverlayClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!overlayCanvasRef.current) return;

    const rect = overlayCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find clicked entity
    const clicked = entityPositions.find(
      (pos) =>
        x >= pos.x &&
        x <= pos.x + pos.width &&
        y >= pos.y &&
        y <= pos.y + pos.height
    );

    if (clicked) {
      console.log('[PDFViewer] Clicked entity:', clicked.entityId);
      if (approvedEntityIds.has(clicked.entityId)) {
        rejectEntity(clicked.entityId);
      } else {
        approveEntity(clicked.entityId);
      }
    }
  };

  // Handle pagination
  const goToPreviousPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPageIndex < numPages - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-900 w-full">
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
    <div className="flex flex-col items-center justify-start h-full w-full bg-slate-950 p-4 overflow-auto">
      {/* PDF Viewer with Overlay */}
      <div
        ref={scrollContainerRef}
        className="relative inline-block border border-slate-700 mb-4"
        style={{
          transform: `scale(${zoomLevel / 100})`,
          transformOrigin: 'top center',
          transition: 'transform 0.15s ease-out',
        }}
      >
        {/* Page Canvas */}
        <canvas
          ref={pageCanvasRef}
          className="block bg-white"
          title="PDF Page"
        />

        {/* Overlay Canvas */}
        {showOverlay && (
          <canvas
            ref={overlayCanvasRef}
            className="absolute top-0 left-0"
            onClick={handleOverlayClick}
            title="Click to approve/reject entities"
            style={{ cursor: entityPositions.length > 0 ? 'pointer' : 'default' }}
          />
        )}
      </div>

      {/* No Entities Message */}
      {showOverlay && entities.length === 0 && (
        <div className="text-center py-4 text-gray-400">
          <p className="text-sm">No entities detected in this document</p>
        </div>
      )}

      {/* Pagination Controls */}
      {numPages > 1 && (
        <div className="flex items-center gap-4 mt-4">
          <button
            onClick={goToPreviousPage}
            disabled={currentPageIndex === 0}
            className="p-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title="Previous page"
          >
            <ChevronUp className="h-5 w-5 text-gray-300" />
          </button>

          <div className="text-gray-300 text-sm">
            Page {currentPageIndex + 1} of {numPages}
          </div>

          <button
            onClick={goToNextPage}
            disabled={currentPageIndex === numPages - 1}
            className="p-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            title="Next page"
          >
            <ChevronDown className="h-5 w-5 text-gray-300" />
          </button>
        </div>
      )}

      {/* Entity Count */}
      {showOverlay && (
        <div className="mt-4 text-sm text-gray-400">
          Found {entities.length} entities • Approved: {approvedEntityIds.size} • Pending: {entities.length - approvedEntityIds.size - rejectedEntityIds.size}
        </div>
      )}
    </div>
  );
};

export default PDFViewer;
