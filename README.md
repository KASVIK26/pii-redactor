# PII Redactor - Document Privacy Tool

A comprehensive web-based application for detecting and redacting personally identifiable information (PII) from PDFs and scanned images. Built with Next.js, FastAPI, and Supabase for production-grade document privacy and compliance.

## 🎯 Overview

The PII Redactor helps organizations and individuals protect sensitive information by:
- **Detecting PII** using advanced NLP models (spaCy, HuggingFace Transformers)
- **OCR Processing** for scanned documents with Tesseract
- **Smart Redaction** preserving document layout while removing sensitive data
- **Audit Logging** for compliance and tracking
- **Batch Processing** for enterprise workflows

## ✨ Features

### Core Functionality
- ✅ **Authentication & User Management** (Supabase Auth)
- ✅ **File Upload System** (Drag & drop, PDF/Images, 10MB limit)
- ✅ **Responsive Dashboard** with real-time status
- 🔄 **OCR Text Extraction** (Tesseract integration)
- 🔄 **PII Detection Engine** (spaCy + HuggingFace + Regex)
- 🔄 **Document Redaction** (PyMuPDF with layout preservation)
- 🔄 **Audit Logging** (Detailed tracking and reports)

### Advanced Features
- 🔄 **Confidence Thresholds** (Configurable detection sensitivity)
- 🔄 **PII Type Selection** (Names, emails, phones, SSN, etc.)
- 🔄 **Preview Mode** (Before/after comparison)
- 🔄 **Batch Processing** (Multiple documents)
- 🔄 **REST API** (Programmatic access)
- 🔄 **Export Capabilities** (Audit logs, compliance reports)

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   Database      │
│   (Next.js)     │◄──►│   (FastAPI)     │◄──►│   (Supabase)    │
│                 │    │                 │    │                 │
│ • React + TS    │    │ • Python        │    │ • PostgreSQL    │
│ • Tailwind CSS  │    │ • spaCy/HF      │    │ • Storage       │
│ • Shadcn UI     │    │ • Tesseract     │    │ • Auth          │
│ • Supabase Auth │    │ • PyMuPDF       │    │ • RLS Policies  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ and npm
- **Python** 3.8+ and pip
- **Tesseract OCR** installed
- **Supabase** account and project

### 1. Clone & Setup
```bash
git clone <repository-url>
cd pii-redactor
```

### 2. Database Setup
```bash
# Run the schema in your Supabase SQL editor
psql -f schema.sql
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env.local

# Configure your environment variables
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 4. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Download spaCy model
python -m spacy download en_core_web_sm

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials
```

### 5. Run Development Servers
```bash
# Terminal 1: Frontend
cd frontend
npm run dev

# Terminal 2: Backend
cd backend
uvicorn main:app --reload --port 8000
```

Visit `http://localhost:3000` to access the application.

## 📁 Project Structure

```
pii-redactor/
├── frontend/                 # Next.js Frontend
│   ├── src/
│   │   ├── app/             # App Router pages
│   │   ├── components/      # React components
│   │   │   ├── ui/         # Shadcn UI components
│   │   │   ├── auth/       # Authentication forms
│   │   │   └── ...
│   │   ├── contexts/       # React contexts
│   │   └── lib/           # Utilities and configs
│   └── package.json
│
├── backend/                 # FastAPI Backend
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── core/          # Configuration
│   │   ├── models/        # Data models
│   │   └── services/      # Business logic
│   │       ├── ocr_service.py
│   │       ├── pii_detection_service.py
│   │       └── redaction_service.py
│   ├── requirements.txt
│   └── main.py
│
└── schema.sql              # Database schema
```

## 🔧 Configuration

### Environment Variables

#### Frontend (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### Backend (.env)
```env
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=your-database-connection-string
SECRET_KEY=your-jwt-secret
TESSERACT_CMD=/path/to/tesseract  # Optional on Windows
```

### Supabase Setup
1. Create a new Supabase project
2. Run the `schema.sql` in the SQL editor
3. Configure Storage buckets (auto-created by schema)
4. Set up Authentication providers as needed

## 🧪 Testing

### Run Tests
```bash
# Backend tests
cd backend
pytest

# Frontend tests (if configured)
cd frontend
npm test
```

### Test Data
Sample documents for testing are available in `test-documents/`:
- `sample_resume.pdf` - Contains names, emails, phone numbers
- `sample_form.png` - Scanned form with various PII types

## 📊 API Documentation

When the backend is running, visit:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

### Key Endpoints
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User authentication
- `POST /api/documents/upload` - Upload documents
- `POST /api/redaction/detect` - Detect PII (preview)
- `POST /api/redaction/redact` - Process and redact

## 🚀 Deployment

### Frontend (Vercel)
```bash
cd frontend
npm run build
# Deploy to Vercel or your preferred platform
```

### Backend (Render/Heroku)
```bash
cd backend
# Create Dockerfile (included)
docker build -t pii-redactor-backend .
# Deploy to your preferred container platform
```

### Environment Setup
- Configure production environment variables
- Set up proper CORS origins
- Configure file storage limits
- Set up monitoring and logging

## 🔒 Security Considerations

- **File Validation**: Strict MIME type and size checking
- **User Isolation**: Row-level security policies
- **Data Encryption**: Files encrypted at rest in Supabase
- **Audit Trails**: Complete logging of all operations
- **Rate Limiting**: API throttling (implement as needed)

## 🛠️ Development

### Adding New PII Types
1. Update regex patterns in `pii_detection_service.py`
2. Add to enum in `redaction.py`
3. Update frontend PII type selector
4. Add test cases

### Customizing Redaction
- Modify `redaction_service.py` for different redaction styles
- Implement pseudonymization logic
- Add watermarking or custom overlays

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📋 Todo / Roadmap

- [ ] Complete OCR service implementation
- [ ] Finish PII detection engine
- [ ] Implement document redaction system
- [ ] Add batch processing capabilities
- [ ] Create comprehensive audit logging
- [ ] Build API documentation
- [ ] Add Docker configuration
- [ ] Implement CLI tool
- [ ] Add more PII detection models
- [ ] Create compliance reports

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.


## 🙏 Acknowledgments

- **spaCy** for NLP capabilities
- **Tesseract** for OCR processing
- **Supabase** for backend infrastructure
- **Next.js & React** for the frontend framework
- **FastAPI** for the backend API
