import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract filename from URL or path
 * @param url URL or file path (e.g., "http://example.com/documents/my-file.pdf")
 * @returns Extracted filename (e.g., "my-file.pdf")
 */
export function extractFilename(url: string): string {
  try {
    // Handle URL paths
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    return pathname.split('/').pop() || 'document.pdf';
  } catch {
    // Handle relative paths and regular strings
    return url.split('/').pop() || 'document.pdf';
  }
}

/**
 * Add _redacted suffix to filename before extension
 * @param filename Original filename (e.g., "my-document.pdf")
 * @returns Filename with redacted suffix (e.g., "my-document_redacted.pdf")
 */
export function getRedactedFilename(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  
  if (lastDotIndex === -1) {
    // No extension
    return `${filename}_redacted`;
  }
  
  const name = filename.substring(0, lastDotIndex);
  const ext = filename.substring(lastDotIndex);
  return `${name}_redacted${ext}`;
}

/**
 * Get display name from URL (removes query params and hash)
 * @param url URL or file path
 * @returns Clean filename for display
 */
export function getDisplayFilename(url: string): string {
  let filename = extractFilename(url);
  
  // Remove query parameters if present
  filename = filename.split('?')[0];
  
  // Remove hash if present
  filename = filename.split('#')[0];
  
  return filename;
}
