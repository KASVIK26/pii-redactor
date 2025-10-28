// Debug utility - add this to window for easy debugging
// Can be accessed in browser console as: window.pdfDebugLog

interface DebugLog {
  timestamp: string
  prefix: string
  message: string
  details?: any
}

class PDFDebugCollector {
  private logs: DebugLog[] = []
  private maxLogs = 200

  addLog(prefix: string, message: string, details?: any) {
    const log: DebugLog = {
      timestamp: new Date().toISOString(),
      prefix,
      message,
      details
    }
    
    this.logs.push(log)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
  }

  getLogs(filterPrefix?: string): DebugLog[] {
    if (!filterPrefix) return this.logs
    return this.logs.filter(log => log.prefix.includes(filterPrefix))
  }

  getLogsFormatted(filterPrefix?: string): string {
    const logs = this.getLogs(filterPrefix)
    return logs.map(log => 
      `[${log.timestamp}] ${log.prefix}: ${log.message}${log.details ? ' | ' + JSON.stringify(log.details) : ''}`
    ).join('\n')
  }

  clearLogs() {
    this.logs = []
  }

  exportLogs(filterPrefix?: string): string {
    return this.getLogsFormatted(filterPrefix)
  }

  getAllLogs(): DebugLog[] {
    return [...this.logs]
  }

  // Create a searchable log view
  searchLogs(searchTerm: string): DebugLog[] {
    const term = searchTerm.toLowerCase()
    return this.logs.filter(log => 
      log.message.toLowerCase().includes(term) ||
      log.prefix.toLowerCase().includes(term)
    )
  }
}

// Export for use in browser
if (typeof window !== 'undefined') {
  (window as any).pdfDebugLog = new PDFDebugCollector()
  
  // Override console methods to capture logs
  const originalLog = console.log
  const originalError = console.error
  const originalWarn = console.warn

  console.log = function(...args: any[]) {
    originalLog.apply(console, args)
    const message = args.join(' ')
    if (message.includes('[PDF') || message.includes('[DocumentViewer') || message.includes('[LiveEditor')) {
      (window as any).pdfDebugLog.addLog(
        'CONSOLE',
        message
      )
    }
  }

  console.error = function(...args: any[]) {
    originalError.apply(console, args)
    const message = args.join(' ')
    if (message.includes('[PDF') || message.includes('[DocumentViewer') || message.includes('[LiveEditor') || message.includes('Error')) {
      (window as any).pdfDebugLog.addLog(
        'ERROR',
        message,
        args[1]
      )
    }
  }

  console.warn = function(...args: any[]) {
    originalWarn.apply(console, args)
    const message = args.join(' ')
    if (message.includes('[PDF') || message.includes('[DocumentViewer') || message.includes('[LiveEditor')) {
      (window as any).pdfDebugLog.addLog(
        'WARN',
        message
      )
    }
  }
}

export default PDFDebugCollector
