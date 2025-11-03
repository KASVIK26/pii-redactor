#!/usr/bin/env python
"""Debug script - simplified"""

from app.services.pii_detection_service import PIIDetectionService
import logging

# Set up detailed logging
logging.basicConfig(level=logging.INFO, format='%(message)s')

service = PIIDetectionService()

# Test SSN
ssn_text = "My SSN is 123-45-6789"
print(f"Testing: {ssn_text}\n")
ssn_entities = service.detect_pii(ssn_text)

print("\n=== FINAL RESULTS ===")
for e in ssn_entities:
    print(f"  {e['label']:15} | {e['text']:20} | Method: {e.get('method', 'unknown')}")

ssn_list = [e for e in ssn_entities if e.get("label") == "SSN"]
print(f"\nSSN Count: {len(ssn_list)}")
for s in ssn_list:
    print(f"  Found: {s['text']}")

