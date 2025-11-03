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
  const [filename, setFilename] = useState<string>('document.pdf')

  // Fetch entities when component mounts
  useEffect(() => {
    if (!documentId || !session?.access_token) {
      console.log('Missing documentId or session')
      return
    }

    const fetchEntities = async () => {
      try {
        setLoading(true)
        console.log('[Editor] Fetching document metadata for:', documentId)
        
        const response = await fetch(`http://localhost:8000/api/documents/${documentId}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const document = await response.json()
          console.log('[Editor] Document fetched:', document)
          
          // Extract filename from document
          const docFilename = document.original_filename || document.filename || 'document.pdf'
          console.log('[Editor] Document filename:', docFilename)
          setFilename(docFilename)
          
          // Extract entities from metadata
          const entitiesFromMetadata = document.metadata?.entities || []
          console.log('[Editor] Entities from metadata:', entitiesFromMetadata.length)
          console.log('[Editor] Entities sample:', entitiesFromMetadata.slice(0, 3))
          
          setEntities(entitiesFromMetadata)
        } else {
          console.error('[Editor] Failed to fetch document:', response.status)
        }

        // Set PDF URL
        setPdfUrl(`http://localhost:8000/api/documents/${documentId}/file`)
      } catch (err) {
        console.error('[Editor] Error fetching document:', err)
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
      filename={filename}
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