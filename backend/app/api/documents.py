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
    print(f"[Auth] get_current_user called with credentials: {credentials.credentials[:50] if credentials else 'None'}...")
    try:
        # Use anon client to verify token
        supabase_auth = get_supabase_auth_client()
        print(f"[Auth] Verifying token with Supabase...")
        user_response = supabase_auth.auth.get_user(credentials.credentials)
        print(f"[Auth] User response: {user_response}")
        
        if user_response.user:
            print(f"[Auth] User verified: {user_response.user.id}")
            return user_response.user
        else:
            print(f"[Auth] ERROR: No user in response")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Auth] ERROR: {str(e)}")
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

class BoundingBoxModel(BaseModel):
    x: float
    y: float
    width: float
    height: float
    scale: Optional[float] = None

class CustomRedactionModel(BaseModel):
    page: int
    bbox: BoundingBoxModel
    type: str
    label: Optional[str] = None

class ApplyRedactionRequest(BaseModel):
    documentId: str
    approvedEntityIds: List[str]
    customRedactions: List[CustomRedactionModel] = []
    modifications: Optional[List[dict]] = None

class RedactionStatsModel(BaseModel):
    totalRedacted: int
    totalPages: int
    processedPages: int
    failedPages: int
    originalFileSize: int
    redactedFileSize: int
    processingTimeMs: int

class ApplyRedactionResponse(BaseModel):
    success: bool
    message: str
    redactedDocumentId: Optional[str] = None
    redactedStoragePath: Optional[str] = None
    downloadUrl: Optional[str] = None
    stats: Optional[RedactionStatsModel] = None
    error: Optional[str] = None

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
    storage_path = f"{document_id}{file_extension}"
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
            
            # Detailed entity breakdown logging
            entity_breakdown = {}
            entity_methods = {}
            for entity in entities:
                label = entity.get('label', 'UNKNOWN')
                method = entity.get('method', 'unknown')
                
                entity_breakdown[label] = entity_breakdown.get(label, 0) + 1
                if method not in entity_methods:
                    entity_methods[method] = {}
                entity_methods[method][label] = entity_methods[method].get(label, 0) + 1
            
            logger.info(f"[Document {document_id}] PII detection completed: {len(entities)} total entities")
            logger.info(f"[Document {document_id}] Entity breakdown by type: {entity_breakdown}")
            logger.info(f"[Document {document_id}] Entity breakdown by detection method: {entity_methods}")
            
            # Log top detected entities (for analysis purposes - limit to first 50)
            sorted_entities = sorted(entities, key=lambda x: x.get('confidence', 0), reverse=True)[:50]
            for idx, entity in enumerate(sorted_entities, 1):
                logger.debug(f"[Document {document_id}] Entity {idx}: {entity.get('label', 'UNKNOWN'):15} | "
                            f"Method: {entity.get('method', 'unknown'):12} | "
                            f"Confidence: {entity.get('confidence', 0):.2f} | "
                            f"Text: '{entity.get('text', '')[:60]}'")
            
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
        
        # Ensure storage_path doesn't have "documents/" prefix (for new documents)
        # In case old documents have it, strip it out (including multiple prefixes)
        clean_storage_path = storage_path
        while clean_storage_path.startswith("documents/"):
            clean_storage_path = clean_storage_path.replace("documents/", "", 1)
        
        redacted_storage_path = clean_storage_path.replace('.', '_redacted.', 1)
        
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
        logger.info(f"[REDACTION UPLOAD] DB updated with redacted_storage_path")
        
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
        
        # Delete both original and redacted files from storage
        files_to_delete = [document["storage_path"]]
        
        # Also delete redacted file if it exists
        redacted_path = document.get("metadata", {}).get("redacted_storage_path")
        if redacted_path:
            files_to_delete.append(redacted_path)
        
        supabase.storage.from_("documents").remove(files_to_delete)
        
        # Delete from database
        supabase.table("documents").delete().eq("id", document_id).eq("user_id", current_user.id).execute()
        
        print(f"[DEBUG] Document {document_id} deleted successfully (original + redacted)")
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
        
        # Ensure path doesn't have "documents/" prefix (for old documents that have it)
        clean_redacted_path = redacted_path
        while clean_redacted_path.startswith("documents/"):
            clean_redacted_path = clean_redacted_path.replace("documents/", "", 1)
        
        # Download redacted file from storage with fallback paths
        file_response = None
        paths_to_try = [
            clean_redacted_path,  # Try: 78e72506..._redacted.pdf
            f"documents/{clean_redacted_path}",  # Try: documents/78e72506..._redacted.pdf (for nested old uploads)
        ]
        
        for attempt_path in paths_to_try:
            try:
                file_response = supabase.storage.from_("documents").download(attempt_path)
                
                # Check if response is bytes directly
                if isinstance(file_response, bytes):
                    break
                elif hasattr(file_response, 'data') and file_response.data:
                    break
                else:
                    continue
            except Exception:
                continue
        
        # Handle both bytes response and object with .data attribute
        file_bytes = None
        if isinstance(file_response, bytes):
            file_bytes = file_response
        elif file_response and hasattr(file_response, 'data') and file_response.data:
            file_bytes = file_response.data
        
        if not file_bytes:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Redacted file not found in storage"
            )
        
        # Return file as download
        import io
        
        # Generate filename for download
        original_name = document["original_filename"]
        name_parts = original_name.rsplit('.', 1)
        if len(name_parts) == 2:
            redacted_filename = f"{name_parts[0]}_redacted.{name_parts[1]}"
        else:
            redacted_filename = f"{original_name}_redacted"
        
        return StreamingResponse(
            io.BytesIO(file_bytes),
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

@router.get("/{document_id}/download-redacted")
async def download_redacted_document_alt(
    document_id: str,
    current_user = Depends(get_current_user)
):
    """Download the redacted version of a document"""
    
    try:
        print(f"[Download] ===== STARTING DOWNLOAD =====")
        print(f"[Download] Document ID: {document_id}")
        print(f"[Download] Current user ID: {current_user.id}")
        
        supabase = get_supabase_client()
        
        # Get document by ID
        print(f"[Download] Fetching document from database...")
        doc_response = supabase.table("documents").select("*").eq("id", document_id).execute()
        
        print(f"[Download] Query returned {len(doc_response.data) if doc_response.data else 0} documents")
        
        if not doc_response.data:
            print(f"[Download] ERROR: Document not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        document = doc_response.data[0]
        print(f"[Download] Document owner: {document.get('user_id')}")
        print(f"[Download] Document status: {document.get('status')}")
        
        # Verify ownership
        if document.get("user_id") != current_user.id:
            print(f"[Download] ERROR: User mismatch!")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to download this document"
            )
        
        if document["status"] != "processed":
            print(f"[Download] ERROR: Document status is '{document['status']}', expected 'processed'")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Document has not been processed yet (status: {document['status']})"
            )
        
        print(f"[Download] Status check passed. Status: 'processed'")
        
        # Get redacted file path from metadata
        redacted_path = document.get("metadata", {}).get("redacted_storage_path")
        print(f"[Download] Redacted path from metadata: {redacted_path}")
        
        if not redacted_path:
            print(f"[Download] ERROR: No redacted_storage_path in metadata")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Redacted file not found"
            )
        
        # Clean path to handle old documents with "documents/" prefix
        clean_redacted_path = redacted_path
        while clean_redacted_path.startswith("documents/"):
            clean_redacted_path = clean_redacted_path.replace("documents/", "", 1)
        
        print(f"[Download] Attempting to download from paths...")
        
        # Download redacted file from storage with fallback paths
        file_response = None
        paths_to_try = [
            clean_redacted_path,  # Try: 78e72506..._redacted.pdf
            f"documents/{clean_redacted_path}",  # Try: documents/78e72506..._redacted.pdf (for nested old uploads)
        ]
        
        for attempt_path in paths_to_try:
            print(f"[Download] Trying path: {attempt_path}")
            try:
                file_response = supabase.storage.from_("documents").download(attempt_path)
                print(f"[Download] SUCCESS: Downloaded from {attempt_path}")
                print(f"[Download] Response type: {type(file_response)}")
                print(f"[Download] Response attributes: {dir(file_response)}")
                print(f"[Download] Response value: {file_response if isinstance(file_response, bytes) else 'not bytes'}")
                break
            except Exception as e:
                print(f"[Download] Failed to download from {attempt_path}: {e}")
                continue
        
        print(f"[Download] After loop - file_response type: {type(file_response)}")
        
        # The response might be bytes directly, not an object with .data
        file_data = None
        if isinstance(file_response, bytes):
            print(f"[Download] Response is bytes directly. Size: {len(file_response)}")
            file_data = file_response
        elif hasattr(file_response, 'data') and file_response.data:
            print(f"[Download] Response has .data attribute. Size: {len(file_response.data)}")
            file_data = file_response.data
        else:
            print(f"[Download] ERROR: Response is neither bytes nor has .data attribute")
            print(f"[Download] Response: {file_response}")
        
        if not file_data:
            print(f"[Download] ERROR: File data is empty or invalid")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Redacted file not found in storage"
            )
        
        print(f"[Download] File data ready. Size: {len(file_data)} bytes")
        
        # Return file as download
        import io
        
        # Generate filename for download
        original_name = document["original_filename"]
        name_parts = original_name.rsplit('.', 1)
        if len(name_parts) == 2:
            redacted_filename = f"{name_parts[0]}_redacted.{name_parts[1]}"
        else:
            redacted_filename = f"{original_name}_redacted"
        
        print(f"[Download] Returning file as download: {redacted_filename}")
        print(f"[Download] ===== DOWNLOAD COMPLETE - RETURNING STREAMED RESPONSE =====")
        
        return StreamingResponse(
            io.BytesIO(file_data),
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


@router.post("/{document_id}/apply-redaction", response_model=ApplyRedactionResponse)
async def apply_redaction(
    document_id: str,
    request: ApplyRedactionRequest,
    background_tasks: BackgroundTasks = None,
    current_user = Depends(get_current_user)
):
    """
    Apply approved redactions to a document
    
    - Downloads original document
    - Applies redactions to approved entities and custom redactions
    - Saves redacted PDF to storage
    - Updates document metadata
    - Returns download URL
    """
    import time
    from app.services.redaction_service import apply_redactions_to_pdf
    
    start_time = time.time()
    
    try:
        supabase = get_supabase_client()
        
        # Verify document exists and belongs to user
        doc_response = supabase.table("documents").select("*").eq("id", document_id).execute()
        
        if not doc_response.data or len(doc_response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        document = doc_response.data[0]
        
        # Verify ownership
        if document["user_id"] != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this document"
            )
        
        # Download original document
        storage_path = document["storage_path"]
        clean_storage_path = storage_path
        while clean_storage_path.startswith("documents/"):
            clean_storage_path = clean_storage_path.replace("documents/", "", 1)
        
        file_response = None
        paths_to_try = [clean_storage_path, f"documents/{clean_storage_path}"]
        
        for attempt_path in paths_to_try:
            try:
                file_response = supabase.storage.from_("documents").download(attempt_path)
                break
            except Exception:
                continue
        
        if not file_response:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Original document file not found"
            )
        
        # Extract file bytes (handle both response formats)
        file_bytes = None
        if isinstance(file_response, bytes):
            file_bytes = file_response
        elif hasattr(file_response, 'data') and file_response.data:
            file_bytes = file_response.data
        
        if not file_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to read document file"
            )
        
        original_file_size = len(file_bytes)
        
        # Prepare redactions data
        redactions_data = {
            "approved_entity_ids": request.approvedEntityIds,
            "custom_redactions": [
                {
                    "page": r.page,
                    "bbox": {
                        "x": r.bbox.x,
                        "y": r.bbox.y,
                        "width": r.bbox.width,
                        "height": r.bbox.height,
                        "scale": r.bbox.scale
                    },
                    "type": r.type,
                    "label": r.label
                }
                for r in request.customRedactions
            ]
        }
        
        # Get entities from document metadata to pass to redaction service
        entities_for_redaction = document.get("metadata", {}).get("entities", [])
        
        # Apply redactions using redaction service
        redacted_bytes, stats = apply_redactions_to_pdf(
            file_bytes=file_bytes,
            redactions=redactions_data,
            document_id=document_id,
            entities=entities_for_redaction
        )
        
        redacted_file_size = len(redacted_bytes)
        
        # Generate filename for redacted document
        original_filename = document["original_filename"]
        name_parts = original_filename.rsplit('.', 1)
        if len(name_parts) == 2:
            redacted_filename = f"{name_parts[0]}_redacted.{name_parts[1]}"
        else:
            redacted_filename = f"{original_filename}_redacted"
        
        # Create storage paths for redacted documents
        # Keep versioned copies with timestamps for audit trail
        from datetime import datetime as dt_module
        timestamp = dt_module.utcnow().strftime("%Y%m%d_%H%M%S")
        
        redacted_storage_path = f"{document_id}_redacted.pdf"  # Latest version (updated each time)
        redacted_versioned_path = f"{document_id}_redacted_{timestamp}.pdf"  # Timestamped version (archived)
        
        # Upload/archive redacted file to storage (versioned copy for history)
        try:
            upload_versioned_response = supabase.storage.from_("documents").upload(
                redacted_versioned_path,
                redacted_bytes,
                file_options={"content-type": "application/pdf"}
            )
        except Exception:
            # Versioned copy is nice-to-have but not critical
            pass
        
        # Upload/overwrite latest redacted file to storage
        try:
            # First try to remove the latest file if it exists
            try:
                supabase.storage.from_("documents").remove([redacted_storage_path])
            except Exception:
                # File might not exist, that's fine
                pass
            
            # Now upload the latest redacted file
            upload_response = supabase.storage.from_("documents").upload(
                redacted_storage_path,
                redacted_bytes,
                file_options={"content-type": "application/pdf"}
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload redacted document: {str(e)}"
            )
        
        if hasattr(upload_response, 'error') and upload_response.error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload redacted document: {upload_response.error}"
            )
        
        # Update document metadata
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        updated_metadata = document.get("metadata", {})
        updated_metadata["redacted_storage_path"] = redacted_storage_path  # Latest version
        updated_metadata["redacted_storage_path_versioned"] = redacted_versioned_path  # Archived version with timestamp
        
        # Initialize redaction history if not present
        if "redaction_history" not in updated_metadata:
            updated_metadata["redaction_history"] = []
        
        # Add current redaction to history
        updated_metadata["redaction_history"].append({
            "timestamp": timestamp,
            "versioned_path": redacted_versioned_path,
            "approved_entity_count": len(request.approvedEntityIds),
            "custom_redaction_count": len(request.customRedactions),
            "total_redacted": stats["total_redacted"],
            "processing_time_ms": processing_time_ms
        })
        
        # Keep only last 10 versions in history
        if len(updated_metadata["redaction_history"]) > 10:
            updated_metadata["redaction_history"] = updated_metadata["redaction_history"][-10:]
        
        updated_metadata["redaction_stats"] = {
            "total_redacted": stats["total_redacted"],
            "total_pages": stats["total_pages"],
            "processed_pages": stats["processed_pages"],
            "failed_pages": stats["failed_pages"],
            "original_file_size": original_file_size,
            "redacted_file_size": redacted_file_size,
            "processing_time_ms": processing_time_ms,
            "approved_entity_count": len(request.approvedEntityIds),
            "custom_redaction_count": len(request.customRedactions),
            "redacted_at": datetime.utcnow().isoformat()
        }
        
        update_response = supabase.table("documents").update({
            "status": "processed",
            "metadata": updated_metadata,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", document_id).execute()
        
        print(f"[Apply Redaction] Database update response: {update_response}")
        print(f"[Apply Redaction] Document status set to 'processed'")
        print(f"[Apply Redaction] Metadata saved with redacted_storage_path: {redacted_storage_path}")
        
        return ApplyRedactionResponse(
            success=True,
            message="Redaction applied successfully",
            redactedDocumentId=document_id,
            redactedStoragePath=redacted_storage_path,
            downloadUrl=f"/api/documents/{document_id}/download-redacted",
            stats=RedactionStatsModel(
                totalRedacted=stats["total_redacted"],
                totalPages=stats["total_pages"],
                processedPages=stats["processed_pages"],
                failedPages=stats["failed_pages"],
                originalFileSize=original_file_size,
                redactedFileSize=redacted_file_size,
                processingTimeMs=processing_time_ms
            )
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error applying redaction: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply redaction: {str(e)}"
        )