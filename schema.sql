-- PII Redactor Database Schema
-- This file contains all tables, RLS policies, storage buckets, and triggers

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create custom types
CREATE TYPE document_status AS ENUM ('uploaded', 'queued', 'processing', 'processed', 'completed', 'failed');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE user_role AS ENUM ('user', 'admin');

-- =============================================
-- USER PROFILES TABLE (extends auth.users)
-- =============================================
CREATE TABLE public.user_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    role user_role NOT NULL DEFAULT 'user',
    subscription_tier TEXT DEFAULT 'free',
    max_documents INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =============================================
-- DOCUMENTS TABLE
-- =============================================
CREATE TABLE public.documents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    filename TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT,
    page_count INTEGER,
    status document_status NOT NULL DEFAULT 'uploaded',
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    processed_date TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =============================================
-- REDACTION SESSIONS TABLE (Simplified Approach)
-- =============================================
CREATE TABLE public.redaction_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    session_name TEXT DEFAULT 'Default Session',
    
    -- All entities stored as JSON for flexibility and performance
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
-- DETECTED ENTITIES TABLE (Legacy - Keep for backward compatibility)
-- =============================================
CREATE TABLE public.detected_entities (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID REFERENCES public.redaction_jobs(id) ON DELETE CASCADE NOT NULL,
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,
    entity_text TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    confidence REAL NOT NULL,
    page_number INTEGER,
    position_data JSONB, -- bounding box, coordinates
    redacted BOOLEAN DEFAULT FALSE,
    replacement_text TEXT,
    detection_method TEXT, -- 'spacy', 'regex', 'huggingface'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =============================================
-- AUDIT LOGS TABLE
-- =============================================
CREATE TABLE public.audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
    job_id UUID REFERENCES public.redaction_jobs(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL, -- 'document', 'job', 'user'
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    session_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =============================================
-- API KEYS TABLE (for programmatic access)
-- =============================================
CREATE TABLE public.api_keys (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    key_name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    permissions TEXT[] DEFAULT ARRAY['read'],
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- =============================================
-- PROCESSING STATS TABLE (for analytics)
-- =============================================
CREATE TABLE public.processing_stats (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    documents_processed INTEGER DEFAULT 0,
    entities_detected INTEGER DEFAULT 0,
    entities_redacted INTEGER DEFAULT 0,
    total_processing_time_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, date)
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_status ON public.documents(status);
CREATE INDEX idx_documents_created_at ON public.documents(created_at DESC);

CREATE INDEX idx_redaction_sessions_document_id ON public.redaction_sessions(document_id);
CREATE INDEX idx_redaction_sessions_user_id ON public.redaction_sessions(user_id);
CREATE INDEX idx_redaction_sessions_status ON public.redaction_sessions(status);
CREATE INDEX idx_redaction_sessions_created_at ON public.redaction_sessions(created_at DESC);

-- GIN indexes for JSON querying
CREATE INDEX idx_redaction_sessions_entities_gin ON public.redaction_sessions USING GIN (entities);
CREATE INDEX idx_documents_metadata_gin ON public.documents USING GIN (metadata);

CREATE INDEX idx_detected_entities_job_id ON public.detected_entities(job_id);
CREATE INDEX idx_detected_entities_document_id ON public.detected_entities(document_id);
CREATE INDEX idx_detected_entities_type ON public.detected_entities(entity_type);

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

CREATE INDEX idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON public.api_keys(key_hash);

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_redaction_sessions_updated_at BEFORE UPDATE ON public.redaction_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- TRIGGER FOR USER PROFILE CREATION
-- =============================================
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER create_user_profile_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION create_user_profile();

-- =============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redaction_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_stats ENABLE ROW LEVEL SECURITY;

-- User Profiles Policies
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- Documents Policies
CREATE POLICY "Users can view own documents" ON public.documents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents" ON public.documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" ON public.documents
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON public.documents
    FOR DELETE USING (auth.uid() = user_id);

-- Redaction Sessions Policies
CREATE POLICY "Users can view own redaction sessions" ON public.redaction_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own redaction sessions" ON public.redaction_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own redaction sessions" ON public.redaction_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own redaction sessions" ON public.redaction_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Detected Entities Policies (Legacy)
CREATE POLICY "Users can view entities from own sessions" ON public.detected_entities
    FOR SELECT USING (
        auth.uid() = (SELECT user_id FROM public.documents WHERE id = document_id)
    );

-- Audit Logs Policies
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (true); -- Service role can insert

-- API Keys Policies
CREATE POLICY "Users can view own API keys" ON public.api_keys
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own API keys" ON public.api_keys
    FOR ALL USING (auth.uid() = user_id);

-- Processing Stats Policies
CREATE POLICY "Users can view own stats" ON public.processing_stats
    FOR SELECT USING (auth.uid() = user_id);

-- =============================================
-- STORAGE BUCKETS CONFIGURATION
-- =============================================

-- Documents bucket for original files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    false,
    10485760, -- 10MB
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
) ON CONFLICT (id) DO NOTHING;

-- Redacted documents bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'redacted-documents',
    'redacted-documents',
    false,
    10485760, -- 10MB
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
) ON CONFLICT (id) DO NOTHING;

-- Thumbnails bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'thumbnails',
    'thumbnails',
    true,
    1048576, -- 1MB
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- =============================================
-- STORAGE RLS POLICIES
-- =============================================

-- Documents storage policies
CREATE POLICY "Users can upload own documents" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'documents' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view own documents" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'documents' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete own documents" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'documents' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Redacted documents storage policies
CREATE POLICY "Users can upload own redacted documents" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'redacted-documents' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view own redacted documents" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'redacted-documents' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Thumbnails storage policies (public read)
CREATE POLICY "Anyone can view thumbnails" ON storage.objects
    FOR SELECT USING (bucket_id = 'thumbnails');

CREATE POLICY "Users can upload own thumbnails" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'thumbnails' AND 
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- =============================================
-- FUNCTIONS FOR BUSINESS LOGIC
-- =============================================

-- Function to get user document count
CREATE OR REPLACE FUNCTION get_user_document_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER 
        FROM public.documents 
        WHERE user_id = user_uuid AND status != 'failed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can upload more documents
CREATE OR REPLACE FUNCTION can_user_upload(user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    current_count INTEGER;
    max_allowed INTEGER;
BEGIN
    SELECT get_user_document_count(user_uuid) INTO current_count;
    SELECT max_documents INTO max_allowed 
    FROM public.user_profiles 
    WHERE id = user_uuid;
    
    RETURN current_count < max_allowed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
    p_user_id UUID,
    p_action TEXT,
    p_resource_type TEXT,
    p_resource_id UUID DEFAULT NULL,
    p_document_id UUID DEFAULT NULL,
    p_job_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO public.audit_logs (
        user_id, action, resource_type, resource_id, 
        document_id, job_id, details
    )
    VALUES (
        p_user_id, p_action, p_resource_type, p_resource_id,
        p_document_id, p_job_id, p_details
    )
    RETURNING id INTO audit_id;
    
    RETURN audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- VIEWS FOR REPORTING
-- =============================================

-- User dashboard view
CREATE VIEW user_dashboard AS
SELECT 
    up.id,
    up.email,
    up.full_name,
    up.role,
    up.subscription_tier,
    get_user_document_count(up.id) as document_count,
    up.max_documents,
    (
        SELECT COUNT(*) 
        FROM public.redaction_jobs rj 
        WHERE rj.user_id = up.id AND rj.status = 'processing'
    ) as active_jobs,
    (
        SELECT COUNT(*) 
        FROM public.redaction_jobs rj 
        WHERE rj.user_id = up.id AND rj.status = 'completed'
    ) as completed_jobs,
    up.created_at,
    up.updated_at
FROM public.user_profiles up;

-- Document summary view
CREATE VIEW document_summary AS
SELECT 
    d.id,
    d.user_id,
    d.filename,
    d.original_filename,
    d.file_size,
    d.file_type,
    d.status,
    d.upload_date,
    d.page_count,
    (
        SELECT COUNT(*) 
        FROM public.redaction_jobs rj 
        WHERE rj.document_id = d.id
    ) as job_count,
    (
        SELECT rj.status 
        FROM public.redaction_jobs rj 
        WHERE rj.document_id = d.id 
        ORDER BY rj.created_at DESC 
        LIMIT 1
    ) as latest_job_status,
    d.created_at,
    d.updated_at
FROM public.documents d;

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant permissions to service role
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;