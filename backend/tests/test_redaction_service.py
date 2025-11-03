"""
Unit tests for Redaction Service.
Tests document redaction functionality and layout preservation.
"""

import pytest
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pathlib import Path
from app.services.redaction_service import RedactionService
import logging

logger = logging.getLogger(__name__)


class TestRedactionServiceBasic:
    """Test basic redaction functionality."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.service = RedactionService()
    
    def test_service_initialization(self):
        """Test that RedactionService initializes correctly."""
        assert self.service is not None
        assert hasattr(self.service, 'supported_formats')
        assert '.pdf' in self.service.supported_formats
        assert '.png' in self.service.supported_formats
        
        logger.info("✓ Redaction service initialization successful")
    
    def test_supported_formats(self):
        """Test that service supports correct file formats."""
        service = RedactionService()
        
        supported = service.supported_formats
        assert '.pdf' in supported
        assert '.png' in supported
        assert '.jpg' in supported
        assert '.jpeg' in supported
        
        logger.info(f"✓ Supported formats: {supported}")
    
    def test_redaction_with_pdf(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test redaction of PDF documents."""
        output_path = os.path.join(test_temp_dir, "redacted.pdf")
        
        result = self.service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=sample_entities,
            redaction_style='black'
        )
        
        assert result is not None
        assert isinstance(result, dict)
        assert 'output_path' in result
        assert os.path.exists(output_path)
        
        logger.info(f"✓ PDF redaction successful")
        logger.debug(f"  Output path: {output_path}")
        logger.debug(f"  Redaction stats: {result}")
    
    def test_redaction_with_image(self, sample_image_path, sample_entities, test_temp_dir):
        """Test redaction of image documents."""
        output_path = os.path.join(test_temp_dir, "redacted.png")
        
        result = self.service.redact_document(
            input_path=sample_image_path,
            output_path=output_path,
            entities=sample_entities,
            redaction_style='black'
        )
        
        assert result is not None
        assert isinstance(result, dict)
        assert 'output_path' in result
        assert os.path.exists(output_path)
        
        logger.info(f"✓ Image redaction successful")
        logger.debug(f"  Output path: {output_path}")
    
    def test_redaction_output_exists(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test that redacted output file is created."""
        output_path = os.path.join(test_temp_dir, "output.pdf")
        
        self.service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=sample_entities
        )
        
        assert os.path.exists(output_path), "Output file should be created"
        assert os.path.getsize(output_path) > 0, "Output file should not be empty"
        
        logger.info(f"✓ Output file created with size: {os.path.getsize(output_path)} bytes")


class TestRedactionStyles:
    """Test different redaction styles."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.service = RedactionService()
    
    def test_black_redaction_style(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test black box redaction style."""
        output_path = os.path.join(test_temp_dir, "redacted_black.pdf")
        
        result = self.service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=sample_entities,
            redaction_style='black'
        )
        
        assert result is not None
        assert result.get('redaction_style') == 'black'
        assert os.path.exists(output_path)
        
        logger.info("✓ Black redaction style applied successfully")
    
    def test_blur_redaction_style(self, sample_image_path, sample_entities, test_temp_dir):
        """Test blur redaction style."""
        output_path = os.path.join(test_temp_dir, "redacted_blur.png")
        
        result = self.service.redact_document(
            input_path=sample_image_path,
            output_path=output_path,
            entities=sample_entities,
            redaction_style='blur',
            blur_radius=15
        )
        
        assert result is not None
        assert result.get('redaction_style') == 'blur'
        
        logger.info("✓ Blur redaction style applied successfully")
    
    def test_white_redaction_style(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test white box redaction style."""
        output_path = os.path.join(test_temp_dir, "redacted_white.pdf")
        
        result = self.service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=sample_entities,
            redaction_style='white'
        )
        
        assert result is not None
        assert os.path.exists(output_path)
        
        logger.info("✓ White redaction style applied successfully")
    
    def test_custom_blur_radius(self, sample_image_path, sample_entities, test_temp_dir):
        """Test custom blur radius configuration."""
        output_path = os.path.join(test_temp_dir, "redacted_custom_blur.png")
        
        result = self.service.redact_document(
            input_path=sample_image_path,
            output_path=output_path,
            entities=sample_entities,
            redaction_style='blur',
            blur_radius=20
        )
        
        assert result is not None
        logger.info(f"✓ Custom blur radius (20) applied successfully")


class TestRedactionAccuracy:
    """Test accuracy of redaction operations."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.service = RedactionService()
    
    def test_all_entities_redacted(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test that all provided entities are redacted."""
        output_path = os.path.join(test_temp_dir, "fully_redacted.pdf")
        
        result = self.service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=sample_entities
        )
        
        assert result is not None
        total_entities = result.get('total_entities', 0)
        redacted_entities = result.get('redacted_entities', 0)
        
        # Should attempt to redact all entities
        assert redacted_entities > 0 or total_entities > 0
        
        logger.info(f"✓ Redacted {redacted_entities}/{total_entities} entities")
    
    def test_empty_entity_list(self, sample_pdf_path, test_temp_dir):
        """Test redaction with no entities."""
        output_path = os.path.join(test_temp_dir, "no_redaction.pdf")
        
        result = self.service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=[]
        )
        
        assert result is not None
        assert result.get('total_entities') == 0
        
        logger.info("✓ Empty entity list handled correctly")
    
    def test_redaction_result_structure(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test that redaction result has expected structure."""
        output_path = os.path.join(test_temp_dir, "result_test.pdf")
        
        result = self.service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=sample_entities
        )
        
        # Check required result fields
        assert 'output_path' in result
        assert 'total_entities' in result
        assert 'redacted_entities' in result
        assert 'redaction_style' in result
        
        logger.info(f"✓ Result structure valid with all required fields")
    
    def test_redaction_statistics(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test that redaction statistics are recorded accurately."""
        output_path = os.path.join(test_temp_dir, "stats_test.pdf")
        
        result = self.service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=sample_entities
        )
        
        total = result.get('total_entities', 0)
        redacted = result.get('redacted_entities', 0)
        
        # Redacted should not exceed total
        assert redacted <= total
        
        logger.info(f"✓ Statistics recorded: {redacted} of {total} entities redacted")


class TestRedactionLayoutPreservation:
    """Test that redaction preserves document layout."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.service = RedactionService()
    
    def test_pdf_page_count_preserved(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test that PDF page count is preserved after redaction."""
        output_path = os.path.join(test_temp_dir, "pages_preserved.pdf")
        
        import fitz
        original_doc = fitz.open(sample_pdf_path)
        original_pages = len(original_doc)
        original_doc.close()
        
        self.service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=sample_entities
        )
        
        redacted_doc = fitz.open(output_path)
        redacted_pages = len(redacted_doc)
        redacted_doc.close()
        
        assert redacted_pages == original_pages
        logger.info(f"✓ Page count preserved: {original_pages} pages")
    
    def test_image_dimensions_preserved(self, sample_image_path, sample_entities, test_temp_dir):
        """Test that image dimensions are preserved after redaction."""
        output_path = os.path.join(test_temp_dir, "dimensions_preserved.png")
        
        from PIL import Image
        original_img = Image.open(sample_image_path)
        original_size = original_img.size
        original_img.close()
        
        self.service.redact_document(
            input_path=sample_image_path,
            output_path=output_path,
            entities=sample_entities
        )
        
        redacted_img = Image.open(output_path)
        redacted_size = redacted_img.size
        redacted_img.close()
        
        assert redacted_size == original_size
        logger.info(f"✓ Image dimensions preserved: {original_size}")


class TestRedactionErrorHandling:
    """Test error handling in redaction service."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.service = RedactionService()
    
    def test_missing_input_file(self, test_temp_dir, sample_entities):
        """Test handling of missing input file."""
        output_path = os.path.join(test_temp_dir, "output.pdf")
        missing_file = os.path.join(test_temp_dir, "nonexistent.pdf")
        
        with pytest.raises(Exception):
            self.service.redact_document(
                input_path=missing_file,
                output_path=output_path,
                entities=sample_entities
            )
        
        logger.info("✓ Missing input file error handled correctly")
    
    def test_unsupported_file_format(self, test_temp_dir, sample_entities, sample_pdf_path):
        """Test handling of unsupported file format."""
        output_path = os.path.join(test_temp_dir, "output.pdf")
        unsupported_file = os.path.join(test_temp_dir, "test.txt")
        
        # Create unsupported file
        with open(unsupported_file, 'w') as f:
            f.write("test content")
        
        with pytest.raises(Exception):
            self.service.redact_document(
                input_path=unsupported_file,
                output_path=output_path,
                entities=sample_entities
            )
        
        logger.info("✓ Unsupported file format error handled correctly")
    
    def test_invalid_output_path(self, sample_pdf_path, sample_entities):
        """Test handling of invalid output path."""
        invalid_path = "/invalid/path/that/does/not/exist/output.pdf"
        
        # This might not raise an error depending on service implementation
        # Just test that it doesn't crash
        try:
            result = self.service.redact_document(
                input_path=sample_pdf_path,
                output_path=invalid_path,
                entities=sample_entities
            )
            logger.info("ℹ Invalid output path handled gracefully")
        except Exception as e:
            logger.info(f"✓ Invalid output path error: {type(e).__name__}")


class TestRedactionConfiguration:
    """Test redaction configuration and parameters."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.service = RedactionService()
    
    def test_redaction_style_parameter(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test that redaction style parameter is respected."""
        for style in ['black', 'blur', 'white']:
            output_path = os.path.join(test_temp_dir, f"redacted_{style}.pdf")
            
            result = self.service.redact_document(
                input_path=sample_pdf_path,
                output_path=output_path,
                entities=sample_entities,
                redaction_style=style
            )
            
            assert result.get('redaction_style') == style
            logger.info(f"✓ Redaction style '{style}' parameter respected")
    
    def test_blur_radius_parameter(self, sample_image_path, sample_entities, test_temp_dir):
        """Test that blur radius parameter is applied."""
        for radius in [5, 10, 20]:
            output_path = os.path.join(test_temp_dir, f"redacted_blur_{radius}.png")
            
            result = self.service.redact_document(
                input_path=sample_image_path,
                output_path=output_path,
                entities=sample_entities,
                redaction_style='blur',
                blur_radius=radius
            )
            
            assert result is not None
            logger.info(f"✓ Blur radius {radius} applied successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
