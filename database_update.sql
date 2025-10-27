-- Database Update Script for PII Redactor
-- Run this in Supabase SQL Editor to apply the optimized schema

-- =============================================
-- STEP 1: REMOVE OLD COMPLEX TABLES
-- =============================================
DROP TABLE IF EXISTS public.detected_entities CASCADE;
DROP TABLE IF EXISTS public.redaction_jobs CASCADE;

-- =============================================
-- STEP 2: CREATE/UPDATE REDACTION SESSIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.redaction_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    session_name TEXT DEFAULT 'Default Session',
    
    -- All entities stored as JSON for flexibility
    entities JSONB NOT NULL DEFAULT '[]',
    
    -- User interaction tracking
    entities_approved INTEGER DEFAULT 0,
    entities_rejected INTEGER DEFAULT 0,
    entities_pending INTEGER DEFAULT 0,
    
    -- Session settings
    confidence_threshold REAL DEFAULT 0.85,
    redaction_method TEXT DEFAULT 'black_box', -- 'black_box', 'blur', 'highlight'
    auto_approve_high_confidence BOOLEAN DEFAULT false,
    
    -- Processing status
    status TEXT DEFAULT 'draft', -- 'draft', 'review', 'approved', 'applied'
    
    -- File paths
    redacted_document_path TEXT,
    redacted_filename TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE
);

-- =============================================
-- STEP 3: ADD INDEXES
-- =============================================
DROP INDEX IF EXISTS idx_redaction_sessions_document_id;
DROP INDEX IF EXISTS idx_redaction_sessions_user_id;
DROP INDEX IF EXISTS idx_redaction_sessions_status;
DROP INDEX IF EXISTS idx_redaction_sessions_entities_gin;

CREATE INDEX idx_redaction_sessions_document_id ON public.redaction_sessions(document_id);
CREATE INDEX idx_redaction_sessions_user_id ON public.redaction_sessions(user_id);
CREATE INDEX idx_redaction_sessions_status ON public.redaction_sessions(status);
CREATE INDEX idx_redaction_sessions_entities_gin ON public.redaction_sessions USING GIN (entities);

-- =============================================
-- STEP 4: ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.redaction_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own redaction sessions" ON public.redaction_sessions;
DROP POLICY IF EXISTS "Users can insert own redaction sessions" ON public.redaction_sessions;
DROP POLICY IF EXISTS "Users can update own redaction sessions" ON public.redaction_sessions;
DROP POLICY IF EXISTS "Users can delete own redaction sessions" ON public.redaction_sessions;

CREATE POLICY "Users can view own redaction sessions" ON public.redaction_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own redaction sessions" ON public.redaction_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own redaction sessions" ON public.redaction_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own redaction sessions" ON public.redaction_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- STEP 5: UPDATE TRIGGER
-- =============================================
DROP TRIGGER IF EXISTS update_redaction_sessions_updated_at ON public.redaction_sessions;

CREATE TRIGGER update_redaction_sessions_updated_at 
    BEFORE UPDATE ON public.redaction_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- STEP 6: UTILITY FUNCTIONS (Fixed ROUND issue)
-- =============================================

-- Function to create a redaction session from document metadata
CREATE OR REPLACE FUNCTION create_redaction_session_from_document(
    p_document_id UUID,
    p_user_id UUID,
    p_session_name TEXT DEFAULT 'Auto-Generated Session'
)
RETURNS UUID AS $$
DECLARE
    session_id UUID;
    doc_entities JSONB;
BEGIN
    -- Get entities from document metadata
    SELECT metadata->'entities' INTO doc_entities
    FROM public.documents 
    WHERE id = p_document_id AND user_id = p_user_id;
    
    IF doc_entities IS NULL THEN
        doc_entities := '[]'::jsonb;
    END IF;
    
    -- Create redaction session
    INSERT INTO public.redaction_sessions (
        document_id, user_id, session_name, entities,
        entities_pending, status
    ) VALUES (
        p_document_id, p_user_id, p_session_name, doc_entities,
        jsonb_array_length(doc_entities), 'review'
    ) RETURNING id INTO session_id;
    
    RETURN session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update entity approval status
CREATE OR REPLACE FUNCTION update_entity_approval(
    p_session_id UUID,
    p_user_id UUID,
    p_entity_id TEXT,
    p_approved BOOLEAN,
    p_is_redacted BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN AS $$
DECLARE
    updated_entities JSONB;
    entity_index INTEGER;
BEGIN
    -- Update the specific entity in the entities JSON array
    UPDATE public.redaction_sessions 
    SET entities = (
        SELECT jsonb_agg(
            CASE 
                WHEN elem->>'id' = p_entity_id THEN
                    elem || jsonb_build_object(
                        'user_approved', p_approved,
                        'is_redacted', p_is_redacted,
                        'updated_at', NOW()
                    )
                ELSE elem
            END
        )
        FROM jsonb_array_elements(entities) elem
    ),
    updated_at = NOW()
    WHERE id = p_session_id AND user_id = p_user_id;
    
    -- Update counters
    UPDATE public.redaction_sessions 
    SET 
        entities_approved = (
            SELECT COUNT(*) FROM jsonb_array_elements(entities) 
            WHERE elem->>'user_approved' = 'true'
        ),
        entities_rejected = (
            SELECT COUNT(*) FROM jsonb_array_elements(entities) 
            WHERE elem->>'user_approved' = 'false'
        ),
        entities_pending = (
            SELECT COUNT(*) FROM jsonb_array_elements(entities) 
            WHERE elem->>'user_approved' IS NULL OR elem->>'user_approved' = 'null'
        )
    WHERE id = p_session_id AND user_id = p_user_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get entity statistics (FIXED ROUND function)
CREATE OR REPLACE FUNCTION get_redaction_session_stats(p_session_id UUID)
RETURNS TABLE (
    total_entities INTEGER,
    approved INTEGER,
    rejected INTEGER,
    pending INTEGER,
    completion_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        jsonb_array_length(rs.entities) as total_entities,
        rs.entities_approved as approved,
        rs.entities_rejected as rejected,
        rs.entities_pending as pending,
        CASE 
            WHEN jsonb_array_length(rs.entities) > 0 THEN
                ROUND((rs.entities_approved + rs.entities_rejected)::NUMERIC / jsonb_array_length(rs.entities) * 100, 2)
            ELSE 0::NUMERIC
        END as completion_percentage
    FROM public.redaction_sessions rs
    WHERE rs.id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STEP 7: VIEWS (FIXED ROUND function)
-- =============================================

-- Drop existing view
DROP VIEW IF EXISTS redaction_session_summary;

-- Redaction session summary view
CREATE VIEW redaction_session_summary AS
SELECT 
    rs.id,
    rs.document_id,
    rs.user_id,
    rs.session_name,
    rs.status,
    d.original_filename,
    d.file_type,
    jsonb_array_length(rs.entities) as total_entities,
    rs.entities_approved,
    rs.entities_rejected,
    rs.entities_pending,
    CASE 
        WHEN jsonb_array_length(rs.entities) > 0 THEN
            ROUND((rs.entities_approved + rs.entities_rejected)::NUMERIC / jsonb_array_length(rs.entities) * 100, 2)
        ELSE 0::NUMERIC
    END as completion_percentage,
    rs.confidence_threshold,
    rs.redaction_method,
    rs.created_at,
    rs.updated_at,
    rs.applied_at
FROM public.redaction_sessions rs
JOIN public.documents d ON rs.document_id = d.id;

-- =============================================
-- STEP 8: GRANT PERMISSIONS
-- =============================================
GRANT ALL ON public.redaction_sessions TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT SELECT ON redaction_session_summary TO authenticated;

-- Grant service role permissions (for backend processing)
GRANT ALL ON public.redaction_sessions TO service_role;

-- =============================================
-- STEP 9: ADD COMMENT FOR METADATA STRUCTURE
-- =============================================
COMMENT ON COLUMN public.documents.metadata IS 
'JSON structure for entity storage:
{
  "stage": "completed",
  "entities": [
    {
      "id": "entity_001",
      "text": "John Doe", 
      "label": "PERSON",
      "method": "spacy|huggingface|regex",
      "start_pos": 123,
      "end_pos": 131,
      "confidence": 0.95,
      "page": 1,
      "user_approved": null|true|false,
      "is_redacted": true|false,
      "replacement_text": "[REDACTED]"
    }
  ],
  "redacted_storage_path": "path/to/redacted/file.pdf",
  "entities_found": 25,
  "text_length": 5000,
  "processing_time": 12.5,
  "file_size_original": 199046,
  "file_size_redacted": 197404
}';

-- =============================================
-- COMPLETED SUCCESSFULLY
-- =============================================
-- This script has optimized the database schema for better performance
-- and simplified entity management using JSON storage approach.
-- 
-- Key benefits:
-- 1. Simplified schema with fewer tables
-- 2. JSON-based entity storage for flexibility
-- 3. Better performance with proper indexing
-- 4. Fixed ROUND function issues
-- 5. Proper RLS policies for security