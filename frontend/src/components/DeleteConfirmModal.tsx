'use client'

import { Button } from '@/components/ui/button'
import { AlertCircle, Trash2 } from 'lucide-react'

interface DeleteConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  filename: string
  isLoading: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteConfirmModal({
  isOpen,
  title,
  message,
  filename,
  isLoading,
  onConfirm,
  onCancel,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null

  console.log('[DeleteConfirmModal] Rendering with:', { isOpen, filename, isLoading })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md mx-4 border border-gray-200">
        {/* Header with gradient accent */}
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-red-50 to-red-100 rounded-lg flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-1">Permanent action</p>
          </div>
        </div>

        {/* Message */}
        <div className="mb-6 space-y-3">
          <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
          
          {/* Filename highlight box */}
          <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Document to delete</p>
            <p className="text-sm font-semibold text-gray-900 truncate" title={filename}>
              {filename}
            </p>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">This action cannot be undone</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
          <Button
            variant="outline"
            onClick={() => {
              console.log('[DeleteConfirmModal] Cancel clicked')
              onCancel()
            }}
            disabled={isLoading}
            className="px-6 py-2 text-gray-700 border-gray-300 hover:bg-gray-50"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              console.log('[DeleteConfirmModal] Confirm clicked, isLoading:', isLoading)
              onConfirm()
            }}
            disabled={isLoading}
            className="px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-medium shadow-lg hover:shadow-xl transition-all"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Deleting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                Delete Document
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
