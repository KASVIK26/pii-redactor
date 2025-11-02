import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface Document {
  id: string
  user_id: string
  filename: string
  original_filename: string
  file_size: number
  file_type: string
  mime_type: string
  storage_path: string
  status: string
  upload_date: string
  processed_date?: string
  metadata?: any
  created_at: string
  updated_at: string
}

export const useDocuments = () => {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingCount, setProcessingCount] = useState<number>(0)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const { user, session } = useAuth()
  const lastFetchTime = useRef<number>(0)
  const cacheTimeout = 3000
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef<boolean>(false)
  const processingDocIdsRef = useRef<Set<string>>(new Set())

  const fetchDocuments = useCallback(async (forceRefresh = false) => {
    if (!user || !session?.access_token) return
    
    const now = Date.now()
    if (!forceRefresh && documents.length > 0 && (now - lastFetchTime.current) < cacheTimeout) {
      console.log('[useDocuments] FETCH SKIPPED - using cache')
      setLoading(false)
      return
    }
    
    console.log('[useDocuments] FETCH STARTED - forceRefresh:', forceRefresh)
    
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('http://localhost:8000/api/documents/', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.status}`)
      }

      const data = await response.json()
      console.log('[useDocuments] FETCH response:', data.length, 'documents from server')

      // Just replace with server data - don't try to merge local changes
      setDocuments(data)
      console.log('[useDocuments] Documents set to server response:', data.length)
      
      lastFetchTime.current = now

      // Update processing docs tracking
      const processingIds = new Set(
        data
          .filter((doc: Document) => doc.status === 'processing' || doc.status === 'queued')
          .map((doc: Document) => doc.id)
      ) as Set<string>
      processingDocIdsRef.current = processingIds
      setProcessingCount(processingIds.size)
      
      console.log('[useDocuments] FETCH COMPLETE')
    } catch (err) {
      console.error('[useDocuments] FETCH ERROR:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch documents')
    } finally {
      setLoading(false)
      if (!initialLoadComplete) {
        setInitialLoadComplete(true)
      }
    }
  }, [user, session?.access_token, documents.length])

  const deleteDocument = useCallback(async (documentId: string) => {
    console.log('[useDocuments] DELETE STARTED for:', documentId)
    console.log('[useDocuments] Current documents before delete:', documents.length, documents.map(d => ({ id: d.id, name: d.original_filename })))
    
    if (!user || !session?.access_token) {
      console.error('[useDocuments] No user or token')
      return false
    }
    
    try {
      console.log('[useDocuments] Sending DELETE request to backend...')
      const response = await fetch(`http://localhost:8000/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      console.log('[useDocuments] DELETE response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[useDocuments] DELETE failed:', response.status, errorText)
        throw new Error(`Failed to delete: ${response.status}`)
      }

      console.log('[useDocuments] Backend confirmed deletion, now updating local state...')
      
      // Remove from state - Dashboard will auto-update
      setDocuments(prev => {
        console.log('[useDocuments] setDocuments callback - prev length:', prev.length)
        const newDocs = prev.filter(doc => doc.id !== documentId)
        console.log('[useDocuments] LOCAL STATE UPDATED: before length =', prev.length, ', after length =', newDocs.length)
        console.log('[useDocuments] Remaining docs:', newDocs.map(d => ({ id: d.id, name: d.original_filename })))
        return newDocs
      })
      
      console.log('[useDocuments] Clearing cache...')
      lastFetchTime.current = 0
      
      console.log('[useDocuments] DELETE COMPLETED SUCCESSFULLY')
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      console.error('[useDocuments] DELETE ERROR:', msg)
      setError(msg)
      return false
    }
  }, [user, session?.access_token, documents])

  const refreshDocuments = useCallback(() => {
    fetchDocuments(true) // Force refresh when explicitly requested
  }, [fetchDocuments])

  // Function to add a new document to the list (called when file is uploaded)
  const addDocumentToQueue = useCallback((documentId: string, filename: string, fileSize: number, fileType: string) => {
    const newDoc: Document = {
      id: documentId,
      user_id: user?.id || '',
      filename: filename,
      original_filename: filename,
      file_size: fileSize,
      file_type: fileType,
      mime_type: `application/${fileType}`,
      storage_path: `documents/${documentId}`,
      status: 'queued',
      upload_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        stage: 'download_starting',
        entities_found: 0,
        text_length: 0,
        file_size_downloaded: 0,
      }
    }
    
    setDocuments(prev => [newDoc, ...prev])
    processingDocIdsRef.current.add(documentId)
    setProcessingCount(prev => prev + 1)
  }, [user?.id])

  // Setup polling with smart detection
  useEffect(() => {
    // Only poll if there are processing documents
    if (processingCount === 0 || !user || !session?.access_token) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
        isPollingRef.current = false
      }
      return
    }

    // Start polling
    if (isPollingRef.current) {
      return
    }
    
    isPollingRef.current = true

    // Initial immediate fetch
    fetchDocuments(true)

    // Then poll every 2 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchDocuments(true)
    }, 2000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      isPollingRef.current = false
    }
  }, [user, session?.access_token, fetchDocuments, processingCount])

  // Handle page visibility and focus changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchDocuments(true)
      }
    }

    const handleFocus = () => {
      fetchDocuments(true)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchDocuments])

  // Initial fetch when user/session changes
  useEffect(() => {
    if (user && session?.access_token) {
      fetchDocuments(true)
    }
  }, [user, session?.access_token, fetchDocuments])

  return {
    documents,
    loading,
    initialLoadComplete,
    error,
    deleteDocument,
    refreshDocuments,
    addDocumentToQueue,
  }
}