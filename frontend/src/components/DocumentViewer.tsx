'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Button } from '@/components/ui/button'
import InteractiveRedactionOverlay from './InteractiveRedactionOverlay'
import PdfErrorBoundary from './PdfErrorBoundary'
import { setupPdfWorker, setupPdfWorkerFallback, resetPdfWorker } from '@/lib/pdfSetup'
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  Maximize2,
  Minimize2
} from 'lucide-react'

interface DocumentViewerProps {
  documentUrl: string
  fileType: string
  entities?: Array<{
    id?: string
    text: string
    label: string
    start_pos: number
    end_pos: number
    bounding_box?: {
      x: number
      y: number
      width: number
      height: number
    }
    page?: number
    user_approved?: boolean | null
    is_redacted?: boolean
  }>
  showRedacted?: boolean
  zoom?: number
  isEditing?: boolean
  selectedTool?: 'select' | 'redact' | 'move' | 'erase'
  onEntityClick?: (entityId: string) => void
  onZoomChange?: (zoom: number) => void
  onEntityUpdate?: (entityId: string, updates: any) => void
  onEntityDelete?: (entityId: string) => void
  onEntityAdd?: (entity: any) => void
}

export default function DocumentViewer({
  documentUrl,
  fileType,
  entities = [],
  showRedacted = false,
  zoom = 100,
  isEditing = false,
  selectedTool = 'select',
  onEntityClick,
  onZoomChange,
  onEntityUpdate,
  onEntityDelete,
  onEntityAdd
}: DocumentViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 })
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({})

  // Setup PDF worker on component mount
  useEffect(() => {
    setupPdfWorker()
  }, [])

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoading(false)
    setError(null)
  }, [])

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF Load Error:', error)
    
    // Check if it's a worker-related error and try to reinitialize
    if (error.message.includes('Worker') || error.message.includes('GlobalWorkerOptions') || error.message.includes('defineProperty')) {
      try {
        // Use fallback worker configuration
        setupPdfWorkerFallback()
        // Retry loading after a short delay
        setTimeout(() => {
          setError(null)
          setLoading(true)
          // Force re-render by updating state
          setCurrentPage(prev => prev)
        }, 1000)
        return
      } catch (workerError) {
        console.error('Worker reinitialize failed:', workerError)
      }
    }
    
    setError(`Failed to load document: ${error.message}`)
    setLoading(false)
  }, [])

  const handleZoomIn = () => {
    const newZoom = Math.min(200, zoom + 25)
    onZoomChange?.(newZoom)
  }

  const handleZoomOut = () => {
    const newZoom = Math.max(25, zoom - 25)
    onZoomChange?.(newZoom)
  }

  const handlePreviousPage = () => {
    setCurrentPage(Math.max(1, currentPage - 1))
  }

  const handleNextPage = () => {
    setCurrentPage(Math.min(numPages, currentPage + 1))
  }

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  // Convert entities to redaction boxes
  const redactionBoxes = entities
    .filter(entity => entity.page === currentPage || (!entity.page && currentPage === 1))
    .map(entity => ({
      id: entity.id || `${entity.start_pos}-${entity.end_pos}`,
      x: entity.bounding_box?.x || 100,
      y: entity.bounding_box?.y || 100 + (entities.indexOf(entity) * 60),
      width: entity.bounding_box?.width || 150,
      height: entity.bounding_box?.height || 40,
      entityId: entity.id,
      text: entity.text,
      label: entity.label,
      isRedacted: entity.is_redacted || false,
      user_approved: entity.user_approved
    }))

  const handleBoxUpdate = useCallback((boxId: string, updates: any) => {
    const entity = entities.find(e => (e.id || `${e.start_pos}-${e.end_pos}`) === boxId)
    if (entity?.id && onEntityUpdate) {
      onEntityUpdate(entity.id, {
        ...updates,
        bounding_box: {
          x: updates.x || entity.bounding_box?.x || 0,
          y: updates.y || entity.bounding_box?.y || 0,
          width: updates.width || entity.bounding_box?.width || 100,
          height: updates.height || entity.bounding_box?.height || 40
        }
      })
    }
  }, [entities, onEntityUpdate])

  const handleBoxDelete = useCallback((boxId: string) => {
    const entity = entities.find(e => (e.id || `${e.start_pos}-${e.end_pos}`) === boxId)
    if (entity?.id && onEntityDelete) {
      onEntityDelete(entity.id)
    }
  }, [entities, onEntityDelete])

  const handleBoxSelect = useCallback((boxId: string | null) => {
    if (boxId) {
      const entity = entities.find(e => (e.id || `${e.start_pos}-${e.end_pos}`) === boxId)
      if (entity?.id && onEntityClick) {
        onEntityClick(entity.id)
      }
    }
  }, [entities, onEntityClick])

  const handleAddBox = useCallback((box: any) => {
    if (onEntityAdd) {
      onEntityAdd({
        text: box.text,
        label: box.label,
        start_pos: 0,
        end_pos: 0,
        is_redacted: box.isRedacted,
        user_approved: box.user_approved,
        bounding_box: {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height
        }
      })
    }
  }, [onEntityAdd])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-red-600">
          <p className="text-lg font-semibold mb-2">Error Loading Document</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    )
  }

  // Handle image files
  if (fileType !== 'pdf') {
    return (
      <div 
        ref={containerRef}
        className={`relative ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'h-full'} overflow-auto`}
      >
        {/* Controls */}
        <div className="absolute top-4 left-4 z-10 flex items-center space-x-2 bg-white rounded-lg shadow-lg p-2">
          <Button variant="outline" size="sm" onClick={handleZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm px-2 py-1 bg-gray-100 rounded min-w-[60px] text-center">
            {zoom}%
          </span>
          <Button variant="outline" size="sm" onClick={handleZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>

        {/* Image with overlays */}
        <div className="relative inline-block">
          <img
            src={documentUrl}
            alt="Document"
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top left',
            }}
            className="max-w-none"
            onLoad={(e) => {
              const img = e.target as HTMLImageElement
              setContainerDimensions({ width: img.naturalWidth, height: img.naturalHeight })
            }}
          />
          <InteractiveRedactionOverlay
            boxes={redactionBoxes}
            zoom={zoom}
            isEditing={isEditing}
            selectedTool={selectedTool}
            showRedacted={showRedacted}
            onBoxUpdate={handleBoxUpdate}
            onBoxDelete={handleBoxDelete}
            onBoxSelect={handleBoxSelect}
            onAddBox={handleAddBox}
            containerWidth={containerDimensions.width}
            containerHeight={containerDimensions.height}
          />
        </div>
      </div>
    )
  }

  // Handle PDF files
  return (
    <div 
      ref={containerRef}
      className={`relative ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : 'h-full'} overflow-auto`}
    >
      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center space-x-2 bg-white rounded-lg shadow-lg p-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handlePreviousPage}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm px-2 py-1 bg-gray-100 rounded min-w-[80px] text-center">
          {currentPage} / {numPages}
        </span>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleNextPage}
          disabled={currentPage >= numPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-gray-300 mx-2" />
        <Button variant="outline" size="sm" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-sm px-2 py-1 bg-gray-100 rounded min-w-[60px] text-center">
          {zoom}%
        </span>
        <Button variant="outline" size="sm" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>

      {/* PDF Document */}
      <div className="pt-16">
        <PdfErrorBoundary
          onRetry={() => {
            resetPdfWorker()
            setupPdfWorker()
            setError(null)
            setLoading(true)
          }}
        >
          <Document
            file={documentUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            }
          >
            <div className="relative inline-block">
              <Page
                pageNumber={currentPage}
                scale={zoom / 100}
                renderTextLayer={!showRedacted}
                renderAnnotationLayer={false}
                onRenderSuccess={(page) => {
                  // Update container dimensions based on PDF page
                  setContainerDimensions({ 
                    width: page.width, 
                    height: page.height 
                  })
                }}
              />
              <InteractiveRedactionOverlay
                boxes={redactionBoxes}
                zoom={zoom}
                isEditing={isEditing}
                selectedTool={selectedTool}
                showRedacted={showRedacted}
                onBoxUpdate={handleBoxUpdate}
                onBoxDelete={handleBoxDelete}
                onBoxSelect={handleBoxSelect}
                onAddBox={handleAddBox}
                containerWidth={containerDimensions.width}
                containerHeight={containerDimensions.height}
              />
            </div>
          </Document>
        </PdfErrorBoundary>
      </div>

      {/* Page thumbnails for multi-page PDFs */}
      {numPages > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 bg-white rounded-lg shadow-lg p-2 max-w-xs overflow-x-auto">
          <div className="flex space-x-2">
            {Array.from({ length: numPages }, (_, index) => index + 1).map(pageNum => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`flex-shrink-0 w-12 h-16 border-2 rounded text-xs flex items-center justify-center transition-colors ${
                  currentPage === pageNum 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-gray-300 hover:border-gray-400 bg-white'
                }`}
              >
                {pageNum}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}