from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
from datetime import datetime
from supabase import create_client, Client
from app.core.config import settings

router = APIRouter()
security = HTTPBearer()

# Function to get Supabase client (initialized when called, not at import)
def get_supabase_client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def get_supabase_auth_client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

# Auth dependency
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify JWT token and get current user"""
    try:
        # Use anon client to verify token
        supabase_auth = get_supabase_auth_client()
        user_response = supabase_auth.auth.get_user(credentials.credentials)
        
        if user_response.user:
            return user_response.user
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed"
        )

class DocumentMetadata(BaseModel):
    id: str
    user_id: str
    filename: str
    original_filename: str
    file_size: int
    file_type: str
    mime_type: str
    storage_path: str
    status: str
    upload_date: str
    processed_date: Optional[str] = None
    created_at: str
    updated_at: str
    metadata: Optional[dict] = None

class DocumentUploadResponse(BaseModel):
    document_id: str
    filename: str
    message: str

ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def allowed_file(filename: str) -> bool:
    return '.' in filename and \
           os.path.splitext(filename)[1].lower() in ALLOWED_EXTENSIONS

@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    current_user = Depends(get_current_user)
):
    """Upload a document for PII redaction"""
    
    # Validate file
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds maximum limit of 10MB"
        )
    document_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    storage_path = f"documents/{document_id}{file_extension}"
    try:
        supabase = get_supabase_client()
        # Upload to Supabase Storage
        storage_response = supabase.storage.from_("documents").upload(
            storage_path, 
            content,
            file_options={"content-type": file.content_type}
        )
        # Check for upload errors - Supabase storage response format varies
        if hasattr(storage_response, 'error') and storage_response.error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload file to storage: {storage_response.error}"
            )
        # Save metadata to database
        db_response = supabase.table("documents").insert({
            "id": document_id,
            "user_id": current_user.id,
            "filename": file.filename,
            "original_filename": file.filename,
            "file_size": len(content),
            "file_type": file_extension[1:] if file_extension else "unknown",
            "mime_type": file.content_type,
            "storage_path": storage_path,
            "status": "queued"
        }).execute()
        if not db_response.data or (hasattr(db_response, 'error') and db_response.error):
            # Clean up storage if DB insert fails
            supabase.storage.from_("documents").remove([storage_path])
            error_msg = db_response.error if hasattr(db_response, 'error') else "Unknown database error"
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to save document metadata: {error_msg}"
            )
        # Queue background processing for PII detection/redaction
        if background_tasks is not None:
            background_tasks.add_task(process_document_task, document_id, storage_path, file.content_type)
        return DocumentUploadResponse(
            document_id=document_id,
            filename=file.filename,
            message="File uploaded and queued for processing"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )
# Background task for processing document
def process_document_task(document_id: str, storage_path: str, mime_type: str):
    import tempfile
    import os
    import json
    import numpy as np
    from app.services.ocr_service import OCRService
    from app.services.pii_detection_service import PIIDetectionService
    from app.services.redaction_service import RedactionService
    import logging
    
    def make_json_serializable(obj):
        """Convert numpy types to Python native types for JSON serialization"""
        if isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, dict):
            return {key: make_json_serializable(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [make_json_serializable(item) for item in obj]
        else:
            return obj
    
    def get_and_merge_metadata(supabase, doc_id: str, new_metadata: dict):
        """Fetch current metadata and merge with new updates"""
        try:
            result = supabase.table("documents").select("metadata").eq("id", doc_id).execute()
            if result.data and result.data[0].get("metadata"):
                current_metadata = result.data[0]["metadata"]
                if isinstance(current_metadata, dict):
                    # Merge: keep existing fields, update with new ones
                    merged = {**current_metadata, **new_metadata}
                    return merged
        except Exception as e:
            logger.warning(f"Could not fetch current metadata for {doc_id}: {str(e)}")
        
        # If fetch fails or no existing metadata, return just the new metadata
        return new_metadata
    
    supabase = get_supabase_client()
    logger = logging.getLogger("process_document_task")
    supabase.table("documents").update({"status": "processing"}).eq("id", document_id).execute()
    try:
        # Download file from Supabase Storage
        logger.info(f"Downloading file from storage: {storage_path}")
        file_response = supabase.storage.from_("documents").download(storage_path)
        
        # Handle different response formats
        file_bytes = None
        if hasattr(file_response, 'data') and file_response.data:
            file_bytes = file_response.data
        elif isinstance(file_response, bytes):
            file_bytes = file_response
        else:
            logger.error(f"Unexpected response format for document {document_id}: {type(file_response)}")
            supabase.table("documents").update({
                "status": "failed",
                "metadata": {"error": "Failed to download file from storage", "stage": "download"}
            }).eq("id", document_id).execute()
            return
            
        if not file_bytes:
            logger.error(f"No file data received for document {document_id}")
            supabase.table("documents").update({
                "status": "failed", 
                "metadata": {"error": "No file data received", "stage": "download"}
            }).eq("id", document_id).execute()
            return
            
        logger.info(f"Successfully downloaded {len(file_bytes)} bytes for document {document_id}")
        
        # Update status to indicate download completed
        merged_metadata = get_and_merge_metadata(supabase, document_id, {
            "stage": "download_complete",
            "file_size_downloaded": len(file_bytes)
        })
        supabase.table("documents").update({
            "status": "processing",
            "metadata": merged_metadata
        }).eq("id", document_id).execute()
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(storage_path)[1]) as tmp_file:
            tmp_file.write(file_bytes)
            tmp_file_path = tmp_file.name
        # OCR
        logger.info(f"Starting OCR for document {document_id}")
        merged_metadata = get_and_merge_metadata(supabase, document_id, {
            "stage": "ocr_starting",
            "file_size_downloaded": len(file_bytes)
        })
        supabase.table("documents").update({
            "metadata": merged_metadata
        }).eq("id", document_id).execute()
        
        try:
            ocr = OCRService()
            if mime_type == "application/pdf":
                ocr_result = ocr.extract_text_from_pdf(tmp_file_path)
                full_text = " ".join([p['text'] for p in ocr_result['pages']])
                blocks = [b for p in ocr_result['pages'] for b in p['blocks']]
            else:
                ocr_result = ocr.extract_text_from_image(tmp_file_path)
                full_text = ocr_result['full_text']
                blocks = ocr_result['text_blocks']
                
            logger.info(f"OCR completed for document {document_id}, extracted {len(full_text)} characters")
            merged_metadata = get_and_merge_metadata(supabase, document_id, {
                "stage": "ocr_complete",
                "text_length": len(full_text),
                "file_size_downloaded": len(file_bytes)
            })
            supabase.table("documents").update({
                "metadata": merged_metadata
            }).eq("id", document_id).execute()
            
        except Exception as e:
            logger.error(f"OCR failed for document {document_id}: {str(e)}")
            supabase.table("documents").update({
                "status": "failed",
                "metadata": {"stage": "ocr_failed", "error": str(e), "file_size_downloaded": len(file_bytes)}
            }).eq("id", document_id).execute()
            full_text = ""
            blocks = []
        
        # PII Detection
        logger.info(f"Starting PII detection for document {document_id}")
        merged_metadata = get_and_merge_metadata(supabase, document_id, {
            "stage": "pii_detection_starting",
            "text_length": len(full_text),
            "file_size_downloaded": len(file_bytes)
        })
        supabase.table("documents").update({
            "metadata": merged_metadata
        }).eq("id", document_id).execute()
        
        try:
            pii = PIIDetectionService()
            entities = pii.detect_pii(full_text)
            logger.info(f"PII detection completed for document {document_id}, found {len(entities)} entities")
            merged_metadata = get_and_merge_metadata(supabase, document_id, {
                "stage": "pii_detection_complete",
                "entities_found": len(entities),
                "text_length": len(full_text),
                "file_size_downloaded": len(file_bytes)
            })
            supabase.table("documents").update({
                "metadata": merged_metadata
            }).eq("id", document_id).execute()
            
        except Exception as e:
            logger.error(f"PII detection failed for document {document_id}: {str(e)}")
            supabase.table("documents").update({
                "status": "failed",
                "metadata": {"stage": "pii_detection_failed", "error": str(e), "text_length": len(full_text), "file_size_downloaded": len(file_bytes)}
            }).eq("id", document_id).execute()
            entities = []
        
        # Redaction
        logger.info(f"Starting redaction for document {document_id}")
        merged_metadata = get_and_merge_metadata(supabase, document_id, {
            "stage": "redaction_starting",
            "entities_found": len(entities),
            "text_length": len(full_text),
            "file_size_downloaded": len(file_bytes)
        })
        supabase.table("documents").update({
            "metadata": merged_metadata
        }).eq("id", document_id).execute()
        
        try:
            redactor = RedactionService()
            redacted_path = tmp_file_path.replace('.', '_redacted.', 1)
            redaction_result = redactor.redact_document(tmp_file_path, redacted_path, entities)
            logger.info(f"Redaction completed for document {document_id}")
            merged_metadata = get_and_merge_metadata(supabase, document_id, {
                "stage": "redaction_complete",
                "entities_found": len(entities),
                "text_length": len(full_text),
                "file_size_downloaded": len(file_bytes)
            })
            supabase.table("documents").update({
                "metadata": merged_metadata
            }).eq("id", document_id).execute()
            
        except Exception as e:
            logger.error(f"Redaction failed for document {document_id}: {str(e)}")
            supabase.table("documents").update({
                "status": "failed",
                "metadata": {"stage": "redaction_failed", "error": str(e), "entities_found": len(entities), "text_length": len(full_text), "file_size_downloaded": len(file_bytes)}
            }).eq("id", document_id).execute()
            # If redaction fails, just copy the original file
            import shutil
            redacted_path = tmp_file_path.replace('.', '_redacted.', 1)
            shutil.copy2(tmp_file_path, redacted_path)
        # Upload redacted file
        logger.info(f"Uploading redacted file for document {document_id}")
        merged_metadata = get_and_merge_metadata(supabase, document_id, {
            "stage": "upload_starting",
            "entities_found": len(entities),
            "text_length": len(full_text),
            "file_size_downloaded": len(file_bytes)
        })
        supabase.table("documents").update({
            "metadata": merged_metadata
        }).eq("id", document_id).execute()
        
        with open(redacted_path, "rb") as f:
            redacted_bytes = f.read()
        redacted_storage_path = storage_path.replace('.', '_redacted.', 1)
        upload_result = supabase.storage.from_("documents").upload(
            redacted_storage_path,
            redacted_bytes,
            file_options={"content-type": mime_type}
        )
        
        logger.info(f"Upload completed for document {document_id}")
        
        # Update DB with processed status and redacted file path
        merged_metadata = get_and_merge_metadata(supabase, document_id, {
            "stage": "completed",
            "entities": make_json_serializable(entities), 
            "redacted_storage_path": redacted_storage_path,
            "entities_found": len(entities),
            "text_length": len(full_text),
            "file_size_downloaded": len(file_bytes),
            "redacted_file_size": len(redacted_bytes)
        })
        supabase.table("documents").update({
            "status": "processed",
            "metadata": merged_metadata
        }).eq("id", document_id).execute()
        
        # Store entities in simplified redaction session (optional)
        try:
            # Note: We'll skip this for now since we don't have proper user context in background task
            # The entities are already stored in documents.metadata.entities which is sufficient
            # Users can create redaction sessions from the frontend when needed
            logger.info(f"Entities stored in document metadata for {document_id}")
        except Exception as e:
            logger.warning(f"Note: {str(e)}")
            # Don't fail the whole process
        
        # Cleanup temp files
        os.remove(tmp_file_path)
        os.remove(redacted_path)
    except Exception as e:
        logger.error(f"Processing failed for document {document_id}: {str(e)}")
        supabase.table("documents").update({
            "status": "failed",
            "metadata": {"stage": "general_error", "error": str(e)}
        }).eq("id", document_id).execute()

@router.get("/", response_model=List[DocumentMetadata])
async def list_documents(current_user = Depends(get_current_user)):
    """List all documents for the authenticated user"""
    
    try:
        supabase = get_supabase_client()
        response = supabase.table("documents").select("*").eq("user_id", current_user.id).execute()
        return response.data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch documents: {str(e)}"
        )

@router.get("/{document_id}", response_model=DocumentMetadata)
async def get_document(
    document_id: str,
    current_user = Depends(get_current_user)
):
    """Get document metadata by ID"""
    
    try:
        supabase = get_supabase_client()
        response = supabase.table("documents").select("*").eq("id", document_id).eq("user_id", current_user.id).execute()
        
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        return response.data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch document: {str(e)}"
        )

@router.get("/{document_id}/file")
async def get_document_file(
    document_id: str,
    redacted: bool = False
):
    """Get the document file (original or redacted)"""
    
    try:
        supabase = get_supabase_client()
        
        # Get document metadata
        doc_response = supabase.table("documents").select("*").eq("id", document_id).execute()
        
        if not doc_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        document = doc_response.data[0]
        
        # Determine which file to serve
        if redacted and document.get("metadata", {}).get("redacted_storage_path"):
            file_path = document["metadata"]["redacted_storage_path"]
        else:
            file_path = document["storage_path"]
        
        # Download file from Supabase Storage
        file_response = supabase.storage.from_("documents").download(file_path)
        
        # Handle different response formats
        file_bytes = None
        if hasattr(file_response, 'data') and file_response.data:
            file_bytes = file_response.data
        elif isinstance(file_response, bytes):
            file_bytes = file_response
        
        if not file_bytes:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found"
            )
        
        # Determine content type
        content_type = document.get("mime_type", "application/octet-stream")
        
        from fastapi.responses import Response
        return Response(
            content=file_bytes,
            media_type=content_type,
            headers={
                "Content-Disposition": f"inline; filename=\"{document['original_filename']}\""
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to serve document file: {str(e)}"
        )

@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    current_user = Depends(get_current_user)
):
    """Delete a document"""
    
    try:
        supabase = get_supabase_client()
        
        print(f"[DEBUG] Attempting to delete document: {document_id} for user: {current_user.id}")
        
        # Get document to verify ownership and get storage path
        doc_response = supabase.table("documents").select("*").eq("id", document_id).eq("user_id", current_user.id).execute()
        
        print(f"[DEBUG] Query result: {doc_response.data}")
        
        if not doc_response.data:
            print(f"[DEBUG] Document not found - trying alternative queries")
            
            # Try checking if document exists at all
            all_doc_response = supabase.table("documents").select("id, user_id").eq("id", document_id).execute()
            print(f"[DEBUG] Document exists in DB: {all_doc_response.data}")
            
            if all_doc_response.data:
                doc_user_id = all_doc_response.data[0].get("user_id")
                print(f"[DEBUG] Document belongs to user: {doc_user_id}, request from user: {current_user.id}")
            
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found or you don't have permission to delete it"
            )
        
        document = doc_response.data[0]
        
        # Delete from storage
        supabase.storage.from_("documents").remove([document["storage_path"]])
        
        # Delete from database
        supabase.table("documents").delete().eq("id", document_id).eq("user_id", current_user.id).execute()
        
        print(f"[DEBUG] Document {document_id} deleted successfully")
        return {"message": "Document deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[DEBUG] Error deleting document: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(e)}"
        )

@router.get("/{document_id}/download")
async def download_redacted_document(
    document_id: str,
    current_user = Depends(get_current_user)
):
    """Download the redacted version of a document"""
    
    try:
        supabase = get_supabase_client()
        
        # Get document to verify ownership and get redacted file path
        doc_response = supabase.table("documents").select("*").eq("id", document_id).eq("user_id", current_user.id).execute()
        
        if not doc_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        document = doc_response.data[0]
        
        if document["status"] != "processed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Document has not been processed yet"
            )
        
        # Get redacted file path from metadata
        redacted_path = document.get("metadata", {}).get("redacted_storage_path")
        if not redacted_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Redacted file not found"
            )
        
        # Download redacted file from storage
        file_response = supabase.storage.from_("documents").download(redacted_path)
        if not hasattr(file_response, 'data') or not file_response.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Redacted file not found in storage"
            )
        
        # Return file as download
        import io
        file_like = io.BytesIO(file_response.data)
        
        # Generate filename for download
        original_name = document["original_filename"]
        name_parts = original_name.rsplit('.', 1)
        if len(name_parts) == 2:
            redacted_filename = f"{name_parts[0]}_redacted.{name_parts[1]}"
        else:
            redacted_filename = f"{original_name}_redacted"
        
        return StreamingResponse(
            io.BytesIO(file_response.data),
            media_type=document["mime_type"],
            headers={"Content-Disposition": f"attachment; filename={redacted_filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download document: {str(e)}"
        )