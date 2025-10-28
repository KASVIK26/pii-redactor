// PDF.js setup with proper worker configuration
import { pdfjs } from 'react-pdf'

// Configure PDF.js worker only once
let isWorkerConfigured = false
let setupAttempts = 0
const MAX_SETUP_ATTEMPTS = 3

// Use static versions instead of dynamic pdfjs.version to avoid initialization issues
const PDFJS_VERSION = '3.11.174'

const workerUrls = [
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`,
  `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`,
  `https://mozilla.github.io/pdf.js/build/pdf.worker.js`,
]

const safeSetWorkerSrc = (url: string): boolean => {
  try {
    // Check all preconditions before setting workerSrc
    if (typeof window === 'undefined') {
      console.log('[PDF Setup] Window is undefined')
      return false
    }

    if (!pdfjs) {
      console.warn('[PDF Setup] pdfjs is not available')
      return false
    }

    if (typeof pdfjs !== 'object') {
      console.warn('[PDF Setup] pdfjs is not an object:', typeof pdfjs)
      return false
    }

    if (!pdfjs.GlobalWorkerOptions) {
      console.warn('[PDF Setup] GlobalWorkerOptions does not exist on pdfjs')
      return false
    }

    if (typeof pdfjs.GlobalWorkerOptions !== 'object') {
      console.warn('[PDF Setup] GlobalWorkerOptions is not an object:', typeof pdfjs.GlobalWorkerOptions)
      return false
    }

    // Safely set the worker source
    console.log('[PDF Setup] Setting worker URL to:', url)
    pdfjs.GlobalWorkerOptions.workerSrc = url
    console.log('[PDF Setup] Worker URL set successfully')
    console.log('[PDF Setup] Verified worker src:', pdfjs.GlobalWorkerOptions.workerSrc)
    return true
  } catch (error) {
    console.error('[PDF Setup] Error setting worker source:', error)
    console.error('[PDF Setup] Error details:', error instanceof Error ? error.message : String(error))
    return false
  }
}

export const setupPdfWorker = () => {
  if (typeof window === 'undefined') {
    console.log('[PDF Setup] Window is undefined, skipping setup')
    return
  }

  // Avoid multiple initialization attempts
  if (isWorkerConfigured) {
    console.log('[PDF Setup] Worker already configured, skipping')
    return
  }

  setupAttempts++
  if (setupAttempts > MAX_SETUP_ATTEMPTS) {
    console.warn('[PDF Setup] Max setup attempts reached')
    return
  }

  console.log('[PDF Setup] Starting PDF worker setup (attempt', setupAttempts, ')')

  try {
    // Try each URL in order
    for (let i = 0; i < workerUrls.length; i++) {
      const url = workerUrls[i]
      if (safeSetWorkerSrc(url)) {
        isWorkerConfigured = true
        console.log('[PDF Setup] Successfully configured PDF worker')
        return
      }
    }

    // If we get here, none of the URLs worked
    console.error('[PDF Setup] Failed to configure worker with any URL')
    
    // Retry after a delay - pdfjs might not be fully initialized yet
    setTimeout(() => {
      if (!isWorkerConfigured) {
        console.log('[PDF Setup] Retrying setup after delay...')
        setupPdfWorker()
      }
    }, 500)
  } catch (error) {
    console.error('[PDF Setup] Unexpected error in setupPdfWorker:', error)
  }
}

// Fallback to alternative CDN
export const setupPdfWorkerFallback = () => {
  if (typeof window === 'undefined') {
    console.log('[PDF Setup Fallback] Window is undefined')
    return
  }

  console.log('[PDF Setup Fallback] Starting fallback setup...')

  try {
    // Try fallback URLs
    for (let i = 1; i < workerUrls.length; i++) {
      const url = workerUrls[i]
      if (safeSetWorkerSrc(url)) {
        isWorkerConfigured = true
        console.log('[PDF Setup Fallback] Successfully configured with fallback')
        return
      }
    }

    console.error('[PDF Setup Fallback] Failed to configure with any fallback URL')
  } catch (error) {
    console.error('[PDF Setup Fallback] Error in fallback setup:', error)
  }
}

// Reset worker configuration for retry
export const resetPdfWorker = () => {
  console.log('[PDF Setup] Resetting worker configuration')
  isWorkerConfigured = false
  setupAttempts = 0
}