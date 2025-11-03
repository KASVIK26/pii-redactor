/**
 * Core types for the live redaction editor
 */

/**
 * Represents a detected entity in the PDF
 */
export interface Entity {
  id: string; // Unique identifier (uuid or hash)
  type: EntityType; // Classification (PERSON, DATE, ID, etc)
  text: string; // Actual detected text
  confidence: number; // 0-1 confidence score
  method: 'spacy' | 'regex' | 'huggingface'; // Detection method
  page: number; // Page number (0-indexed)
  bbox: BoundingBox; // Position on page
  isApproved: boolean; // User approval status
  isRejected: boolean; // User rejection status
}

/**
 * Entity type classification
 */
export type EntityType = 'PERSON' | 'DATE' | 'ID' | 'ORGANIZATION' | 'EMAIL' | 'PHONE' | 'ADDRESS' | 'CUSTOM';

/**
 * Bounding box coordinates for text position
 * Coordinates are relative to page (0-1 scale or absolute pixels)
 */
export interface BoundingBox {
  x: number; // Left position
  y: number; // Top position
  width: number; // Width
  height: number; // Height
  scale?: number; // Scale factor if different from display
}

/**
 * Custom redaction drawn by user (not auto-detected)
 */
export interface CustomRedaction {
  id: string; // Unique identifier
  page: number; // Page number (0-indexed)
  bbox: BoundingBox; // Position on page
  type: EntityType; // Usually 'CUSTOM' but can be other types
  label?: string; // Optional user label for why redacted
  createdAt: number; // Timestamp
}

/**
 * Modification to an existing auto-detected entity
 */
export interface EntityModification {
  entityId: string; // Reference to original entity
  type: 'resize' | 'move' | 'retext'; // Type of modification
  newBbox?: BoundingBox; // New position if moved/resized
  newText?: string; // New text if retext operation
  timestamp: number; // When modification was made
}

/**
 * Complete redaction state for a document
 */
export interface RedactionState {
  documentId: string; // Reference to document
  currentPage: number; // Currently displayed page (0-indexed)
  totalPages: number; // Total number of pages

  // Entities from detection
  entities: Map<string, Entity>; // entity.id → Entity
  approvedEntityIds: Set<string>; // IDs of approved entities
  rejectedEntityIds: Set<string>; // IDs of rejected entities

  // User modifications
  customRedactions: Map<string, CustomRedaction>; // custom.id → CustomRedaction
  entityModifications: Map<string, EntityModification[]>; // entityId → [modifications]

  // Editor state
  selectedEntityId?: string; // Currently selected entity
  drawMode: boolean; // Is user drawing custom redaction
  isDragging: boolean; // Is user dragging entity
  isApplying: boolean; // Is redaction being applied

  // History for undo/redo
  history: RedactionAction[];
  historyIndex: number;

  // UI state
  zoomLevel: number; // 1.0 = 100%
  filters: EntityFilter; // Active filters in sidebar
  showComparison: boolean; // Show original vs redacted
}

/**
 * Action for undo/redo stack
 */
export interface RedactionAction {
  type: 'approve' | 'reject' | 'add_custom' | 'remove_custom' | 'modify_entity' | 'bulk_approve' | 'bulk_reject';
  entityIds?: string[]; // For entity actions
  customRedactionIds?: string[]; // For custom redaction actions
  modification?: EntityModification; // For entity modification
  customRedaction?: CustomRedaction; // For custom redaction addition
  timestamp: number;
}

/**
 * Filters for entity display in sidebar
 */
export interface EntityFilter {
  types: EntityType[]; // Types to show
  confidenceMin: number; // 0-1 minimum confidence
  confidenceMax: number; // 0-1 maximum confidence
  status: 'all' | 'approved' | 'rejected' | 'pending'; // Status filter
  searchText: string; // Search by entity text
}

/**
 * PDF page reference
 */
export interface PDFPage {
  number: number; // 0-indexed page number
  width: number; // Page width in pixels
  height: number; // Page height in pixels
  canvas?: HTMLCanvasElement; // Rendered page canvas
  isLoading: boolean; // Is page being rendered
  error?: string; // Error message if rendering failed
}

/**
 * Redaction request to backend
 */
export interface ApplyRedactionRequest {
  documentId: string;
  approvedEntityIds: string[]; // Entities to redact
  customRedactions: Array<{
    page: number;
    bbox: BoundingBox;
    type: EntityType;
    label?: string;
  }>;
  modifications?: EntityModification[]; // Modified entities
}

/**
 * Response from apply-redaction endpoint
 */
export interface ApplyRedactionResponse {
  success: boolean;
  message: string;
  redactedDocumentId?: string; // New document ID if separate
  redactedStoragePath?: string; // Where redacted file is stored
  downloadUrl?: string; // Direct download link
  stats?: RedactionStats; // Statistics about applied redactions
  error?: string; // Error message if failed
}

/**
 * Statistics about applied redactions
 */
export interface RedactionStats {
  totalRedacted: number; // Total redactions applied
  totalPages: number; // Total pages in document
  processedPages: number; // Pages successfully processed
  failedPages: number; // Pages that failed
  originalFileSize: number; // Original file size in bytes
  redactedFileSize: number; // Redacted file size in bytes
  processingTimeMs: number; // How long redaction took
}

/**
 * UI toast notification
 */
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number; // ms until auto-dismiss, undefined = manual dismiss
}

/**
 * Progress update during redaction processing
 */
export interface ProgressUpdate {
  status: 'starting' | 'processing' | 'saving' | 'complete' | 'error';
  currentPage?: number;
  totalPages?: number;
  percentComplete: number; // 0-100
  message: string;
  error?: string;
}
