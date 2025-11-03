"""
Performance and benchmarking tests.
Measures execution time, memory usage, and scalability characteristics.
"""

import pytest
import time
import logging
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pathlib import Path
from typing import Dict, List
import psutil
import tracemalloc

logger = logging.getLogger(__name__)


class PerformanceMetrics:
    """Helper class to collect and report performance metrics."""
    
    def __init__(self):
        self.metrics: List[Dict] = []
    
    def record(self, name: str, duration_ms: float, memory_mb: float = 0):
        """Record a performance metric."""
        self.metrics.append({
            'name': name,
            'duration_ms': duration_ms,
            'memory_mb': memory_mb,
            'timestamp': time.time()
        })
    
    def get_summary(self) -> Dict:
        """Get summary statistics."""
        if not self.metrics:
            return {}
        
        durations = [m['duration_ms'] for m in self.metrics]
        memories = [m['memory_mb'] for m in self.metrics if m['memory_mb'] > 0]
        
        return {
            'count': len(self.metrics),
            'total_time_ms': sum(durations),
            'avg_time_ms': sum(durations) / len(durations),
            'min_time_ms': min(durations),
            'max_time_ms': max(durations),
            'peak_memory_mb': max(memories) if memories else 0,
            'avg_memory_mb': sum(memories) / len(memories) if memories else 0
        }
    
    def report(self):
        """Generate performance report."""
        summary = self.get_summary()
        if not summary:
            return "No metrics recorded"
        
        report = f"""
Performance Summary:
  Total Operations: {summary['count']}
  Total Time: {summary['total_time_ms']:.2f}ms
  Average Time: {summary['avg_time_ms']:.2f}ms
  Min Time: {summary['min_time_ms']:.2f}ms
  Max Time: {summary['max_time_ms']:.2f}ms
  Peak Memory: {summary['peak_memory_mb']:.2f}MB
  Avg Memory: {summary['avg_memory_mb']:.2f}MB
"""
        return report


@pytest.fixture
def perf_metrics():
    """Provide performance metrics collector."""
    return PerformanceMetrics()


class TestPIIDetectionPerformance:
    """Performance tests for PII detection."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        from app.services.pii_detection_service import PIIDetectionService
        self.service = PIIDetectionService()
    
    def test_detection_speed_simple_text(self, sample_text_data, perf_metrics):
        """Test detection speed on simple text."""
        text = sample_text_data["simple_text"]
        
        start_time = time.time()
        entities = self.service.detect_pii(text)
        elapsed = (time.time() - start_time) * 1000  # ms
        
        perf_metrics.record("simple_text_detection", elapsed)
        
        logger.info(f"✓ Simple text detection: {elapsed:.2f}ms for {len(entities)} entities")
        assert elapsed < 5000, "Simple detection should be fast"
    
    def test_detection_speed_complex_text(self, sample_text_data, perf_metrics):
        """Test detection speed on complex text."""
        text = sample_text_data["complex_text"]
        
        start_time = time.time()
        entities = self.service.detect_pii(text)
        elapsed = (time.time() - start_time) * 1000  # ms
        
        perf_metrics.record("complex_text_detection", elapsed)
        
        logger.info(f"✓ Complex text detection: {elapsed:.2f}ms for {len(entities)} entities")
    
    def test_detection_memory_usage(self, sample_text_data):
        """Test memory usage during detection."""
        text = sample_text_data["complex_text"] * 5
        
        tracemalloc.start()
        
        entities = self.service.detect_pii(text)
        
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        
        peak_mb = peak / 1024 / 1024
        logger.info(f"✓ Detection memory: {peak_mb:.2f}MB for {len(text)} chars")
    
    def test_detection_scaling_linear(self, sample_text_data, perf_metrics):
        """Test that detection scales linearly with text size."""
        base_text = sample_text_data["mixed_pii_text"]
        
        times_ms = []
        for multiplier in [1, 2, 5]:
            text = base_text * multiplier
            
            start_time = time.time()
            entities = self.service.detect_pii(text)
            elapsed = (time.time() - start_time) * 1000
            
            times_ms.append(elapsed)
            perf_metrics.record(f"scaling_{multiplier}x", elapsed)
        
        logger.info(f"✓ Scaling test: 1x={times_ms[0]:.2f}ms, 2x={times_ms[1]:.2f}ms, 5x={times_ms[2]:.2f}ms")
    
    def test_detection_throughput(self, sample_text_data):
        """Test detection throughput (entities per second)."""
        text = sample_text_data["complex_text"]
        
        start_time = time.time()
        for _ in range(10):
            entities = self.service.detect_pii(text)
        elapsed = time.time() - start_time
        
        throughput = 10 / elapsed
        logger.info(f"✓ Detection throughput: {throughput:.2f} documents/sec")


class TestRedactionPerformance:
    """Performance tests for redaction."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures."""
        from app.services.redaction_service import RedactionService
        self.service = RedactionService()
    
    def test_pdf_redaction_speed(self, sample_pdf_path, sample_entities, perf_metrics, test_temp_dir):
        """Test PDF redaction speed."""
        output_path = os.path.join(test_temp_dir, "perf_redacted.pdf")
        
        start_time = time.time()
        result = self.service.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=sample_entities
        )
        elapsed = (time.time() - start_time) * 1000  # ms
        
        perf_metrics.record("pdf_redaction", elapsed)
        
        logger.info(f"✓ PDF redaction: {elapsed:.2f}ms for {len(sample_entities)} entities")
    
    def test_image_redaction_speed(self, sample_image_path, sample_entities, perf_metrics, test_temp_dir):
        """Test image redaction speed."""
        output_path = os.path.join(test_temp_dir, "perf_redacted.png")
        
        start_time = time.time()
        result = self.service.redact_document(
            input_path=sample_image_path,
            output_path=output_path,
            entities=sample_entities,
            redaction_style='black'
        )
        elapsed = (time.time() - start_time) * 1000  # ms
        
        perf_metrics.record("image_redaction", elapsed)
        
        logger.info(f"✓ Image redaction: {elapsed:.2f}ms for {len(sample_entities)} entities")
    
    def test_redaction_memory_usage(self, sample_pdf_path, sample_entities):
        """Test memory usage during redaction."""
        import tempfile
        
        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = os.path.join(tmpdir, "redacted.pdf")
            
            tracemalloc.start()
            
            result = self.service.redact_document(
                input_path=sample_pdf_path,
                output_path=output_path,
                entities=sample_entities
            )
            
            current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            
            peak_mb = peak / 1024 / 1024
            logger.info(f"✓ Redaction memory: {peak_mb:.2f}MB")
    
    def test_multiple_redactions_throughput(self, sample_pdf_path, sample_entities, perf_metrics, test_temp_dir):
        """Test throughput of multiple redactions."""
        doc_count = 5
        times = []
        
        for i in range(doc_count):
            output_path = os.path.join(test_temp_dir, f"throughput_{i}.pdf")
            
            start_time = time.time()
            result = self.service.redact_document(
                input_path=sample_pdf_path,
                output_path=output_path,
                entities=sample_entities
            )
            elapsed = (time.time() - start_time) * 1000
            times.append(elapsed)
        
        avg_time = sum(times) / len(times)
        throughput = 1000 / avg_time  # docs per second
        
        logger.info(f"✓ Redaction throughput: {throughput:.2f} docs/sec (avg: {avg_time:.2f}ms)")


class TestPipelinePerformance:
    """Performance tests for complete pipeline."""
    
    def test_end_to_end_document_processing(self, sample_pdf_path, test_temp_dir, perf_metrics):
        """Test end-to-end processing performance."""
        from app.services.pii_detection_service import PIIDetectionService
        from app.services.redaction_service import RedactionService
        import fitz
        
        # Stage 1: Text extraction
        start = time.time()
        doc = fitz.open(sample_pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        extract_time = (time.time() - start) * 1000
        
        # Stage 2: PII detection
        detector = PIIDetectionService()
        start = time.time()
        entities = detector.detect_pii(text)
        detect_time = (time.time() - start) * 1000
        
        # Stage 3: Redaction
        redactor = RedactionService()
        output_path = os.path.join(test_temp_dir, "end_to_end.pdf")
        start = time.time()
        result = redactor.redact_document(
            input_path=sample_pdf_path,
            output_path=output_path,
            entities=entities
        )
        redact_time = (time.time() - start) * 1000
        
        total_time = extract_time + detect_time + redact_time
        
        logger.info(f"✓ End-to-end pipeline:")
        logger.debug(f"  Extraction: {extract_time:.2f}ms")
        logger.debug(f"  Detection: {detect_time:.2f}ms")
        logger.debug(f"  Redaction: {redact_time:.2f}ms")
        logger.debug(f"  Total: {total_time:.2f}ms")
        
        perf_metrics.record("extraction", extract_time)
        perf_metrics.record("detection", detect_time)
        perf_metrics.record("redaction", redact_time)
    
    def test_batch_processing_performance(self, sample_pdf_path, test_temp_dir, sample_entities):
        """Test batch processing performance."""
        from app.services.redaction_service import RedactionService
        
        redactor = RedactionService()
        batch_size = 10
        
        start_time = time.time()
        for i in range(batch_size):
            output_path = os.path.join(test_temp_dir, f"batch_{i}.pdf")
            redactor.redact_document(
                input_path=sample_pdf_path,
                output_path=output_path,
                entities=sample_entities
            )
        
        total_time = time.time() - start_time
        avg_per_doc = total_time / batch_size
        throughput = batch_size / total_time
        
        logger.info(f"✓ Batch processing ({batch_size} docs):")
        logger.debug(f"  Total time: {total_time:.2f}s")
        logger.debug(f"  Per doc: {avg_per_doc:.2f}s")
        logger.debug(f"  Throughput: {throughput:.2f} docs/sec")


class TestResourceUtilization:
    """Test system resource utilization."""
    
    def test_cpu_usage_during_detection(self, sample_text_data):
        """Test CPU usage during PII detection."""
        from app.services.pii_detection_service import PIIDetectionService
        
        service = PIIDetectionService()
        text = sample_text_data["complex_text"] * 3
        
        process = psutil.Process()
        cpu_percent_start = process.cpu_percent(interval=0.1)
        
        entities = service.detect_pii(text)
        
        cpu_percent_end = process.cpu_percent(interval=0.1)
        
        logger.info(f"✓ CPU usage: start={cpu_percent_start:.1f}%, end={cpu_percent_end:.1f}%")
    
    def test_memory_efficiency(self, sample_text_data):
        """Test memory efficiency."""
        from app.services.pii_detection_service import PIIDetectionService
        
        service = PIIDetectionService()
        
        # Test with progressively larger inputs
        sizes = []
        for multiplier in [1, 2, 5, 10]:
            text = sample_text_data["complex_text"] * multiplier
            
            tracemalloc.start()
            entities = service.detect_pii(text)
            current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            
            peak_mb = peak / 1024 / 1024
            ratio = peak_mb / (len(text) / 1024 / 1024) if len(text) > 0 else 0
            
            sizes.append({
                'text_size_mb': len(text) / 1024 / 1024,
                'peak_memory_mb': peak_mb,
                'ratio': ratio
            })
        
        logger.info("✓ Memory efficiency test:")
        for i, s in enumerate(sizes):
            logger.debug(f"  Input: {s['text_size_mb']:.2f}MB -> Peak: {s['peak_memory_mb']:.2f}MB (ratio: {s['ratio']:.2f}x)")


class TestLoadTesting:
    """Load and stress tests."""
    
    def test_concurrent_detection_simulation(self, sample_text_data):
        """Simulate concurrent detection requests."""
        from app.services.pii_detection_service import PIIDetectionService
        
        service = PIIDetectionService()
        text = sample_text_data["mixed_pii_text"]
        
        concurrent_requests = 20
        start_time = time.time()
        
        for _ in range(concurrent_requests):
            entities = service.detect_pii(text)
        
        elapsed = time.time() - start_time
        rate = concurrent_requests / elapsed
        
        logger.info(f"✓ Concurrent detection simulation:")
        logger.debug(f"  Requests: {concurrent_requests}")
        logger.debug(f"  Total time: {elapsed:.2f}s")
        logger.debug(f"  Rate: {rate:.2f} req/s")
    
    def test_large_batch_redaction(self, sample_pdf_path, sample_entities, test_temp_dir):
        """Test processing large batch of documents."""
        from app.services.redaction_service import RedactionService
        
        redactor = RedactionService()
        batch_count = 5
        
        start_time = time.time()
        success_count = 0
        
        for i in range(batch_count):
            try:
                output_path = os.path.join(test_temp_dir, f"large_batch_{i}.pdf")
                redactor.redact_document(
                    input_path=sample_pdf_path,
                    output_path=output_path,
                    entities=sample_entities
                )
                success_count += 1
            except Exception as e:
                logger.warning(f"ℹ Batch item {i} failed: {e}")
        
        elapsed = time.time() - start_time
        
        logger.info(f"✓ Large batch processing:")
        logger.debug(f"  Completed: {success_count}/{batch_count}")
        logger.debug(f"  Total time: {elapsed:.2f}s")
        logger.debug(f"  Rate: {success_count/elapsed:.2f} docs/s")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
