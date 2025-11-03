# 📋 Clean Implementation Plan: Manual Entity Selection

## Problem Statement

Currently, all detected entities are auto-redacted (90%+ confidence). We need to allow users to manually select additional entities to redact, specifically those with **50-90% confidence**.

**Current Issue**: Previous implementation had data loss and incorrect entity counts.

## Solution Architecture

### 1. Entity Separation Strategy

**During PII Detection** (Backend):
```
PII Model Output: All detected entities with confidence scores

Split into 3 categories:
├─ HIGH_CONFIDENCE (90%+)
│  └─ Auto-redact, shown in Live Editor
├─ MEDIUM_CONFIDENCE (50-90%)
│  └─ Optional redaction, shown in "Choose Manually" section
└─ LOW_CONFIDENCE (<50%)
   └─ Discarded, not shown to user
```

### 2. Data Flow

```
┌─────────────────────────────────────────────────────────┐
│ BACKEND: Document Processing                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Run PII detection model → Get all entities         │
│  2. Filter by confidence:                              │
│     - HIGH (90%+) → Store in entities[]                │
│     - MEDIUM (50-90%) → Store in medium_confidence[]   │
│  3. Save BOTH arrays in document.metadata              │
│                                                          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ API: /documents/{id}/entities                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  GET Response:                                          │
│  {                                                       │
│    "entities": [4 high-confidence],                    │
│    "medium_confidence": [4 medium-confidence]          │
│  }                                                       │
│                                                          │
│  Note: NO "possible_entities" or complex logic         │
│  Just TWO simple arrays                                │
│                                                          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ FRONTEND: Entity Review & Live Editor                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. EntityReview Component:                            │
│     - Receives only "entities" (high-confidence)       │
│     - User reviews and clicks "Go to Live Editor"      │
│     - Navigates to live editor with entities          │
│                                                          │
│  2. LiveRedactionEditor Component:                     │
│     - Load high-confidence entities auto              │
│     - ALSO fetch medium-confidence entities           │
│     - Show "Choose Manually" section with medium      │
│     - User selects which medium entities to redact    │
│     - Apply button combines high + selected medium    │
│                                                          │
│  3. State Management (Zustand):                        │
│     - manuallySelectedEntityIds: Set<string>          │
│     - Store selected medium-confidence entity IDs     │
│                                                          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ REDACTION: Apply Redactions                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  POST /apply-redaction with:                           │
│  {                                                       │
│    "entity_ids": [                                     │
│      "...all high-confidence IDs...",                 │
│      "...selected medium-confidence IDs..."           │
│    ]                                                    │
│  }                                                       │
│                                                          │
│  Result: PDF with all selected entities redacted      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Backend - Entity Separation (Minimal Changes)

**File**: `backend/app/api/documents.py`

**Changes**:
1. In `process_document_task()` → Entity separation at storage time
   - Filter entities >= 90% confidence → `entities[]`
   - Filter entities 50-90% confidence → `medium_confidence[]`
   - Discard < 50%

2. Update document metadata storage:
   ```python
   metadata = {
       "entities": high_conf_list,      # 90%+
       "medium_confidence": medium_list, # 50-90%
       # No "possible_entities"
   }
   ```

3. Create/update API endpoint `/documents/{id}/entities`:
   ```python
   GET /documents/{id}/entities
   Response:
   {
       "entities": [...],              # High confidence
       "medium_confidence": [...]      # Medium confidence
   }
   ```

**No approve/reject endpoints needed** - That's in Live Editor now.

---

### Phase 2: Frontend - EntityReview (Already Done!)

**File**: `frontend/src/components/EntityReview.tsx`

✅ **Already Updated**:
- Removed approve/reject checkboxes
- Removed approval/rejection counts
- Simplified sidebar to only show entity types
- Styled "Save & Go to Live Editor" button nicely
- Just displays entities with type filtering

**What it should do**:
1. Fetch high-confidence entities from `/entities` endpoint
2. Display them grouped by type
3. Allow filtering by type
4. Show total entity count
5. Navigate to Live Editor

---

### Phase 3: LiveRedactionEditor - Manual Selection UI

**File**: `frontend/src/components/LiveRedactionEditor.tsx`

**Changes**:
1. Fetch BOTH arrays when component loads:
   ```typescript
   const response = await fetch(`/entities/${documentId}`)
   const highConfidence = response.data.entities
   const mediumConfidence = response.data.medium_confidence
   ```

2. Load high-confidence entities into Zustand store (auto-approved)

3. Create "Choose Manually" section:
   - Show medium-confidence entities
   - User can click to select/deselect
   - Toggle updates Zustand `manuallySelectedEntityIds`
   - Visual feedback (highlight, checkbox)

4. When "Apply Redactions" clicked:
   ```typescript
   const selectedIds = [
       ...highConfidence.map(e => e.id),
       ...Array.from(manuallySelectedEntityIds)
   ]
   
   POST /apply-redaction
   Body: { entity_ids: selectedIds }
   ```

---

### Phase 4: Backend - Redaction Endpoint

**File**: `backend/app/api/redaction.py`

**Endpoint**: `POST /apply-redaction`

**What it receives**:
```python
{
    "entity_ids": ["id1", "id2", "id3", ...]  # Mix of high + selected medium
}
```

**What it does**:
1. Get document
2. Find entities matching entity_ids
3. Apply redaction to all of them
4. Save redacted PDF
5. Return download URL

---

## Data Integrity Guarantees

### No Data Loss ✅
- `entities[]`: High-confidence, auto-redacted
- `medium_confidence[]`: Medium confidence, user-selected
- Both arrays stored separately, never mixed
- No "eating up" of entities

### Correct Counts ✅
- EntityReview shows: `entities.length` (high-confidence count)
- LiveEditor shows: `entities.length + medium_confidence.length` (total available)
- No duplicate counting

### Clean Filtering ✅
- 90%+: Auto-redact (visible in Live Editor by default)
- 50-90%: Manual-select (visible in "Choose Manually" section)
- <50%: Not shown (discarded)

---

## Key Differences From Previous Implementation

| Aspect | Previous (Broken) | New (Clean) |
|--------|-------------------|------------|
| Array names | `entities`, `possible_entities` | `entities`, `medium_confidence` |
| Confidence ranges | Complex logic, overlapping | Clear: 90+, 50-90, <50 |
| Data storage | Mixed, confusing | Separated, clear purpose |
| Entity count | Miscalculated | Always correct |
| Approve/reject | In EntityReview | In LiveEditor only |
| State management | Complex separation | Simple selection Set |

---

## Testing Checklist

### Backend Tests
- [ ] Upload PDF → Check metadata has both arrays
- [ ] Verify 90%+ entities in `entities[]`
- [ ] Verify 50-90% entities in `medium_confidence[]`
- [ ] API returns both arrays correctly
- [ ] Entity counts match confidence ranges

### Frontend Tests - EntityReview
- [ ] Shows high-confidence entities only
- [ ] Filter by type works
- [ ] Total count is correct
- [ ] "Go to Live Editor" navigates properly

### Frontend Tests - LiveEditor
- [ ] Loads high-confidence entities auto
- [ ] "Choose Manually" shows medium-confidence
- [ ] User can select/deselect manual entities
- [ ] Selection tracked in Zustand
- [ ] Visual feedback for selections

### End-to-End Tests
- [ ] Upload PDF with mixed confidence
- [ ] Review high-confidence entities
- [ ] Go to Live Editor
- [ ] Select some medium-confidence entities
- [ ] Apply redaction
- [ ] Download PDF has ALL selected entities redacted

---

## Files to Modify

1. **`backend/app/api/documents.py`**
   - `process_document_task()`: Separate entities by confidence
   - Store `entities[]` (90%+) and `medium_confidence[]` (50-90%)
   - GET endpoint returns both arrays

2. **`frontend/src/components/EntityReview.tsx`**
   - ✅ Already simplified (remove approve/reject)

3. **`frontend/src/components/LiveRedactionEditor.tsx`**
   - Fetch both arrays
   - Show "Choose Manually" section with medium-confidence
   - Track selections in Zustand

4. **`frontend/src/stores/redactionStore.ts`**
   - Ensure `manuallySelectedEntityIds` exists
   - Add methods: `toggleManualSelection()`, `getSelectedIds()`

5. **`backend/app/api/redaction.py`** (if not already done)
   - Update `/apply-redaction` to accept entity_ids from both categories
   - Redact all matching entities

---

## Summary

- **Clear**: Two confidence ranges = High (auto) vs Medium (manual)
- **Simple**: No complex logic, straightforward arrays
- **Correct**: Counts are always accurate
- **Safe**: No data loss, clear data separation
- **User-Friendly**: Clear UI showing what's being done

Ready to implement when you are! 🚀
