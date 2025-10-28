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
  Minimize2,
  Download,
  RefreshCw
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

interface RedactionBox {
  id: string
  x: number
  y: number
  width: number
  height: number
  entityId?: string
  text?: string
  label?: string
  isRedacted?: boolean
  user_approved?: boolean | null
}

export default function DocumentViewerProfessional({
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
  const [containerDimensions, setContainerDimensions] = useState({ width: 900, height: 1170 })
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null)
  const [redactionBoxes, setRedactionBoxes] = useState<RedactionBox[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const pdfDocRef = useRef<any>(null)

  // Initialize PDF.js
  useEffect(() => {
    const initPdf = async () => {
      try {
        console.log('[DocumentViewer] Waiting for PDF.js library...')
        
        if (typeof (window as any).pdfjsLib !== 'undefined' && (window as any).pdfjsLib.getDocument) {
          console.log('[DocumentViewer] PDF.js library available globally')
          return true
        }

        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            console.error('[DocumentViewer] Timeout waiting for PDF.js')
            resolve(false)
          }, 10000)

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

  // Load and render PDF
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

        // Wait for PDF.js library
        let attempts = 0
        const maxAttempts = 100
        while ((typeof (window as any).pdfjsLib === 'undefined' || !(window as any).pdfjsLib.getDocument) && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }

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

  // Render page with proper redaction box extraction
  const renderPage = async (doc: any, pageNum: number) => {
    try {
      console.log('[DocumentViewer] Rendering page:', pageNum)
      
      const page = await doc.getPage(pageNum)
      const scale = 2 // High resolution render
      const viewport = page.getViewport({ scale })
      
      // Set container dimensions based on page size
      setContainerDimensions({
        width: viewport.width,
        height: viewport.height
      })

      // Create canvas for rendering
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height

      if (!context) throw new Error('Could not get canvas context')

      // Render page to canvas
      await page.render({ canvasContext: context, viewport }).promise

      // Convert to image
      const imageUrl = canvas.toDataURL('image/png')
      setPageImageUrl(imageUrl)

      // Extract text and calculate redaction boxes
      const textContent = await page.getTextContent()
      const boxes: RedactionBox[] = []

      // Find matching entities for this page
      const pageEntities = entities.filter(e => (e.page || 1) === pageNum)
      
      for (const entity of pageEntities) {
        if (entity.bounding_box) {
          // Scale the bounding box coordinates
          const box: RedactionBox = {
            id: entity.id || `entity-${Math.random()}`,
            x: entity.bounding_box.x * scale,
            y: entity.bounding_box.y * scale,
            width: entity.bounding_box.width * scale,
            height: entity.bounding_box.height * scale,
            entityId: entity.id,
            text: entity.text,
            label: entity.label,
            isRedacted: entity.is_redacted ?? entity.user_approved ?? false,
            user_approved: entity.user_approved
          }
          boxes.push(box)
        }
      }

      setRedactionBoxes(boxes)
      console.log('[DocumentViewer] Page rendered with', boxes.length, 'redaction boxes')
    } catch (err) {
      console.error('[DocumentViewer] Error rendering page:', err)
      throw err
    }
  }

  // Handle page navigation
  const handlePrevPage = () => {
    if (currentPage > 1) {
      const newPage = currentPage - 1
      setCurrentPage(newPage)
      if (pdfDocRef.current) {
        renderPage(pdfDocRef.current, newPage).catch(err => 
          console.error('[DocumentViewer] Error rendering page:', err)
        )
      }
    }
  }

  const handleNextPage = () => {
    if (currentPage < numPages) {
      const newPage = currentPage + 1
      setCurrentPage(newPage)
      if (pdfDocRef.current) {
        renderPage(pdfDocRef.current, newPage).catch(err => 
          console.error('[DocumentViewer] Error rendering page:', err)
        )
      }
    }
  }

  // Redaction box handlers
  const handleBoxUpdate = (boxId: string, updates: Partial<RedactionBox>) => {
    setRedactionBoxes(prev => 
      prev.map(box => box.id === boxId ? { ...box, ...updates } : box)
    )
    const box = redactionBoxes.find(b => b.id === boxId)
    if (box?.entityId && onEntityUpdate) {
      onEntityUpdate(box.entityId, updates)
    }
  }

  const handleBoxDelete = (boxId: string) => {
    const box = redactionBoxes.find(b => b.id === boxId)
    if (box?.entityId && onEntityDelete) {
      onEntityDelete(box.entityId)
    }
    setRedactionBoxes(prev => prev.filter(b => b.id !== boxId))
  }

  const handleAddBox = (newBox: Omit<RedactionBox, 'id'>) => {
    const box: RedactionBox = {
      ...newBox,
      id: `box-${Date.now()}`
    }
    setRedactionBoxes(prev => [...prev, box])
    if (onEntityAdd) {
      onEntityAdd(box)
    }
  }

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full flex flex-col bg-slate-950 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
    >
      {/* Professional Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shadow-lg">
        {/* Left: Page Navigation */}
        <div className="flex items-center space-x-3">
          <Button 
            variant="ghost"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            className="hover:bg-slate-800 text-slate-300"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="bg-slate-800 px-4 py-2 rounded-md text-sm font-semibold text-white border border-slate-700">
            {currentPage} / {numPages}
          </div>
          <Button 
            variant="ghost"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage === numPages}
            className="hover:bg-slate-800 text-slate-300"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Right: Zoom & Controls */}
        <div className="flex items-center space-x-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onZoomChange?.(Math.max(50, zoom - 25))}
            className="hover:bg-slate-800 text-slate-300"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="bg-slate-800 px-3 py-2 rounded-md text-sm font-semibold text-white border border-slate-700 w-16 text-center">
            {zoom}%
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onZoomChange?.(Math.min(200, zoom + 25))}
            className="hover:bg-slate-800 text-slate-300"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-slate-700"></div>
          <Button 
            variant="ghost" 
            size="sm"
            className="hover:bg-slate-800 text-slate-300"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            className="hover:bg-slate-800 text-slate-300"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="hover:bg-slate-800 text-slate-300"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Document Display Area */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-slate-950">
        {loading && (
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-slate-700 border-t-blue-500"></div>
            <p className="mt-6 text-slate-400 font-medium text-lg">Loading Document...</p>
          </div>
        )}

        {error && (
          <div className="text-center bg-red-950 border border-red-800 rounded-lg p-8 max-w-md shadow-lg">
            <p className="font-semibold text-red-300 mb-3 text-lg">⚠️ Error Loading Document</p>
            <p className="text-sm text-red-400 leading-relaxed">{error}</p>
          </div>
        )}

        {!loading && !error && pageImageUrl && (
          <div 
            style={{
              position: 'relative',
              width: containerDimensions.width * (zoom / 100),
              height: containerDimensions.height * (zoom / 100),
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'center top',
              backgroundColor: '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              borderRadius: '0.5rem',
              overflow: 'hidden',
            }}
          >
            {/* PDF Page Image */}
            <img 
              src={pageImageUrl} 
              alt={`Page ${currentPage}`}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
              }}
            />

            {/* Redaction Overlay - Professional Black Boxes */}
            {isEditing && (
              <InteractiveRedactionOverlay
                boxes={redactionBoxes.map(box => ({
                  ...box,
                  isRedacted: showRedacted ? box.isRedacted : false
                }))}
                zoom={100} // Already scaled in container
                isEditing={isEditing}
                selectedTool={selectedTool}
                showRedacted={showRedacted}
                onBoxUpdate={handleBoxUpdate}
                onBoxDelete={handleBoxDelete}
                onBoxSelect={() => {}}
                onAddBox={handleAddBox}
                containerWidth={containerDimensions.width}
                containerHeight={containerDimensions.height}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
