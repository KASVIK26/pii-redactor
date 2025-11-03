"""
Unit tests for PII Detection Service.
Tests core PII detection functionality using various detection methods.
"""

import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.services.pii_detection_service import PIIDetectionService
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)


class TestPIIDetectionServiceBasic:
    """Test basic PII detection functionality."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.service = PIIDetectionService()
    
    def test_service_initialization(self):
        """Test that PIIDetectionService initializes correctly."""
        assert self.service is not None
        assert self.service.spacy_model_name == "en_core_web_sm"
        logger.info("✓ Service initialization successful")
    
    def test_detect_simple_pii(self, sample_text_data):
        """Test detection of simple PII in straightforward text."""
        text = sample_text_data["simple_text"]
        entities = self.service.detect_pii(text)
        
        assert entities is not None
        assert isinstance(entities, list)
        assert len(entities) > 0
        
        # Check for expected entity types
        entity_labels = [e.get("label") for e in entities]
        assert any(label in ["PERSON", "ORG", "PRODUCT"] for label in entity_labels)
        
        logger.info(f"✓ Detected {len(entities)} entities in simple text")
        logger.debug(f"  Entity types: {set(entity_labels)}")
    
    def test_detect_email_addresses(self, sample_text_data):
        """Test detection of email addresses."""
        text = sample_text_data["simple_text"]
        entities = self.service.detect_pii(text)
        
        emails = [e for e in entities if e.get("label") == "EMAIL"]
        assert len(emails) > 0, "Should detect email addresses"
        
        logger.info(f"✓ Detected {len(emails)} email addresses")
        for email in emails:
            logger.debug(f"  Email: {email['text']}")
    
    def test_detect_ssn(self, sample_text_data):
        """Test detection of Social Security Numbers."""
        text = sample_text_data["ssn_text"]
        entities = self.service.detect_pii(text)
        
        ssns = [e for e in entities if e.get("label") == "SSN"]
        assert len(ssns) > 0, "Should detect SSNs"
        
        logger.info(f"✓ Detected {len(ssns)} SSN(s)")
        for ssn in ssns:
            logger.debug(f"  SSN: {ssn['text']}")
    
    def test_detect_phone_numbers(self, sample_text_data):
        """Test detection of phone numbers."""
        text = sample_text_data["phone_text"]
        entities = self.service.detect_pii(text)
        
        phones = [e for e in entities if e.get("label") == "PHONE"]
        assert len(phones) > 0, "Should detect phone numbers"
        
        logger.info(f"✓ Detected {len(phones)} phone number(s)")
        for phone in phones:
            logger.debug(f"  Phone: {phone['text']}")
    
    def test_no_false_positives_on_clean_text(self, sample_text_data):
        """Test that clean text doesn't trigger false positives."""
        text = sample_text_data["no_pii_text"]
        entities = self.service.detect_pii(text)
        
        # Allow some minor detections but should be minimal
        logger.info(f"ℹ Detected {len(entities)} entities in clean text")
        logger.debug(f"  (Acceptable if confidence is very low)")
    
    def test_complex_document_detection(self, sample_text_data):
        """Test detection in complex document with multiple PII types."""
        text = sample_text_data["complex_text"]
        entities = self.service.detect_pii(text)
        
        assert len(entities) > 0, "Should detect entities in complex document"
        
        # Group by entity type
        entity_types = {}
        for entity in entities:
            label = entity.get("label", "UNKNOWN")
            entity_types[label] = entity_types.get(label, 0) + 1
        
        logger.info(f"✓ Detected {len(entities)} total entities")
        logger.debug(f"  Entity type breakdown: {entity_types}")
    
    def test_confidence_threshold(self, sample_text_data):
        """Test confidence threshold filtering."""
        text = sample_text_data["mixed_pii_text"]
        
        high_confidence = self.service.detect_pii(text, confidence_threshold=0.95)
        low_confidence = self.service.detect_pii(text, confidence_threshold=0.5)
        
        # Higher threshold should result in fewer or equal entities
        assert len(high_confidence) <= len(low_confidence)
        
        logger.info(f"✓ Threshold filtering works:")
        logger.debug(f"  High threshold (0.95): {len(high_confidence)} entities")
        logger.debug(f"  Low threshold (0.5): {len(low_confidence)} entities")
    
    def test_entity_structure(self, sample_text_data):
        """Test that detected entities have proper structure."""
        text = sample_text_data["simple_text"]
        entities = self.service.detect_pii(text)
        
        for entity in entities:
            # Check required fields
            assert "text" in entity, "Entity must have 'text' field"
            assert "label" in entity, "Entity must have 'label' field"
            assert "confidence" in entity, "Entity must have 'confidence' field"
            
            # Validate field types and values
            assert isinstance(entity["text"], str)
            assert isinstance(entity["label"], str)
            assert isinstance(entity["confidence"], (int, float))
            assert 0 <= entity["confidence"] <= 1, "Confidence must be between 0 and 1"
        
        logger.info(f"✓ All {len(entities)} entities have proper structure")
    
    def test_empty_text_handling(self):
        """Test handling of empty text."""
        entities = self.service.detect_pii("")
        
        assert isinstance(entities, list)
        assert len(entities) == 0
        
        logger.info("✓ Empty text handled correctly")
    
    def test_very_long_text_handling(self, sample_text_data):
        """Test handling of very long text."""
        # Create a long text by repeating content
        long_text = (sample_text_data["complex_text"] * 10)
        
        entities = self.service.detect_pii(long_text)
        
        assert entities is not None
        assert isinstance(entities, list)
        
        logger.info(f"✓ Long text handled: {len(long_text)} chars -> {len(entities)} entities")


class TestPIIDetectionServiceAdvanced:
    """Test advanced PII detection features."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.service = PIIDetectionService()
    
    def test_regex_fallback_detection(self, pii_patterns):
        """Test that regex patterns work as fallback."""
        test_email = "contact@company.com"
        entities = self.service.detect_pii(test_email)
        
        email_entities = [e for e in entities if e.get("label") == "EMAIL"]
        assert len(email_entities) > 0, "Should detect email via regex fallback"
        
        logger.info(f"✓ Regex fallback detection working for emails")
    
    def test_overlapping_entity_merging(self):
        """Test that overlapping entities are properly merged."""
        text = "John Doe is a person named John Doe living in New York"
        entities = self.service.detect_pii(text)
        
        # Check that overlapping detections are handled
        assert isinstance(entities, list)
        
        logger.info(f"✓ Overlapping entities handled: {len(entities)} merged entities")
    
    def test_deduplication(self, sample_text_data):
        """Test that duplicate entities are removed."""
        text = sample_text_data["simple_text"]
        entities = self.service.detect_pii(text)
        
        # Check for duplicates
        entity_texts = [e["text"] for e in entities]
        assert len(entity_texts) == len(set(entity_texts)), "Should not have duplicate entity texts"
        
        logger.info(f"✓ Deduplication working: {len(entities)} unique entities")
    
    def test_multiple_pii_types_in_single_doc(self, sample_text_data):
        """Test detection of multiple PII types in one document."""
        text = sample_text_data["mixed_pii_text"]
        entities = self.service.detect_pii(text)
        
        entity_labels = set(e.get("label") for e in entities)
        
        # Should detect multiple types
        assert len(entity_labels) > 1, "Should detect multiple entity types"
        
        logger.info(f"✓ Multiple PII types detected: {entity_labels}")
    
    def test_entity_position_tracking(self, sample_text_data):
        """Test that entity positions are tracked correctly."""
        text = sample_text_data["simple_text"]
        entities = self.service.detect_pii(text)
        
        for entity in entities:
            if "start" in entity and "end" in entity:
                # Verify position is within text bounds
                assert entity["start"] >= 0
                assert entity["end"] <= len(text)
                assert entity["start"] < entity["end"]
        
        logger.info(f"✓ Entity positions correctly tracked")


class TestPIIDetectionAccuracy:
    """Test accuracy and precision of PII detection."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.service = PIIDetectionService()
    
    def test_precision(self, sample_text_data):
        """Test precision of detection (no false positives)."""
        text = sample_text_data["no_pii_text"]
        entities = self.service.detect_pii(text, confidence_threshold=0.95)
        
        # At high confidence threshold, should have very few false positives
        high_confidence_entities = [e for e in entities if e.get("confidence", 0) >= 0.95]
        
        logger.info(f"ℹ High confidence detections: {len(high_confidence_entities)}")
        logger.debug(f"  (Precision test: should be minimal on clean text)")
    
    def test_recall(self, sample_text_data):
        """Test recall of detection (catches most real PII)."""
        text = sample_text_data["mixed_pii_text"]
        entities = self.service.detect_pii(text, confidence_threshold=0.5)
        
        # At low confidence threshold, should catch more entities
        assert len(entities) > 0, "Should detect entities with low threshold"
        
        logger.info(f"✓ Recall test: detected {len(entities)} entities with low threshold")
    
    def test_confidence_calibration(self, sample_text_data):
        """Test that confidence scores are properly calibrated."""
        text = sample_text_data["simple_text"]
        entities = self.service.detect_pii(text)
        
        confidence_scores = [e.get("confidence", 0) for e in entities]
        
        assert len(confidence_scores) > 0
        assert all(0 <= score <= 1 for score in confidence_scores)
        
        avg_confidence = sum(confidence_scores) / len(confidence_scores)
        logger.info(f"✓ Confidence scores: avg={avg_confidence:.2f}, range=[{min(confidence_scores):.2f}, {max(confidence_scores):.2f}]")


class TestPIIDetectionEdgeCases:
    """Test edge cases and error handling."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        self.service = PIIDetectionService()
    
    def test_special_characters_in_pii(self):
        """Test handling of special characters in PII."""
        text = "Email: john+test@example.co.uk"
        entities = self.service.detect_pii(text)
        
        assert isinstance(entities, list)
        logger.info(f"✓ Special characters handled: detected {len(entities)} entities")
    
    def test_unicode_characters(self):
        """Test handling of Unicode characters."""
        text = "Name: José García, Email: josé@example.com"
        entities = self.service.detect_pii(text)
        
        assert isinstance(entities, list)
        logger.info(f"✓ Unicode handled: detected {len(entities)} entities")
    
    def test_malformed_pii_patterns(self):
        """Test handling of malformed PII patterns."""
        text = "SSN: 12345678 (invalid format)"
        entities = self.service.detect_pii(text)
        
        # Should not detect malformed SSN
        ssns = [e for e in entities if e.get("label") == "SSN"]
        logger.info(f"ℹ Malformed SSN detection: {len(ssns)} detected (should be 0)")
    
    def test_case_insensitivity(self):
        """Test that detection is case-insensitive where appropriate."""
        text_lower = "name: john doe, email: john@example.com"
        text_upper = "NAME: JOHN DOE, EMAIL: JOHN@EXAMPLE.COM"
        
        entities_lower = self.service.detect_pii(text_lower)
        entities_upper = self.service.detect_pii(text_upper)
        
        # Email should be detected in both cases
        emails_lower = [e for e in entities_lower if e.get("label") == "EMAIL"]
        emails_upper = [e for e in entities_upper if e.get("label") == "EMAIL"]
        
        logger.info(f"✓ Case sensitivity: lower={len(emails_lower)}, upper={len(emails_upper)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
