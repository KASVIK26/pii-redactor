/**
 * Module that safely initializes PDF.js and react-pdf
 * This runs once and ensures worker is configured before react-pdf is used
 */

let pdfInitialized = false
let initPromise: Promise<boolean> | null = null

export const ensurePdfInitialized = async (): Promise<boolean> => {
  // Only initialize once
  if (pdfInitialized) return true
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      console.log('[PDF Module] Initializing PDF.js...')
      
      if (typeof window === 'undefined') {
        console.log('[PDF Module] Server environment, skipping initialization')
        return false
      }

      // Import react-pdf which exports the pdfjs library we need
      const { pdfjs } = await import('react-pdf')
      
      console.log('[PDF Module] react-pdf imported successfully')
      
      // Configure the worker
      if (pdfjs?.GlobalWorkerOptions) {
        const workerUrl = (window as any).pdfjsWorkerSrc || 
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.296/pdf.worker.min.js'
        
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        console.log('[PDF Module] PDF worker configured:', workerUrl)
        pdfInitialized = true
        return true
      } else {
        console.warn('[PDF Module] GlobalWorkerOptions not found')
        return false
      }
    } catch (error) {
      console.error('[PDF Module] Initialization failed:', error)
      return false
    }
  })()

  return initPromise
}

// Export the react-pdf components after ensuring initialization
export async function getDocument() {
  await ensurePdfInitialized()
  const mod = await import('react-pdf')
  return mod.Document
}

export async function getPage() {
  await ensurePdfInitialized()
  const mod = await import('react-pdf')
  return mod.Page
}
