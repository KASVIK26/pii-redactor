'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Trash2, Download, FileText, Clock, CheckCircle, AlertCircle, Loader, Edit } from 'lucide-react'
import { useDocuments } from '@/hooks/useDocuments'
import { useAuth } from '@/contexts/AuthContext'
import { formatDistanceToNow } from 'date-fns'
import { DocumentProcessingStatus } from './DocumentProcessingStatus'
import EntityReview from './EntityReview'
import { DeleteConfirmModal } from './DeleteConfirmModal'

interface Document {
  id: string
  filename: string
  original_filename: string
  file_size: number
  file_type: string
  status: string
  upload_date: string
  processed_date?: string
  updated_at: string
  file_url: string
  processed_file_url?: string
  metadata?: {
    error?: string
    stage?: string
    processing_time?: number
    stages?: {
      [stage: string]: {
        status: string
        completed_at?: string
        error?: string
        processing_time?: number
      }
    }
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'queued':
      return <Clock className="h-4 w-4" />
    case 'processing':
      return <Loader className="h-4 w-4 animate-spin" />
    case 'processed':
      return <CheckCircle className="h-4 w-4" />
    case 'failed':
      return <AlertCircle className="h-4 w-4" />
    default:
      return <FileText className="h-4 w-4" />
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'queued':
      return 'bg-yellow-100 text-yellow-800'
    case 'processing':
      return 'bg-blue-100 text-blue-800'
    case 'processed':
      return 'bg-green-100 text-green-800'
    case 'failed':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function RecentDocuments() {
  const { documents, loading: initialLoading, initialLoadComplete, error, deleteDocument, refreshDocuments } = useDocuments()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteDocumentName, setDeleteDocumentName] = useState('')
  const [, setRefreshTrigger] = useState(0)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [entityReviewDocId, setEntityReviewDocId] = useState<string | null>(null)
  const { session } = useAuth()

  // Log when documents change with detailed info
  useEffect(() => {
    console.log('[RecentDocuments] RENDER - documents changed:', documents.length)
    documents.forEach((doc, idx) => {
      console.log(`  [${idx}] ${doc.original_filename} - status: ${doc.status}, id: ${doc.id.substring(0, 8)}...`)
    })
  }, [documents])

  const handleDeleteClick = (documentId: string, filename: string) => {
    console.log('[RecentDocuments] Delete button clicked:', { documentId, filename })
    setDeletingId(documentId)
    setDeleteDocumentName(filename)
    setDeleteModalOpen(true)
    console.log('[RecentDocuments] Modal opened for deletion')
  }

  const handleDeleteConfirm = async () => {
    if (!deletingId) {
      console.log('[RecentDocuments] No deletingId set')
      return
    }
    
    console.log('[RecentDocuments] DELETE STARTED - documentId:', deletingId)
    console.log('[RecentDocuments] All documents before delete:', documents.length, documents.map(d => ({ id: d.id, name: d.original_filename })))
    
    setIsDeleting(true)
    const success = await deleteDocument(deletingId)
    console.log('[RecentDocuments] deleteDocument returned:', success)
    
    setIsDeleting(false)
    
    setDeleteModalOpen(false)
    setDeletingId(null)
    setDeleteDocumentName('')
    
    console.log('[RecentDocuments] All documents after delete:', documents.length, documents.map(d => ({ id: d.id, name: d.original_filename })))
    
    if (!success) {
      console.error('[RecentDocuments] DELETE FAILED')
      alert('Failed to delete document. Please try again.')
    } else {
      console.log('[RecentDocuments] DELETE SUCCESS - triggering metrics refresh')
      // Trigger a fresh fetch to update dashboard metrics
      setTimeout(() => {
        console.log('[RecentDocuments] Calling refreshDocuments to update metrics')
        refreshDocuments()
      }, 500)
    }
  }

  const handleDeleteCancel = () => {
    console.log('[RecentDocuments] Delete cancelled by user')
    setDeleteModalOpen(false)
    setDeletingId(null)
    setDeleteDocumentName('')
  }

  const handleDownload = async (documentId: string, filename: string, isProcessed: boolean) => {
    if (!session?.access_token) {
      alert('Authentication token missing')
      return
    }
    
    // Prevent multiple simultaneous downloads
    if (downloadingId) {
      console.log('[RecentDocuments] Already downloading, ignoring click')
      return
    }
    
    console.log('[RecentDocuments] Download initiated for:', documentId)
    setDownloadingId(documentId)
    
    try {
      // Build download URL
      const baseUrl = `http://localhost:8000/api/documents/${documentId}/download`
      const url = isProcessed ? `${baseUrl}?redacted=true` : baseUrl
      
      console.log('[RecentDocuments] Requesting:', url)
      
      // Fetch with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Server error ${response.status}: ${errorText}`)
      }

      // Get file blob
      const blob = await response.blob()
      console.log(`[RecentDocuments] Download successful: ${blob.size} bytes`)
      
      // Trigger browser download
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Cleanup
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100)
      console.log('[RecentDocuments] File download triggered')
      
    } catch (error) {
      console.error('[RecentDocuments] Download failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert(`Download failed: ${errorMessage}`)
    } finally {
      // Always clear loading state
      setDownloadingId(null)
      console.log('[RecentDocuments] Download handler complete, loading state cleared')
    }
  }

  // Only show loading on initial load, not during polling updates
  if (!initialLoadComplete) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>Your recently processed documents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Loading documents...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>Your recently processed documents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-500">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load documents: {error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>Your recently processed documents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No documents processed yet.</p>
            <p className="text-sm">Upload your first document to get started!</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>
            {documents.length} document{documents.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {documents.map((document) => (
              <div 
                key={document.id}
                className="border rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="flex-shrink-0">
                      <FileText className="h-8 w-8 text-gray-400" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-medium text-gray-900 truncate">
                          {document.original_filename}
                        </h4>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${getStatusColor(document.status)}`}
                        >
                          <span className="flex items-center space-x-1">
                            {getStatusIcon(document.status)}
                            <span className="capitalize">{document.status}</span>
                          </span>
                        </Badge>
                      </div>
                      
                      <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                        <span>{formatFileSize(document.file_size)}</span>
                        <span>•</span>
                        <span className="uppercase">{document.file_type}</span>
                        <span>•</span>
                        <span>
                          Uploaded {formatDistanceToNow(new Date(document.upload_date))} ago
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {document.status === 'processed' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(document.id, document.original_filename, true)}
                          disabled={downloadingId === document.id}
                          className="text-green-600 hover:text-green-700"
                        >
                          {downloadingId === document.id ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEntityReviewDocId(document.id)}
                          className="text-blue-600 hover:text-blue-700"
                          title="Review detected PII entities"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteClick(document.id, document.original_filename)}
                      disabled={deletingId === document.id}
                      className="text-red-600 hover:text-red-700"
                    >
                      {deletingId === document.id ? (
                        <Loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                
                {/* Show processing status for documents that are processing or queued */}
                {(document.status === 'processing' || document.status === 'queued') && (
                  <div className="px-4 pb-4">
                    <DocumentProcessingStatus document={document} />
                  </div>
                )}
                
                {/* Show error details for failed documents */}
                {document.status === 'failed' && document.metadata?.error && (
                  <div className="px-4 pb-4">
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-red-800">Processing Failed</p>
                          <p className="text-sm text-red-600 mt-1">{document.metadata.error}</p>
                          {document.metadata.stage && (
                            <p className="text-xs text-red-500 mt-1">Failed at stage: {document.metadata.stage}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Entity Review Modal */}
      {entityReviewDocId && (
        <EntityReview 
          documentId={entityReviewDocId}
          accessToken={session?.access_token || ''}
          onClose={() => setEntityReviewDocId(null)} 
        />
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        title="Delete Document"
        message="This action cannot be undone. The document and all its data will be permanently deleted."
        filename={deleteDocumentName}
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </>
  )
}