from datetime import datetime
from typing import Dict, List, Optional, Any
import json
import logging
from enum import Enum
from dataclasses import dataclass, asdict
from supabase import create_client, Client
from app.core.config import settings

logger = logging.getLogger(__name__)

class AuditAction(str, Enum):
    """Enumeration of audit actions"""
    DOCUMENT_UPLOAD = "document_upload"
    DOCUMENT_DELETE = "document_delete"
    PII_DETECTION = "pii_detection"
    DOCUMENT_REDACTION = "document_redaction"
    PREVIEW_GENERATION = "preview_generation"
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    USER_REGISTRATION = "user_registration"
    SETTINGS_UPDATE = "settings_update"
    API_KEY_CREATION = "api_key_creation"
    API_KEY_DELETION = "api_key_deletion"
    EXPORT_AUDIT_LOG = "export_audit_log"

class ResourceType(str, Enum):
    """Enumeration of resource types"""
    DOCUMENT = "document"
    REDACTION_JOB = "redaction_job"
    USER = "user"
    API_KEY = "api_key"
    AUDIT_LOG = "audit_log"

@dataclass
class AuditLogEntry:
    """Data class for audit log entries"""
    user_id: str
    action: AuditAction
    resource_type: ResourceType
    resource_id: Optional[str] = None
    document_id: Optional[str] = None
    job_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    session_id: Optional[str] = None
    timestamp: Optional[datetime] = None

class AuditLogger:
    """Service for logging audit events and generating compliance reports"""
    
    def __init__(self):
        self.supabase_client = create_client(
            settings.SUPABASE_URL, 
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
    
    async def log_event(
        self,
        user_id: str,
        action: AuditAction,
        resource_type: ResourceType,
        resource_id: Optional[str] = None,
        document_id: Optional[str] = None,
        job_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> str:
        """
        Log an audit event
        
        Returns:
            The ID of the created audit log entry
        """
        try:
            audit_entry = AuditLogEntry(
                user_id=user_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                document_id=document_id,
                job_id=job_id,
                details=details or {},
                ip_address=ip_address,
                user_agent=user_agent,
                session_id=session_id,
                timestamp=datetime.utcnow()
            )
            
            # Insert into database
            response = self.supabase_client.table('audit_logs').insert({
                'user_id': audit_entry.user_id,
                'action': audit_entry.action.value,
                'resource_type': audit_entry.resource_type.value,
                'resource_id': audit_entry.resource_id,
                'document_id': audit_entry.document_id,
                'job_id': audit_entry.job_id,
                'details': audit_entry.details,
                'ip_address': audit_entry.ip_address,
                'user_agent': audit_entry.user_agent,
                'session_id': audit_entry.session_id
            }).execute()
            
            if response.data:
                audit_id = response.data[0]['id']
                logger.info(f"Audit event logged: {action.value} for user {user_id} (ID: {audit_id})")
                return audit_id
            else:
                logger.error(f"Failed to log audit event: {action.value} for user {user_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error logging audit event: {str(e)}")
            return None
    
    async def log_document_upload(
        self,
        user_id: str,
        document_id: str,
        filename: str,
        file_size: int,
        file_type: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> str:
        """Log document upload event"""
        return await self.log_event(
            user_id=user_id,
            action=AuditAction.DOCUMENT_UPLOAD,
            resource_type=ResourceType.DOCUMENT,
            resource_id=document_id,
            document_id=document_id,
            details={
                'filename': filename,
                'file_size': file_size,
                'file_type': file_type
            },
            ip_address=ip_address,
            user_agent=user_agent
        )
    
    async def log_pii_detection(
        self,
        user_id: str,
        document_id: str,
        job_id: str,
        entities_detected: List[Dict],
        confidence_threshold: float,
        pii_types: List[str],
        detection_time_seconds: float,
        ip_address: Optional[str] = None
    ) -> str:
        """Log PII detection event"""
        return await self.log_event(
            user_id=user_id,
            action=AuditAction.PII_DETECTION,
            resource_type=ResourceType.REDACTION_JOB,
            resource_id=job_id,
            document_id=document_id,
            job_id=job_id,
            details={
                'entities_count': len(entities_detected),
                'entities_by_type': self._count_entities_by_type(entities_detected),
                'confidence_threshold': confidence_threshold,
                'pii_types_searched': pii_types,
                'detection_time_seconds': detection_time_seconds,
                'entities_summary': [
                    {
                        'type': e.get('label'),
                        'confidence': e.get('confidence'),
                        'text_length': len(e.get('text', ''))
                    } for e in entities_detected[:10]  # First 10 entities
                ]
            },
            ip_address=ip_address
        )
    
    async def log_document_redaction(
        self,
        user_id: str,
        document_id: str,
        job_id: str,
        entities_redacted: int,
        redaction_style: str,
        processing_time_seconds: float,
        output_file_size: int,
        ip_address: Optional[str] = None
    ) -> str:
        """Log document redaction event"""
        return await self.log_event(
            user_id=user_id,
            action=AuditAction.DOCUMENT_REDACTION,
            resource_type=ResourceType.REDACTION_JOB,
            resource_id=job_id,
            document_id=document_id,
            job_id=job_id,
            details={
                'entities_redacted': entities_redacted,
                'redaction_style': redaction_style,
                'processing_time_seconds': processing_time_seconds,
                'output_file_size': output_file_size
            },
            ip_address=ip_address
        )
    
    async def get_user_audit_logs(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        actions: Optional[List[AuditAction]] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """Get audit logs for a specific user"""
        try:
            query = self.supabase_client.table('audit_logs').select('*').eq('user_id', user_id)
            
            if start_date:
                query = query.gte('created_at', start_date.isoformat())
            if end_date:
                query = query.lte('created_at', end_date.isoformat())
            if actions:
                action_values = [action.value for action in actions]
                query = query.in_('action', action_values)
            
            query = query.order('created_at', desc=True).range(offset, offset + limit - 1)
            
            response = query.execute()
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching audit logs for user {user_id}: {str(e)}")
            return []
    
    async def get_document_audit_trail(self, document_id: str, user_id: str) -> List[Dict]:
        """Get complete audit trail for a specific document"""
        try:
            response = self.supabase_client.table('audit_logs').select('*').eq('document_id', document_id).eq('user_id', user_id).order('created_at', desc=False).execute()
            
            return response.data if response.data else []
            
        except Exception as e:
            logger.error(f"Error fetching audit trail for document {document_id}: {str(e)}")
            return []
    
    async def generate_compliance_report(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime,
        report_format: str = 'json'
    ) -> Dict[str, Any]:
        """Generate a compliance report for a date range"""
        try:
            logs = await self.get_user_audit_logs(
                user_id=user_id,
                start_date=start_date,
                end_date=end_date,
                limit=10000  # Large limit for reports
            )
            
            # Generate statistics
            report = {
                'report_metadata': {
                    'user_id': user_id,
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'generated_at': datetime.utcnow().isoformat(),
                    'total_events': len(logs)
                },
                'summary': {
                    'documents_uploaded': 0,
                    'documents_processed': 0,
                    'total_pii_detected': 0,
                    'total_pii_redacted': 0,
                    'unique_documents': set(),
                    'actions_by_type': {},
                    'processing_time_total': 0
                },
                'events': logs if report_format == 'detailed' else []
            }
            
            # Calculate summary statistics
            for log in logs:
                action = log['action']
                report['summary']['actions_by_type'][action] = report['summary']['actions_by_type'].get(action, 0) + 1
                
                if action == AuditAction.DOCUMENT_UPLOAD.value:
                    report['summary']['documents_uploaded'] += 1
                    report['summary']['unique_documents'].add(log['document_id'])
                
                elif action == AuditAction.PII_DETECTION.value:
                    details = log.get('details', {})
                    report['summary']['total_pii_detected'] += details.get('entities_count', 0)
                    report['summary']['processing_time_total'] += details.get('detection_time_seconds', 0)
                
                elif action == AuditAction.DOCUMENT_REDACTION.value:
                    details = log.get('details', {})
                    report['summary']['total_pii_redacted'] += details.get('entities_redacted', 0)
                    report['summary']['processing_time_total'] += details.get('processing_time_seconds', 0)
                    report['summary']['documents_processed'] += 1
            
            # Convert set to count
            report['summary']['unique_documents_count'] = len(report['summary']['unique_documents'])
            del report['summary']['unique_documents']
            
            return report
            
        except Exception as e:
            logger.error(f"Error generating compliance report for user {user_id}: {str(e)}")
            return {'error': str(e)}
    
    async def export_audit_logs(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        format: str = 'csv'
    ) -> str:
        """Export audit logs in specified format"""
        try:
            logs = await self.get_user_audit_logs(
                user_id=user_id,
                start_date=start_date,
                end_date=end_date,
                limit=50000  # Large limit for exports
            )
            
            # Log the export action
            await self.log_event(
                user_id=user_id,
                action=AuditAction.EXPORT_AUDIT_LOG,
                resource_type=ResourceType.AUDIT_LOG,
                details={
                    'export_format': format,
                    'records_exported': len(logs),
                    'start_date': start_date.isoformat() if start_date else None,
                    'end_date': end_date.isoformat() if end_date else None
                }
            )
            
            if format == 'csv':
                return self._export_to_csv(logs)
            elif format == 'json':
                return json.dumps(logs, indent=2, default=str)
            else:
                raise ValueError(f"Unsupported export format: {format}")
                
        except Exception as e:
            logger.error(f"Error exporting audit logs for user {user_id}: {str(e)}")
            raise
    
    def _count_entities_by_type(self, entities: List[Dict]) -> Dict[str, int]:
        """Count entities by their type"""
        counts = {}
        for entity in entities:
            entity_type = entity.get('label', 'unknown')
            counts[entity_type] = counts.get(entity_type, 0) + 1
        return counts
    
    def _export_to_csv(self, logs: List[Dict]) -> str:
        """Convert logs to CSV format"""
        import csv
        import io
        
        if not logs:
            return ""
        
        output = io.StringIO()
        fieldnames = logs[0].keys()
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        
        writer.writeheader()
        for log in logs:
            # Flatten details for CSV
            row = log.copy()
            if 'details' in row and isinstance(row['details'], dict):
                row['details'] = json.dumps(row['details'])
            writer.writerow(row)
        
        return output.getvalue()

# Global audit logger instance
audit_logger = AuditLogger()