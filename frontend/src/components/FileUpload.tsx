'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface UploadedFile {
  id: string
  file: File
  status: 'uploading' | 'uploaded' | 'error'
  progress: number
  error?: string
}

interface FileUploadProps {
  onUploadComplete?: (fileId: string, filename: string, fileSize: number, fileType: string) => void
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const { user } = useAuth()
  const [files, setFiles] = useState<UploadedFile[]>([])


  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!user) return;

    const newFiles: UploadedFile[] = acceptedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'uploading',
      progress: 0
    }));

    setFiles(prev => [...prev, ...newFiles]);

    for (const uploadFile of newFiles) {
      try {
        await uploadFileToBackend(uploadFile);
      } catch (error) {
        setFiles(prev => prev.map(f =>
          f.id === uploadFile.id
            ? { ...f, status: 'error', error: 'Upload failed' }
            : f
        ));
      }
    }
  }, [user]);


  // New: Upload file to FastAPI backend
  const uploadFileToBackend = async (uploadFile: UploadedFile) => {
    if (!user) return;

    try {
      setFiles(prev => prev.map(f =>
        f.id === uploadFile.id ? { ...f, progress: 25 } : f
      ));

      // Get Supabase access token for auth
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error('Authentication required');
      }

      const formData = new FormData();
      formData.append('file', uploadFile.file);

      const response = await fetch('http://localhost:8000/api/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body: formData,
      });

      setFiles(prev => prev.map(f =>
        f.id === uploadFile.id ? { ...f, progress: 75 } : f
      ));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed: ${response.status}`);
      }

      const data = await response.json();

      setFiles(prev => prev.map(f =>
        f.id === uploadFile.id ? { ...f, status: 'uploaded', progress: 100 } : f
      ));

      if (onUploadComplete && data.document_id) {
        const fileType = uploadFile.file.type.split('/').pop() || 'unknown'
        onUploadComplete(
          data.document_id, 
          uploadFile.file.name, 
          uploadFile.file.size,
          fileType
        );
      }
    } catch (error) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f =>
        f.id === uploadFile.id
          ? { ...f, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
          : f
      ));
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5
  })

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Upload Documents</CardTitle>
        <CardDescription>
          Upload PDF files or images (PNG, JPG) to detect and redact PII
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive 
              ? 'border-primary bg-primary/5' 
              : 'border-gray-300 hover:border-primary/50'
          }`}
        >
          <input {...getInputProps()} />
          <div className="space-y-4">
            <div className="text-4xl">
              {isDragActive ? '📥' : '📄'}
            </div>
            <div>
              <p className="text-lg font-medium text-gray-900">
                {isDragActive 
                  ? 'Drop files here...' 
                  : 'Drag and drop your files here'
                }
              </p>
              <p className="text-sm text-gray-500">
                or click to browse (PDF, PNG, JPG - max 10MB each)
              </p>
            </div>
            {!isDragActive && (
              <Button type="button">
                Choose Files
              </Button>
            )}
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Uploading Files</h4>
            {files.map((uploadFile) => (
              <div key={uploadFile.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {uploadFile.file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(uploadFile.file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      uploadFile.status === 'uploaded' 
                        ? 'bg-green-100 text-green-800'
                        : uploadFile.status === 'error'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {uploadFile.status === 'uploaded' && '✓ Uploaded'}
                      {uploadFile.status === 'uploading' && 'Uploading...'}
                      {uploadFile.status === 'error' && '✗ Error'}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(uploadFile.id)}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
                
                {uploadFile.status === 'uploading' && (
                  <Progress value={uploadFile.progress} className="h-2" />
                )}
                
                {uploadFile.status === 'error' && uploadFile.error && (
                  <p className="text-xs text-red-600 mt-1">
                    {uploadFile.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}