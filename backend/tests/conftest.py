"""
Pytest configuration and fixtures for testing.
Provides test data, mock objects, and reusable fixtures.
"""

import pytest
import tempfile
import os
from pathlib import Path
from PIL import Image, ImageDraw
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None
from typing import Dict, List

# Test data constants
TEST_DATA = {
    "simple_text": "My name is John Smith and my email is john.smith@example.com",
    "ssn_text": "My SSN is 123-45-6789",
    "phone_text": "Call me at (555) 123-4567 or 555.987.6543",
    "complex_text": """
    Patient Information:
    Name: Jane Doe
    Email: jane.doe@hospital.com
    Phone: (555) 234-5678
    SSN: 987-65-4321
    Medical Record: MR-2024-001234
    Date of Birth: 1990-05-15
    Credit Card: 4532-1111-2222-3333
    """,
    "no_pii_text": "This is a simple document with no personal information.",
    "mixed_pii_text": """
    John Doe (john@example.com, 555-123-4567) works at ABC Corp.
    His SSN is 111-22-3333 and credit card is 5555-6666-7777-8888.
    Contact: jane.doe@abc.com, SSN: 222-33-4444
    """,
}

PII_PATTERNS = {
    "email": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    "ssn": r"\d{3}-\d{2}-\d{4}",
    "phone": r"(\(\d{3}\)\s?|\d{3}-)\d{3}-\d{4}",
    "credit_card": r"\d{4}-\d{4}-\d{4}-\d{4}",
}


@pytest.fixture
def test_temp_dir():
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def sample_text_data():
    """Provide sample text data with various PII types."""
    return TEST_DATA.copy()


@pytest.fixture
def sample_pdf_path(test_temp_dir):
    """Create a sample PDF document for testing."""
    if fitz is None:
        pytest.skip("PyMuPDF not installed")
    
    pdf_path = os.path.join(test_temp_dir, "sample.pdf")
    
    # Create PDF with text
    doc = fitz.open()
    page = doc.new_page()
    
    text_content = """
    Sample Document
    
    Name: John Doe
    Email: john.doe@example.com
    Phone: (555) 123-4567
    SSN: 123-45-6789
    
    This is a test document for PDF redaction testing.
    """
    
    page.insert_text((50, 50), text_content, fontsize=12)
    doc.save(pdf_path)
    doc.close()
    
    yield pdf_path
    
    # Cleanup
    if os.path.exists(pdf_path):
        os.remove(pdf_path)


@pytest.fixture
def sample_image_path(test_temp_dir):
    """Create a sample image document for testing."""
    image_path = os.path.join(test_temp_dir, "sample.png")
    
    # Create image with text
    img = Image.new('RGB', (600, 400), color='white')
    draw = ImageDraw.Draw(img)
    
    text_content = """
    Sample Image Document
    
    Name: Jane Smith
    Email: jane.smith@example.com
    Phone: (555) 987-6543
    """
    
    draw.text((50, 50), text_content, fill='black')
    img.save(image_path)
    
    yield image_path
    
    # Cleanup
    if os.path.exists(image_path):
        os.remove(image_path)


@pytest.fixture
def sample_entities():
    """Provide sample entity detections for testing."""
    return [
        {
            "text": "John Doe",
            "label": "PERSON",
            "confidence": 0.95,
            "start": 16,
            "end": 25,
            "method": "spacy"
        },
        {
            "text": "john.smith@example.com",
            "label": "EMAIL",
            "confidence": 0.99,
            "start": 50,
            "end": 72,
            "method": "regex"
        },
        {
            "text": "123-45-6789",
            "label": "SSN",
            "confidence": 0.98,
            "start": 100,
            "end": 111,
            "method": "regex"
        },
    ]


@pytest.fixture
def pii_patterns():
    """Provide PII detection patterns."""
    return PII_PATTERNS.copy()


@pytest.fixture
def mock_spacy_model():
    """Mock spaCy model for testing without loading actual model."""
    class MockDoc:
        def __init__(self, text):
            self.text = text
            self.ents = []
    
    class MockNLP:
        def __call__(self, text):
            return MockDoc(text)
    
    return MockNLP()


@pytest.fixture
def sample_detection_results():
    """Provide sample detection results."""
    return {
        "total_entities": 10,
        "entities_by_type": {
            "PERSON": 3,
            "EMAIL": 2,
            "PHONE": 2,
            "SSN": 1,
            "CREDIT_CARD": 1,
            "DATE": 1
        },
        "confidence_distribution": {
            "0.9-1.0": 8,
            "0.8-0.9": 2
        },
        "processing_time_ms": 250
    }


@pytest.fixture
def sample_redaction_config():
    """Provide sample redaction configuration."""
    return {
        "redaction_style": "black",
        "blur_radius": 10,
        "preserve_layout": True,
        "merge_overlapping": True,
        "min_confidence": 0.85
    }


@pytest.fixture
def performance_baseline():
    """Provide performance baseline metrics."""
    return {
        "pii_detection_per_page_ms": 500,
        "redaction_per_page_ms": 300,
        "ocr_processing_per_page_ms": 2000,
        "total_processing_per_page_ms": 2800
    }
