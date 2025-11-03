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
  user_approved?: boolean | null
}

interface EntityReviewProps {
  documentId: string
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

export default function EntityReview({ documentId, onClose }: EntityReviewProps) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<any>(null)
  const [filterBy, setFilterBy] = useState<string>('all')

  useEffect(() => {
    fetchEntities()
    fetchSummary()
  }, [documentId])

  const fetchEntities = async () => {
    try {
      console.log(`[FRONTEND] EntityReview.fetchEntities() - Fetching entities for document: ${documentId}`)
      const response = await fetch(`http://localhost:8000/api/entities/${documentId}`, {
        headers: {
          'Authorization': `Bearer test-token`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch entities')
      }

      const data = await response.json()
      console.log(`[FRONTEND] EntityReview.fetchEntities() - API Response:`, data)
      
      // Get both detected and possible entities from API
      const detectedEntities = data.entities || []
      const possibleEntities = data.possible_entities || []
      
      console.log(`[FRONTEND] EntityReview.fetchEntities() - Detected: ${detectedEntities.length}, Possible: ${possibleEntities.length}`)
      console.log(`[FRONTEND] EntityReview.fetchEntities() - Detected sample:`, detectedEntities.slice(0, 3).map((e: any) => ({ text: e.text?.substring(0, 20), type: e.label, conf: e.confidence })))
      console.log(`[FRONTEND] EntityReview.fetchEntities() - Possible sample:`, possibleEntities.slice(0, 3).map((e: any) => ({ text: e.text?.substring(0, 20), type: e.label, conf: e.confidence })))
      
      // Combine them for display (detected entities first, then possible)
      const allEntities = [...detectedEntities, ...possibleEntities]
      console.log(`[FRONTEND] EntityReview.fetchEntities() - Total combined entities: ${allEntities.length}`)
      setEntities(allEntities)
    } catch (err) {
      setError('Failed to load entities')
      console.error('[FRONTEND] EntityReview.fetchEntities() - Error fetching entities:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchSummary = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/entities/${documentId}/summary`, {
        headers: {
          'Authorization': `Bearer test-token`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setSummary(data)
      }
    } catch (err) {
      console.error('Error fetching summary:', err)
    }
  }

  const updateEntityApproval = async (entityId: string, approved: boolean, redacted: boolean) => {
    try {
      const response = await fetch(`http://localhost:8000/api/entities/${entityId}/approval`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer test-token`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_approved: approved,
          is_redacted: redacted
        })
      })

      if (response.ok) {
        // Update local state
        setEntities(entities.map(entity => 
          entity.id === entityId 
            ? { ...entity, user_approved: approved, is_redacted: redacted }
            : entity
        ))
        fetchSummary() // Refresh summary
      }
    } catch (err) {
      console.error('Error updating entity:', err)
    }
  }

  const filteredEntities = entities.filter(entity => {
    if (filterBy === 'all') return true
    if (filterBy === 'approved') return entity.user_approved === true
    if (filterBy === 'rejected') return entity.user_approved === false
    if (filterBy === 'pending') return entity.user_approved === null
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
              <p className="text-gray-600">Review and approve/reject detected personally identifiable information</p>
            </div>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
          
          {summary && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-blue-600">{summary.total_entities}</div>
                  <div className="text-sm text-gray-600">Total Entities</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-green-600">{summary.entities_approved || 0}</div>
                  <div className="text-sm text-gray-600">Approved</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-red-600">{summary.entities_rejected || 0}</div>
                  <div className="text-sm text-gray-600">Rejected</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-yellow-600">{summary.entities_pending || summary.total_entities}</div>
                  <div className="text-sm text-gray-600">Pending</div>
                </CardContent>
              </Card>
            </div>
          )}
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
                <Button
                  variant={filterBy === 'pending' ? 'default' : 'outline'}
                  onClick={() => setFilterBy('pending')}
                  className="w-full justify-start"
                >
                  Pending Review ({entities.filter(e => e.user_approved === null || e.user_approved === undefined).length})
                </Button>
                <Button
                  variant={filterBy === 'approved' ? 'default' : 'outline'}
                  onClick={() => setFilterBy('approved')}
                  className="w-full justify-start"
                >
                  Approved ({entities.filter(e => e.user_approved === true).length})
                </Button>
                <Button
                  variant={filterBy === 'rejected' ? 'default' : 'outline'}
                  onClick={() => setFilterBy('rejected')}
                  className="w-full justify-start"
                >
                  Rejected ({entities.filter(e => e.user_approved === false).length})
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
                          
                          <div className="flex flex-col gap-2 ml-4">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`approve-${index}`}
                                checked={entity.user_approved === true}
                                onChange={(e) => {
                                  if (entity.id) {
                                    updateEntityApproval(entity.id, e.target.checked, true)
                                  }
                                }}
                                className="w-4 h-4"
                              />
                              <label htmlFor={`approve-${index}`} className="text-sm text-green-600">
                                Approve & Redact
                              </label>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`reject-${index}`}
                                checked={entity.user_approved === false}
                                onChange={(e) => {
                                  if (entity.id) {
                                    updateEntityApproval(entity.id, !e.target.checked, false)
                                  }
                                }}
                                className="w-4 h-4"
                              />
                              <label htmlFor={`reject-${index}`} className="text-sm text-red-600">
                                Reject (Keep Original)
                              </label>
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
        <div className="border-t p-4 bg-white">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Total: {entities.length} entities | Pending: {entities.filter(e => e.user_approved === null || e.user_approved === undefined).length}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={async () => {
                // Auto-approve any pending entities before navigating
                const pendingEntities = entities.filter(e => e.user_approved === null || e.user_approved === undefined)
                
                if (pendingEntities.length > 0) {
                  try {
                    // Auto-approve all pending entities
                    const approvalPromises = pendingEntities.map(entity => 
                      entity.id ? updateEntityApproval(entity.id, true, true) : Promise.resolve()
                    )
                    await Promise.all(approvalPromises)
                  } catch (error) {
                    console.error('Error auto-approving pending entities:', error)
                  }
                }
                
                // Navigate to live editor
                window.location.href = `/editor/${documentId}`
              }}>
                Save & Go to Live Editor
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}