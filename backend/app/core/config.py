from pydantic_settings import BaseSettings
from typing import List, Optional
import os
from dotenv import load_dotenv

# Load environment variables from .env.local and .env files
load_dotenv(".env.local")
load_dotenv(".env")

class Settings(BaseSettings):
    # Basic settings
    PROJECT_NAME: str = "PII Redactor"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    
    # CORS
    ALLOWED_HOSTS: List[str] = [
        "http://localhost:3000",
        "http://localhost:8000",
        "https://your-frontend-domain.com"
    ]
    
    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    
    # File upload
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    UPLOAD_FOLDER: str = "uploads"
    OUTPUT_FOLDER: str = "outputs"
    
    # PII Detection
    DEFAULT_CONFIDENCE_THRESHOLD: float = 0.85
    SPACY_MODEL: str = "en_core_web_sm"
    
    # Tesseract OCR
    TESSERACT_CMD: Optional[str] = os.getenv("TESSERACT_CMD")
    
    # Redis (for Celery)
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    class Config:
        env_file = [".env.local", ".env"]
        env_file_encoding = "utf-8"
        extra = "ignore"  # Allow extra fields to be ignored

settings = Settings()
settings = Settings()