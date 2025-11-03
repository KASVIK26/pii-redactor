'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface Entity {
  id?: string
  text: string
  label: string
  method: string
  start_pos: number
  end_pos: number
  confidence: number
  is_redacted?: boolean
}

interface EntityReviewProps {
  documentId: string
  accessToken: string
  onClose: () => void
}

const EntityTypeColors = {
  PERSON: 'bg-blue-100 text-blue-800',
  ORGANIZATION: 'bg-green-100 text-green-800', 
  LOCATION: 'bg-purple-100 text-purple-800',
  EMAIL: 'bg-red-100 text-red-800',
  PHONE: 'bg-orange-100 text-orange-800',
  DATE: 'bg-yellow-100 text-yellow-800',
  IDENTIFIER: 'bg-gray-100 text-gray-800',
  MISC: 'bg-indigo-100 text-indigo-800',
}

export default function EntityReview({ documentId, accessToken, onClose }: EntityReviewProps) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterBy, setFilterBy] = useState<string>('all')

  useEffect(() => {
    fetchEntities()
  }, [documentId])

  const fetchEntities = async () => {
    try {
      console.log(`[FRONTEND] EntityReview - Fetching document for: ${documentId}`)
      const response = await fetch(`http://localhost:8000/api/documents/${documentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.status}`)
      }

      const document = await response.json()
      console.log(`[FRONTEND] EntityReview - Document fetched:`, document)
      
      // Extract entities from metadata
      const entitiesFromMetadata = document.metadata?.entities || []
      console.log(`[FRONTEND] EntityReview - Entities found:`, entitiesFromMetadata.length)
      console.log(`[FRONTEND] EntityReview - Sample:`, entitiesFromMetadata.slice(0, 3))
      
      setEntities(entitiesFromMetadata)
    } catch (err) {
      setError('Failed to load entities')
      console.error('[FRONTEND] EntityReview - Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredEntities = entities.filter(entity => {
    if (filterBy === 'all') return true
    return entity.label === filterBy
  })

  const entityTypes = [...new Set(entities.map(e => e.label))]

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg">
          <div className="text-center">Loading entities...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Review Detected PII</h2>
              <p className="text-gray-600">Review detected personally identifiable information before redaction</p>
            </div>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Sidebar Filters */}
          <div className="w-64 border-r flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold mb-4">Filter by</h3>
              <div className="space-y-2">
                <Button
                  variant={filterBy === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilterBy('all')}
                  className="w-full justify-start"
                >
                  All ({entities.length})
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <h4 className="font-semibold mb-2">Entity Types</h4>
              <div className="space-y-1">
                {entityTypes.map(type => (
                  <Button
                    key={type}
                    variant={filterBy === type ? 'default' : 'outline'}
                    onClick={() => setFilterBy(type)}
                    className="w-full justify-start text-xs"
                  >
                    {type} ({entities.filter(e => e.label === type).length})
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Entity List */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto p-4">
              {error ? (
                <div className="text-red-600 text-center py-8">{error}</div>
              ) : filteredEntities.length === 0 ? (
                <div className="text-gray-500 text-center py-8">No entities found</div>
              ) : (
                <div className="space-y-3">
                  {filteredEntities.map((entity, index) => (
                    <Card key={entity.id || index} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge 
                                variant="secondary"
                                className={EntityTypeColors[entity.label as keyof typeof EntityTypeColors] || 'bg-gray-100 text-gray-800'}
                              >
                                {entity.label}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {entity.method}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {Math.round(entity.confidence * 100)}%
                              </Badge>
                            </div>
                            <div className="text-lg font-medium bg-gray-50 p-2 rounded border">
                              "{entity.text}"
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              Position: {entity.start_pos} - {entity.end_pos}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-6 bg-gradient-to-r from-slate-50 to-slate-100 flex justify-between items-center">
          <div className="text-base text-gray-700 font-medium">
            Total: <span className="text-2xl font-bold text-blue-600">{entities.length}</span> entities detected
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="px-6 py-2 text-base"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                window.location.href = `/editor/${documentId}`
              }}
              className="px-8 py-2 text-base bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all"
            >
              Save & Go to Live Editor
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}