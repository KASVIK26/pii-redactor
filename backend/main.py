from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import documents, auth, redaction, entities
from app.core.config import settings

app = FastAPI(
    title="PII Redactor API",
    description="API for redacting personally identifiable information from documents",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_HOSTS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(redaction.router, prefix="/api/redaction", tags=["redaction"])
app.include_router(entities.router, tags=["entities"])

@app.get("/")
async def root():
    return {"message": "PII Redactor API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}