import spacy
import re
from typing import List, Dict, Tuple, Optional
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline
import logging

logger = logging.getLogger(__name__)

class PIIDetectionService:
    """Service for detecting personally identifiable information in text"""
    
    def __init__(self, spacy_model: str = "en_core_web_sm"):
        self.spacy_model_name = spacy_model
        self.nlp = None
        self.hf_pipeline = None
        self._load_models()
    
    def _load_models(self):
        """Load NLP models"""
        try:
            # Try to load spaCy model
            try:
                self.nlp = spacy.load(self.spacy_model_name)
                logger.info(f"Loaded spaCy model: {self.spacy_model_name}")
            except OSError as e:
                logger.warning(f"Could not load spaCy model {self.spacy_model_name}: {e}")
                logger.info("Falling back to regex-only PII detection")
                self.nlp = None
            
            # Load HuggingFace NER model (alternative/backup)
            try:
                self.hf_pipeline = pipeline(
                    "ner",
                    model="dbmdz/bert-large-cased-finetuned-conll03-english",
                    aggregation_strategy="simple"
                )
                logger.info("Loaded HuggingFace NER model")
            except Exception as e:
                logger.warning(f"Could not load HuggingFace model: {e}")
                self.hf_pipeline = None
                
        except Exception as e:
            logger.error(f"Error loading models: {e}")
            # Continue with regex-only detection
    
    def detect_pii(self, text: str, confidence_threshold: float = 0.85) -> List[Dict]:
        """Detect PII entities in text"""
        import uuid
        
        entities = []
        
        # SpaCy NER
        if self.nlp:
            spacy_entities = self._detect_with_spacy(text, confidence_threshold)
            entities.extend(spacy_entities)
            logger.info(f"[SpaCy NER] Detected {len(spacy_entities)} entities")
            if spacy_entities:
                entity_summary = self._summarize_entities(spacy_entities)
                logger.debug(f"[SpaCy NER] Entity breakdown: {entity_summary}")
                for entity in spacy_entities:
                    logger.debug(f"[SpaCy NER] {entity['label']:15} | Confidence: {entity['confidence']:.2f} | Text: '{entity['text'][:50]}'")
        else:
            logger.debug("[SpaCy NER] Model not loaded, skipping SpaCy detection")
        
        # Regex-based detection
        regex_entities = self._detect_with_regex(text)
        entities.extend(regex_entities)
        logger.info(f"[Regex Detection] Detected {len(regex_entities)} entities")
        if regex_entities:
            entity_summary = self._summarize_entities(regex_entities)
            logger.debug(f"[Regex Detection] Entity breakdown: {entity_summary}")
            for entity in regex_entities:
                logger.debug(f"[Regex Detection] {entity['label']:15} | Confidence: {entity['confidence']:.2f} | Text: '{entity['text'][:50]}'")
        
        # HuggingFace NER (if available)
        if self.hf_pipeline:
            hf_entities = self._detect_with_huggingface(text, confidence_threshold)
            entities.extend(hf_entities)
            logger.info(f"[HuggingFace NER] Detected {len(hf_entities)} entities")
            if hf_entities:
                entity_summary = self._summarize_entities(hf_entities)
                logger.debug(f"[HuggingFace NER] Entity breakdown: {entity_summary}")
                for entity in hf_entities:
                    logger.debug(f"[HuggingFace NER] {entity['label']:15} | Confidence: {entity['confidence']:.2f} | Text: '{entity['text'][:50]}'")
        else:
            logger.debug("[HuggingFace NER] Model not loaded, skipping HuggingFace detection")
        
        logger.info(f"[PII Detection] Total entities before deduplication: {len(entities)}")
        
        # Remove duplicates and merge overlapping entities
        entities_before_merge = len(entities)
        entities = self._merge_overlapping_entities(entities)
        logger.info(f"[PII Detection] Merged overlapping entities: {entities_before_merge} -> {len(entities)}")
        
        # Deduplicate entities detected by multiple methods
        entities_before_dedup = len(entities)
        entities = self._deduplicate_by_method(entities)
        logger.info(f"[PII Detection] Deduplicated by method: {entities_before_dedup} -> {len(entities)}")
        
        # Filter out header labels and non-PII entities
        entities_before_filter = len(entities)
        entities = self._filter_header_labels(entities)
        logger.info(f"[PII Detection] Filtered header labels: {entities_before_filter} -> {len(entities)}")
        
        # Add unique IDs to each entity
        for entity in entities:
            if 'id' not in entity:
                entity['id'] = str(uuid.uuid4())
        
        # Final summary
        final_summary = self._summarize_entities(entities)
        logger.info(f"[PII Detection] Final result - Total entities: {len(entities)} | Summary: {final_summary}")
        
        return entities
    
    def _detect_with_spacy(self, text: str, confidence_threshold: float) -> List[Dict]:
        """Detect entities using spaCy NER"""
        entities = []
        doc = self.nlp(text)
        
        for ent in doc.ents:
            # Map spaCy labels to our PII types
            pii_type = self._map_spacy_label(ent.label_)
            if pii_type:
                entity_obj = {
                    'text': ent.text,
                    'label': pii_type,
                    'confidence': 0.9,  # spaCy doesn't provide confidence scores
                    'start_pos': ent.start_char,
                    'end_pos': ent.end_char,
                    'method': 'spacy'
                }
                entities.append(entity_obj)
                logger.debug(f"[SpaCy] Detected {pii_type}: '{ent.text}' at position {ent.start_char}-{ent.end_char}")
        
        return entities
    
    def _summarize_entities(self, entities: List[Dict]) -> Dict[str, int]:
        """Create a summary of entities by type"""
        summary = {}
        for entity in entities:
            label = entity.get('label', 'UNKNOWN')
            summary[label] = summary.get(label, 0) + 1
        return summary
    
    def _filter_header_labels(self, entities: List[Dict]) -> List[Dict]:
        """Filter out common document header labels and non-PII labels"""
        # Common document headers and labels to skip
        skip_labels = {
            'office copy', 'receipt date', 'form no', 'receipt no', 
            'prn no', 'payment date', 'installment details', 'paid amount',
            'class name', 'student name', 'academic year', 'div', 'category',
            'roll no', 'grand total', 'amount in rs', 'paid amount in rs',
            'student name:', 'form no:', 'class name:', 'received:', 'rs',
            'college fee particulars', 'receipt no', 'paid on', 'transaction id',
            'total', 'receipt', 'college fee', 'portal subscription fee',
            'amount in words', 'pay date & time', 'amount in rs.',
            'college fee receipt', 'date', 'time', 'fee', 'form', 'in rs',
            'amount', 'paid', 'a', 'obc', 'b. tech', 'b.tech', 'b tech', 'cs',
            'b.a', 'b.sc', 'b.com', 'b.e', 'mtech', 'm.tech', 'mca', 'm.ca',
            'three hundred and fifty four rupees', 'three hundred', 'fifty', 'four', 
            'rupees', 'and', 'prn no:', 'office copy receipt date',
            # Numbers that look like amounts but aren't PII
            '0.00', '0.0', '354', '2819', '00', '0',
            # Academic degrees and certifications
            'degree', 'diploma', 'certificate', 'course',
            # Common field labels
            'name', 'id', 'number', 'no', 'no:', 'date:', 'time:', 'amount:',
            'paid on:', 'paid date:', 'payment date:', 'from:', 'to:',
            'balance', 'due', 'semester', 'academic', 'session', 'year',
            '2025-26', '2024-25', '2023-24'  # Academic years
            # NOTE: Removed 'ssn', 'phone', 'email' from skip list as these are legitimate PII
        }
        
        # Patterns that indicate labels/headers (text followed by colon/equals)
        label_patterns = [
            r'^\w+\s+no:?$',  # "Student No" / "Roll No:"
            r'^\w+\s+name:?$',  # "Student Name:"
            r'^[\w\s]+:$',  # Any text ending with colon
        ]
        
        filtered = []
        filtered_count = 0
        
        for entity in entities:
            entity_text = entity['text'].strip()
            entity_text_lower = entity_text.lower().strip()
            
            # Check if entity text is in skip list
            if entity_text_lower in skip_labels:
                logger.debug(f"[Filter] Skipped header/label: '{entity['text']}' ({entity['label']})")
                filtered_count += 1
                continue
            
            # Check for label patterns
            is_label = False
            for pattern in label_patterns:
                if re.match(pattern, entity_text_lower):
                    logger.debug(f"[Filter] Skipped label pattern: '{entity['text']}' (matches {pattern})")
                    filtered_count += 1
                    is_label = True
                    break
            
            if is_label:
                continue
            
            # Check if entity is overly short (likely labels, not values)
            # Exception: allow short values like dates, IDs, amounts
            if len(entity_text) <= 2 and entity['label'] not in ['DATE', 'TIME', 'STUDENT_ID', 'TRANSACTION_ID']:
                logger.debug(f"[Filter] Skipped short label: '{entity['text']}' (length: {len(entity_text)})")
                filtered_count += 1
                continue
            
            # Filter common PII field labels/acronyms (SSN, DOB, etc.) that aren't actual values
            common_pii_labels = {'ssn', 'dob', 'pan', 'aadhar', 'phone', 'email', 'name', 'address', 
                                 'city', 'state', 'pin', 'zip', 'account', 'card', 'id', 'no', 'date'}
            if entity_text_lower in common_pii_labels and entity['label'] not in ['SSN', 'PHONE', 'EMAIL', 'DATE']:
                logger.debug(f"[Filter] Skipped PII field label: '{entity['text']}' (recognized as field name)")
                filtered_count += 1
                continue
            
            # Filter out pure numeric amounts (0-9999)
            if entity['label'] == 'IDENTIFIER' and entity_text.replace('.', '').isdigit():
                amount = float(entity_text) if '.' in entity_text else int(entity_text)
                if 0 <= amount <= 9999:  # Likely currency amounts, not PII
                    logger.debug(f"[Filter] Skipped numeric amount: '{entity['text']}'")
                    filtered_count += 1
                    continue
            
            # Filter out written amounts (e.g., "Three Hundred and Fifty Four Rupees")
            if entity['label'] == 'IDENTIFIER' and re.match(r'^[a-zA-Z\s]+[Rr]upees?$', entity_text):
                logger.debug(f"[Filter] Skipped written amount: '{entity['text']}'")
                filtered_count += 1
                continue
            
            # Filter out time expressions that are not actual times
            if entity['label'] == 'TIME' and not re.match(r'^\d{1,2}:\d{2}(:\d{2})?', entity_text):
                logger.debug(f"[Filter] Skipped non-time pattern: '{entity['text']}'")
                filtered_count += 1
                continue
            
            filtered.append(entity)
        
        if filtered_count > 0:
            logger.info(f"[Filter] Removed {filtered_count} false positives, {len(filtered)} entities remain")
        
        return filtered
    
    def _detect_with_regex(self, text: str) -> List[Dict]:
        """Detect PII using regex patterns"""
        entities = []
        regex_stats = {'EMAIL': 0, 'PHONE': 0, 'SSN': 0, 'CREDIT_CARD': 0, 
                       'INDIAN_DATE': 0, 'STUDENT_ID': 0, 'TRANSACTION_ID': 0}
        
        # Email pattern
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        for match in re.finditer(email_pattern, text):
            entity_obj = {
                'text': match.group(),
                'label': 'EMAIL',
                'confidence': 0.95,
                'start_pos': match.start(),
                'end_pos': match.end(),
                'method': 'regex'
            }
            entities.append(entity_obj)
            regex_stats['EMAIL'] += 1
            logger.debug(f"[Regex] EMAIL pattern matched: '{match.group()}' at position {match.start()}")
        
        # Phone number patterns
        phone_patterns = [
            (r'\d{3}-\d{3}-\d{4}', '123-456-7890'),
            (r'\(\d{3}\)\s*\d{3}-\d{4}', '(123) 456-7890'),
            (r'\d{3}\.\d{3}\.\d{4}', '123.456.7890'),
            (r'\+1\s*\d{3}\s*\d{3}\s*\d{4}', '+1 123 456 7890'),
        ]
        
        for pattern, pattern_desc in phone_patterns:
            for match in re.finditer(pattern, text):
                entity_obj = {
                    'text': match.group(),
                    'label': 'PHONE',
                    'confidence': 0.9,
                    'start_pos': match.start(),
                    'end_pos': match.end(),
                    'method': 'regex'
                }
                entities.append(entity_obj)
                regex_stats['PHONE'] += 1
                logger.debug(f"[Regex] PHONE pattern ({pattern_desc}) matched: '{match.group()}' at position {match.start()}")
        
        # SSN pattern
        ssn_pattern = r'\b\d{3}-\d{2}-\d{4}\b'
        for match in re.finditer(ssn_pattern, text):
            entity_obj = {
                'text': match.group(),
                'label': 'SSN',
                'confidence': 0.95,
                'start_pos': match.start(),
                'end_pos': match.end(),
                'method': 'regex'
            }
            entities.append(entity_obj)
            regex_stats['SSN'] += 1
            logger.debug(f"[Regex] SSN pattern matched: '{match.group()}' at position {match.start()}")
        
        # Credit card pattern (simplified)
        cc_pattern = r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b'
        for match in re.finditer(cc_pattern, text):
            entity_obj = {
                'text': match.group(),
                'label': 'CREDIT_CARD',
                'confidence': 0.85,
                'start_pos': match.start(),
                'end_pos': match.end(),
                'method': 'regex'
            }
            entities.append(entity_obj)
            regex_stats['CREDIT_CARD'] += 1
            logger.debug(f"[Regex] CREDIT_CARD pattern matched: '{match.group()}' at position {match.start()}")
        
        # Indian date format (DD-MM-YYYY) - NEW
        indian_date_pattern = r'\b(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-(\d{4})\b'
        for match in re.finditer(indian_date_pattern, text):
            entity_obj = {
                'text': match.group(),
                'label': 'DATE',
                'confidence': 0.95,
                'start_pos': match.start(),
                'end_pos': match.end(),
                'method': 'regex'
            }
            entities.append(entity_obj)
            regex_stats['INDIAN_DATE'] += 1
            logger.debug(f"[Regex] INDIAN_DATE (DD-MM-YYYY) pattern matched: '{match.group()}' at position {match.start()}")
        
        # Student ID / College ID (0801CS221155) - NEW
        student_id_pattern = r'\b\d{4}[A-Z]{2,3}\d{6}\b'
        for match in re.finditer(student_id_pattern, text):
            entity_obj = {
                'text': match.group(),
                'label': 'STUDENT_ID',
                'confidence': 0.90,
                'start_pos': match.start(),
                'end_pos': match.end(),
                'method': 'regex'
            }
            entities.append(entity_obj)
            regex_stats['STUDENT_ID'] += 1
            logger.debug(f"[Regex] STUDENT_ID pattern matched: '{match.group()}' at position {match.start()}")
        
        # Transaction ID (long numeric sequence 15+ digits) - NEW
        transaction_pattern = r'\b\d{15,}\b'
        for match in re.finditer(transaction_pattern, text):
            entity_obj = {
                'text': match.group(),
                'label': 'TRANSACTION_ID',
                'confidence': 0.85,
                'start_pos': match.start(),
                'end_pos': match.end(),
                'method': 'regex'
            }
            entities.append(entity_obj)
            regex_stats['TRANSACTION_ID'] += 1
            logger.debug(f"[Regex] TRANSACTION_ID pattern matched: '{match.group()}' at position {match.start()}")
        
        logger.debug(f"[Regex] Pattern statistics: {regex_stats}")
        return entities
    
    def _deduplicate_by_method(self, entities: List[Dict]) -> List[Dict]:
        """Remove duplicate detections across different methods (spacy, regex, huggingface)
        
        When the same entity is detected by multiple methods, keep the one with highest confidence.
        This reduces redundancy while preserving diverse detection methods where they add value.
        """
        if not entities:
            return []
        
        # Group entities by text and position proximity
        entity_groups = {}  # Key: (text_normalized, label) -> list of entities
        
        for entity in entities:
            text_norm = entity['text'].lower().strip()
            key = (text_norm, entity['label'])
            
            if key not in entity_groups:
                entity_groups[key] = []
            
            entity_groups[key].append(entity)
        
        # For each group, keep only the highest confidence one
        deduplicated = []
        dedup_count = 0
        
        for key, group in entity_groups.items():
            if len(group) > 1:
                # Multiple methods detected same entity
                # Sort by confidence descending
                group.sort(key=lambda x: x['confidence'], reverse=True)
                best = group[0]
                
                methods_detecting = [e['method'] for e in group]
                logger.debug(f"[Dedup] Multiple detections for '{best['text']}':")
                logger.debug(f"  Label: {best['label']}")
                logger.debug(f"  Methods: {', '.join(methods_detecting)}")
                logger.debug(f"  Keeping: {best['method']} (confidence: {best['confidence']:.2f})")
                
                for other in group[1:]:
                    logger.debug(f"  Removing: {other['method']} (confidence: {other['confidence']:.2f})")
                
                dedup_count += len(group) - 1
                deduplicated.append(best)
            else:
                # Only one detection, keep it
                deduplicated.append(group[0])
        
        if dedup_count > 0:
            logger.info(f"[Dedup] Removed {dedup_count} redundant method-based detections")
        
        return deduplicated

    def _detect_with_huggingface(self, text: str, confidence_threshold: float) -> List[Dict]:
        """Detect entities using HuggingFace transformers"""
        if not self.hf_pipeline:
            return []
        
        entities = []
        below_threshold_count = 0
        try:
            results = self.hf_pipeline(text)
            logger.debug(f"[HuggingFace] Raw results from pipeline: {len(results)} predictions")
            
            for result in results:
                if result['score'] >= confidence_threshold:
                    pii_type = self._map_hf_label(result['entity_group'])
                    if pii_type:
                        entity_obj = {
                            'text': result['word'],
                            'label': pii_type,
                            'confidence': float(result['score']),  # Convert numpy float32 to Python float
                            'start_pos': int(result['start']),     # Convert to Python int
                            'end_pos': int(result['end']),         # Convert to Python int
                            'method': 'huggingface'
                        }
                        entities.append(entity_obj)
                        logger.debug(f"[HuggingFace] {pii_type:15} | Confidence: {result['score']:.4f} | Text: '{result['word']}'")
                else:
                    below_threshold_count += 1
                    logger.debug(f"[HuggingFace] Below threshold ({result['score']:.4f} < {confidence_threshold}): '{result['word']}'")
        
            logger.info(f"[HuggingFace] Processed {len(results)} predictions: {len(entities)} passed threshold, {below_threshold_count} filtered")
            
        except Exception as e:
            logger.error(f"[HuggingFace] NER failed: {e}")
        
        return entities
    
    def _map_spacy_label(self, label: str) -> Optional[str]:
        """Map spaCy entity labels to our PII types"""
        mapping = {
            'PERSON': 'PERSON',
            'ORG': 'ORGANIZATION',
            'GPE': 'LOCATION',  # Countries, cities, states
            'LOC': 'LOCATION',
            'DATE': 'DATE',
            'TIME': 'TIME',
            'MONEY': 'FINANCIAL',
            'PERCENT': 'FINANCIAL',
            'ORDINAL': 'IDENTIFIER',
            'CARDINAL': 'IDENTIFIER'
        }
        return mapping.get(label)
    
    def _map_hf_label(self, label: str) -> Optional[str]:
        """Map HuggingFace entity labels to our PII types"""
        mapping = {
            'PER': 'PERSON',
            'PERSON': 'PERSON',
            'ORG': 'ORGANIZATION',
            'LOC': 'LOCATION',
            'MISC': 'MISC'
        }
        return mapping.get(label)
    
    def _merge_overlapping_entities(self, entities: List[Dict]) -> List[Dict]:
        """Merge overlapping entities and remove duplicates (including cross-page duplicates)"""
        if not entities:
            return []
        
        # Sort by start position
        entities.sort(key=lambda x: x['start_pos'])
        
        merged = []
        seen_text = {}  # Track seen entities by text (for duplicate detection)
        merge_count = 0
        duplicate_count = 0
        
        for entity in entities:
            entity_text_lower = entity['text'].lower().strip()
            
            # Check for exact duplicate (same text, same label, within same page)
            # This catches the multi-page duplicate issue
            duplicate_key = f"{entity_text_lower}:{entity['label']}"
            
            if duplicate_key in seen_text:
                old_entity = seen_text[duplicate_key]
                logger.debug(f"[Merge] Duplicate entity detected:")
                logger.debug(f"  Text: '{entity['text']}' | Label: {entity['label']}")
                logger.debug(f"  Old position: {old_entity['start_pos']}-{old_entity['end_pos']}")
                logger.debug(f"  New position: {entity['start_pos']}-{entity['end_pos']}")
                # Keep the one with higher confidence
                if entity['confidence'] > old_entity['confidence']:
                    logger.debug(f"  Keeping new (higher confidence: {entity['confidence']:.2f} > {old_entity['confidence']:.2f})")
                    # Replace the old one
                    merged = [e for e in merged if f"{e['text'].lower().strip()}:{e['label']}" != duplicate_key]
                    merged.append(entity)
                    seen_text[duplicate_key] = entity
                else:
                    logger.debug(f"  Keeping old (higher confidence: {old_entity['confidence']:.2f} >= {entity['confidence']:.2f})")
                duplicate_count += 1
                continue
            
            # Check for overlap (positions within 5 chars - might be same entity with slight OCR variance)
            overlapped = False
            for existing in merged:
                if entity['label'] == existing['label'] and entity['text'].lower() == existing['text'].lower():
                    # Same entity text/label, positions close - merge
                    if abs(entity['start_pos'] - existing['start_pos']) <= 5:
                        logger.debug(f"[Merge] Position variance detected (same text):")
                        logger.debug(f"  '{entity['text']}' at {entity['start_pos']} vs {existing['start_pos']}")
                        overlapped = True
                        break
                elif entity['start_pos'] <= existing['end_pos'] + 2 and entity['start_pos'] >= existing['start_pos'] - 2:
                    # Overlapping positions - prioritize regex methods and higher confidence
                    should_replace = False
                    if entity['method'] == 'regex' and existing['method'] != 'regex':
                        # Prefer regex detection over other methods
                        should_replace = True
                        logger.debug(f"[Merge] Prioritizing regex detection over {existing['method']}")
                    elif entity['confidence'] > existing['confidence']:
                        should_replace = True
                        logger.debug(f"[Merge] Overlapping entities, keeping higher confidence:")
                    else:
                        logger.debug(f"[Merge] Skipping overlapping lower/equal confidence: {entity['label']} '{entity['text']}'")
                    
                    if should_replace:
                        logger.debug(f"  Removing: {existing['label']} '{existing['text']}' ({existing['method']})")
                        merged = [e for e in merged if e != existing]
                        logger.debug(f"  Adding: {entity['label']} '{entity['text']}' ({entity['method']})")
                        merged.append(entity)  # ADD THE ENTITY
                        seen_text[f"{entity['text'].lower().strip()}:{entity['label']}"] = entity
                    
                    overlapped = True
                    merge_count += 1
                    break
            
            if not overlapped:
                merged.append(entity)
                seen_text[duplicate_key] = entity
        
        logger.info(f"[Merge] Deduplicated: {duplicate_count} exact duplicates, {merge_count} overlaps removed")
        return merged