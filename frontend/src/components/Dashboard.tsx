'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileUpload } from '@/components/FileUpload'
import { RecentDocuments } from './RecentDocuments'
import { useDocuments } from '@/hooks/useDocuments'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const { refreshDocuments, documents } = useDocuments()

  const handleSignOut = () => {
    signOut()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                PII Redactor
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                Welcome, {user?.email}
              </span>
              <Button 
                variant="outline" 
                onClick={handleSignOut}
                size="sm"
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Upload Section */}
          <div className="lg:col-span-2">
            <FileUpload onUploadComplete={(fileId) => {
              console.log('File uploaded:', fileId)
              // Refresh document list after upload
              refreshDocuments()
            }} />
          </div>

          {/* Quick Stats Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Documents Processed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {documents.length}
                </div>
                <p className="text-sm text-gray-500">Total documents</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>PII Entities Found</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-red-600">
                  {documents.reduce((acc, doc) => acc + (doc.metadata?.entities?.length || 0), 0)}
                </div>
                <p className="text-sm text-gray-500">Entities detected</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Processing Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {documents.some(d => d.status === 'processing') ? 'Processing' : 'Ready'}
                </div>
                <p className="text-sm text-gray-500">System status</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Recent Documents Section */}
        <div className="mt-8">
          <RecentDocuments />
        </div>
      </main>
    </div>
  )
}