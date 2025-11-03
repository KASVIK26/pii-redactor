# PII Redactor - Testing Guide

This directory contains comprehensive test suites for the PII Redactor application.

## 📋 Test Structure

### 1. **conftest.py**
Pytest configuration and reusable fixtures
- Test data samples
- Temporary file fixtures
- Mock objects
- Performance baseline data

### 2. **test_pii_detection.py**
Unit tests for PII detection service
- **Basic Tests**: Simple entity detection (emails, SSN, phone)
- **Advanced Tests**: Complex documents, overlapping entities, deduplication
- **Accuracy Tests**: Precision, recall, confidence calibration
- **Edge Cases**: Special characters, Unicode, malformed patterns

### 3. **test_redaction_service.py**
Unit tests for document redaction
- **Basic Tests**: PDF and image redaction
- **Redaction Styles**: Black box, blur, white box redaction
- **Accuracy Tests**: Entity redaction verification
- **Layout Preservation**: Page/dimension preservation
- **Error Handling**: Corrupted files, invalid paths
- **Configuration**: Parameter handling

### 4. **test_integration.py**
Integration and end-to-end tests
- **Complete Workflows**: PDF and image processing pipelines
- **Component Integration**: Detection to redaction flow
- **Data Flow**: Structure consistency and position tracking
- **Error Recovery**: Graceful handling of failures
- **Compliance**: Security and privacy checks
- **Performance**: Batch processing and scaling

### 5. **test_performance.py**
Performance and benchmarking tests
- **Detection Performance**: Speed and memory usage
- **Redaction Performance**: Throughput and resource utilization
- **Pipeline Performance**: End-to-end execution time
- **Load Testing**: Concurrent request simulation
- **Scalability**: Linear scaling verification

### 6. **run_tests.py**
Comprehensive test runner and report generator
- Executes all test suites
- Generates detailed SRS report
- Creates HTML reports
- Produces JSON results

## 🚀 Quick Start

### Prerequisites
```bash
cd backend
pip install -r requirements.txt
pip install pytest pytest-asyncio pytest-html
```

### Run All Tests
```bash
python tests/run_tests.py
```

### Run Specific Test Suites

**Unit Tests Only:**
```bash
pytest tests/test_pii_detection.py tests/test_redaction_service.py -v
```

**Integration Tests:**
```bash
pytest tests/test_integration.py -v
```

**Performance Tests:**
```bash
pytest tests/test_performance.py -v
```

### Run Specific Test Classes
```bash
# Test PII detection accuracy
pytest tests/test_pii_detection.py::TestPIIDetectionAccuracy -v

# Test redaction styles
pytest tests/test_redaction_service.py::TestRedactionStyles -v
```

### Run with Coverage Report
```bash
pytest tests/ --cov=app --cov-report=html
```

### Run with Detailed Output
```bash
pytest tests/ -vv --tb=long
```

## 📊 Test Results

After running the complete suite, you'll get:

1. **test_results_srs.txt** - SRS-compatible report for academic purposes
2. **test_results.json** - Detailed JSON results
3. **unit_tests_report.html** - HTML report for unit tests
4. **integration_tests_report.html** - HTML report for integration tests
5. **performance_tests_report.html** - HTML report for performance tests
6. **test_results.log** - Detailed execution log

## 📈 Test Coverage

### PII Detection Service
- ✅ Email detection
- ✅ Phone number detection
- ✅ SSN detection
- ✅ Credit card detection
- ✅ Date detection
- ✅ Medical record detection
- ✅ Confidence threshold filtering
- ✅ Overlapping entity handling
- ✅ Deduplication

### Redaction Service
- ✅ PDF redaction
- ✅ Image redaction
- ✅ Black box redaction
- ✅ Blur redaction
- ✅ White box redaction
- ✅ Layout preservation
- ✅ Error handling

### Integration
- ✅ Complete workflows
- ✅ Multi-document processing
- ✅ Batch processing
- ✅ Error recovery
- ✅ Data consistency

### Performance
- ✅ Throughput measurement
- ✅ Memory profiling
- ✅ Scaling analysis
- ✅ Load testing

## 🎯 Performance Baselines

Expected performance metrics:

| Operation | Target | Notes |
|-----------|--------|-------|
| Simple text detection | < 5 seconds | Single PII entity |
| Complex document detection | < 10 seconds | Multiple PII types |
| PDF redaction | < 300ms per page | Single entity |
| Image redaction | < 100ms per entity | Single image |
| Memory peak | < 500MB | Large batch processing |
| Throughput | > 5 docs/sec | Batch mode |

## 🔍 Test Data

Test data includes:
- Simple text with basic PII
- Complex documents with multiple PII types
- Edge cases (special characters, Unicode)
- Sample PDFs and images
- Various entity types and patterns

## 📝 Adding New Tests

1. Create test function in appropriate file
2. Use fixtures from `conftest.py`
3. Follow naming convention: `test_<functionality>`
4. Add docstring explaining test purpose
5. Use logger for test output
6. Include assertions

Example:
```python
def test_new_functionality(sample_text_data, perf_metrics):
    """Test description."""
    text = sample_text_data["simple_text"]
    
    # Perform test
    result = some_function(text)
    
    # Assert results
    assert result is not None
    
    # Log findings
    logger.info(f"✓ Test passed: {result}")
```

## ⚙️ Configuration

Modify baseline metrics in `conftest.py`:
```python
@pytest.fixture
def performance_baseline():
    return {
        "pii_detection_per_page_ms": 500,
        "redaction_per_page_ms": 300,
        ...
    }
```

## 🐛 Troubleshooting

### Import Errors
```bash
# Ensure backend is in Python path
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
```

### Model Loading Issues
```bash
# Download required models
python -m spacy download en_core_web_sm
```

### Tesseract Not Found
```bash
# Install Tesseract OCR
# Windows: Download from https://github.com/UB-Mannheim/tesseract/wiki
# Linux: sudo apt-get install tesseract-ocr
# Mac: brew install tesseract
```

## 📚 References

- pytest Documentation: https://docs.pytest.org/
- Performance Testing: https://docs.pytest.org/en/stable/fixture.html
- SRS Template: IEEE 830-1998
- Testing Best Practices: ISO/IEC/IEEE 29119

## 👥 Contributors

Testing Framework: PII Redactor Development Team

## 📄 License

Same as main project
