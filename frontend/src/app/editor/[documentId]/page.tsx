'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { LiveRedactionEditor } from '@/components/LiveRedactionEditor'
import { Entity } from '@/types/redaction'

export default function EditorPage() {
  const params = useParams()
  const router = useRouter()
  const { session } = useAuth()
  const documentId = params?.documentId as string
  
  const [loading, setLoading] = useState(true)
  const [entities, setEntities] = useState<Entity[]>([])
  const [pdfUrl, setPdfUrl] = useState<string>('')

  // Fetch entities when component mounts
  useEffect(() => {
    if (!documentId || !session?.access_token) {
      console.log('Missing documentId or session')
      return
    }

    const fetchEntities = async () => {
      try {
        setLoading(true)
        console.log('[Editor] Fetching entities for:', documentId)
        
        const response = await fetch(`http://localhost:8000/api/documents/${documentId}/entities`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          console.log('[Editor] Entities fetched:', data.entities?.length || 0)
          setEntities(data.entities || [])
        } else {
          console.error('[Editor] Failed to fetch entities:', response.status)
        }

        // Set PDF URL
        setPdfUrl(`http://localhost:8000/api/documents/${documentId}/file`)
      } catch (err) {
        console.error('[Editor] Error fetching entities:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchEntities()
  }, [documentId, session?.access_token])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mb-4"></div>
          <p className="text-white">Loading editor...</p>
        </div>
      </div>
    )
  }

  return (
    <LiveRedactionEditor
      documentId={documentId}
      pdfUrl={pdfUrl}
      entities={entities}
      accessToken={session?.access_token || ''}
      onRedactionComplete={(result) => {
        console.log('[Editor] Redaction complete:', result)
        // Download or redirect
        if (result.downloadUrl) {
          window.location.href = result.downloadUrl
        }
        setTimeout(() => {
          router.push('/')
        }, 1000)
      }}
      onCancel={() => {
        console.log('[Editor] Cancelled')
        router.push('/')
      }}
    />
  )
}