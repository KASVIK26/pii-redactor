import pytesseract
from PIL import Image
import fitz  # PyMuPDF
import numpy as np
from typing import Dict, List, Tuple, Optional
import cv2
import io
import logging

logger = logging.getLogger(__name__)

class OCRService:
    """Service for extracting text from documents using Tesseract OCR"""
    
    def __init__(self, tesseract_cmd: Optional[str] = None):
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
    
    def extract_text_from_image(self, image_path: str) -> Dict:
        """Extract text and bounding boxes from an image"""
        try:
            image = Image.open(image_path)
            
            # Get text with bounding box data
            data = pytesseract.image_to_data(
                image, 
                output_type=pytesseract.Output.DICT
            )
            
            # Extract text with positions
            text_blocks = []
            full_text = ""
            
            for i in range(len(data['text'])):
                if int(data['conf'][i]) > 30:  # Confidence threshold
                    text = data['text'][i].strip()
                    if text:
                        bbox = {
                            'x': data['left'][i],
                            'y': data['top'][i],
                            'width': data['width'][i],
                            'height': data['height'][i]
                        }
                        
                        text_blocks.append({
                            'text': text,
                            'bbox': bbox,
                            'confidence': data['conf'][i]
                        })
                        
                        full_text += text + " "
            
            return {
                'full_text': full_text.strip(),
                'text_blocks': text_blocks,
                'image_size': image.size
            }
            
        except Exception as e:
            logger.error(f"OCR failed for image {image_path}: {str(e)}")
            raise
    
    def extract_text_from_pdf(self, pdf_path: str) -> Dict:
        """Extract text from PDF, with OCR fallback for images"""
        doc = None
        try:
            doc = fitz.open(pdf_path)
            pages_data = []
            
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                
                # Try to extract text directly first
                text = page.get_text()
                
                if text.strip():
                    # Text is already available
                    text_dict = page.get_text("dict")
                    blocks = self._extract_blocks_from_dict(text_dict)
                    
                    pages_data.append({
                        'page_number': page_num + 1,
                        'text': text,
                        'blocks': blocks,
                        'method': 'direct'
                    })
                else:
                    # Need OCR - convert page to image
                    pix = page.get_pixmap()
                    img_data = pix.tobytes("png")
                    image = Image.open(io.BytesIO(img_data))
                    
                    # Save temporarily for OCR
                    import tempfile
                    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as temp_file:
                        temp_path = temp_file.name
                        image.save(temp_path)
                    
                    try:
                        ocr_result = self.extract_text_from_image(temp_path)
                        pages_data.append({
                            'page_number': page_num + 1,
                            'text': ocr_result['full_text'],
                            'blocks': ocr_result['text_blocks'],
                            'method': 'ocr'
                        })
                    finally:
                        # Clean up temp file
                        import os
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
            
            total_pages = len(doc)
            
            return {
                'pages': pages_data,
                'total_pages': total_pages
            }
            
        except Exception as e:
            logger.error(f"PDF processing failed for {pdf_path}: {str(e)}")
            raise
        finally:
            # Ensure document is properly closed
            if doc is not None:
                doc.close()
    
    def _extract_blocks_from_dict(self, text_dict: Dict) -> List[Dict]:
        """Extract text blocks with positions from PyMuPDF text dict"""
        blocks = []
        
        for block in text_dict.get("blocks", []):
            if "lines" in block:
                for line in block["lines"]:
                    for span in line.get("spans", []):
                        text = span.get("text", "").strip()
                        if text:
                            bbox = span.get("bbox", [0, 0, 0, 0])
                            blocks.append({
                                'text': text,
                                'bbox': {
                                    'x': bbox[0],
                                    'y': bbox[1], 
                                    'width': bbox[2] - bbox[0],
                                    'height': bbox[3] - bbox[1]
                                },
                                'confidence': 100  # Direct text extraction
                            })
        
        return blocks