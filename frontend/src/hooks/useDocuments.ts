import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchMetrics } from '@/lib/metricsHelper'

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
  const fetchDocumentsRef = useRef<((forceRefresh?: boolean) => Promise<void>) | null>(null)

  const fetchDocuments = useCallback(async (forceRefresh = false) => {
    if (!user || !session?.access_token) {
      console.log('[useDocuments] FETCH SKIPPED - no user or token')
      return
    }
    
    const now = Date.now()
    
    // Only use cache if not forcing refresh AND cache is still fresh AND we have documents
    if (!forceRefresh && documents.length > 0 && (now - lastFetchTime.current) < cacheTimeout) {
      console.log('[useDocuments] FETCH SKIPPED - using cache (age:', now - lastFetchTime.current, 'ms)')
      setLoading(false)
      return
    }
    
    console.log('[useDocuments] FETCH STARTED - forceRefresh:', forceRefresh, 'cacheAge:', now - lastFetchTime.current, 'currentDocs:', documents.length)
    
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
      console.log('[useDocuments] FETCH response received:', data.length, 'documents')
      console.log('[useDocuments] Response sample:', data.slice(0, 2).map((d: Document) => ({ id: d.id, name: d.original_filename, status: d.status })))

      // Merge server data with local data (preserve locally-added documents that might not be on server yet)
      setDocuments(prevDocs => {
        const serverIds = new Set(data.map((d: Document) => d.id))
        
        // Keep locally-added docs that aren't on server yet, but update ones that are on server
        const merged = [
          // First, updated server documents
          ...data,
          // Then, locally-added documents that don't exist on server yet
          ...prevDocs.filter(doc => !serverIds.has(doc.id))
        ]
        
        console.log('[useDocuments] Merged documents - server:', data.length, 'local-only:', prevDocs.filter(doc => !serverIds.has(doc.id)).length, 'total:', merged.length)
        
        // Update processing docs tracking from merged data
        const processingIds = new Set(
          merged
            .filter((doc: Document) => doc.status === 'processing' || doc.status === 'queued')
            .map((doc: Document) => doc.id)
        ) as Set<string>
        
        const previousCount = processingDocIdsRef.current.size
        processingDocIdsRef.current = processingIds
        
        console.log('[useDocuments] Processing docs from merged:', processingIds.size, '(was:', previousCount, ')')
        
        if (processingIds.size !== previousCount) {
          setProcessingCount(processingIds.size)
          console.log('[useDocuments] Processing count updated to:', processingIds.size)
        }
        
        return merged
      })
      console.log('[useDocuments] Documents state updated with merge')
      
      lastFetchTime.current = now
      console.log('[useDocuments] FETCH COMPLETE')
    } catch (err) {
      console.error('[useDocuments] FETCH ERROR:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch documents')
    } finally {
      setLoading(false)
      if (!initialLoadComplete) {
        console.log('[useDocuments] Setting initialLoadComplete to true')
        setInitialLoadComplete(true)
      }
    }
  }, [user, session?.access_token, documents.length, initialLoadComplete])

  // Keep ref up to date with latest fetchDocuments function
  useEffect(() => {
    fetchDocumentsRef.current = fetchDocuments
  }, [fetchDocuments])

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
      
      // Remove from state
      setDocuments(prev => {
        console.log('[useDocuments] setDocuments callback - prev length:', prev.length)
        const newDocs = prev.filter(doc => doc.id !== documentId)
        console.log('[useDocuments] LOCAL STATE UPDATED: before length =', prev.length, ', after length =', newDocs.length)
        console.log('[useDocuments] Remaining docs:', newDocs.map(d => ({ id: d.id, name: d.original_filename })))
        return newDocs
      })
      
      console.log('[useDocuments] Clearing cache...')
      lastFetchTime.current = 0
      
      // Fetch fresh metrics after successful delete for Dashboard refresh
      console.log('[useDocuments] Fetching fresh metrics after delete...')
      if (user?.id) {
        const metrics = await fetchMetrics(user.id)
        console.log('[useDocuments] Fresh metrics received:', metrics)
      }
      
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
    console.log('[useDocuments] addDocumentToQueue - Adding new document:', documentId, filename)
    
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
    
    console.log('[useDocuments] addDocumentToQueue - Setting document and processing count')
    setDocuments(prev => {
      console.log('[useDocuments] addDocumentToQueue - setDocuments callback, prev length:', prev.length)
      const updated = [newDoc, ...prev]
      console.log('[useDocuments] addDocumentToQueue - Updated docs length:', updated.length)
      return updated
    })
    
    processingDocIdsRef.current.add(documentId)
    setProcessingCount(prev => {
      const newCount = prev + 1
      console.log('[useDocuments] addDocumentToQueue - setProcessingCount:', prev, '→', newCount)
      return newCount
    })
    
    // Clear cache to force immediate fetch
    lastFetchTime.current = 0
    console.log('[useDocuments] addDocumentToQueue - Cleared cache, document added to list')
  }, [user?.id])

  // Setup polling with smart detection
  useEffect(() => {
    console.log('[useDocuments] Polling effect triggered - processingCount:', processingCount, 'user:', !!user, 'token:', !!session?.access_token)
    
    // Only poll if there are processing documents
    if (processingCount === 0 || !user || !session?.access_token) {
      console.log('[useDocuments] Stopping polling - no processing documents or no auth')
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
        isPollingRef.current = false
      }
      return
    }

    // Start polling
    if (isPollingRef.current) {
      console.log('[useDocuments] Already polling, skipping setup')
      return
    }
    
    console.log('[useDocuments] Starting polling - processingCount:', processingCount)
    isPollingRef.current = true

    // Initial immediate fetch (no delay)
    console.log('[useDocuments] Initial fetch started immediately')
    if (fetchDocumentsRef.current) {
      fetchDocumentsRef.current(true)
    }

    // Then poll every 1.5 seconds for faster updates during processing
    pollIntervalRef.current = setInterval(() => {
      console.log('[useDocuments] Poll interval triggered')
      if (fetchDocumentsRef.current) {
        fetchDocumentsRef.current(true)
      }
    }, 1500)

    return () => {
      console.log('[useDocuments] Cleaning up polling')
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      isPollingRef.current = false
    }
  }, [processingCount, user, session?.access_token])

  // Handle page visibility and focus changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && fetchDocumentsRef.current) {
        fetchDocumentsRef.current(true)
      }
    }

    const handleFocus = () => {
      if (fetchDocumentsRef.current) {
        fetchDocumentsRef.current(true)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Initial fetch when user/session changes
  useEffect(() => {
    if (user && session?.access_token && fetchDocumentsRef.current) {
      fetchDocumentsRef.current(true)
    }
  }, [user, session?.access_token])

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