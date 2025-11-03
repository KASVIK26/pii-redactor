#!/usr/bin/env python
"""Quick test to check if backend is running and responsive"""

import requests
import json

BASE_URL = "http://localhost:8000"

print(f"Testing backend at {BASE_URL}")

# Test 1: Health check
try:
    response = requests.get(f"{BASE_URL}/health", timeout=5)
    print(f"✓ Health check: {response.status_code}")
    print(f"  Response: {response.json()}")
except Exception as e:
    print(f"✗ Health check failed: {e}")
    print("  Backend might not be running!")
    exit(1)

# Test 2: Root endpoint
try:
    response = requests.get(f"{BASE_URL}/", timeout=5)
    print(f"✓ Root endpoint: {response.status_code}")
    print(f"  Response: {response.json()}")
except Exception as e:
    print(f"✗ Root endpoint failed: {e}")

print("\n✓ Backend is running and responsive!")
