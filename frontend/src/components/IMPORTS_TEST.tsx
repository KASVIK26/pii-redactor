/**
 * QUICK TEST - Verify all imports work
 * 
 * Run this to ensure no import errors
 * You can delete this file after verification
 */

// Test all component imports
import { PDFViewer } from '@/components/PDFViewer';
import { EntityOverlay } from '@/components/EntityOverlay';
import { EntityListSidebar } from '@/components/EntityListSidebar';
import { LiveRedactionEditor } from '@/components/LiveRedactionEditor';

// Test store import
import { useRedactionStore } from '@/stores/redactionStore';

// Test type imports
import type { Entity, CustomRedaction, RedactionState, ApplyRedactionRequest } from '@/types/redaction';

// Test UI component imports
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

console.log('✅ All imports successful!');

/**
 * Expected output in browser console:
 * ✅ All imports successful!
 * 
 * If you see this, everything is properly set up.
 */
