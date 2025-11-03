/**
 * Entity Overlay Component
 * Displays detected entities as interactive colored boxes over the PDF
 */

'use client';

import React, { useMemo, useCallback } from 'react';
import { Entity, EntityType } from '@/types/redaction';
import { useRedactionStore } from '@/stores/redactionStore';

interface EntityOverlayProps {
  entities: Entity[];
  containerWidth: number;
  containerHeight: number;
  currentPage: number;
  onEntityClick?: (entity: Entity) => void;
}

// Color scheme for entity types
const ENTITY_COLORS: Record<EntityType, { bg: string; border: string }> = {
  PERSON: { bg: 'rgba(239, 68, 68, 0.1)', border: '#dc2626' },
  DATE: { bg: 'rgba(59, 130, 246, 0.1)', border: '#2563eb' },
  ID: { bg: 'rgba(34, 197, 94, 0.1)', border: '#16a34a' },
  ORGANIZATION: { bg: 'rgba(251, 146, 60, 0.1)', border: '#f97316' },
  EMAIL: { bg: 'rgba(168, 85, 247, 0.1)', border: '#a855f7' },
  PHONE: { bg: 'rgba(236, 72, 153, 0.1)', border: '#be185d' },
  ADDRESS: { bg: 'rgba(14, 165, 233, 0.1)', border: '#0369a1' },
  CUSTOM: { bg: 'rgba(139, 92, 246, 0.1)', border: '#7c3aed' },
};

export const EntityOverlay: React.FC<EntityOverlayProps> = ({
  entities,
  containerWidth,
  containerHeight,
  currentPage,
  onEntityClick,
}) => {
  const selectedEntityId = useRedactionStore((state) => state.selectedEntityId);
  const approvedEntityIds = useRedactionStore((state) => state.approvedEntityIds);
  const rejectedEntityIds = useRedactionStore((state) => state.rejectedEntityIds);

  // Filter entities for current page
  const pageEntities = useMemo(() => {
    return entities.filter((e) => e.page === currentPage);
  }, [entities, currentPage]);

  const handleEntityClick = useCallback(
    (entity: Entity) => {
      useRedactionStore.getState().setSelectedEntity(entity.id);
      onEntityClick?.(entity);
    },
    [onEntityClick]
  );

  if (containerWidth === 0 || containerHeight === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 pointer-events-auto">
      {pageEntities.map((entity) => {
        const colors = ENTITY_COLORS[entity.type];
        const isSelected = selectedEntityId === entity.id;
        const isApproved = approvedEntityIds.has(entity.id);
        const isRejected = rejectedEntityIds.has(entity.id);

        // Convert normalized coordinates (0-1) to pixels
        const x = (entity.bbox.x / 100) * containerWidth;
        const y = (entity.bbox.y / 100) * containerHeight;
        const width = (entity.bbox.width / 100) * containerWidth;
        const height = (entity.bbox.height / 100) * containerHeight;

        return (
          <div
            key={entity.id}
            className={`absolute group cursor-pointer transition-all border-2 rounded hover:shadow-lg ${
              isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''
            } ${
              isRejected
                ? 'opacity-40 bg-gray-300 border-gray-500 line-through'
                : isApproved
                  ? 'bg-green-100 border-green-500'
                  : 'hover:opacity-80'
            }`}
            style={{
              left: `${x}px`,
              top: `${y}px`,
              width: `${width}px`,
              height: `${height}px`,
              backgroundColor: isRejected ? 'rgba(209, 213, 219, 0.5)' : colors.bg,
              borderColor: isRejected ? '#9ca3af' : colors.border,
              zIndex: isSelected ? 40 : 10,
            }}
            onClick={() => handleEntityClick(entity)}
          >
            {/* Status indicator */}
            {(isApproved || isRejected) && (
              <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border-2 flex items-center justify-center text-xs font-bold"
                   style={{ borderColor: colors.border }}>
                {isApproved ? (
                  <span className="text-green-600">✓</span>
                ) : (
                  <span className="text-red-600">✕</span>
                )}
              </div>
            )}

            {/* Confidence badge */}
            <div className="absolute -top-2 -left-2 text-xs font-bold px-1.5 py-0.5 rounded bg-white border"
                 style={{ borderColor: colors.border, color: colors.border }}>
              {(entity.confidence * 100).toFixed(0)}%
            </div>

            {/* Hover tooltip */}
            <div className="absolute -top-16 left-0 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              <div className="font-semibold">{entity.type}</div>
              <div className="truncate max-w-xs">{entity.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EntityOverlay;
