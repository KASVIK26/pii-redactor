#!/usr/bin/env python
"""
Quick test runner script
Simplifies running different test categories
"""

import sys
import subprocess
import argparse
from pathlib import Path

def run_command(cmd, description):
    """Run a command and print status."""
    print(f"\n{'='*80}")
    print(f"{description}")
    print(f"{'='*80}")
    print(f"Command: {' '.join(cmd)}\n")
    
    result = subprocess.run(cmd)
    return result.returncode

def main():
    parser = argparse.ArgumentParser(
        description="Run PII Redactor tests",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python tests_quick.py --unit          # Run unit tests
  python tests_quick.py --integration   # Run integration tests
  python tests_quick.py --performance   # Run performance tests
  python tests_quick.py --all           # Run all tests
  python tests_quick.py --quick         # Quick test run
  python tests_quick.py --coverage      # With coverage report
        """
    )
    
    parser.add_argument('--unit', action='store_true', help='Run unit tests only')
    parser.add_argument('--integration', action='store_true', help='Run integration tests only')
    parser.add_argument('--performance', action='store_true', help='Run performance tests only')
    parser.add_argument('--all', action='store_true', help='Run all test suites')
    parser.add_argument('--quick', action='store_true', help='Quick test run (excludes slow tests)')
    parser.add_argument('--coverage', action='store_true', help='Run with coverage report')
    parser.add_argument('--srs', action='store_true', help='Run full suite and generate SRS report')
    parser.add_argument('-v', '--verbose', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    # Default to all tests if no option specified
    if not any([args.unit, args.integration, args.performance, args.all, args.quick, args.coverage, args.srs]):
        args.all = True
    
    test_dir = Path(__file__).parent / "tests"
    
    # Build base command
    base_cmd = [sys.executable, "-m", "pytest"]
    if args.verbose:
        base_cmd.append("-vv")
    else:
        base_cmd.append("-v")
    
    exit_code = 0
    
    # Unit tests
    if args.unit or args.all or args.quick:
        cmd = base_cmd + [
            str(test_dir / "test_pii_detection.py"),
            str(test_dir / "test_redaction_service.py"),
            "--tb=short"
        ]
        exit_code = run_command(cmd, "UNIT TESTS")
        if exit_code != 0:
            return exit_code
    
    # Integration tests
    if args.integration or args.all:
        cmd = base_cmd + [
            str(test_dir / "test_integration.py"),
            "--tb=short"
        ]
        exit_code = run_command(cmd, "INTEGRATION TESTS")
        if exit_code != 0:
            return exit_code
    
    # Performance tests
    if args.performance or args.all:
        cmd = base_cmd + [
            str(test_dir / "test_performance.py"),
            "--tb=short"
        ]
        if args.quick:
            cmd.append("-m 'not slow'")
        exit_code = run_command(cmd, "PERFORMANCE TESTS")
        if exit_code != 0:
            return exit_code
    
    # Coverage
    if args.coverage:
        cmd = base_cmd + [
            str(test_dir),
            "--cov=app",
            "--cov-report=html",
            "--cov-report=term"
        ]
        exit_code = run_command(cmd, "TESTS WITH COVERAGE REPORT")
    
    # SRS Report
    if args.srs:
        cmd = [sys.executable, str(test_dir / "run_tests.py")]
        exit_code = run_command(cmd, "RUNNING FULL TEST SUITE WITH SRS REPORT GENERATION")
    
    print(f"\n{'='*80}")
    print(f"Test run completed with exit code: {exit_code}")
    print(f"{'='*80}\n")
    
    return exit_code

if __name__ == "__main__":
    sys.exit(main())
