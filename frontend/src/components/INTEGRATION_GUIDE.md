/**
 * INTEGRATION GUIDE - Live Redaction Editor
 * 
 * How to integrate the new live redaction editor into the existing dashboard
 */

import { LiveRedactionEditor } from '@/components/LiveRedactionEditor';

/**
 * EXAMPLE 1: Basic Usage
 * 
 * Add this to your document viewer page:
 */

// In your document viewer/editor page:
import { useState } from 'react';

export function DocumentEditor({ documentId, pdfUrl, entities }: {
  documentId: string;
  pdfUrl: string;
  entities: any[];
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <LiveRedactionEditor
        documentId={documentId}
        pdfUrl={pdfUrl}
        entities={entities}
        onRedactionComplete={(result) => {
          console.log('Redaction complete:', result);
          // Download the redacted file
          window.location.href = result.downloadUrl;
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div>
      <button onClick={() => setIsEditing(true)}>
        Edit Redactions
      </button>
      {/* ... rest of document view ... */}
    </div>
  );
}

/**
 * EXAMPLE 2: Integration with Existing Dashboard
 * 
 * Update your DocumentViewerNew.tsx or similar component:
 */

// Add state for redaction editor
const [showRedactionEditor, setShowRedactionEditor] = useState(false);

// Add button to toolbar
<Button
  onClick={() => setShowRedactionEditor(true)}
  className="gap-2"
>
  <Edit className="h-4 w-4" />
  Edit Redactions
</Button>

// Add modal/overlay
{showRedactionEditor && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-lg w-full max-w-6xl h-[90vh]">
      <LiveRedactionEditor
        documentId={document.id}
        pdfUrl={`/api/documents/${document.id}/file`}
        entities={detectedEntities}
        onRedactionComplete={(result) => {
          // Refresh document and close editor
          refreshDocument();
          setShowRedactionEditor(false);
        }}
        onCancel={() => setShowRedactionEditor(false)}
      />
    </div>
  </div>
)}

/**
 * EXAMPLE 3: Fetch entities from backend
 * 
 * If entities aren't loaded yet, fetch them:
 */

async function loadEntities(documentId: string) {
  const response = await fetch(`/api/documents/${documentId}/entities`);
  const data = await response.json();
  return data.entities; // Array of Entity objects
}

/**
 * KEY FEATURES
 */

/**
 * User Workflow:
 * 1. User clicks "Edit Redactions" button
 * 2. LiveRedactionEditor opens with PDF and detected entities
 * 3. User reviews entities:
 *    - Click entity box to select it
 *    - Click Approve button (checkmark) to keep redaction
 *    - Click Reject button (X) to remove redaction
 *    - Use Approve All / Reject All for batch operations
 * 4. User can search/filter entities in sidebar by type and confidence
 * 5. User clicks "Apply" button to process redactions
 * 6. Backend applies redactions and saves new PDF
 * 7. Download link is returned and file can be downloaded
 */

/**
 * Component Props:
 * 
 * - documentId: string - ID of document being edited
 * - pdfUrl: string - URL to fetch PDF from (e.g., /api/documents/{id}/file)
 * - entities: Entity[] - Array of detected entities with bbox info
 * - onRedactionComplete: (result) => void - Called when redaction succeeds
 * - onCancel: () => void - Called when user cancels
 */

/**
 * Redux Store Integration (if needed):
 * 
 * The editor uses Zustand for state management internally.
 * The store is isolated and doesn't require Redux setup.
 * 
 * If you need to access redaction state from outside the component,
 * import the store:
 * 
 * import { useRedactionStore } from '@/stores/redactionStore';
 * 
 * const approvedEntities = useRedactionStore((state) => state.getApprovedEntities());
 * const customRedactions = useRedactionStore((state) => state.customRedactions);
 */

/**
 * Error Handling:
 * 
 * The editor handles:
 * - PDF loading failures
 * - Invalid entity coordinates
 * - Backend redaction failures
 * - Network errors
 * 
 * Errors are displayed in an error banner at the top of the editor.
 */

/**
 * Styling:
 * 
 * The editor uses Tailwind CSS and shadcn/ui components.
 * All styling is self-contained within the component classes.
 * No external CSS imports needed.
 */

export { LiveRedactionEditor };
