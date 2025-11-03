/**
 * Zustand store for redaction editor state management
 * Handles all state for the live redaction editor including undo/redo
 */

import { create } from 'zustand';
import {
  Entity,
  CustomRedaction,
  EntityModification,
  RedactionState,
  RedactionAction,
  EntityFilter,
  EntityType,
  BoundingBox,
  Toast,
} from '@/types/redaction';

const MAX_HISTORY = 50; // Maximum undo/redo history

interface RedactionStore extends RedactionState {
  // Entity management
  setEntity: (entity: Entity) => void;
  updateEntity: (id: string, partial: Partial<Entity>) => void;
  approveEntity: (id: string) => void;
  rejectEntity: (id: string) => void;
  bulkApprove: (ids: string[]) => void;
  bulkReject: (ids: string[]) => void;

  // Manual selection
  manuallySelectedEntityIds: Set<string>;
  toggleManualSelection: (id: string) => void;
  setManualSelections: (ids: string[]) => void;
  clearManualSelections: () => void;

  // Custom redactions
  addCustomRedaction: (redaction: Omit<CustomRedaction, 'id' | 'createdAt'>) => void;
  removeCustomRedaction: (id: string) => void;

  // Entity modifications
  modifyEntity: (entityId: string, modification: Omit<EntityModification, 'timestamp'>) => void;

  // Editor state
  setCurrentPage: (page: number) => void;
  setZoomLevel: (level: number) => void;
  setDrawMode: (enabled: boolean) => void;
  setDragging: (dragging: boolean) => void;
  setSelectedEntity: (id?: string) => void;

  // Filters
  setFilters: (filters: Partial<EntityFilter>) => void;
  resetFilters: () => void;

  // UI state
  setComparison: (show: boolean) => void;
  setApplying: (applying: boolean) => void;

  // History/Undo/Redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Batch operations
  loadEntities: (entities: Entity[]) => void;
  reset: () => void;

  // Selectors
  getApprovedEntities: () => Entity[];
  getRejectedEntities: () => Entity[];
  getPendingEntities: () => Entity[];
  getPageEntities: (page: number) => Entity[];
  getFilteredEntities: () => Entity[];
  getTotalRedactions: () => number;
}

const defaultFilters: EntityFilter = {
  types: ['PERSON', 'DATE', 'ID', 'ORGANIZATION', 'EMAIL', 'PHONE', 'ADDRESS'],
  confidenceMin: 0,
  confidenceMax: 1,
  status: 'all',
  searchText: '',
};

export const useRedactionStore = create<RedactionStore>((set, get) => ({
      // Initial state
      documentId: '',
      currentPage: 0,
      totalPages: 0,
      entities: new Map(),
      approvedEntityIds: new Set(),
      rejectedEntityIds: new Set(),
      manuallySelectedEntityIds: new Set(),
      customRedactions: new Map(),
      entityModifications: new Map(),
      selectedEntityId: undefined,
      drawMode: false,
      isDragging: false,
      isApplying: false,
      history: [],
      historyIndex: -1,
      zoomLevel: 1.0,
      filters: defaultFilters,
      showComparison: false,

      // Entity management
      setEntity: (entity) =>
        set((state) => {
          const newEntities = new Map(state.entities);
          newEntities.set(entity.id, entity);
          return { entities: newEntities };
        }),

      updateEntity: (id, partial) =>
        set((state) => {
          const entity = state.entities.get(id);
          if (!entity) return state;

          const newEntities = new Map(state.entities);
          newEntities.set(id, { ...entity, ...partial });
          return { entities: newEntities };
        }),

      approveEntity: (id) =>
        set((state) => {
          const entity = state.entities.get(id);
          if (!entity) return state;

          // Add action to history
          const newAction: RedactionAction = {
            type: 'approve',
            entityIds: [id],
            timestamp: Date.now(),
          };

          const newApproved = new Set(state.approvedEntityIds);
          newApproved.add(id);

          const newRejected = new Set(state.rejectedEntityIds);
          newRejected.delete(id);

          // Update entity object to reflect approval state
          const newEntities = new Map(state.entities);
          newEntities.set(id, {
            ...entity,
            isApproved: true,
            isRejected: false,
          });

          return {
            entities: newEntities,
            approvedEntityIds: newApproved,
            rejectedEntityIds: newRejected,
            history: [...state.history.slice(0, state.historyIndex + 1), newAction],
            historyIndex: state.historyIndex + 1,
          };
        }),

      rejectEntity: (id) =>
        set((state) => {
          const entity = state.entities.get(id);
          if (!entity) return state;

          const newAction: RedactionAction = {
            type: 'reject',
            entityIds: [id],
            timestamp: Date.now(),
          };

          const newRejected = new Set(state.rejectedEntityIds);
          newRejected.add(id);

          const newApproved = new Set(state.approvedEntityIds);
          newApproved.delete(id);

          // Update entity object to reflect rejection state
          const newEntities = new Map(state.entities);
          newEntities.set(id, {
            ...entity,
            isApproved: false,
            isRejected: true,
          });

          return {
            entities: newEntities,
            approvedEntityIds: newApproved,
            rejectedEntityIds: newRejected,
            history: [...state.history.slice(0, state.historyIndex + 1), newAction],
            historyIndex: state.historyIndex + 1,
          };
        }),

      bulkApprove: (ids) =>
        set((state) => {
          const newAction: RedactionAction = {
            type: 'bulk_approve',
            entityIds: ids,
            timestamp: Date.now(),
          };

          const newApproved = new Set(state.approvedEntityIds);
          const newRejected = new Set(state.rejectedEntityIds);

          ids.forEach((id) => {
            if (state.entities.has(id)) {
              newApproved.add(id);
              newRejected.delete(id);
            }
          });

          return {
            approvedEntityIds: newApproved,
            rejectedEntityIds: newRejected,
            history: [...state.history.slice(0, state.historyIndex + 1), newAction],
            historyIndex: state.historyIndex + 1,
          };
        }),

      bulkReject: (ids) =>
        set((state) => {
          const newAction: RedactionAction = {
            type: 'bulk_reject',
            entityIds: ids,
            timestamp: Date.now(),
          };

          const newApproved = new Set(state.approvedEntityIds);
          const newRejected = new Set(state.rejectedEntityIds);

          ids.forEach((id) => {
            if (state.entities.has(id)) {
              newRejected.add(id);
              newApproved.delete(id);
            }
          });

          return {
            approvedEntityIds: newApproved,
            rejectedEntityIds: newRejected,
            history: [...state.history.slice(0, state.historyIndex + 1), newAction],
            historyIndex: state.historyIndex + 1,
          };
        }),

      // Manual selection
      toggleManualSelection: (id) =>
        set((state) => {
          const newSelected = new Set(state.manuallySelectedEntityIds);
          if (newSelected.has(id)) {
            newSelected.delete(id);
          } else {
            newSelected.add(id);
          }
          return { manuallySelectedEntityIds: newSelected };
        }),

      setManualSelections: (ids) =>
        set(() => ({
          manuallySelectedEntityIds: new Set(ids),
        })),

      clearManualSelections: () =>
        set(() => ({
          manuallySelectedEntityIds: new Set(),
        })),

      // Custom redactions
      addCustomRedaction: (redaction) =>
        set((state) => {
          const id = crypto.randomUUID();
          const customRedaction: CustomRedaction = {
            ...redaction,
            id,
            createdAt: Date.now(),
          };

          const newCustom = new Map(state.customRedactions);
          newCustom.set(id, customRedaction);

          const newAction: RedactionAction = {
            type: 'add_custom',
            customRedactionIds: [id],
            customRedaction,
            timestamp: Date.now(),
          };

          return {
            customRedactions: newCustom,
            history: [...state.history.slice(0, state.historyIndex + 1), newAction],
            historyIndex: state.historyIndex + 1,
          };
        }),

      removeCustomRedaction: (id) =>
        set((state) => {
          const newCustom = new Map(state.customRedactions);
          newCustom.delete(id);

          const newAction: RedactionAction = {
            type: 'remove_custom',
            customRedactionIds: [id],
            timestamp: Date.now(),
          };

          return {
            customRedactions: newCustom,
            history: [...state.history.slice(0, state.historyIndex + 1), newAction],
            historyIndex: state.historyIndex + 1,
          };
        }),

      // Entity modifications
      modifyEntity: (entityId, modification) =>
        set((state) => {
          if (!state.entities.has(entityId)) return state;

          const fullModification: EntityModification = {
            ...modification,
            entityId,
            timestamp: Date.now(),
          };

          const newModifications = new Map(state.entityModifications);
          const existing = newModifications.get(entityId) || [];
          newModifications.set(entityId, [...existing, fullModification]);

          const newAction: RedactionAction = {
            type: 'modify_entity',
            modification: fullModification,
            timestamp: Date.now(),
          };

          return {
            entityModifications: newModifications,
            history: [...state.history.slice(0, state.historyIndex + 1), newAction],
            historyIndex: state.historyIndex + 1,
          };
        }),

      // Editor state
      setCurrentPage: (page) => set({ currentPage: page }),
      setZoomLevel: (level) => set({ zoomLevel: Math.max(0.5, Math.min(3, level)) }),
      setDrawMode: (enabled) => set({ drawMode: enabled }),
      setDragging: (dragging) => set({ isDragging: dragging }),
      setSelectedEntity: (id) => set({ selectedEntityId: id }),

      // Filters
      setFilters: (filters) =>
        set((state) => ({
          filters: { ...state.filters, ...filters },
        })),

      resetFilters: () =>
        set({
          filters: defaultFilters,
        }),

      // UI state
      setComparison: (show) => set({ showComparison: show }),
      setApplying: (applying) => set({ isApplying: applying }),

      // History/Undo/Redo
      undo: () =>
        set((state) => {
          if (state.historyIndex <= 0) return state;

          // This is simplified - full implementation would replay state changes
          return {
            historyIndex: state.historyIndex - 1,
          };
        }),

      redo: () =>
        set((state) => {
          if (state.historyIndex >= state.history.length - 1) return state;

          return {
            historyIndex: state.historyIndex + 1,
          };
        }),

      canUndo: () => {
        const state = get();
        return state.historyIndex > 0;
      },

      canRedo: () => {
        const state = get();
        return state.historyIndex < state.history.length - 1;
      },

      // Batch operations
      loadEntities: (entities) =>
        set((state) => {
          const newEntities = new Map<string, Entity>();
          const approvedIds = new Set<string>();
          const rejectedIds = new Set<string>();

          entities.forEach((entity) => {
            newEntities.set(entity.id, entity);
            
            // Load approval states from entity properties
            if (entity.isApproved) {
              approvedIds.add(entity.id);
            }
            if (entity.isRejected) {
              rejectedIds.add(entity.id);
            }
          });

          return {
            entities: newEntities,
            approvedEntityIds: approvedIds,
            rejectedEntityIds: rejectedIds,
            customRedactions: new Map(),
            entityModifications: new Map(),
            history: [],
            historyIndex: -1,
          };
        }),

      reset: () =>
        set({
          documentId: '',
          currentPage: 0,
          totalPages: 0,
          entities: new Map(),
          approvedEntityIds: new Set(),
          rejectedEntityIds: new Set(),
          manuallySelectedEntityIds: new Set(),
          customRedactions: new Map(),
          entityModifications: new Map(),
          selectedEntityId: undefined,
          drawMode: false,
          isDragging: false,
          isApplying: false,
          history: [],
          historyIndex: -1,
          zoomLevel: 1.0,
          filters: defaultFilters,
          showComparison: false,
        }),

      // Selectors
      getApprovedEntities: () => {
        const state = get();
        const approved: Entity[] = [];
        state.approvedEntityIds.forEach((id) => {
          const entity = state.entities.get(id);
          if (entity) approved.push(entity);
        });
        return approved;
      },

      getRejectedEntities: () => {
        const state = get();
        const rejected: Entity[] = [];
        state.rejectedEntityIds.forEach((id) => {
          const entity = state.entities.get(id);
          if (entity) rejected.push(entity);
        });
        return rejected;
      },

      getPendingEntities: () => {
        const state = get();
        const pending: Entity[] = [];
        state.entities.forEach((entity) => {
          if (!state.approvedEntityIds.has(entity.id) && !state.rejectedEntityIds.has(entity.id)) {
            pending.push(entity);
          }
        });
        return pending;
      },

      getPageEntities: (page) => {
        const state = get();
        const pageEntities: Entity[] = [];
        state.entities.forEach((entity) => {
          if (entity.page === page) {
            pageEntities.push(entity);
          }
        });
        return pageEntities;
      },

      getFilteredEntities: () => {
        const state = get();
        const { filters } = state;

        const results: Entity[] = [];

        state.entities.forEach((entity) => {
          // Check type filter
          if (!filters.types.includes(entity.type)) return;

          // Check confidence filter
          if (entity.confidence < filters.confidenceMin || entity.confidence > filters.confidenceMax) return;

          // Check status filter
          if (filters.status === 'approved' && !state.approvedEntityIds.has(entity.id)) return;
          if (filters.status === 'rejected' && !state.rejectedEntityIds.has(entity.id)) return;
          if (
            filters.status === 'pending' &&
            (state.approvedEntityIds.has(entity.id) || state.rejectedEntityIds.has(entity.id))
          )
            return;

          // Check search text
          if (filters.searchText && !entity.text.toLowerCase().includes(filters.searchText.toLowerCase())) return;

          results.push(entity);
        });

        return results;
      },

      getTotalRedactions: () => {
        const state = get();
        return state.approvedEntityIds.size + state.customRedactions.size;
      },
    })
);

// Export selector hooks for convenience
export const useRedactionEntities = () => useRedactionStore((state) => state.entities);
export const useApprovedEntities = () => useRedactionStore((state) => state.getApprovedEntities());
export const usePendingEntities = () => useRedactionStore((state) => state.getPendingEntities());
export const useCurrentPage = () => useRedactionStore((state) => state.currentPage);
export const useZoomLevel = () => useRedactionStore((state) => state.zoomLevel);
export const useDrawMode = () => useRedactionStore((state) => state.drawMode);
export const useFilters = () => useRedactionStore((state) => state.filters);
