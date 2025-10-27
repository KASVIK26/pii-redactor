'use client'

import React, { useState, useCallback } from 'react'
import Draggable from 'react-draggable'
import { ResizableBox } from 'react-resizable'
import { Trash2, Move, Square, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import 'react-resizable/css/styles.css'

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
  const [dragData, setDragData] = useState<{ [key: string]: { x: number; y: number } }>({})

  const handleBoxClick = useCallback((boxId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (selectedTool === 'select') {
      setSelectedBoxId(boxId)
      onBoxSelect(boxId)
    }
  }, [selectedTool, onBoxSelect])

  const handleDragStart = useCallback((boxId: string, data: any) => {
    setDragData(prev => ({
      ...prev,
      [boxId]: { x: data.x, y: data.y }
    }))
  }, [])

  const handleDragStop = useCallback((boxId: string, data: any) => {
    const box = boxes.find(b => b.id === boxId)
    if (box) {
      onBoxUpdate(boxId, {
        x: Math.max(0, Math.min(data.x, containerWidth - box.width)),
        y: Math.max(0, Math.min(data.y, containerHeight - box.height))
      })
    }
    setDragData(prev => {
      const newData = { ...prev }
      delete newData[boxId]
      return newData
    })
  }, [boxes, onBoxUpdate, containerWidth, containerHeight])

  const handleResize = useCallback((boxId: string, _event: React.SyntheticEvent, { size }: { size: { width: number; height: number } }) => {
    onBoxUpdate(boxId, {
      width: Math.max(20, size.width),
      height: Math.max(20, size.height)
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
      className += 'bg-black border-2 border-black'
    } else {
      className += `border-2 ${
        box.user_approved === true 
          ? 'border-green-500 bg-green-100 bg-opacity-50'
          : box.user_approved === false
            ? 'border-red-500 bg-red-100 bg-opacity-50'
            : 'border-blue-500 bg-blue-100 bg-opacity-50'
      }`
    }
    
    if (isSelected && isEditing) {
      className += ' ring-4 ring-blue-300 ring-opacity-50'
    }
    
    if (isEditing) {
      switch (selectedTool) {
        case 'redact':
          className += ' cursor-crosshair'
          break
        case 'move':
          className += ' cursor-move'
          break
        case 'erase':
          className += ' cursor-crosshair'
          break
        case 'select':
        default:
          className += ' cursor-pointer'
          break
      }
    } else {
      className += ' cursor-pointer'
    }

    return {
      className,
      style: {
        transform: `scale(${zoom / 100})`,
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
        const isDragging = dragData[box.id]

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
                width: box.width,
                height: box.height,
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
          <Draggable
            key={box.id}
            position={{ x: box.x, y: box.y }}
            onStart={(e, data) => handleDragStart(box.id, data)}
            onStop={(e, data) => handleDragStop(box.id, data)}
            disabled={selectedTool !== 'move' && selectedTool !== 'select' && selectedTool !== 'erase'}
            bounds="parent"
          >
            <div>
              <ResizableBox
                width={box.width}
                height={box.height}
                onResize={(e, data) => handleResize(box.id, e, data)}
                resizeHandles={isSelected ? ['se', 'sw', 'ne', 'nw', 'n', 's', 'e', 'w'] : []}
                minConstraints={[20, 20]}
                maxConstraints={[containerWidth, containerHeight]}
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

                  {/* Drag indicator */}
                  {isDragging && (
                    <div className="absolute top-1 right-1">
                      <Move className="h-3 w-3 text-gray-500" />
                    </div>
                  )}
                </div>
              </ResizableBox>
            </div>
          </Draggable>
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