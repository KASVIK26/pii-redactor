from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import logging
from .documents import get_current_user
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter(prefix="/api/entities", tags=["entities"])
logger = logging.getLogger(__name__)
security = HTTPBearer()



def get_supabase_client():
    from supabase import create_client, Client
    import os
    
    url = os.getenv("SUPABASE_URL")
    # Use service role key to bypass RLS for entity management
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
    
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase configuration missing")
    
    return create_client(url, key)

# Simplified auth bypass for testing
async def get_current_user_bypass(credentials: HTTPAuthorizationCredentials = Depends(security)):
    # Always use the known user ID for test-token
    if credentials.credentials == "test-token":
        user_id = "6540a7b9-0c8e-4a38-92c2-c99c16e1beb5"
        logger.info(f"Test token detected, using user_id: {user_id}")
        return {"id": user_id, "email": "test@example.com"}
    else:
        # Use the real auth for production
        return await get_current_user(credentials)

@router.get("/{document_id}")
async def get_document_entities(
    document_id: str,
    user: dict = Depends(get_current_user_bypass)
):
    """Get all detected entities for a document"""
    try:
        supabase = get_supabase_client()
        
        # Get the document with metadata
        doc_result = supabase.table("documents").select("*").eq("id", document_id).execute()
        
        if not doc_result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        doc = doc_result.data[0]
        
        # Get entities from document metadata 
        entities = doc.get("metadata", {}).get("entities", [])
        
        return {
            "document_id": document_id,
            "entities": entities,
            "total": len(entities)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching entities for document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch entities")

@router.get("/{document_id}/summary")
async def get_redaction_summary(
    document_id: str,
    user: dict = Depends(get_current_user_bypass)
):
    """Get redaction job summary for a document"""
    try:
        supabase = get_supabase_client()
        
        # Get the document
        doc_result = supabase.table("documents").select("*").eq("id", document_id).execute()
        
        if not doc_result.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        doc = doc_result.data[0]
        
        # For test-token, allow access to any document. For real users, check ownership
        if user["id"] != "test-user-id" and doc["user_id"] != user["id"]:
            logger.warning(f"User {user['id']} trying to access summary for document owned by {doc['user_id']}")
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Get entities from metadata
        entities = doc.get("metadata", {}).get("entities", [])
        
        # Calculate statistics
        total = len(entities)
        approved = len([e for e in entities if e.get("user_approved") == True])
        rejected = len([e for e in entities if e.get("user_approved") == False])
        pending = total - approved - rejected
        
        return {
            "document_id": document_id,
            "status": doc.get("status", "unknown"),
            "total_entities": total,
            "entities_approved": approved,
            "entities_rejected": rejected,
            "entities_pending": pending,
            "entities_redacted": total  # All entities are redacted by default
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching redaction summary for document {document_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch redaction summary")

@router.put("/{entity_id}/approval")
async def update_entity_approval(
    entity_id: str,
    approval_data: dict,
    user: dict = Depends(get_current_user_bypass)
):
    """Update entity approval status (approve/reject for redaction)"""
    try:
        supabase = get_supabase_client()
        user_approved = approval_data.get("user_approved")
        is_redacted = approval_data.get("is_redacted", True)
        
        # First, find which document contains this entity
        # Get all documents and search for the entity
        documents_response = supabase.table("documents").select("*").execute()
        
        target_document = None
        entity_index = None
        
        for doc in documents_response.data:
            if doc.get("metadata") and doc["metadata"].get("entities"):
                for i, entity in enumerate(doc["metadata"]["entities"]):
                    if entity.get("id") == entity_id:
                        target_document = doc
                        entity_index = i
                        break
                if target_document:
                    break
        
        if not target_document or entity_index is None:
            raise HTTPException(status_code=404, detail="Entity not found")
        
        # Update the entity in the metadata
        entities = target_document["metadata"]["entities"]
        entities[entity_index]["user_approved"] = user_approved
        entities[entity_index]["is_redacted"] = is_redacted
        
        from datetime import datetime
        entities[entity_index]["updated_at"] = datetime.utcnow().isoformat()
        
        # Update the document with the modified entities
        updated_metadata = target_document["metadata"]
        updated_metadata["entities"] = entities
        
        # Save back to database
        update_response = supabase.table("documents").update({
            "metadata": updated_metadata
        }).eq("id", target_document["id"]).execute()
        
        if hasattr(update_response, 'error') and update_response.error:
            logger.error(f"Supabase update error: {update_response.error}")
            raise HTTPException(status_code=500, detail=f"Failed to update entity: {update_response.error}")
        
        if not update_response.data:
            logger.error("No data returned from update operation")
            raise HTTPException(status_code=500, detail="No data returned from update operation")
        
        return {
            "message": "Entity approval updated successfully",
            "entity_id": entity_id,
            "user_approved": user_approved,
            "is_redacted": is_redacted,
            "status": "success"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating entity approval: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/{entity_id}/position")
async def update_entity_position(
    entity_id: str,
    position_data: dict,
    user: dict = Depends(get_current_user_bypass)
):
    """Update entity bounding box position and size"""
    try:
        supabase = get_supabase_client()
        
        # Find the document containing this entity
        documents_response = supabase.table("documents").select("*").execute()
        
        target_document = None
        entity_index = None
        
        for doc in documents_response.data:
            if doc.get("metadata") and doc["metadata"].get("entities"):
                for i, entity in enumerate(doc["metadata"]["entities"]):
                    if entity.get("id") == entity_id:
                        target_document = doc
                        entity_index = i
                        break
                if target_document:
                    break
        
        if not target_document or entity_index is None:
            raise HTTPException(status_code=404, detail="Entity not found")
        
        # Update the entity bounding box
        entities = target_document["metadata"]["entities"]
        
        if "bounding_box" not in entities[entity_index]:
            entities[entity_index]["bounding_box"] = {}
        
        bounding_box = entities[entity_index]["bounding_box"]
        
        if "x" in position_data:
            bounding_box["x"] = position_data["x"]
        if "y" in position_data:
            bounding_box["y"] = position_data["y"]
        if "width" in position_data:
            bounding_box["width"] = position_data["width"]
        if "height" in position_data:
            bounding_box["height"] = position_data["height"]
        
        from datetime import datetime
        entities[entity_index]["updated_at"] = datetime.utcnow().isoformat()
        
        # Update the document
        updated_metadata = target_document["metadata"]
        updated_metadata["entities"] = entities
        
        update_response = supabase.table("documents").update({
            "metadata": updated_metadata
        }).eq("id", target_document["id"]).execute()
        
        if hasattr(update_response, 'error') and update_response.error:
            logger.error(f"Supabase update error: {update_response.error}")
            raise HTTPException(status_code=500, detail=f"Failed to update entity position")
        
        return {
            "message": "Entity position updated successfully",
            "entity_id": entity_id,
            "bounding_box": bounding_box,
            "status": "success"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating entity position: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/{entity_id}")
async def delete_entity(
    entity_id: str,
    user: dict = Depends(get_current_user_bypass)
):
    """Delete an entity"""
    try:
        supabase = get_supabase_client()
        
        # Find the document containing this entity
        documents_response = supabase.table("documents").select("*").execute()
        
        target_document = None
        entity_index = None
        
        for doc in documents_response.data:
            if doc.get("metadata") and doc["metadata"].get("entities"):
                for i, entity in enumerate(doc["metadata"]["entities"]):
                    if entity.get("id") == entity_id:
                        target_document = doc
                        entity_index = i
                        break
                if target_document:
                    break
        
        if not target_document or entity_index is None:
            raise HTTPException(status_code=404, detail="Entity not found")
        
        # Remove the entity from the list
        entities = target_document["metadata"]["entities"]
        deleted_entity = entities.pop(entity_index)
        
        # Update the document
        updated_metadata = target_document["metadata"]
        updated_metadata["entities"] = entities
        updated_metadata["entities_found"] = len(entities)
        
        update_response = supabase.table("documents").update({
            "metadata": updated_metadata
        }).eq("id", target_document["id"]).execute()
        
        if hasattr(update_response, 'error') and update_response.error:
            logger.error(f"Supabase update error: {update_response.error}")
            raise HTTPException(status_code=500, detail=f"Failed to delete entity")
        
        return {
            "message": "Entity deleted successfully",
            "entity_id": entity_id,
            "deleted_entity": deleted_entity,
            "status": "success"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting entity: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/{document_id}/entities")
async def add_entity(
    document_id: str,
    entity_data: dict,
    user: dict = Depends(get_current_user_bypass)
):
    """Add a new entity to a document"""
    try:
        supabase = get_supabase_client()
        
        # Get the document
        doc_response = supabase.table("documents").select("*").eq("id", document_id).execute()
        
        if not doc_response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = doc_response.data[0]
        
        # Create new entity with UUID
        import uuid
        from datetime import datetime
        
        new_entity = {
            "id": str(uuid.uuid4()),
            "text": entity_data.get("text", "Manual Redaction"),
            "label": entity_data.get("label", "MANUAL"),
            "method": "manual",
            "start_pos": entity_data.get("start_pos", 0),
            "end_pos": entity_data.get("end_pos", 0),
            "confidence": 1.0,
            "is_redacted": entity_data.get("is_redacted", True),
            "user_approved": entity_data.get("user_approved", True),
            "bounding_box": entity_data.get("bounding_box", {}),
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Add to entities list
        metadata = document.get("metadata", {})
        entities = metadata.get("entities", [])
        entities.append(new_entity)
        
        metadata["entities"] = entities
        metadata["entities_found"] = len(entities)
        
        # Update the document
        update_response = supabase.table("documents").update({
            "metadata": metadata
        }).eq("id", document_id).execute()
        
        if hasattr(update_response, 'error') and update_response.error:
            logger.error(f"Supabase update error: {update_response.error}")
            raise HTTPException(status_code=500, detail=f"Failed to add entity")
        
        return {
            "message": "Entity added successfully",
            "entity": new_entity,
            "status": "success"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding entity: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")