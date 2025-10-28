/**
 * Initialize PDF.js worker configuration
 * This must be called as early as possible, before any PDF operations
 */

export const initializePdfWorker = async () => {
  try {
    // Only run in browser environment
    if (typeof window === 'undefined') {
      return
    }

    console.log('[PDF Init] Starting PDF worker initialization...')

    // Try to dynamically set up pdfjs before react-pdf uses it
    // by importing the worker script directly
    const scriptTag = document.createElement('script')
    scriptTag.type = 'text/javascript'
    scriptTag.async = true
    scriptTag.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.296/pdf.min.js'
    
    scriptTag.onload = () => {
      console.log('[PDF Init] PDF.js library loaded from CDN')
      // After pdf.min.js loads, configure the worker
      try {
        const pdfjsLib = (window as any).pdfjsLib
        if (pdfjsLib?.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.296/pdf.worker.min.js'
          console.log('[PDF Init] PDF worker configured successfully')
        }
      } catch (e) {
        console.error('[PDF Init] Error configuring worker after CDN load:', e)
      }
    }
    
    scriptTag.onerror = () => {
      console.error('[PDF Init] Failed to load PDF.js from CDN')
    }

    document.head.appendChild(scriptTag)
    return true
  } catch (error) {
    console.error('[PDF Init] Failed to initialize PDF worker:', error)
    return false
  }
}
