#!/usr/bin/env python
"""Test what regex finds"""

import re

ssn_text = "My SSN is 123-45-6789"
ssn_pattern = r'\b\d{3}-\d{2}-\d{4}\b'

matches = list(re.finditer(ssn_pattern, ssn_text))
print(f"Text: {ssn_text}")
print(f"Pattern: {ssn_pattern}")
print(f"Matches found: {len(matches)}")
for m in matches:
    print(f"  Match: '{m.group()}' at position {m.start()}-{m.end()}")

# Also test without word boundaries
ssn_pattern2 = r'\d{3}-\d{2}-\d{4}'
matches2 = list(re.finditer(ssn_pattern2, ssn_text))
print(f"\nPattern (no boundary): {ssn_pattern2}")
print(f"Matches found: {len(matches2)}")
for m in matches2:
    print(f"  Match: '{m.group()}' at position {m.start()}-{m.end()}")
