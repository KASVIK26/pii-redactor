'use client'

import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  onRetry?: () => void
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: any
}

class PdfErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('PDF Error Boundary caught an error:', error, errorInfo)
    this.setState({ error, errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            PDF Display Error
          </h3>
          <p className="text-gray-600 text-center mb-4 max-w-md">
            There was an issue loading the PDF viewer. This might be due to browser compatibility or network issues.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                this.setState({ hasError: false, error: undefined, errorInfo: undefined })
                this.props.onRetry?.()
              }}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </Button>
          </div>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-4 p-4 bg-red-50 border border-red-200 rounded max-w-2xl">
              <summary className="cursor-pointer text-red-700 font-medium">
                Error Details (Development)
              </summary>
              <pre className="mt-2 text-sm text-red-600 whitespace-pre-wrap">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}

export default PdfErrorBoundary