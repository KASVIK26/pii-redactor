import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for our database
export type Database = {
  public: {
    Tables: {
      documents: {
        Row: {
          id: string
          user_id: string
          filename: string
          file_size: number
          file_type: string
          storage_path: string
          status: 'uploaded' | 'processing' | 'completed' | 'failed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          filename: string
          file_size: number
          file_type: string
          storage_path: string
          status?: 'uploaded' | 'processing' | 'completed' | 'failed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          filename?: string
          file_size?: number
          file_type?: string
          storage_path?: string
          status?: 'uploaded' | 'processing' | 'completed' | 'failed'
          created_at?: string
          updated_at?: string
        }
      }
      redaction_jobs: {
        Row: {
          id: string
          document_id: string
          user_id: string
          settings: any
          detected_entities: any[]
          redacted_document_path: string | null
          status: 'pending' | 'processing' | 'completed' | 'failed'
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          document_id: string
          user_id: string
          settings: any
          detected_entities?: any[]
          redacted_document_path?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          document_id?: string
          user_id?: string
          settings?: any
          detected_entities?: any[]
          redacted_document_path?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          created_at?: string
          completed_at?: string | null
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          document_id: string
          job_id: string
          action: string
          details: any
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_id: string
          job_id: string
          action: string
          details: any
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_id?: string
          job_id?: string
          action?: string
          details?: any
          created_at?: string
        }
      }
    }
  }
}