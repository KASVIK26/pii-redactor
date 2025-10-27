# PII Redactor - Production Deployment Guide

This guide covers deploying the PII Redactor application to production environments.

## 🚀 Deployment Options

### Option 1: Docker Compose (Recommended for Self-Hosting)

#### Prerequisites
- Docker and Docker Compose installed
- Supabase project configured
- Domain name (optional)

#### Steps

1. **Clone and Configure**
   ```bash
   git clone <repository-url>
   cd pii-redactor
   cp .env.example .env
   ```

2. **Environment Setup**
   Edit `.env` with your production values:
   ```env
   # Supabase (Production)
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   
   # Database
   DATABASE_URL=postgresql://postgres:[password]@db.your-project-ref.supabase.co:5432/postgres
   
   # Security
   SECRET_KEY=your-secure-32-character-secret-key
   
   # Frontend
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Deploy**
   ```bash
   docker-compose up -d
   ```

4. **Verify Deployment**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Option 2: Vercel + Render/Railway (Serverless + Container)

#### Frontend (Vercel)

1. **Connect Repository**
   - Import project to Vercel
   - Connect your Git repository

2. **Environment Variables**
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_API_URL=https://your-backend-domain.com
   ```

3. **Deploy**
   - Vercel will automatically deploy on git push

#### Backend (Render/Railway/Heroku)

1. **Render Deployment**
   ```yaml
   # render.yaml
   services:
     - type: web
       name: pii-redactor-backend
       env: docker
       plan: starter
       dockerfilePath: ./backend/Dockerfile
       envVars:
         - key: SUPABASE_URL
           value: your-supabase-url
         - key: SUPABASE_SERVICE_ROLE_KEY
           value: your-service-role-key
         - key: SECRET_KEY
           generateValue: true
   ```

2. **Connect Repository**
   - Link Git repository to Render
   - Configure environment variables
   - Deploy

### Option 3: AWS/GCP/Azure (Cloud Native)

#### Architecture
```
Internet → CloudFront/CDN → 
├── S3/Static Hosting (Frontend)
└── ECS/Cloud Run (Backend) → RDS/Cloud SQL (Database)
```

#### Frontend (S3 + CloudFront)
```bash
# Build and upload
cd frontend
npm run build
aws s3 sync out/ s3://your-bucket-name
```

#### Backend (ECS/Cloud Run)
```dockerfile
# Use multi-stage build for optimization
FROM python:3.9-slim as production
# ... (same as existing Dockerfile)
```

## 🔒 Security Configuration

### 1. Environment Variables
Never commit sensitive data:
```bash
# Use secret management
export SUPABASE_SERVICE_ROLE_KEY=$(vault kv get -field=key secret/pii-redactor)
```

### 2. CORS Configuration
Update allowed origins in production:
```python
# backend/app/core/config.py
ALLOWED_HOSTS = [
    "https://your-domain.com",
    "https://www.your-domain.com"
]
```

### 3. Rate Limiting
Implement rate limiting for production:
```python
# Add to main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

### 4. HTTPS/TLS
- Use SSL certificates (Let's Encrypt recommended)
- Configure HSTS headers
- Implement CSRF protection

## 📊 Monitoring & Logging

### 1. Application Monitoring
```python
# Add to backend
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

sentry_sdk.init(
    dsn="your-sentry-dsn",
    integrations=[FastApiIntegration()],
    traces_sample_rate=1.0,
)
```

### 2. Health Checks
```python
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow(),
        "version": "1.0.0"
    }
```

### 3. Logging Configuration
```python
import logging
import structlog

logging.basicConfig(
    format="%(message)s",
    stream=sys.stdout,
    level=logging.INFO,
)

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)
```

## 🔧 Performance Optimization

### 1. Database Optimization
```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_documents_user_status 
ON documents(user_id, status);

CREATE INDEX CONCURRENTLY idx_audit_logs_user_date 
ON audit_logs(user_id, created_at DESC);
```

### 2. Caching Strategy
```python
# Redis caching for processed documents
import redis
import pickle

redis_client = redis.Redis(host='localhost', port=6379, db=0)

def cache_detection_result(document_id: str, result: dict):
    redis_client.setex(
        f"pii_detection:{document_id}", 
        3600,  # 1 hour
        pickle.dumps(result)
    )
```

### 3. File Storage Optimization
- Use CDN for file delivery
- Implement file compression
- Set up automatic cleanup for temporary files

## 🧪 Production Testing

### 1. Load Testing
```bash
# Using Artillery
npm install -g artillery
artillery quick --count 10 --num 5 http://localhost:8000/health
```

### 2. Security Testing
```bash
# Using OWASP ZAP or similar
docker run -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:3000
```

### 3. End-to-End Testing
```typescript
// Using Playwright
test('complete redaction workflow', async ({ page }) => {
  await page.goto('/');
  await page.fill('[data-testid=email]', 'test@example.com');
  // ... complete workflow test
});
```

## 🔄 Backup & Recovery

### 1. Database Backups
```bash
# Automated Supabase backups are included
# Additional custom backup script:
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. File Storage Backups
```bash
# S3 cross-region replication
aws s3api put-bucket-replication \
  --bucket your-bucket \
  --replication-configuration file://replication.json
```

## 📈 Scaling Considerations

### 1. Horizontal Scaling
- Use load balancers (ALB, NGINX)
- Implement container orchestration (Kubernetes)
- Database read replicas

### 2. Vertical Scaling
- Monitor CPU/Memory usage
- Optimize resource allocation
- Use auto-scaling groups

### 3. Service Isolation
- Separate OCR processing to dedicated workers
- Use message queues for background tasks
- Implement circuit breakers

## 🚨 Disaster Recovery

### 1. Backup Strategy
- Daily database backups
- Weekly full system backups
- Cross-region replication

### 2. Recovery Procedures
1. Database restoration from backup
2. File storage restoration
3. Application deployment verification
4. Data integrity checks

### 3. Monitoring & Alerts
```yaml
# Example alerting rules
alerts:
  - name: High Error Rate
    condition: error_rate > 5%
    notification: slack, email
  
  - name: Database Connection Issues
    condition: db_connections < 1
    notification: pagerduty
```

## 📞 Support & Maintenance

### 1. Monitoring Dashboard
- Set up Grafana/DataDog dashboards
- Monitor key metrics:
  - Request response times
  - Error rates
  - Document processing times
  - User activity

### 2. Maintenance Windows
- Schedule regular updates
- Plan for security patches
- Database maintenance

### 3. Documentation
- Keep deployment docs updated
- Document troubleshooting procedures
- Maintain runbooks for common issues

## 🔐 Compliance & Governance

### 1. Data Retention
```python
# Implement automatic cleanup
async def cleanup_old_documents():
    cutoff_date = datetime.utcnow() - timedelta(days=90)
    await delete_documents_older_than(cutoff_date)
```

### 2. Audit Requirements
- Enable comprehensive logging
- Set up log retention policies
- Implement audit report generation

### 3. Access Control
- Implement role-based access
- Regular access reviews
- Multi-factor authentication

---

This deployment guide ensures your PII Redactor application is production-ready with proper security, monitoring, and scalability considerations.