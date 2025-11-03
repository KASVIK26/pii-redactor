"""
Logging configuration for PII Redactor backend
"""
import logging
import logging.handlers
from pathlib import Path
import os
from datetime import datetime

def setup_logging(log_level=logging.INFO):
    """
    Configure logging for the application with:
    - Console handler (INFO level and above)
    - File handler with daily rotation (DEBUG level and above)
    - Specific loggers for entity detection tracking
    """
    
    # Create logs directory if it doesn't exist
    logs_dir = Path("backend/logs")
    logs_dir.mkdir(parents=True, exist_ok=True)
    
    # Create formatters
    detailed_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    console_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%H:%M:%S'
    )
    
    # Get root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    
    # Console handler (INFO and above)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(console_formatter)
    root_logger.addHandler(console_handler)
    
    # File handler with rotation (DEBUG and above)
    log_file = logs_dir / f"pii_redactor_{datetime.now().strftime('%Y%m%d')}.log"
    file_handler = logging.handlers.RotatingFileHandler(
        log_file,
        maxBytes=10_000_000,  # 10MB
        backupCount=7,  # Keep 7 backup files
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(detailed_formatter)
    root_logger.addHandler(file_handler)
    
    # Create a specific logger for entity detection
    entity_logger = logging.getLogger("entity_detection")
    entity_logger.setLevel(logging.DEBUG)
    
    # Entity detection file handler
    entity_log_file = logs_dir / f"entity_detection_{datetime.now().strftime('%Y%m%d')}.log"
    entity_file_handler = logging.handlers.RotatingFileHandler(
        entity_log_file,
        maxBytes=10_000_000,  # 10MB
        backupCount=7,
        encoding='utf-8'
    )
    entity_file_handler.setLevel(logging.DEBUG)
    entity_file_handler.setFormatter(detailed_formatter)
    
    # Suppress duplicate logs
    if not any(isinstance(h, logging.handlers.RotatingFileHandler) and h.baseFilename == str(entity_log_file) 
               for h in entity_logger.handlers):
        entity_logger.addHandler(entity_file_handler)
    
    return root_logger, entity_logger


# Set up logging on module import
if not logging.getLogger().handlers:
    setup_logging()
