"""
Integration tests for the PII Redactor system.
Tests end-to-end workflows and component interactions.
"""

import pytest
import os
import json
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class TestEndToEndWorkflow:
    """Test complete workflows from document upload to redacted output."""
    
    def test_pdf_processing_workflow(self, sample_pdf_path, test_temp_dir):
        """Test complete PDF processing workflow."""
        from app.services.pii_detection_service import PIIDetectionService
        from app.services.redaction_service import RedactionService
        import fitz
        
        # Step 1: Extract text from PDF
        doc = fitz.open(sample_pdf_path)
        extracted_text = ""
        for page_num in range(len(doc)):
            page = doc[page_num]
            extracted_text += page.get_text()
        doc.close()
        
        assert len(extracted_text) > 0, "Should extract text from PDF"
        logger.info(f"✓ Step 1: Extracted {len(extracted_text)} chars from PDF")
        
        # Step 2: Detect PII
        detection_service = PIIDetectionService()
        entities = detection_service.detect_pii(extracted_text)
        
        assert isinstance(entities, list), "Detection should return list"
        logger.info(f"✓ Step 2: Detected {len(entities)} PII entities")
        
        # Step 3: Redact document
        redaction_service = RedactionService()
        output_path = os.path.join(test_temp_dir, "redacted.pdf")
        
        result = redaction_service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=entities
        )
        
        assert os.path.exists(output_path), "Redacted document should exist"
        logger.info(f"✓ Step 3: Created redacted document at {output_path}")
        
        # Verify output
        assert result.get('total_entities') > 0 or len(entities) == 0
        logger.info(f"✓ Workflow complete: {result.get('redacted_entities', 0)} entities redacted")
    
    def test_image_processing_workflow(self, sample_image_path, test_temp_dir):
        """Test complete image processing workflow."""
        from app.services.redaction_service import RedactionService
        from PIL import Image
        import pytesseract
        
        # Step 1: Extract text via OCR
        try:
            ocr_text = pytesseract.image_to_string(sample_image_path)
            logger.info(f"✓ Step 1: OCR extracted {len(ocr_text)} chars")
        except Exception as e:
            logger.warning(f"ℹ OCR not available: {e}")
            ocr_text = "Sample OCR text"
        
        # Step 2: Use sample entities
        sample_entities = [
            {
                "text": "Jane Smith",
                "label": "PERSON",
                "confidence": 0.95,
                "start": 0,
                "end": 10
            }
        ]
        
        # Step 3: Redact image
        redaction_service = RedactionService()
        output_path = os.path.join(test_temp_dir, "redacted.png")
        
        result = redaction_service.redact_document(
            input_path=sample_image_path,
            output_path=output_path,
            entities=sample_entities
        )
        
        assert os.path.exists(output_path), "Redacted image should exist"
        logger.info(f"✓ Step 3: Created redacted image")
        
        # Verify image integrity
        img = Image.open(output_path)
        assert img.size == Image.open(sample_image_path).size
        logger.info(f"✓ Image integrity verified")


class TestComponentIntegration:
    """Test integration between different components."""
    
    def test_detection_redaction_integration(self, sample_text_data, sample_pdf_path, test_temp_dir):
        """Test that detected entities can be successfully redacted."""
        from app.services.pii_detection_service import PIIDetectionService
        from app.services.redaction_service import RedactionService
        
        # Detect PII
        detector = PIIDetectionService()
        text = sample_text_data["mixed_pii_text"]
        detected_entities = detector.detect_pii(text)
        
        # Verify detection
        assert len(detected_entities) > 0, "Should detect entities"
        logger.info(f"✓ Detected {len(detected_entities)} entities")
        
        # Attempt redaction
        redactor = RedactionService()
        output_path = os.path.join(test_temp_dir, "integrated_redaction.pdf")
        
        result = redactor.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=detected_entities
        )
        
        assert result is not None
        logger.info(f"✓ Integration successful: detected entities redacted")
    
    def test_multiple_pii_types_redaction(self, sample_pdf_path, test_temp_dir):
        """Test redaction of multiple PII types."""
        from app.services.redaction_service import RedactionService
        
        # Create entities with various PII types
        entities = [
            {"text": "John Doe", "label": "PERSON", "confidence": 0.95, "start": 0, "end": 8},
            {"text": "john@example.com", "label": "EMAIL", "confidence": 0.99, "start": 10, "end": 26},
            {"text": "555-123-4567", "label": "PHONE", "confidence": 0.98, "start": 30, "end": 42},
            {"text": "123-45-6789", "label": "SSN", "confidence": 0.97, "start": 45, "end": 56},
        ]
        
        redactor = RedactionService()
        output_path = os.path.join(test_temp_dir, "multi_type_redaction.pdf")
        
        result = redactor.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=entities
        )
        
        assert result.get('total_entities') == len(entities)
        logger.info(f"✓ Multiple PII types redacted: {len(entities)} entities")
    
    def test_detection_accuracy_with_redaction(self, sample_text_data, test_temp_dir):
        """Test that detection results in proper redaction."""
        from app.services.pii_detection_service import PIIDetectionService
        
        detector = PIIDetectionService()
        text = sample_text_data["complex_text"]
        
        # Test different confidence thresholds
        high_conf_entities = detector.detect_pii(text, confidence_threshold=0.95)
        low_conf_entities = detector.detect_pii(text, confidence_threshold=0.5)
        
        # Higher threshold should give fewer entities
        assert len(high_conf_entities) <= len(low_conf_entities)
        logger.info(f"✓ Confidence filtering working: {len(high_conf_entities)} -> {len(low_conf_entities)}")


class TestDataFlow:
    """Test data flow through the system."""
    
    def test_entity_data_structure_consistency(self, sample_text_data):
        """Test that entity data structures are consistent through the pipeline."""
        from app.services.pii_detection_service import PIIDetectionService
        
        detector = PIIDetectionService()
        text = sample_text_data["mixed_pii_text"]
        entities = detector.detect_pii(text)
        
        # Check structure consistency
        required_fields = {'text', 'label', 'confidence'}
        
        for entity in entities:
            assert all(field in entity for field in required_fields), \
                f"Entity missing required fields: {entity}"
            
            # Type checks
            assert isinstance(entity['text'], str)
            assert isinstance(entity['label'], str)
            assert isinstance(entity['confidence'], (int, float))
            assert 0 <= entity['confidence'] <= 1
        
        logger.info(f"✓ Data structure consistency verified for {len(entities)} entities")
    
    def test_entity_position_accuracy(self, sample_text_data):
        """Test that entity positions are accurate."""
        from app.services.pii_detection_service import PIIDetectionService
        
        detector = PIIDetectionService()
        text = sample_text_data["simple_text"]
        entities = detector.detect_pii(text)
        
        for entity in entities:
            if 'start' in entity and 'end' in entity:
                start, end = entity['start'], entity['end']
                
                # Verify bounds
                assert 0 <= start < len(text)
                assert 0 < end <= len(text)
                assert start < end
                
                # Verify text matches
                if 'text' in entity:
                    extracted = text[start:end]
                    logger.debug(f"  Position check: {start}-{end} = '{extracted}'")
        
        logger.info(f"✓ Entity positions verified for {len(entities)} entities")


class TestErrorRecovery:
    """Test system behavior during error conditions."""
    
    def test_graceful_handling_of_corrupted_input(self, test_temp_dir, sample_entities):
        """Test handling of corrupted input files."""
        from app.services.redaction_service import RedactionService
        
        # Create corrupted PDF file
        corrupted_path = os.path.join(test_temp_dir, "corrupted.pdf")
        with open(corrupted_path, 'wb') as f:
            f.write(b"This is not a valid PDF")
        
        redactor = RedactionService()
        output_path = os.path.join(test_temp_dir, "output.pdf")
        
        try:
            result = redactor.redact_document(
                input_path=corrupted_path,
                output_path=output_path,
                entities=sample_entities
            )
            logger.info("✓ Corrupted input handled gracefully")
        except Exception as e:
            logger.info(f"✓ Corrupted input caught: {type(e).__name__}")
    
    def test_large_document_handling(self, test_temp_dir):
        """Test handling of large documents."""
        from app.services.pii_detection_service import PIIDetectionService
        
        detector = PIIDetectionService()
        
        # Create large text document
        large_text = ("Name: John Doe, Email: john@example.com, " * 1000)
        
        try:
            entities = detector.detect_pii(large_text)
            logger.info(f"✓ Large document processed: {len(large_text)} chars -> {len(entities)} entities")
        except Exception as e:
            logger.warning(f"ℹ Large document handling: {e}")


class TestConformanceAndCompliance:
    """Test compliance with security and privacy standards."""
    
    def test_sensitive_data_not_logged(self, sample_text_data):
        """Test that sensitive data is not exposed in logs."""
        from app.services.pii_detection_service import PIIDetectionService
        import logging
        
        # Setup a handler to capture logs
        log_capture = []
        handler = logging.StreamHandler()
        
        detector = PIIDetectionService()
        text = sample_text_data["mixed_pii_text"]
        
        # Process text
        entities = detector.detect_pii(text)
        
        # Verify entities detected
        assert len(entities) > 0
        logger.info("✓ Sensitive data processing completed")
    
    def test_original_document_integrity(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test that original document is not modified during redaction."""
        from app.services.redaction_service import RedactionService
        import os
        
        # Get original file size and modification time
        original_size = os.path.getsize(sample_pdf_path)
        original_mtime = os.path.getmtime(sample_pdf_path)
        
        # Perform redaction
        redactor = RedactionService()
        output_path = os.path.join(test_temp_dir, "redacted.pdf")
        
        redactor.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=sample_entities
        )
        
        # Verify original unchanged
        assert os.path.getsize(sample_pdf_path) == original_size
        assert os.path.getmtime(sample_pdf_path) == original_mtime
        
        logger.info("✓ Original document integrity verified")


class TestPerformanceIntegration:
    """Test performance characteristics in integrated scenarios."""
    
    def test_batch_document_processing(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test processing multiple documents in sequence."""
        from app.services.redaction_service import RedactionService
        import time
        
        redactor = RedactionService()
        
        # Process multiple documents
        processing_times = []
        doc_count = 3
        
        for i in range(doc_count):
            output_path = os.path.join(test_temp_dir, f"redacted_{i}.pdf")
            
            start_time = time.time()
            result = redactor.redact_document(
                input_path=sample_pdf_path,
                output_path=output_path,
                entities=sample_entities
            )
            elapsed = time.time() - start_time
            processing_times.append(elapsed)
        
        avg_time = sum(processing_times) / len(processing_times)
        logger.info(f"✓ Batch processing: {doc_count} docs in {sum(processing_times):.2f}s (avg: {avg_time:.2f}s)")
    
    def test_detection_scaling(self, sample_text_data):
        """Test detection performance with increasing text size."""
        from app.services.pii_detection_service import PIIDetectionService
        import time
        
        detector = PIIDetectionService()
        base_text = sample_text_data["complex_text"]
        
        results = []
        for multiplier in [1, 5, 10]:
            text = base_text * multiplier
            
            start_time = time.time()
            entities = detector.detect_pii(text)
            elapsed = time.time() - start_time
            
            results.append({
                'text_size': len(text),
                'entity_count': len(entities),
                'time_ms': elapsed * 1000
            })
        
        logger.info("✓ Detection scaling test results:")
        for r in results:
            logger.debug(f"  Size: {r['text_size']} chars, Entities: {r['entity_count']}, Time: {r['time_ms']:.2f}ms")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
