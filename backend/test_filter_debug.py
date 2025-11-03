#!/usr/bin/env python
"""Debug - check what's happening after merge"""

from app.services.pii_detection_service import PIIDetectionService
import json

# Monkey-patch to see what's being filtered
original_filter = PIIDetectionService._filter_header_labels

def debug_filter(self, entities):
    print("\n=== ENTITIES BEFORE FILTER ===")
    for e in entities:
        print(f"  {e['label']:15} | {e['text']:20}")
    result = original_filter(self, entities)
    print("\n=== ENTITIES AFTER FILTER ===")
    for e in result:
        print(f"  {e['label']:15} | {e['text']:20}")
    return result

PIIDetectionService._filter_header_labels = debug_filter

service = PIIDetectionService()
ssn_text = "My SSN is 123-45-6789"
print(f"Testing: {ssn_text}")
ssn_entities = service.detect_pii(ssn_text)

print("\n=== FINAL RESULTS ===")
for e in ssn_entities:
    print(f"  {e['label']:15} | {e['text']:20}")
