# PII Redactor - Comprehensive Testing Framework Documentation

## 📚 Overview

This document provides comprehensive guidance on the testing framework for the PII Redactor application. The framework includes unit tests, integration tests, and performance tests designed to validate functionality and generate SRS-compatible reports for academic purposes.

---

## 🏗️ Architecture

### Testing Pyramid

```
        ▲
       ╱ ╲
      ╱   ╲  Performance Tests (10 tests)
     ╱─────╲ Scalability, Load, Resource Usage
    ╱       ╲
   ╱─────────╲
  ╱ Integration╲ Integration Tests (15+ tests)
 ╱─────────────╲ End-to-End, Workflows, Data Flow
╱───────────────╲
  Unit Tests    Unit Tests (30+ tests)
 (60+ tests)    Individual components
```

### Component Relationship

```
┌────────────────────────────────────────┐
│   run_tests.py (Test Orchestrator)     │
└──────────────────────┬─────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│Unit Tests    │ │Integration   │ │Performance   │
│             │ │Tests         │ │Tests         │
├──────────────┤ ├──────────────┤ ├──────────────┤
│PII Detect    │ │End-to-End    │ │Throughput    │
│Redaction     │ │Workflows     │ │Memory        │
│Accuracy      │ │Data Flow     │ │Scaling       │
│Edge Cases    │ │Error Recovery│ │Load Testing  │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                        ▼
            ┌─────────────────────────┐
            │  conftest.py (Fixtures) │
            │  - Test Data            │
            │  - Temporary Files      │
            │  - Mock Objects         │
            └─────────────────────────┘
```

---

## 📋 Test Categories

### 1. Unit Tests (60+ tests)

Test individual components in isolation.

#### Test PII Detection (`test_pii_detection.py`)

**Class: TestPIIDetectionServiceBasic**
- `test_service_initialization()` - Verify service creation
- `test_detect_simple_pii()` - Basic entity detection
- `test_detect_email_addresses()` - Email detection
- `test_detect_ssn()` - SSN detection
- `test_detect_phone_numbers()` - Phone number detection
- `test_no_false_positives_on_clean_text()` - Precision check
- `test_complex_document_detection()` - Multi-type detection
- `test_confidence_threshold()` - Threshold filtering
- `test_entity_structure()` - Data structure validation
- `test_empty_text_handling()` - Edge case handling
- `test_very_long_text_handling()` - Scalability check

**Class: TestPIIDetectionServiceAdvanced**
- `test_regex_fallback_detection()` - Alternative detection method
- `test_overlapping_entity_merging()` - Overlap handling
- `test_deduplication()` - Duplicate removal
- `test_multiple_pii_types_in_single_doc()` - Multiple types
- `test_entity_position_tracking()` - Position accuracy

**Class: TestPIIDetectionAccuracy**
- `test_precision()` - False positive rate
- `test_recall()` - False negative rate
- `test_confidence_calibration()` - Confidence accuracy

**Class: TestPIIDetectionEdgeCases**
- `test_special_characters_in_pii()` - Special char handling
- `test_unicode_characters()` - Unicode support
- `test_malformed_pii_patterns()` - Invalid pattern handling
- `test_case_insensitivity()` - Case sensitivity

#### Test Redaction Service (`test_redaction_service.py`)

**Class: TestRedactionServiceBasic**
- `test_service_initialization()` - Service creation
- `test_supported_formats()` - Format support
- `test_redaction_with_pdf()` - PDF redaction
- `test_redaction_with_image()` - Image redaction
- `test_redaction_output_exists()` - Output file creation

**Class: TestRedactionStyles**
- `test_black_redaction_style()` - Black box style
- `test_blur_redaction_style()` - Blur style
- `test_white_redaction_style()` - White box style
- `test_custom_blur_radius()` - Blur parameter

**Class: TestRedactionAccuracy**
- `test_all_entities_redacted()` - All entities redacted
- `test_empty_entity_list()` - No entities case
- `test_redaction_result_structure()` - Result validation
- `test_redaction_statistics()` - Statistics accuracy

**Class: TestRedactionLayoutPreservation**
- `test_pdf_page_count_preserved()` - Page structure
- `test_image_dimensions_preserved()` - Image structure

**Class: TestRedactionErrorHandling**
- `test_missing_input_file()` - Missing file handling
- `test_unsupported_file_format()` - Format error handling
- `test_invalid_output_path()` - Invalid path handling

**Class: TestRedactionConfiguration**
- `test_redaction_style_parameter()` - Style parameter
- `test_blur_radius_parameter()` - Blur radius parameter

### 2. Integration Tests (15+ tests)

Test component interactions and workflows.

**Class: TestEndToEndWorkflow**
- `test_pdf_processing_workflow()` - PDF pipeline
- `test_image_processing_workflow()` - Image pipeline

**Class: TestComponentIntegration**
- `test_detection_redaction_integration()` - Detect → Redact flow
- `test_multiple_pii_types_redaction()` - Multiple PII types
- `test_detection_accuracy_with_redaction()` - Threshold testing

**Class: TestDataFlow**
- `test_entity_data_structure_consistency()` - Data consistency
- `test_entity_position_accuracy()` - Position accuracy

**Class: TestErrorRecovery**
- `test_graceful_handling_of_corrupted_input()` - Error handling
- `test_large_document_handling()` - Large document handling

**Class: TestConformanceAndCompliance**
- `test_sensitive_data_not_logged()` - Security check
- `test_original_document_integrity()` - Document preservation

**Class: TestPerformanceIntegration**
- `test_batch_document_processing()` - Batch processing
- `test_detection_scaling()` - Scaling behavior

### 3. Performance Tests (10+ tests)

Measure performance characteristics.

**Class: TestPIIDetectionPerformance**
- `test_detection_speed_simple_text()` - Speed benchmark
- `test_detection_speed_complex_text()` - Complex benchmark
- `test_detection_memory_usage()` - Memory profiling
- `test_detection_scaling_linear()` - Linear scaling
- `test_detection_throughput()` - Throughput measurement

**Class: TestRedactionPerformance**
- `test_pdf_redaction_speed()` - PDF performance
- `test_image_redaction_speed()` - Image performance
- `test_redaction_memory_usage()` - Memory usage
- `test_multiple_redactions_throughput()` - Throughput

**Class: TestPipelinePerformance**
- `test_end_to_end_document_processing()` - Pipeline speed
- `test_batch_processing_performance()` - Batch speed

**Class: TestResourceUtilization**
- `test_cpu_usage_during_detection()` - CPU usage
- `test_memory_efficiency()` - Memory efficiency

**Class: TestLoadTesting**
- `test_concurrent_detection_simulation()` - Concurrency
- `test_large_batch_redaction()` - Large batch processing

---

## 🔧 Test Fixtures (conftest.py)

### Data Fixtures

```python
@pytest.fixture
def sample_text_data()
    """Provides test text samples:
    - simple_text: Basic PII text
    - ssn_text: SSN-specific text
    - phone_text: Phone number text
    - complex_text: Multi-type PII text
    - no_pii_text: Clean text (no PII)
    - mixed_pii_text: Multiple entities
    """
```

### File Fixtures

```python
@pytest.fixture
def sample_pdf_path(test_temp_dir)
    """Creates temporary PDF with test content"""

@pytest.fixture
def sample_image_path(test_temp_dir)
    """Creates temporary image with test content"""

@pytest.fixture
def test_temp_dir()
    """Provides temporary directory for test files"""
```

### Configuration Fixtures

```python
@pytest.fixture
def sample_entities()
    """Provides sample detected entities"""

@pytest.fixture
def sample_redaction_config()
    """Provides redaction configuration"""

@pytest.fixture
def performance_baseline()
    """Provides performance baseline metrics"""
```

---

## 📊 Test Metrics and Reporting

### Generated Reports

1. **test_results_srs.txt**
   - SRS-formatted report
   - Functional requirement verification
   - Non-functional requirement verification
   - Suitable for academic documentation

2. **test_results.json**
   - Machine-readable results
   - Detailed metrics
   - Test statistics

3. **unit_tests_report.html**
   - HTML report for unit tests
   - Test details and results
   - Assertion information

4. **integration_tests_report.html**
   - HTML report for integration tests
   - Workflow results
   - Error details

5. **performance_tests_report.html**
   - Performance metrics
   - Timing information
   - Resource usage

### Key Metrics Collected

| Metric | Unit | Target |
|--------|------|--------|
| PII Detection Speed | ms | < 5000 |
| Redaction Speed | ms/page | < 300 |
| Memory Peak | MB | < 500 |
| Throughput | docs/sec | > 5 |
| Accuracy (Precision) | % | > 95 |
| Accuracy (Recall) | % | > 90 |

---

## 🚀 Running Tests

### Installation

```bash
cd backend
pip install -r requirements.txt
pip install pytest pytest-html pytest-asyncio psutil
```

### Quick Start

```bash
# Run all tests and generate SRS report
python tests/run_tests.py

# Run specific test category
python tests/tests_quick.py --unit
python tests/tests_quick.py --integration
python tests/tests_quick.py --performance

# Run with coverage
python tests/tests_quick.py --coverage

# Quick test run (fast)
python tests/tests_quick.py --quick
```

### Manual Test Execution

```bash
# All tests
pytest tests/ -v

# Unit tests only
pytest tests/test_pii_detection.py tests/test_redaction_service.py -v

# Integration tests
pytest tests/test_integration.py -v

# Performance tests
pytest tests/test_performance.py -v

# Specific test class
pytest tests/test_pii_detection.py::TestPIIDetectionAccuracy -v

# Specific test
pytest tests/test_pii_detection.py::TestPIIDetectionAccuracy::test_precision -v
```

### Advanced Options

```bash
# With coverage report
pytest tests/ --cov=app --cov-report=html

# Verbose output
pytest tests/ -vv --tb=long

# Stop on first failure
pytest tests/ -x

# Run last failed tests
pytest tests/ --lf

# Run parallel (requires pytest-xdist)
pytest tests/ -n auto

# Capture output
pytest tests/ -s

# Show print statements
pytest tests/ --capture=no
```

---

## 📈 Test Results Interpretation

### Success Criteria

✅ **All Tests Pass** when:
- Unit tests: 0 failures in 60+ tests
- Integration tests: 0 failures in 15+ tests
- Performance tests: 0 failures in 10+ tests
- SRS report generated successfully

### Performance Baselines

Expected performance ranges:

```
PII Detection:
  - Simple text: 100-500ms
  - Complex text: 500-2000ms
  - Per entity: 10-50ms

Redaction:
  - PDF per page: 100-300ms
  - Image per entity: 30-100ms
  - Batch throughput: 5-10 docs/sec

Memory:
  - Peak usage: 200-500MB
  - Detection: 50-100MB
  - Redaction: 100-300MB
```

---

## 🐛 Troubleshooting

### Common Issues

**Issue: Model Loading Failed**
```bash
# Solution: Download required models
python -m spacy download en_core_web_sm
```

**Issue: Tesseract Not Found**
```bash
# Windows: Download installer from GitHub
# Linux: sudo apt-get install tesseract-ocr
# Mac: brew install tesseract
```

**Issue: Import Errors**
```bash
# Add project to Python path
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
```

**Issue: Fixture Not Found**
```bash
# Ensure conftest.py is in tests/ directory
# Check fixture naming matches test requirements
```

---

## 📝 Adding New Tests

### Template

```python
def test_new_functionality(required_fixture, perf_metrics):
    """
    Test description.
    
    This test verifies that [functionality] works correctly
    when [condition] occurs.
    """
    # Setup
    data = required_fixture["key"]
    
    # Execute
    start_time = time.time()
    result = function_to_test(data)
    elapsed = (time.time() - start_time) * 1000
    
    # Assert
    assert result is not None
    assert result["status"] == "success"
    
    # Record metrics
    perf_metrics.record("test_name", elapsed)
    
    # Log
    logger.info(f"✓ Test passed: {result}")
```

### Best Practices

1. **Use Descriptive Names**
   ```python
   def test_pii_detection_with_mixed_text_types()  # Good
   def test_pii_1()  # Bad
   ```

2. **One Assertion Focus**
   ```python
   # Test one thing per test function
   def test_email_detection():
       # Only test email detection
       pass
   ```

3. **Use Fixtures for Setup**
   ```python
   def test_something(sample_text_data, perf_metrics):
       # Use fixture data
       text = sample_text_data["complex_text"]
   ```

4. **Include Logging**
   ```python
   logger.info(f"✓ Detected {len(entities)} entities")
   ```

5. **Handle Errors Gracefully**
   ```python
   try:
       result = function()
   except ExpectedException as e:
       logger.info(f"✓ Expected error: {e}")
   ```

---

## 🔒 Security and Privacy in Tests

### Sensitive Data Handling

- Test data does NOT contain real personal information
- All generated test documents are temporary
- Logs do NOT contain sensitive data
- Original files are never modified
- Temporary files are cleaned up

### Verification

- `test_sensitive_data_not_logged()` - Ensures no data leaks
- `test_original_document_integrity()` - Verifies no modification

---

## 📚 References

### Documentation
- [pytest Documentation](https://docs.pytest.org/)
- [Python Testing Best Practices](https://docs.python-guide.org/writing/tests/)
- [IEEE 829 Test Documentation](https://standards.ieee.org/standard/829-1998.html)

### Standards
- IEEE 829-1998: Software and System Test Documentation
- IEEE 1012-2016: System and Software Verification and Validation
- ISO/IEC/IEEE 29119: Software Testing

---

## 🎯 SRS Compliance

All tests are designed to verify compliance with SRS requirements:

### Functional Requirements
- ✅ FR-1: PII Detection - 15+ tests
- ✅ FR-2: Document Redaction - 20+ tests
- ✅ FR-3: Data Processing - 10+ tests
- ✅ FR-4: Compliance & Security - 8+ tests

### Non-Functional Requirements
- ✅ NFR-1: Performance - 10+ tests
- ✅ NFR-2: Reliability - 8+ tests
- ✅ NFR-3: Usability - 5+ tests
- ✅ NFR-4: Maintainability - 5+ tests

---

## 📞 Support

For issues or questions:
1. Check test logs in `test_results.log`
2. Review generated reports
3. Run tests with verbose flag: `pytest tests/ -vv`
4. Check conftest.py for fixture definitions

---

**Generated**: 2024-2025
**Version**: 1.0
**Status**: Active
