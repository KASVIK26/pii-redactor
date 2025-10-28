'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import InteractiveRedactionOverlay from './InteractiveRedactionOverlay'
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut,
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
  const [pageCanvases, setPageCanvases] = useState<{ [key: number]: HTMLCanvasElement | null }>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const pdfDocRef = useRef<any>(null)

  // Initialize PDF worker when component mounts
  useEffect(() => {
    const initPdf = async () => {
      try {
        console.log('[DocumentViewer] Waiting for PDF.js library...')
        
        // If already loaded, use it immediately
        if (typeof (window as any).pdfjsLib !== 'undefined' && (window as any).pdfjsLib.getDocument) {
          console.log('[DocumentViewer] PDF.js library available globally')
          return true
        }

        // Otherwise, wait for the pdfReady event
        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            console.error('[DocumentViewer] Timeout waiting for PDF.js')
            resolve(false)
          }, 10000) // Increased to 10 seconds

          const handlePdfReady = () => {
            clearTimeout(timeout)
            window.removeEventListener('pdfReady', handlePdfReady)
            console.log('[DocumentViewer] PDF.js ready event received')
            resolve(true)
          }

          window.addEventListener('pdfReady', handlePdfReady)
        })
      } catch (err) {
        console.error('[DocumentViewer] Failed to initialize PDF.js:', err)
        setError('Failed to initialize PDF viewer')
        return false
      }
    }

    initPdf()
  }, [])

  // Load PDF document
  useEffect(() => {
    if (!documentUrl || fileType !== 'pdf') {
      setLoading(false)
      return
    }

    const loadPdf = async () => {
      try {
        console.log('[DocumentViewer] Loading PDF from:', documentUrl)
        setLoading(true)
        setError(null)

        // Wait for PDF.js to be available - with longer timeout
        let attempts = 0
        const maxAttempts = 100 // 10 seconds with 100ms intervals
        while ((typeof (window as any).pdfjsLib === 'undefined' || !(window as any).pdfjsLib.getDocument) && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }

        // Get the globally loaded PDF.js library
        const pdf = (window as any).pdfjsLib
        if (!pdf || !pdf.getDocument) {
          throw new Error('PDF.js library not available - initialization failed after waiting')
        }

        // Load the PDF
        console.log('[DocumentViewer] Starting PDF fetch...')
        const doc = await pdf.getDocument({ url: documentUrl }).promise
        
        console.log('[DocumentViewer] PDF loaded successfully, pages:', doc.numPages)
        pdfDocRef.current = doc
        setNumPages(doc.numPages)
        
        // Render first page
        await renderPage(doc, 1)
        setLoading(false)
      } catch (err) {
        console.error('[DocumentViewer] Error loading PDF:', err)
        setError(`Failed to load PDF: ${err instanceof Error ? err.message : String(err)}`)
        setLoading(false)
      }
    }

    loadPdf()
  }, [documentUrl, fileType])

  // Render a specific page
  const renderPage = async (doc: any, pageNum: number) => {
    try {
      console.log('[DocumentViewer] Rendering page:', pageNum)
      
      const page = await doc.getPage(pageNum)
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      
      if (!context) {
        throw new Error('Could not get canvas context')
      }

      // Calculate scale
      const scale = (zoom / 100) * 1.5
      const viewport = page.getViewport({ scale })
      
      canvas.height = viewport.height
      canvas.width = viewport.width
      
      // Render page to canvas
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise

      console.log('[DocumentViewer] Page rendered, dimensions:', viewport.width, 'x', viewport.height)
      
      setPageCanvases(prev => ({ ...prev, [pageNum]: canvas }))
      setContainerDimensions({ width: viewport.width, height: viewport.height })
    } catch (err) {
      console.error('[DocumentViewer] Error rendering page:', err)
      throw err
    }
  }

  // Handle page changes
  const handlePreviousPage = () => {
    const newPage = Math.max(1, currentPage - 1)
    setCurrentPage(newPage)
    if (pdfDocRef.current) {
      renderPage(pdfDocRef.current, newPage).catch(err => 
        console.error('[DocumentViewer] Error rendering previous page:', err)
      )
    }
  }

  const handleNextPage = () => {
    const newPage = Math.min(numPages, currentPage + 1)
    setCurrentPage(newPage)
    if (pdfDocRef.current) {
      renderPage(pdfDocRef.current, newPage).catch(err => 
        console.error('[DocumentViewer] Error rendering next page:', err)
      )
    }
  }

  const handleZoomIn = () => {
    const newZoom = Math.min(200, zoom + 25)
    onZoomChange?.(newZoom)
    if (pdfDocRef.current) {
      renderPage(pdfDocRef.current, currentPage).catch(err => 
        console.error('[DocumentViewer] Error re-rendering on zoom:', err)
      )
    }
  }

  const handleZoomOut = () => {
    const newZoom = Math.max(25, zoom - 25)
    onZoomChange?.(newZoom)
    if (pdfDocRef.current) {
      renderPage(pdfDocRef.current, currentPage).catch(err => 
        console.error('[DocumentViewer] Error re-rendering on zoom:', err)
      )
    }
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
  const pageCanvas = pageCanvases[currentPage]

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
        {!documentUrl ? (
          <div className="flex items-center justify-center p-8 bg-gray-50 rounded">
            <p className="text-gray-600">No document URL provided</p>
          </div>
        ) : pageCanvas ? (
          <div className="relative inline-block">
            <canvas
              ref={el => {
                if (el && pageCanvas) {
                  el.width = pageCanvas.width
                  el.height = pageCanvas.height
                  const ctx = el.getContext('2d')
                  if (ctx) {
                    const pageCtx = pageCanvas.getContext('2d')
                    if (pageCtx) {
                      ctx.drawImage(pageCanvas, 0, 0)
                    }
                  }
                }
              }}
              style={{ display: 'none' }}
            />
            <img
              src={pageCanvas.toDataURL()}
              alt={`Page ${currentPage}`}
              className="max-w-none"
              style={{
                maxHeight: '100vh',
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
        ) : (
          <div className="flex items-center justify-center p-8">
            <p className="text-gray-600">Rendering page...</p>
          </div>
        )}
      </div>

      {/* Page thumbnails for multi-page PDFs */}
      {numPages > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 bg-white rounded-lg shadow-lg p-2 max-w-xs overflow-x-auto">
          <div className="flex space-x-2">
            {Array.from({ length: numPages }, (_, index) => index + 1).map(pageNum => (
              <button
                key={pageNum}
                onClick={() => {
                  setCurrentPage(pageNum)
                  if (pdfDocRef.current) {
                    renderPage(pdfDocRef.current, pageNum).catch(err => 
                      console.error('[DocumentViewer] Error rendering thumbnail page:', err)
                    )
                  }
                }}
                className={`px-2 py-1 text-xs font-medium rounded ${
                  currentPage === pageNum
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
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
