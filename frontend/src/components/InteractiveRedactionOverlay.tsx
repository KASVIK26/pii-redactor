'use client'

import React, { useState, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Trash2, Move, Square, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RedactionBox {
  id: string
  x: number
  y: number
  width: number
  height: number
  entityId?: string
  text?: string
  label?: string
  isActive?: boolean
  isRedacted?: boolean
  user_approved?: boolean | null
}

interface InteractiveRedactionOverlayProps {
  boxes: RedactionBox[]
  zoom: number
  isEditing: boolean
  selectedTool: 'select' | 'redact' | 'move' | 'erase'
  showRedacted: boolean
  onBoxUpdate: (id: string, box: Partial<RedactionBox>) => void
  onBoxDelete: (id: string) => void
  onBoxSelect: (id: string | null) => void
  onAddBox?: (box: Omit<RedactionBox, 'id'>) => void
  containerWidth?: number
  containerHeight?: number
}

export default function InteractiveRedactionOverlay({
  boxes,
  zoom,
  isEditing,
  selectedTool,
  showRedacted,
  onBoxUpdate,
  onBoxDelete,
  onBoxSelect,
  onAddBox,
  containerWidth = 800,
  containerHeight = 600
}: InteractiveRedactionOverlayProps) {
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null)
  const [resizeData, setResizeData] = useState<{ [key: string]: { width: number; height: number } }>({})

  const handleBoxClick = useCallback((boxId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (selectedTool === 'select') {
      setSelectedBoxId(boxId)
      onBoxSelect(boxId)
    }
  }, [selectedTool, onBoxSelect])

  const handleDragStart = useCallback((boxId: string, data: any) => {
    // No-op for framer-motion
  }, [])

  const handleDragStop = useCallback((boxId: string, info: any) => {
    const box = boxes.find(b => b.id === boxId)
    if (box) {
      onBoxUpdate(boxId, {
        x: Math.max(0, Math.min(info.x, containerWidth - box.width)),
        y: Math.max(0, Math.min(info.y, containerHeight - box.height))
      })
    }
  }, [boxes, onBoxUpdate, containerWidth, containerHeight])

  const handleResize = useCallback((boxId: string, newWidth: number, newHeight: number) => {
    onBoxUpdate(boxId, {
      width: Math.max(20, newWidth),
      height: Math.max(20, newHeight)
    })
  }, [onBoxUpdate])

  const handleContainerClick = useCallback((event: React.MouseEvent) => {
    if (selectedTool === 'redact' && onAddBox) {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      
      const newBox: Omit<RedactionBox, 'id'> = {
        x: Math.max(0, x - 50),
        y: Math.max(0, y - 25),
        width: 100,
        height: 50,
        isRedacted: true,
        user_approved: true,
        text: 'New Redaction',
        label: 'MANUAL'
      }
      
      onAddBox(newBox)
    } else if (selectedTool === 'erase') {
      // Find and delete box under cursor
      const rect = event.currentTarget.getBoundingClientRect()
      const clickX = event.clientX - rect.left
      const clickY = event.clientY - rect.top
      
      const clickedBox = boxes.find(box => 
        clickX >= box.x && 
        clickX <= box.x + box.width && 
        clickY >= box.y && 
        clickY <= box.y + box.height
      )
      
      if (clickedBox && onBoxDelete) {
        onBoxDelete(clickedBox.id)
      }
    } else {
      setSelectedBoxId(null)
      onBoxSelect(null)
    }
  }, [selectedTool, onAddBox, onBoxDelete, onBoxSelect, boxes])

  const toggleBoxRedaction = useCallback((boxId: string) => {
    const box = boxes.find(b => b.id === boxId)
    if (box) {
      onBoxUpdate(boxId, {
        isRedacted: !box.isRedacted,
        user_approved: !box.isRedacted
      })
    }
  }, [boxes, onBoxUpdate])

  const getBoxStyle = useCallback((box: RedactionBox) => {
    const isSelected = selectedBoxId === box.id
    const shouldShowRedacted = showRedacted && box.isRedacted && box.user_approved
    
    let className = 'absolute transition-all duration-200 '
    
    if (shouldShowRedacted) {
      // Professional solid black redaction
      className += 'bg-black border-2 border-black'
    } else {
      // Selected state or pending redaction
      className += `border-2 ${
        box.user_approved === true 
          ? 'border-green-500 bg-green-500 bg-opacity-30'
          : box.user_approved === false
            ? 'border-red-500 bg-red-500 bg-opacity-30'
            : isSelected
              ? 'border-blue-600 bg-blue-600 bg-opacity-40'
              : 'border-amber-500 bg-amber-500 bg-opacity-20'
      }`
    }
    
    if (isSelected && isEditing) {
      className += ' ring-2 ring-yellow-400 ring-opacity-75 shadow-lg'
    }
    
    if (isEditing) {
      switch (selectedTool) {
        case 'redact':
          className += ' cursor-crosshair'
          break
        case 'move':
          className += ' cursor-grab active:cursor-grabbing'
          break
        case 'erase':
          className += ' cursor-not-allowed'
          break
        case 'select':
        default:
          className += ' cursor-pointer hover:opacity-80'
          break
      }
    } else {
      className += ' cursor-pointer'
    }

    return {
      className,
      style: {
        transform: `scale(1)`,
        transformOrigin: 'top left',
      }
    }
  }, [selectedBoxId, showRedacted, isEditing, selectedTool, zoom])

  return (
    <div 
      className="absolute inset-0 pointer-events-auto"
      onClick={handleContainerClick}
      style={{ zIndex: 10 }}
    >
      {boxes.map((box) => {
        const { className, style } = getBoxStyle(box)
        const isSelected = selectedBoxId === box.id
        const shouldShowRedacted = showRedacted && box.isRedacted && box.user_approved

        if (!isEditing) {
          // Static overlay mode - just show the boxes
          return (
            <div
              key={box.id}
              className={className}
                style={{
                  ...style,
                  left: box.x,
                  top: box.y,
                  width: isNaN(box.width) ? 0 : box.width,
                  height: isNaN(box.height) ? 0 : box.height,
                }}
              onClick={(e) => handleBoxClick(box.id, e)}
              title={`${box.text || 'Redaction'} (${box.label || 'UNKNOWN'})`}
            >
              {shouldShowRedacted && (
                <div className="w-full h-full bg-black flex items-center justify-center text-white text-xs font-mono">
                  [REDACTED]
                </div>
              )}
            </div>
          )
        }

        return (
          <motion.div
            key={box.id}
            drag={selectedTool === 'move' || selectedTool === 'select'}
            dragMomentum={false}
            initial={{ x: box.x, y: box.y }}
            animate={{ x: box.x, y: box.y }}
            onDragEnd={(event, info) => handleDragStop(box.id, info)}
            className="absolute"
              style={{
                width: isNaN(box.width) ? 0 : box.width,
                height: isNaN(box.height) ? 0 : box.height,
                left: 0,
                top: 0,
              }}
          >
            <div
              className={className}
              style={{
                ...style,
                width: '100%',
                height: '100%',
              }}
              onClick={(e) => handleBoxClick(box.id, e)}
            >
              {/* Content overlay */}
              {shouldShowRedacted ? (
                <div className="w-full h-full bg-black flex items-center justify-center text-white text-xs font-mono">
                  [REDACTED]
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-xs font-medium text-gray-700 bg-white bg-opacity-75 px-1 rounded">
                    {box.text?.substring(0, 10) || 'Redaction'}
                  </span>
                </div>
              )}

              {/* Control buttons for selected box */}
              {isSelected && (
                <div className="absolute -top-8 left-0 flex space-x-1 bg-white rounded shadow-lg p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleBoxRedaction(box.id)
                    }}
                    title={box.isRedacted ? 'Show original' : 'Apply redaction'}
                  >
                    {box.isRedacted ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      onBoxDelete(box.id)
                    }}
                    title="Delete redaction"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* Resize handles */}
              {isSelected && (
                <>
                  <div 
                    className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 cursor-se-resize"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const startX = e.clientX
                      const startY = e.clientY
                      const startWidth = box.width
                      const startHeight = box.height

                      const handleMouseMove = (moveEvent: MouseEvent) => {
                        const deltaX = moveEvent.clientX - startX
                        const deltaY = moveEvent.clientY - startY
                        handleResize(box.id, startWidth + deltaX, startHeight + deltaY)
                      }

                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove)
                        document.removeEventListener('mouseup', handleMouseUp)
                      }

                      document.addEventListener('mousemove', handleMouseMove)
                      document.addEventListener('mouseup', handleMouseUp)
                    }}
                    title="Drag to resize"
                  />
                </>
              )}
            </div>
          </motion.div>
        )
      })}

      {/* Tool cursor indicator */}
      {selectedTool === 'redact' && (
        <div className="absolute top-4 right-4 bg-blue-100 border border-blue-300 rounded px-2 py-1 text-xs">
          Click to add redaction box
        </div>
      )}
    </div>
  )
}