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
        
        # Regex-based detection
        regex_entities = self._detect_with_regex(text)
        entities.extend(regex_entities)
        
        # HuggingFace NER (if available)
        if self.hf_pipeline:
            hf_entities = self._detect_with_huggingface(text, confidence_threshold)
            entities.extend(hf_entities)
        
        # Remove duplicates and merge overlapping entities
        entities = self._merge_overlapping_entities(entities)
        
        # Add unique IDs to each entity
        for entity in entities:
            if 'id' not in entity:
                entity['id'] = str(uuid.uuid4())
        
        return entities
    
    def _detect_with_spacy(self, text: str, confidence_threshold: float) -> List[Dict]:
        """Detect entities using spaCy NER"""
        entities = []
        doc = self.nlp(text)
        
        for ent in doc.ents:
            # Map spaCy labels to our PII types
            pii_type = self._map_spacy_label(ent.label_)
            if pii_type:
                entities.append({
                    'text': ent.text,
                    'label': pii_type,
                    'confidence': 0.9,  # spaCy doesn't provide confidence scores
                    'start_pos': ent.start_char,
                    'end_pos': ent.end_char,
                    'method': 'spacy'
                })
        
        return entities
    
    def _detect_with_regex(self, text: str) -> List[Dict]:
        """Detect PII using regex patterns"""
        entities = []
        
        # Email pattern
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        for match in re.finditer(email_pattern, text):
            entities.append({
                'text': match.group(),
                'label': 'EMAIL',
                'confidence': 0.95,
                'start_pos': match.start(),
                'end_pos': match.end(),
                'method': 'regex'
            })
        
        # Phone number patterns
        phone_patterns = [
            r'\b\d{3}-\d{3}-\d{4}\b',  # 123-456-7890
            r'\b\(\d{3}\)\s*\d{3}-\d{4}\b',  # (123) 456-7890
            r'\b\d{3}\.\d{3}\.\d{4}\b',  # 123.456.7890
            r'\b\+1\s*\d{3}\s*\d{3}\s*\d{4}\b',  # +1 123 456 7890
        ]
        
        for pattern in phone_patterns:
            for match in re.finditer(pattern, text):
                entities.append({
                    'text': match.group(),
                    'label': 'PHONE_NUMBER',
                    'confidence': 0.9,
                    'start_pos': match.start(),
                    'end_pos': match.end(),
                    'method': 'regex'
                })
        
        # SSN pattern
        ssn_pattern = r'\b\d{3}-\d{2}-\d{4}\b'
        for match in re.finditer(ssn_pattern, text):
            entities.append({
                'text': match.group(),
                'label': 'SSN',
                'confidence': 0.95,
                'start_pos': match.start(),
                'end_pos': match.end(),
                'method': 'regex'
            })
        
        # Credit card pattern (simplified)
        cc_pattern = r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b'
        for match in re.finditer(cc_pattern, text):
            entities.append({
                'text': match.group(),
                'label': 'CREDIT_CARD',
                'confidence': 0.85,
                'start_pos': match.start(),
                'end_pos': match.end(),
                'method': 'regex'
            })
        
        return entities
    
    def _detect_with_huggingface(self, text: str, confidence_threshold: float) -> List[Dict]:
        """Detect entities using HuggingFace transformers"""
        if not self.hf_pipeline:
            return []
        
        entities = []
        try:
            results = self.hf_pipeline(text)
            
            for result in results:
                if result['score'] >= confidence_threshold:
                    pii_type = self._map_hf_label(result['entity_group'])
                    if pii_type:
                        entities.append({
                            'text': result['word'],
                            'label': pii_type,
                            'confidence': float(result['score']),  # Convert numpy float32 to Python float
                            'start_pos': int(result['start']),     # Convert to Python int
                            'end_pos': int(result['end']),         # Convert to Python int
                            'method': 'huggingface'
                        })
        except Exception as e:
            logger.error(f"HuggingFace NER failed: {e}")
        
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
        """Merge overlapping entities and remove duplicates"""
        if not entities:
            return []
        
        # Sort by start position
        entities.sort(key=lambda x: x['start_pos'])
        
        merged = []
        current = entities[0]
        
        for entity in entities[1:]:
            # Check for overlap
            if entity['start_pos'] <= current['end_pos']:
                # Merge entities - keep the one with higher confidence
                if entity['confidence'] > current['confidence']:
                    current = entity
            else:
                merged.append(current)
                current = entity
        
        merged.append(current)
        return merged