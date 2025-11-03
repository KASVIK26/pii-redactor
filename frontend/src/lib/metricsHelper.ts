import { supabase } from '@/lib/supabase'

interface Document {
  id: string
  user_id: string
  metadata?: {
    entities?: Array<{ id: string }>
  }
}

/**
 * Fetch fresh document and entity counts from Supabase
 * This function queries the actual data to get accurate counts after delete
 */
export async function fetchMetrics(userId: string) {
  try {
    // Get all documents for the user
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)

    if (docsError) {
      console.error('[Metrics] Error fetching documents:', docsError)
      return { documentCount: 0, entityCount: 0 }
    }

    // Count total entities across all documents
    let entityCount = 0
    if (documents && documents.length > 0) {
      documents.forEach((doc: Document) => {
        const entities = doc.metadata?.entities || []
        entityCount += Array.isArray(entities) ? entities.length : 0
      })
    }

    console.log('[Metrics] Fresh counts - Documents:', documents?.length || 0, 'Entities:', entityCount)

    return {
      documentCount: documents?.length || 0,
      entityCount: entityCount,
    }
  } catch (error) {
    console.error('[Metrics] Error fetching metrics:', error)
    return { documentCount: 0, entityCount: 0 }
  }
}
