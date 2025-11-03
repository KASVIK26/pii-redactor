#!/usr/bin/env python
"""Debug - full trace"""

from app.services.pii_detection_service import PIIDetectionService

service = PIIDetectionService()

# Get the base detect_pii step by step
ssn_text = "My SSN is 123-45-6789"

# Step 1: Regex detection
regex_entities = service._detect_with_regex(ssn_text)
print("=== AFTER REGEX DETECTION ===")
for e in regex_entities:
    print(f"  {e['label']:15} | Text: '{e['text']:20}' | Pos: {e['start_pos']:3}-{e['end_pos']:3}")

# Step 2: SpaCy detection
spacy_entities = service._detect_with_spacy(ssn_text, 0.85)
print("\n=== AFTER SPACY DETECTION ===")
for e in spacy_entities:
    print(f"  {e['label']:15} | Text: '{e['text']:20}' | Pos: {e['start_pos']:3}-{e['end_pos']:3}")

# Combine
all_entities = spacy_entities + regex_entities
print(f"\n=== COMBINED ({len(all_entities)} entities) ===")
for e in all_entities:
    print(f"  {e['label']:15} | Text: '{e['text']:20}' | Pos: {e['start_pos']:3}-{e['end_pos']:3} | Method: {e['method']}")

# Step 3: Merge
merged = service._merge_overlapping_entities(all_entities)
print(f"\n=== AFTER MERGE ({len(merged)} entities) ===")
for e in merged:
    print(f"  {e['label']:15} | Text: '{e['text']:20}' | Pos: {e['start_pos']:3}-{e['end_pos']:3} | Method: {e['method']}")
