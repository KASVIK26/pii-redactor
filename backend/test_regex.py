import re

text = "Call me at (555) 123-4567 or 555.987.6543"
phone_pattern = r'\b\(\d{3}\)\s*\d{3}-\d{4}\b'

print(f"Text: {text}")
print(f"Pattern: {phone_pattern}")
print(f"Matches: {re.findall(phone_pattern, text)}")

# Try without word boundary
phone_pattern2 = r'\(\d{3}\)\s*\d{3}-\d{4}'
print(f"\nPattern 2 (no word boundary): {phone_pattern2}")
print(f"Matches: {re.findall(phone_pattern2, text)}")

# Test individual patterns
patterns = [
    (r'\b\d{3}-\d{3}-\d{4}\b', '123-456-7890'),
    (r'\b\(\d{3}\)\s*\d{3}-\d{4}\b', '(123) 456-7890'),
    (r'\b\d{3}\.\d{3}\.\d{4}\b', '123.456.7890'),
]

for pat, desc in patterns:
    print(f"\nPattern '{desc}': {pat}")
    print(f"  Matches: {re.findall(pat, text)}")
