#!/usr/bin/env python
"""Debug script to test PII detection"""

from app.services.pii_detection_service import PIIDetectionService
import re

service = PIIDetectionService()

# Test SSN - check regex directly
print("=" * 60)
print("SSN Regex Test")
print("=" * 60)
ssn_text = "My SSN is 123-45-6789"
ssn_pattern = r'\b\d{3}-\d{2}-\d{4}\b'
regex_matches = list(re.finditer(ssn_pattern, ssn_text))
print(f"Text: {ssn_text}")
print(f"Regex pattern: {ssn_pattern}")
print(f"Regex matches: {[m.group() for m in regex_matches]}")

# Test via service
print("\nService Detection:")
ssn_entities = service.detect_pii(ssn_text)
ssn_list = [e for e in ssn_entities if e.get("label") == "SSN"]
print(f"SSN entities found: {len(ssn_list)}")
print(f"All entities: {[(e['label'], e['text'], e.get('method', 'unknown')) for e in ssn_entities]}")

# Test Phone
print("\n" + "=" * 60)
print("Phone Regex Test")
print("=" * 60)
phone_text = "Call me at (555) 123-4567 or 555.987.6543"
phone_pattern1 = r'\b\(\d{3}\)\s*\d{3}-\d{4}\b'
phone_pattern2 = r'\b\d{3}\.\d{3}\.\d{4}\b'
print(f"Text: {phone_text}")
print(f"Pattern 1 matches: {[m.group() for m in re.finditer(phone_pattern1, phone_text)]}")
print(f"Pattern 2 matches: {[m.group() for m in re.finditer(phone_pattern2, phone_text)]}")

# Test via service
print("\nService Detection:")
phone_entities = service.detect_pii(phone_text)
phone_list = [e for e in phone_entities if e.get("label") == "PHONE"]
print(f"PHONE entities found: {len(phone_list)}")
print(f"All entities: {[(e['label'], e['text'], e.get('method', 'unknown')) for e in phone_entities]}")
