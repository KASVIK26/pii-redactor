import { useState, useEffect, useRef } from 'react'
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
  const { user, session } = useAuth()
  const lastFetchTime = useRef<number>(0)
  const cacheTimeout = 60000 // 1 minute cache

  const fetchDocuments = async (forceRefresh = false) => {
    if (!user || !session?.access_token) return
    
    // Check if we should use cache
    const now = Date.now()
    if (!forceRefresh && documents.length > 0 && (now - lastFetchTime.current) < cacheTimeout) {
      setLoading(false)
      return
    }
    
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
      setDocuments(data)
      lastFetchTime.current = now
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch documents')
    } finally {
      setLoading(false)
    }
  }

  const deleteDocument = async (documentId: string) => {
    if (!user || !session?.access_token) return false
    
    try {
      const response = await fetch(`http://localhost:8000/api/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to delete document: ${response.status}`)
      }

      // Remove from local state
      setDocuments(prev => prev.filter(doc => doc.id !== documentId))
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document')
      return false
    }
  }

  const refreshDocuments = () => {
    fetchDocuments(true) // Force refresh when explicitly requested
  }

  useEffect(() => {
    fetchDocuments()
  }, [user, session])

  return {
    documents,
    loading,
    error,
    deleteDocument,
    refreshDocuments,
  }
}