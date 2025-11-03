#!/usr/bin/env python3
"""
Entity Detection Log Analysis Script

This script provides utilities to analyze entity detection logs and generate
statistics about detection performance.

Usage:
    python analyze_logs.py  # Analyze today's logs
    python analyze_logs.py --date 20251102  # Analyze specific date
    python analyze_logs.py --json  # Output as JSON
"""

import re
import sys
import json
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Dict, List, Tuple
import argparse


class LogAnalyzer:
    def __init__(self, log_dir: Path = Path("backend/logs")):
        self.log_dir = log_dir
        self.entity_pattern = re.compile(
            r'\[(.*?)\].*?(\w+)\s+\|.*?Method: (.*?)\s+\|.*?Confidence: ([\d.]+)'
        )
        self.document_pattern = re.compile(
            r'\[Document ([a-f0-9\-]+)\].*?breakdown by type: ({.*?})'
        )
    
    def get_log_file(self, date: str = None) -> Path:
        """Get entity detection log file for given date"""
        if date is None:
            date = datetime.now().strftime("%Y%m%d")
        
        log_file = self.log_dir / f"entity_detection_{date}.log"
        if not log_file.exists():
            raise FileNotFoundError(f"Log file not found: {log_file}")
        return log_file
    
    def parse_log_file(self, log_file: Path) -> List[Dict]:
        """Parse log file and extract entity detections"""
        entities = []
        
        with open(log_file, 'r', encoding='utf-8') as f:
            for line in f:
                match = self.entity_pattern.search(line)
                if match:
                    component, label, method, confidence = match.groups()
                    entities.append({
                        'component': component.strip(),
                        'label': label.strip(),
                        'method': method.strip(),
                        'confidence': float(confidence)
                    })
        
        return entities
    
    def analyze_entities(self, entities: List[Dict]) -> Dict:
        """Generate statistics from detected entities"""
        if not entities:
            return {
                'total': 0,
                'by_type': {},
                'by_method': {},
                'by_component': {},
                'confidence_stats': {}
            }
        
        by_type = defaultdict(int)
        by_method = defaultdict(int)
        by_component = defaultdict(int)
        by_type_method = defaultdict(lambda: defaultdict(int))
        confidences = defaultdict(list)
        
        for entity in entities:
            by_type[entity['label']] += 1
            by_method[entity['method']] += 1
            by_component[entity['component']] += 1
            by_type_method[entity['label']][entity['method']] += 1
            confidences[entity['label']].append(entity['confidence'])
        
        # Calculate confidence statistics
        confidence_stats = {}
        for label, scores in confidences.items():
            scores_sorted = sorted(scores)
            confidence_stats[label] = {
                'min': min(scores),
                'max': max(scores),
                'avg': sum(scores) / len(scores),
                'median': scores_sorted[len(scores) // 2] if scores else 0
            }
        
        return {
            'total': len(entities),
            'by_type': dict(sorted(by_type.items(), key=lambda x: x[1], reverse=True)),
            'by_method': dict(by_method),
            'by_component': dict(by_component),
            'by_type_method': {k: dict(v) for k, v in by_type_method.items()},
            'confidence_stats': confidence_stats
        }
    
    def print_analysis(self, analysis: Dict, json_output: bool = False):
        """Print analysis results"""
        if json_output:
            print(json.dumps(analysis, indent=2))
            return
        
        print("\n" + "=" * 80)
        print("ENTITY DETECTION ANALYSIS")
        print("=" * 80)
        
        print(f"\nTOTAL ENTITIES DETECTED: {analysis['total']}")
        
        print("\n" + "-" * 80)
        print("ENTITIES BY TYPE:")
        print("-" * 80)
        for entity_type, count in analysis['by_type'].items():
            percentage = (count / analysis['total'] * 100) if analysis['total'] > 0 else 0
            print(f"  {entity_type:20} | {count:5} ({percentage:5.1f}%)")
        
        print("\n" + "-" * 80)
        print("DETECTION METHODS USED:")
        print("-" * 80)
        for method, count in sorted(analysis['by_method'].items(), key=lambda x: x[1], reverse=True):
            percentage = (count / analysis['total'] * 100) if analysis['total'] > 0 else 0
            print(f"  {method:20} | {count:5} ({percentage:5.1f}%)")
        
        print("\n" + "-" * 80)
        print("DETECTION COMPONENTS:")
        print("-" * 80)
        for component, count in sorted(analysis['by_component'].items(), key=lambda x: x[1], reverse=True):
            percentage = (count / analysis['total'] * 100) if analysis['total'] > 0 else 0
            print(f"  {component:30} | {count:5} ({percentage:5.1f}%)")
        
        print("\n" + "-" * 80)
        print("METHOD EFFECTIVENESS BY ENTITY TYPE:")
        print("-" * 80)
        for entity_type, methods in sorted(analysis['by_type_method'].items()):
            print(f"\n  {entity_type}:")
            for method, count in sorted(methods.items(), key=lambda x: x[1], reverse=True):
                type_total = analysis['by_type'].get(entity_type, 0)
                percentage = (count / type_total * 100) if type_total > 0 else 0
                print(f"    {method:15} | {count:3} ({percentage:5.1f}%)")
        
        print("\n" + "-" * 80)
        print("CONFIDENCE STATISTICS BY ENTITY TYPE:")
        print("-" * 80)
        for entity_type, stats in sorted(analysis['confidence_stats'].items()):
            print(f"\n  {entity_type}:")
            print(f"    Minimum:  {stats['min']:.4f}")
            print(f"    Maximum:  {stats['max']:.4f}")
            print(f"    Average:  {stats['avg']:.4f}")
            print(f"    Median:   {stats['median']:.4f}")
        
        print("\n" + "=" * 80 + "\n")
    
    def detect_anomalies(self, analysis: Dict) -> List[str]:
        """Detect potential issues in entity detection"""
        issues = []
        
        # Check if any detection method resulted in 0 entities
        if analysis['total'] == 0:
            issues.append("⚠️ No entities detected in logs")
        
        # Check if confidence is too low
        for entity_type, stats in analysis['confidence_stats'].items():
            if stats['avg'] < 0.80:
                issues.append(f"⚠️ Low average confidence for {entity_type}: {stats['avg']:.2f}")
        
        # Check if a method is underutilized
        if 'regex' in analysis['by_method'] and analysis['by_method']['regex'] == 0:
            issues.append("⚠️ No entities detected via regex - check patterns")
        
        if 'spacy' in analysis['by_method'] and analysis['by_method']['spacy'] == 0:
            issues.append("⚠️ No entities detected via spaCy - check model loading")
        
        if 'huggingface' in analysis['by_method'] and analysis['by_method']['huggingface'] == 0:
            issues.append("ℹ️  No entities detected via HuggingFace - model may not be loaded")
        
        return issues


def main():
    parser = argparse.ArgumentParser(description='Analyze entity detection logs')
    parser.add_argument('--date', help='Log date (YYYYMMDD), default: today')
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    parser.add_argument('--log-dir', default='backend/logs', help='Path to log directory')
    
    args = parser.parse_args()
    
    try:
        analyzer = LogAnalyzer(Path(args.log_dir))
        log_file = analyzer.get_log_file(args.date)
        
        print(f"Analyzing: {log_file}")
        
        entities = analyzer.parse_log_file(log_file)
        analysis = analyzer.analyze_entities(entities)
        analyzer.print_analysis(analysis, args.json)
        
        # Show anomalies
        anomalies = analyzer.detect_anomalies(analysis)
        if anomalies:
            print("Potential Issues:")
            for issue in anomalies:
                print(f"  {issue}")
        
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
