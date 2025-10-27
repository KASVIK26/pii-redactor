'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from './ui/alert'
import { 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Loader, 
  Download, 
  Upload, 
  Eye, 
  Shield, 
  FileText,
  XCircle 
} from 'lucide-react'

interface ProcessingStage {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

interface DocumentProcessingStatusProps {
  document: {
    id: string
    filename: string
    status: string
    metadata?: {
      stage?: string
      error?: string
      entities_found?: number
      text_length?: number
      file_size_downloaded?: number
      redacted_file_size?: number
    }
  }
}

const getStageStatus = (currentStage: string | undefined, targetStage: string, documentStatus: string): 'pending' | 'processing' | 'completed' | 'failed' => {
  if (documentStatus === 'failed') {
    // If document failed, mark stages as failed up to the current stage
    const stageOrder = ['download_complete', 'ocr_complete', 'pii_detection_complete', 'redaction_complete', 'completed']
    const currentIndex = stageOrder.indexOf(currentStage || '')
    const targetIndex = stageOrder.indexOf(targetStage)
    
    if (targetIndex <= currentIndex) {
      return 'failed'
    }
    return 'pending'
  }
  
  if (!currentStage) {
    return targetStage === 'download_complete' ? 'processing' : 'pending'
  }
  
  const stageOrder = ['download_complete', 'ocr_complete', 'pii_detection_complete', 'redaction_complete', 'completed']
  const currentIndex = stageOrder.indexOf(currentStage)
  const targetIndex = stageOrder.indexOf(targetStage)
  
  if (targetIndex < currentIndex) return 'completed'
  if (targetIndex === currentIndex) {
    return currentStage.includes('starting') ? 'processing' : 'completed'
  }
  if (targetIndex === currentIndex + 1 && currentStage.includes('starting')) {
    return 'processing'
  }
  
  return 'pending'
}

const getProgressPercentage = (stage: string | undefined, status: string): number => {
  if (status === 'failed') return 0
  if (status === 'processed') return 100
  
  const stageProgress: Record<string, number> = {
    'download_complete': 20,
    'ocr_starting': 25,
    'ocr_complete': 40,
    'pii_detection_starting': 45,
    'pii_detection_complete': 65,
    'redaction_starting': 70,
    'redaction_complete': 85,
    'upload_starting': 90,
    'completed': 100
  }
  
  return stageProgress[stage || 'download_complete'] || 10
}

export function DocumentProcessingStatus({ document }: DocumentProcessingStatusProps) {
  const [stages, setStages] = useState<ProcessingStage[]>([])
  
  useEffect(() => {
    const currentStage = document.metadata?.stage
    const documentStatus = document.status
    
    const processingStages: ProcessingStage[] = [
      {
        id: 'download',
        title: 'File Download',
        description: 'Downloading file from storage',
        icon: <Download className="h-4 w-4" />,
        status: getStageStatus(currentStage, 'download_complete', documentStatus)
      },
      {
        id: 'ocr',
        title: 'Text Extraction (OCR)',
        description: 'Extracting text from document',
        icon: <FileText className="h-4 w-4" />,
        status: getStageStatus(currentStage, 'ocr_complete', documentStatus)
      },
      {
        id: 'pii_detection',
        title: 'PII Detection',
        description: 'Scanning for personal information',
        icon: <Eye className="h-4 w-4" />,
        status: getStageStatus(currentStage, 'pii_detection_complete', documentStatus)
      },
      {
        id: 'redaction',
        title: 'Document Redaction',
        description: 'Removing sensitive information',
        icon: <Shield className="h-4 w-4" />,
        status: getStageStatus(currentStage, 'redaction_complete', documentStatus)
      },
      {
        id: 'upload',
        title: 'Final Upload',
        description: 'Saving redacted document',
        icon: <Upload className="h-4 w-4" />,
        status: getStageStatus(currentStage, 'completed', documentStatus)
      }
    ]
    
    setStages(processingStages)
  }, [document.metadata?.stage, document.status])
  
  const getStatusIcon = (status: 'pending' | 'processing' | 'completed' | 'failed') => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'processing':
        return <Loader className="h-5 w-5 text-blue-500 animate-spin" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <Clock className="h-5 w-5 text-gray-400" />
    }
  }
  
  const getStatusColor = (status: 'pending' | 'processing' | 'completed' | 'failed') => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }
  
  // Don't show processing status for completed documents unless they're very recent
  if (document.status === 'processed') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-6 w-6 text-green-500" />
            <div>
              <p className="font-medium text-green-800">Processing Complete</p>
              <p className="text-sm text-green-600">
                Found {document.metadata?.entities_found || 0} PII entities • 
                Extracted {document.metadata?.text_length || 0} characters
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Loader className="h-5 w-5 animate-spin" />
          <span>Processing {document.filename}</span>
        </CardTitle>
        <div className="mt-2">
          <Progress value={getProgressPercentage(document.metadata?.stage, document.status)} className="w-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error Alert */}
        {document.status === 'failed' && document.metadata?.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Processing Failed:</strong> {document.metadata.error}
              <br />
              <span className="text-sm">Stage: {document.metadata.stage}</span>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Processing Stages */}
        <div className="space-y-3">
          {stages.map((stage, index) => (
            <div 
              key={stage.id}
              className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${getStatusColor(stage.status)}`}
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className="flex-shrink-0">
                  {getStatusIcon(stage.status)}
                </div>
                <div className="flex items-center space-x-2">
                  {stage.icon}
                  <div>
                    <p className="font-medium text-sm">{stage.title}</p>
                    <p className="text-xs opacity-75">{stage.description}</p>
                  </div>
                </div>
              </div>
              
              <Badge variant="outline" className="text-xs">
                {stage.status === 'processing' ? 'Running...' : 
                 stage.status === 'completed' ? 'Done' :
                 stage.status === 'failed' ? 'Failed' : 'Waiting'}
              </Badge>
            </div>
          ))}
        </div>
        
        {/* Processing Stats */}
        {document.metadata && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">Processing Details</p>
            <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
              {document.metadata.file_size_downloaded && (
                <div>
                  <span className="font-medium">Downloaded:</span> {Math.round(document.metadata.file_size_downloaded / 1024)} KB
                </div>
              )}
              {document.metadata.text_length && (
                <div>
                  <span className="font-medium">Text Extracted:</span> {document.metadata.text_length.toLocaleString()} chars
                </div>
              )}
              {document.metadata.entities_found !== undefined && (
                <div>
                  <span className="font-medium">PII Found:</span> {document.metadata.entities_found} entities
                </div>
              )}
              {document.metadata.redacted_file_size && (
                <div>
                  <span className="font-medium">Redacted File:</span> {Math.round(document.metadata.redacted_file_size / 1024)} KB
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}