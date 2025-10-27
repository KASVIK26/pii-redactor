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
        try:
            file_ext = Path(input_path).suffix.lower()
            
            if file_ext == '.pdf':
                return self._redact_pdf(input_path, output_path, entities, redaction_style, blur_radius)
            elif file_ext in {'.png', '.jpg', '.jpeg'}:
                return self._redact_image(input_path, output_path, entities, redaction_style, blur_radius)
            else:
                raise ValueError(f"Unsupported file format: {file_ext}")
                
        except Exception as e:
            logger.error(f"Redaction failed for {input_path}: {str(e)}")
            # If redaction fails completely, just copy the original file
            try:
                shutil.copy2(input_path, output_path)
                return {
                    'redacted_entities': 0,
                    'total_entities': len(entities),
                    'output_path': output_path,
                    'redaction_style': redaction_style,
                    'error': str(e)
                }
            except Exception as copy_error:
                logger.error(f"Failed to copy original file: {copy_error}")
                raise e
    
    def _redact_pdf(
        self, 
        input_path: str, 
        output_path: str, 
        entities: List[Dict],
        redaction_style: str,
        blur_radius: int
    ) -> Dict:
        """Redact PII from PDF document"""
        doc = None
        redacted_count = 0
        
        try:
            doc = fitz.open(input_path)
            
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                page_entities = [e for e in entities if e.get('page_number', 1) == page_num + 1]
                
                for entity in page_entities:
                    bbox = entity.get('bbox')
                    if not bbox:
                        continue
                    
                    # Convert bbox format if needed
                    if isinstance(bbox, dict):
                        rect = fitz.Rect(
                            bbox['x'], 
                            bbox['y'], 
                            bbox['x'] + bbox['width'], 
                            bbox['y'] + bbox['height']
                        )
                    elif isinstance(bbox, list) and len(bbox) == 4:
                        rect = fitz.Rect(bbox[0], bbox[1], bbox[2], bbox[3])
                    else:
                        continue
                    
                    # Apply redaction based on style
                    if redaction_style == 'black':
                        page.add_redact_annot(rect, fill=(0, 0, 0))
                    elif redaction_style == 'white':
                        page.add_redact_annot(rect, fill=(1, 1, 1))
                    elif redaction_style == 'blur':
                        # For blur, we'll use a semi-transparent overlay
                        page.add_redact_annot(rect, fill=(0.5, 0.5, 0.5))
                    
                    redacted_count += 1
                
                # Apply all redactions on this page
                page.apply_redactions()
            
            # Save the redacted document
            doc.save(output_path)
            
            return {
                'redacted_entities': redacted_count,
                'total_entities': len(entities),
                'output_path': output_path,
                'redaction_style': redaction_style
            }
            
        except Exception as e:
            logger.error(f"PDF redaction failed: {str(e)}")
            raise
        finally:
            # Ensure document is properly closed
            if doc is not None:
                doc.close()
    
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
            
            for entity in entities:
                bbox = entity.get('bbox')
                if not bbox:
                    continue
                
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
                
                redacted_count += 1
            
            # Save the redacted image
            image.save(output_path)
            
            return {
                'redacted_entities': redacted_count,
                'total_entities': len(entities),
                'output_path': output_path,
                'redaction_style': redaction_style
            }
            
        except Exception as e:
            logger.error(f"Image redaction failed: {str(e)}")
            raise