import pytesseract
from PIL import Image
import fitz  # PyMuPDF
import numpy as np
from typing import Dict, List, Tuple, Optional
import cv2
import io
import logging
import os
import sys

logger = logging.getLogger(__name__)

class OCRService:
    """Service for extracting text from documents using Tesseract OCR"""
    
    def __init__(self, tesseract_cmd: Optional[str] = None):
        """Initialize OCR service with optional custom Tesseract path"""
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        else:
            # Try to find Tesseract automatically on Windows
            if sys.platform == 'win32':
                common_paths = [
                    r'C:\Program Files\Tesseract-OCR\tesseract.exe',
                    r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
                ]
                for path in common_paths:
                    if os.path.exists(path):
                        pytesseract.pytesseract.tesseract_cmd = path
                        logger.info(f"Found Tesseract at: {path}")
                        break
        
        # Check if Tesseract is available
        try:
            pytesseract.get_tesseract_version()
            logger.info("Tesseract OCR is available")
        except pytesseract.TesseractNotFoundError:
            logger.warning("Tesseract OCR not found - image text extraction may fail")
    
    def extract_text_from_image(self, image_path: str) -> Dict:
        """Extract text and bounding boxes from an image"""
        try:
            image = Image.open(image_path)
            
            try:
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
                    'image_size': image.size,
                    'method': 'tesseract'
                }
            except (pytesseract.TesseractNotFoundError, pytesseract.TesseractTimeout) as ocr_error:
                logger.warning(f"Tesseract OCR failed: {str(ocr_error)}, using fallback method")
                # Fallback: use basic image analysis
                return self._extract_text_fallback(image, image_path)
            
        except Exception as e:
            logger.error(f"OCR failed for image {image_path}: {str(e)}")
            raise
    
    def _extract_text_fallback(self, image: Image.Image, image_path: str) -> Dict:
        """Fallback text extraction using basic image processing"""
        try:
            # If Tesseract fails, return empty blocks but indicate the image was processed
            logger.info(f"Using fallback for image: {image_path}")
            return {
                'full_text': '',
                'text_blocks': [],
                'image_size': image.size,
                'method': 'fallback',
                'note': 'Tesseract OCR not available'
            }
        except Exception as e:
            logger.error(f"Fallback method failed: {str(e)}")
            raise
    
    def extract_text_from_pdf(self, pdf_path: str) -> Dict:
        """Extract text from PDF, with OCR fallback for images"""
        doc = None
        try:
            doc = fitz.open(pdf_path)
            pages_data = []
            
            for page_num in range(len(doc)):
                try:
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
                        try:
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
                                    'method': ocr_result.get('method', 'ocr')
                                })
                            except Exception as ocr_error:
                                # OCR failed, log and continue with empty page
                                logger.warning(f"OCR failed for PDF page {page_num + 1}: {str(ocr_error)}")
                                pages_data.append({
                                    'page_number': page_num + 1,
                                    'text': '',
                                    'blocks': [],
                                    'method': 'ocr_failed',
                                    'error': str(ocr_error)
                                })
                            finally:
                                # Clean up temp file
                                if os.path.exists(temp_path):
                                    os.remove(temp_path)
                        except Exception as pixmap_error:
                            logger.error(f"Failed to convert PDF page {page_num + 1} to image: {str(pixmap_error)}")
                            pages_data.append({
                                'page_number': page_num + 1,
                                'text': '',
                                'blocks': [],
                                'method': 'failed',
                                'error': str(pixmap_error)
                            })
                except Exception as page_error:
                    logger.error(f"Failed to process PDF page {page_num + 1}: {str(page_error)}")
                    pages_data.append({
                        'page_number': page_num + 1,
                        'text': '',
                        'blocks': [],
                        'method': 'failed',
                        'error': str(page_error)
                    })
            
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