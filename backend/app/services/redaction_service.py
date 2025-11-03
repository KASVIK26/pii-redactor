import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFilter
import io
import os
from typing import Dict, List, Optional, Tuple
import logging
from pathlib import Path
import shutil

logger = logging.getLogger(__name__)

class RedactionService:
    """Service for redacting PII from documents while preserving layout"""
    
    def __init__(self):
        self.supported_formats = {'.pdf', '.png', '.jpg', '.jpeg'}
    
    def redact_document(
        self, 
        input_path: str, 
        output_path: str, 
        entities: List[Dict],
        redaction_style: str = 'black',
        blur_radius: int = 10
    ) -> Dict:
        """
        Redact PII entities from a document
        
        Args:
            input_path: Path to input document
            output_path: Path to save redacted document
            entities: List of detected entities with bbox info
            redaction_style: 'black', 'blur', or 'white'
            blur_radius: Blur radius for blur style
            
        Returns:
            Dict with redaction results and statistics
        """
        # Log entity summary
        entity_summary = {}
        for entity in entities:
            label = entity.get('label', 'UNKNOWN')
            entity_summary[label] = entity_summary.get(label, 0) + 1
        
        logger.info(f"[Redaction] Starting redaction for {input_path}")
        logger.info(f"[Redaction] Total entities to redact: {len(entities)}")
        logger.info(f"[Redaction] Entity breakdown by type: {entity_summary}")
        logger.debug(f"[Redaction] Redaction style: {redaction_style}")
        
        for i, entity in enumerate(entities, 1):
            logger.debug(f"[Redaction] Entity {i}/{len(entities)}: {entity.get('label', 'UNKNOWN'):15} | "
                        f"Text: '{entity.get('text', '')[:40]}' | "
                        f"Confidence: {entity.get('confidence', 0):.2f}")
        
        try:
            file_ext = Path(input_path).suffix.lower()
            
            if file_ext == '.pdf':
                result = self._redact_pdf(input_path, output_path, entities, redaction_style, blur_radius)
                logger.info(f"[Redaction] PDF redaction complete: {result['redacted_entities']}/{result['total_entities']} entities redacted")
                return result
            elif file_ext in {'.png', '.jpg', '.jpeg'}:
                result = self._redact_image(input_path, output_path, entities, redaction_style, blur_radius)
                logger.info(f"[Redaction] Image redaction complete: {result['redacted_entities']}/{result['total_entities']} entities redacted")
                return result
            else:
                raise ValueError(f"Unsupported file format: {file_ext}")
                
        except ValueError as e:
            # Unsupported format - re-raise
            logger.error(f"[Redaction] Unsupported file format: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"[Redaction] Redaction failed for {input_path}: {str(e)}")
            # If redaction fails completely, just copy the original file
            try:
                shutil.copy2(input_path, output_path)
                logger.warning(f"[Redaction] Copied original file without redaction due to error")
                return {
                    'redacted_entities': 0,
                    'total_entities': len(entities),
                    'output_path': output_path,
                    'redaction_style': redaction_style,
                    'error': str(e)
                }
            except Exception as copy_error:
                logger.error(f"[Redaction] Failed to copy original file: {copy_error}")
                raise e
    
    def _redact_pdf(
        self, 
        input_path: str, 
        output_path: str, 
        entities: List[Dict],
        redaction_style: str,
        blur_radius: int
    ) -> Dict:
        """Redact PII from PDF document using text search"""
        doc = None
        redacted_count = 0
        entities_failed = []
        entities_redacted = []
        
        try:
            doc = fitz.open(input_path)
            logger.info(f"[PDF Redaction] Opened PDF with {len(doc)} pages")
            logger.info(f"[PDF Redaction] Using text-search based redaction method")
            
            # Track which entities we've already processed to avoid duplicates
            processed_texts = set()
            
            # Get all PDF text for context
            full_text = ""
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                full_text += page.get_text() + "\n"
            
            # Iterate through all pages
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                logger.debug(f"[PDF Redaction] Processing page {page_num + 1}/{len(doc)}")
                
                # Get text from page for redaction
                for entity_idx, entity in enumerate(entities, 1):
                    entity_text = entity.get('text', '').strip()
                    if not entity_text:
                        logger.warning(f"[PDF Redaction] Entity {entity_idx}: Empty text")
                        entities_failed.append(entity)
                        continue
                    
                    # Skip if we already processed this exact text on this page
                    entity_key = f"{page_num}:{entity_text}"
                    if entity_key in processed_texts:
                        logger.debug(f"[PDF Redaction] Skipping duplicate: '{entity_text}' on page {page_num + 1}")
                        continue
                    
                    try:
                        # Search for text on the page
                        search_results = page.search_for(entity_text)
                        
                        if search_results:
                            # Found the entity on this page, redact it
                            for rect in search_results:
                                logger.debug(f"[PDF Redaction] Found '{entity_text}' at {rect} on page {page_num + 1}")
                                
                                # Apply redaction based on style
                                if redaction_style == 'black':
                                    page.draw_rect(rect, color=None, fill=(0, 0, 0))
                                elif redaction_style == 'white':
                                    page.draw_rect(rect, color=None, fill=(1, 1, 1))
                                elif redaction_style == 'blur':
                                    # Create a semi-transparent gray box for blur effect
                                    page.draw_rect(rect, color=None, fill=(0.7, 0.7, 0.7))
                                
                                redacted_count += 1
                                entities_redacted.append(entity)
                                processed_texts.add(entity_key)
                                
                                logger.info(f"[PDF Redaction] Page {page_num + 1}, Entity {entity_idx}: Redacted {entity.get('label', 'UNKNOWN')} "
                                          f"- '{entity_text[:40]}' | Confidence: {entity.get('confidence', 0):.2f}")
                        else:
                            logger.warning(f"[PDF Redaction] Entity '{entity_text}' not found on page {page_num + 1}")
                            # Try fuzzy matching if exact match fails
                            redacted_with_fuzzy = self._try_fuzzy_match_redaction(page, entity_text, entity, redaction_style)
                            if redacted_with_fuzzy:
                                redacted_count += redacted_with_fuzzy
                                entities_redacted.append(entity)
                                processed_texts.add(entity_key)
                            else:
                                entities_failed.append(entity)
                    
                    except Exception as e:
                        logger.warning(f"[PDF Redaction] Failed to redact '{entity_text}' on page {page_num + 1}: {e}")
                        entities_failed.append(entity)
            
            # Save the redacted document
            doc.save(output_path, garbage=4, deflate=True)
            logger.info(f"[PDF Redaction] Saved redacted PDF to {output_path}")
            logger.info(f"[PDF Redaction] Summary: {redacted_count} entities redacted, {len(entities_failed)} failed, {len(entities_redacted)} unique entities redacted")
            
            return {
                'redacted_entities': redacted_count,
                'total_entities': len(entities),
                'output_path': output_path,
                'redaction_style': redaction_style,
                'unique_redacted': len(set(e.get('text', '') for e in entities_redacted))
            }
            
        except Exception as e:
            logger.error(f"[PDF Redaction] PDF redaction failed: {str(e)}")
            raise
        finally:
            # Ensure document is properly closed
            if doc is not None:
                doc.close()
    
    def _try_fuzzy_match_redaction(self, page, entity_text: str, entity: Dict, redaction_style: str) -> int:
        """Try to find and redact entity using fuzzy/partial matching"""
        redacted = 0
        try:
            # Try case-insensitive search
            page_text = page.get_text()
            page_text_lower = page_text.lower()
            entity_lower = entity_text.lower()
            
            # Find all occurrences (case-insensitive)
            start_pos = 0
            occurrences = []
            while True:
                pos = page_text_lower.find(entity_lower, start_pos)
                if pos == -1:
                    break
                occurrences.append((pos, pos + len(entity_text)))
                start_pos = pos + 1
            
            # If found, search for the original case version and redact
            if occurrences:
                search_results = page.search_for(entity_text, flags=fitz.TEXT_PRESERVE_WHITESPACE)
                if not search_results:
                    # If still not found, try with the original text from page
                    search_results = page.search_for(entity_text)
                
                if search_results:
                    for rect in search_results:
                        page.draw_rect(rect, color=None, fill=self._get_fill_color(redaction_style))
                        redacted += 1
                        logger.debug(f"[Fuzzy Redaction] Fuzzy matched '{entity_text}' on page")
            
            return redacted
        except Exception as e:
            logger.debug(f"[Fuzzy Redaction] Fuzzy matching failed for '{entity_text}': {e}")
            return 0
    
    def _get_fill_color(self, redaction_style: str) -> Tuple[float, float, float]:
        """Get RGB fill color based on redaction style"""
        if redaction_style == 'white':
            return (1, 1, 1)
        elif redaction_style == 'blur':
            return (0.7, 0.7, 0.7)
        else:  # black
            return (0, 0, 0)
    
    def _redact_image(
        self, 
        input_path: str, 
        output_path: str, 
        entities: List[Dict],
        redaction_style: str,
        blur_radius: int
    ) -> Dict:
        """Redact PII from image document"""
        try:
            image = Image.open(input_path)
            draw = ImageDraw.Draw(image)
            redacted_count = 0
            entities_failed = []
            
            logger.info(f"[Image Redaction] Opened image: {image.size}")
            logger.info(f"[Image Redaction] Total entities to redact: {len(entities)}")
            
            for entity_idx, entity in enumerate(entities, 1):
                bbox = entity.get('bbox')
                if not bbox:
                    logger.warning(f"[Image Redaction] Entity {entity_idx}: No bbox found for {entity.get('label', 'UNKNOWN')}")
                    entities_failed.append(entity)
                    continue
                
                try:
                    # Convert bbox format
                    if isinstance(bbox, dict):
                        coords = (
                            bbox['x'],
                            bbox['y'],
                            bbox['x'] + bbox['width'],
                            bbox['y'] + bbox['height']
                        )
                    elif isinstance(bbox, list) and len(bbox) == 4:
                        coords = tuple(bbox)
                    else:
                        logger.warning(f"[Image Redaction] Invalid bbox format for entity {entity_idx}")
                        entities_failed.append(entity)
                        continue
                    
                    # Apply redaction based on style
                    if redaction_style == 'black':
                        draw.rectangle(coords, fill='black')
                    elif redaction_style == 'white':
                        draw.rectangle(coords, fill='white')
                    elif redaction_style == 'blur':
                        # For images, blur requires more complex processing
                        region = image.crop(coords)
                        blurred = region.filter(ImageFilter.GaussianBlur(radius=blur_radius))
                        image.paste(blurred, coords)
                    
                    logger.debug(f"[Image Redaction] Entity {entity_idx}/{len(entities)}: Redacted {entity.get('label', 'UNKNOWN')} at coords {coords}")
                    redacted_count += 1
                
                except Exception as e:
                    logger.error(f"[Image Redaction] Failed to redact entity {entity_idx}: {e}")
                    entities_failed.append(entity)
            
            # Save the redacted image
            image.save(output_path)
            logger.info(f"[Image Redaction] Saved redacted image: {redacted_count} entities redacted, {len(entities_failed)} failed")
            
            return {
                'redacted_entities': redacted_count,
                'total_entities': len(entities),
                'output_path': output_path,
                'redaction_style': redaction_style
            }
            
        except Exception as e:
            logger.error(f"[Image Redaction] Image redaction failed: {str(e)}")
            raise


def apply_redactions_to_pdf(
    file_bytes: bytes,
    redactions: Dict,
    document_id: str,
    redaction_style: str = 'black',
    entities: List[Dict] = None
) -> Tuple[bytes, Dict]:
    """
    Apply user-approved redactions to a PDF document
    
    Args:
        file_bytes: Original PDF file as bytes
        redactions: Dict with approved_entity_ids and custom_redactions
        document_id: Document ID for logging
        redaction_style: Type of redaction ('black' or 'blur')
        entities: List of entity objects (optional, can be passed or fetched from DB)
        
    Returns:
        Tuple of (redacted_pdf_bytes, statistics_dict)
    """
    try:
        logger.info(f"[Apply Redaction] Starting for document {document_id}")
        
        # Load PDF from bytes
        pdf_bytes_io = io.BytesIO(file_bytes)
        pdf_doc = fitz.open(stream=pdf_bytes_io, filetype="pdf")
        
        total_pages = pdf_doc.page_count
        processed_pages = 0
        failed_pages = 0
        total_redacted = 0
        
        # Get approved entity IDs and custom redactions
        approved_entity_ids = set(redactions.get("approved_entity_ids", []))
        custom_redactions_list = redactions.get("custom_redactions", [])
        
        logger.info(f"[Apply Redaction] Total pages: {total_pages}")
        logger.info(f"[Apply Redaction] Approved entities: {len(approved_entity_ids)}")
        logger.info(f"[Apply Redaction] Custom redactions: {len(custom_redactions_list)}")
        
        # If entities not provided, we need to fetch them from database
        approved_entities = []
        if entities:
            # Filter to only approved entities
            approved_entities = [e for e in entities if e.get('id') in approved_entity_ids]
            logger.info(f"[Apply Redaction] Found {len(approved_entities)} approved entities from provided list")
        else:
            logger.warning(f"[Apply Redaction] No entities provided - only custom redactions will be applied")
        
        logger.info(f"[Apply Redaction] Approved entities to redact: {len(approved_entities)}")
        for e in approved_entities:
            logger.debug(f"[Apply Redaction] - {e.get('label', 'UNKNOWN')}: '{e.get('text', '')[:50]}'")
        
        # Process each page
        for page_num in range(total_pages):
            try:
                page = pdf_doc[page_num]
                page_redacted_count = 0
                
                # Apply approved entity redactions for this page
                for entity in approved_entities:
                    entity_text = entity.get('text', '').strip()
                    if not entity_text:
                        continue
                    
                    try:
                        # Search for entity text on this page
                        search_results = page.search_for(entity_text)
                        
                        if search_results:
                            # Found and redact all occurrences
                            for rect in search_results:
                                shape = page.new_shape()
                                shape.draw_rect(rect)
                                if redaction_style == 'blur':
                                    shape.finish(fill=(0.8, 0.8, 0.8), color=(0.8, 0.8, 0.8))
                                else:  # black
                                    shape.finish(fill=(0, 0, 0), color=(0, 0, 0))
                                shape.commit()
                                
                                total_redacted += 1
                                page_redacted_count += 1
                                
                                logger.debug(f"[Apply Redaction] Page {page_num + 1}: Redacted '{entity_text[:40]}' "
                                           f"({entity.get('label', 'UNKNOWN')}) at {rect}")
                        else:
                            logger.debug(f"[Apply Redaction] Page {page_num + 1}: Entity '{entity_text[:40]}' not found")
                    
                    except Exception as e:
                        logger.warning(f"[Apply Redaction] Failed to redact '{entity_text[:40]}' on page {page_num + 1}: {e}")
                
                # Apply custom redactions for this page
                for redaction in custom_redactions_list:
                    if redaction["page"] == page_num:
                        bbox = redaction["bbox"]
                        # Convert bbox to PDF coordinates
                        rect = fitz.Rect(
                            bbox["x"],
                            bbox["y"],
                            bbox["x"] + bbox["width"],
                            bbox["y"] + bbox["height"]
                        )
                        
                        # Apply redaction
                        shape = page.new_shape()
                        shape.draw_rect(rect)
                        if redaction_style == 'blur':
                            shape.finish(fill=(0.8, 0.8, 0.8), color=(0.8, 0.8, 0.8))
                        else:
                            shape.finish(fill=(0, 0, 0), color=(0, 0, 0))
                        shape.commit()
                        
                        total_redacted += 1
                        page_redacted_count += 1
                
                if page_redacted_count > 0:
                    logger.info(f"[Apply Redaction] Page {page_num + 1}: {page_redacted_count} redactions applied")
                processed_pages += 1
                
            except Exception as e:
                logger.warning(f"[Apply Redaction] Error processing page {page_num + 1}: {str(e)}")
                failed_pages += 1
        
        # Save redacted PDF to bytes
        output_bytes = io.BytesIO()
        pdf_doc.save(output_bytes, deflate=True)
        redacted_pdf_bytes = output_bytes.getvalue()
        
        pdf_doc.close()
        
        stats = {
            "total_redacted": total_redacted,
            "total_pages": total_pages,
            "processed_pages": processed_pages,
            "failed_pages": failed_pages
        }
        
        logger.info(f"[Apply Redaction] Completed for document {document_id}")
        logger.info(f"[Apply Redaction] Statistics: {stats}")
        
        return redacted_pdf_bytes, stats
        
    except Exception as e:
        logger.error(f"[Apply Redaction] Failed to apply redactions: {str(e)}")
        raise
