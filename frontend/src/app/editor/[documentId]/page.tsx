'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  ArrowLeft, 
  Download, 
  Eye, 
  EyeOff, 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  Square,
  Palette,
  Move,
  Trash2,
  Save,
  Settings,
  FileText,
  Shield,
  Plus,
  Minus,
  CircleDot,
  MousePointer2,
  Eraser
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import DocumentViewer from '@/components/DocumentViewer'

interface Entity {
  id?: string
  text: string
  label: string
  method: string
  start_pos: number
  end_pos: number
  confidence: number
  is_redacted?: boolean
  user_approved?: boolean | null
  page?: number
  bounding_box?: {
    x: number
    y: number
    width: number
    height: number
  }
}

interface Document {
  id: string
  filename: string
  original_filename: string
  file_size: number
  file_type: string
  status: string
  metadata?: {
    entities?: Entity[]
    redacted_storage_path?: string
  }
}

export default function LiveEditor() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const documentId = params?.documentId as string
  
  const [document, setDocument] = useState<Document | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [showRedacted, setShowRedacted] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [selectedTool, setSelectedTool] = useState<'select' | 'redact' | 'move' | 'erase'>('select')
  const [selectedEntities, setSelectedEntities] = useState<string[]>([])

  useEffect(() => {
    if (documentId && user) {
      fetchDocument()
    }
  }, [documentId, user])

  const fetchDocument = async () => {
    try {
      setLoading(true)
      const response = await fetch(`http://localhost:8000/api/documents/${documentId}`, {
        headers: {
          'Authorization': `Bearer test-token`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setDocument(data)
        setEntities(data.metadata?.entities || [])
      }
    } catch (err) {
      console.error('Error fetching document:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateEntityRedaction = async (entityId: string, isRedacted: boolean) => {
    try {
      const response = await fetch(`http://localhost:8000/api/entities/${entityId}/approval`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer test-token`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_approved: isRedacted,
          is_redacted: isRedacted
        })
      })

      if (response.ok) {
        // Update local state
        setEntities(entities.map(entity => 
          entity.id === entityId 
            ? { ...entity, user_approved: isRedacted, is_redacted: isRedacted }
            : entity
        ))
      }
    } catch (err) {
      console.error('Error updating entity:', err)
    }
  }

  const downloadRedactedDocument = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/documents/${documentId}/download-redacted`, {
        headers: {
          'Authorization': `Bearer test-token`
        }
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const anchor = window.document.createElement('a')
        anchor.style.display = 'none'
        anchor.href = url
        anchor.download = `redacted_${document?.original_filename || 'document'}`
        window.document.body.appendChild(anchor)
        anchor.click()
        window.URL.revokeObjectURL(url)
        window.document.body.removeChild(anchor)
      }
    } catch (err) {
      console.error('Error downloading document:', err)
    }
  }

  // Enhanced entity management functions
  const handleEntityPositionUpdate = async (entityId: string, newPosition: { x: number; y: number; width: number; height: number }) => {
    try {
      const response = await fetch(`http://localhost:8000/api/entities/${entityId}/position`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer test-token`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newPosition),
      });

      if (response.ok) {
        // Update local state
        setEntities(entities.map(entity => 
          entity.id === entityId 
            ? { ...entity, bounding_box: newPosition }
            : entity
        ))
      } else {
        console.error('Failed to update entity position')
      }
    } catch (error) {
      console.error('Error updating entity position:', error)
    }
  }

  const handleEntityDeletion = async (entityId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/entities/${entityId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer test-token`
        }
      });

      if (response.ok) {
        // Remove from local state
        setEntities(entities.filter(entity => entity.id !== entityId))
      } else {
        console.error('Failed to delete entity')
      }
    } catch (error) {
      console.error('Error deleting entity:', error)
    }
  }

  const handleEntityCreation = async (entityData: { text: string; label: string; bounding_box: { x: number; y: number; width: number; height: number } }) => {
    try {
      const response = await fetch(`http://localhost:8000/api/entities/${documentId}/entities`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer test-token`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...entityData,
          is_redacted: true,
          user_approved: true
        }),
      });

      if (response.ok) {
        const result = await response.json()
        // Add to local state
        setEntities([...entities, result.entity])
      } else {
        console.error('Failed to create entity')
      }
    } catch (error) {
      console.error('Error creating entity:', error)
    }
  }

  if (!user) {
    router.push('/')
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-96">
          <CardContent className="p-6 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Document not found</h3>
            <p className="text-gray-600 mb-4">The document you're looking for doesn't exist or you don't have access to it.</p>
            <Button onClick={() => router.push('/')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const approvedEntities = entities.filter(e => e.user_approved === true)
  const pendingEntities = entities.filter(e => e.user_approved === null || e.user_approved === undefined)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => router.push('/')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  Live Redaction Editor
                </h1>
                <p className="text-sm text-gray-600">{document.original_filename}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Badge variant={showRedacted ? "default" : "outline"}>
                {showRedacted ? "Redacted View" : "Original View"}
              </Badge>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowRedacted(!showRedacted)}
              >
                {showRedacted ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              <Button 
                variant="default" 
                size="sm"
                onClick={downloadRedactedDocument}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Left Sidebar - Tools & Entities */}
          <div className="lg:col-span-1 space-y-4">
            
            {/* Redaction Tools */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center">
                  <Settings className="h-4 w-4 mr-2" />
                  Redaction Tools
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Tool Selection */}
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Tool Mode</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={selectedTool === 'select' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedTool('select')}
                      className="flex items-center justify-center"
                    >
                      <MousePointer2 className="h-4 w-4 mr-1" />
                      Select
                    </Button>
                    <Button
                      variant={selectedTool === 'redact' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedTool('redact')}
                      className="flex items-center justify-center"
                    >
                      <Square className="h-4 w-4 mr-1" />
                      Redact
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={selectedTool === 'move' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedTool('move')}
                      className="flex items-center justify-center"
                    >
                      <Move className="h-4 w-4 mr-1" />
                      Move
                    </Button>
                    <Button
                      variant={selectedTool === 'erase' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedTool('erase')}
                      className="flex items-center justify-center"
                    >
                      <Eraser className="h-4 w-4 mr-1" />
                      Erase
                    </Button>
                  </div>
                </div>

                {/* Redaction Style */}
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Redaction Style</div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" className="bg-black text-white">
                      <Square className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="bg-red-500 text-white">
                      <Square className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="bg-blue-500 text-white">
                      <Square className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" className="border-2 border-black">
                      <Square className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <CircleDot className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Palette className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {/* Zoom Controls */}
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">Zoom</div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setZoom(Math.max(25, zoom - 25))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-xs px-3 py-1 bg-gray-100 rounded font-mono min-w-[60px] text-center">{zoom}%</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setZoom(Math.min(300, zoom + 25))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {[50, 75, 100, 125, 150, 200].map(zoomLevel => (
                      <Button
                        key={zoomLevel}
                        variant={zoom === zoomLevel ? "default" : "outline"}
                        size="sm"
                        className="text-xs px-2 py-1"
                        onClick={() => setZoom(zoomLevel)}
                      >
                        {zoomLevel}%
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Entity Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center">
                  <Shield className="h-4 w-4 mr-2" />
                  Redaction Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Entities</span>
                    <Badge variant="outline">{entities.length}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Approved</span>
                    <Badge variant="default" className="bg-green-600">{approvedEntities.length}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Pending</span>
                    <Badge variant="default" className="bg-yellow-600">{pendingEntities.length}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => {
                    // Approve all pending entities
                    pendingEntities.forEach(entity => {
                      if (entity.id) {
                        updateEntityRedaction(entity.id, true)
                      }
                    })
                  }}
                >
                  Approve All Pending
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => {
                    // Reject all pending entities
                    pendingEntities.forEach(entity => {
                      if (entity.id) {
                        updateEntityRedaction(entity.id, false)
                      }
                    })
                  }}
                >
                  Reject All Pending
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Main Document Viewer */}
          <div className="lg:col-span-3">
            <Card className="h-[calc(100vh-200px)]">
              <CardHeader className="pb-3 border-b">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base font-medium">Document Preview</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm">
                      <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 h-full">
                <div className="relative h-full bg-gray-100">
                  {document && (
                    <DocumentViewer
                      documentUrl={`http://localhost:8000/api/documents/${documentId}/file${showRedacted ? '?redacted=true' : ''}`}
                      fileType={document.file_type}
                      entities={entities}
                      showRedacted={showRedacted}
                      zoom={zoom}
                      isEditing={true}
                      selectedTool={selectedTool}
                      onEntityClick={(entityId: string) => {
                        // Handle entity click - could open details or toggle selection
                        const entity = entities.find(e => e.id === entityId)
                        if (entity && entity.id) {
                          updateEntityRedaction(entity.id, !entity.is_redacted)
                        }
                      }}
                      onZoomChange={(newZoom: number) => setZoom(newZoom)}
                      onEntityUpdate={(entityId: string, updates: any) => {
                        // Handle entity updates (position, size, redaction status)
                        if (updates.bounding_box) {
                          handleEntityPositionUpdate(entityId, updates.bounding_box)
                        }
                        if ('is_redacted' in updates || 'user_approved' in updates) {
                          updateEntityRedaction(entityId, updates.is_redacted ?? updates.user_approved)
                        }
                      }}
                      onEntityDelete={(entityId: string) => {
                        // Handle entity deletion
                        handleEntityDeletion(entityId)
                      }}
                      onEntityAdd={(entity: any) => {
                        // Handle new entity creation
                        handleEntityCreation({
                          text: entity.text || 'Manual Redaction',
                          label: entity.label || 'MANUAL',
                          bounding_box: entity.bounding_box
                        })
                      }}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}