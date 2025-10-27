// PDF.js setup with proper worker configuration
import { pdfjs } from 'react-pdf'

// Configure PDF.js worker only once
let isWorkerConfigured = false
let workerAttempts = 0
const maxWorkerAttempts = 3

const workerUrls = [
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`,
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`,
  `https://mozilla.github.io/pdf.js/build/pdf.worker.js`,
  // Local fallback - might not work in all environments
  `/pdf.worker.min.js`
]

export const setupPdfWorker = () => {
  if (typeof window !== 'undefined' && !isWorkerConfigured) {
    try {
      const workerUrl = workerUrls[workerAttempts] || workerUrls[0]
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      isWorkerConfigured = true
      console.log(`PDF.js worker configured with: ${workerUrl}`)
    } catch (error) {
      console.error('Initial PDF worker setup failed:', error)
    }
  }
}

// Alternative setup if the first one fails
export const setupPdfWorkerFallback = () => {
  if (typeof window !== 'undefined' && workerAttempts < maxWorkerAttempts) {
    workerAttempts++
    isWorkerConfigured = false
    
    try {
      const fallbackUrl = workerUrls[workerAttempts] || workerUrls[workerUrls.length - 1]
      pdfjs.GlobalWorkerOptions.workerSrc = fallbackUrl
      console.log(`PDF.js worker fallback configured with: ${fallbackUrl}`)
    } catch (error) {
      console.error('PDF worker fallback setup failed:', error)
    }
  }
}

// Reset worker configuration for retry
export const resetPdfWorker = () => {
  isWorkerConfigured = false
  workerAttempts = 0
}