'use client';

import React, { useEffect, useRef } from 'react';
import { useRedactionStore } from '@/stores/redactionStore';

interface Entity {
  id: string;
  text: string;
  label: string;
  start_pos: number;
  end_pos: number;
  confidence: number;
  isApproved?: boolean;
  isRejected?: boolean;
}

interface RedactionOverlayProps {
  entities: Entity[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoomLevel: number;
  onEntityClick?: (entityId: string) => void;
}

export const RedactionOverlay: React.FC<RedactionOverlayProps> = ({
  entities,
  containerRef,
  zoomLevel,
  onEntityClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const approvedEntityIds = useRedactionStore((state) => state.approvedEntityIds);
  const rejectedEntityIds = useRedactionStore((state) => state.rejectedEntityIds);

  // Estimate bounding boxes for entities based on text search
  const estimateEntityPositions = (): Map<string, { x: number; y: number; width: number; height: number }> => {
    const positions = new Map();
    
    // For a 600x800 PDF at standard size
    const PDF_WIDTH = 600;
    const PDF_HEIGHT = 800;
    const MARGIN = 20;
    const CHAR_WIDTH = 7;
    const LINE_HEIGHT = 14;
    const CHARS_PER_LINE = 80;

    entities.forEach((entity) => {
      // Calculate position based on character offset in document
      const charIndex = entity.start_pos;
      const row = Math.floor(charIndex / CHARS_PER_LINE);
      const col = charIndex % CHARS_PER_LINE;

      const x = MARGIN + col * CHAR_WIDTH;
      const y = MARGIN + row * LINE_HEIGHT;
      const width = Math.max(entity.text.length * CHAR_WIDTH, 40); // Min width
      const height = LINE_HEIGHT;

      positions.set(entity.id, { x, y, width, height });
    });

    return positions;
  };

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fixed size for the canvas (matches embed size)
    const PDF_WIDTH = 600;
    const PDF_HEIGHT = 800;
    
    canvas.width = PDF_WIDTH;
    canvas.height = PDF_HEIGHT;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get entity positions
    const positions = estimateEntityPositions();

    console.log('[RedactionOverlay] Drawing', entities.length, 'entities');

    // Draw entity boxes
    entities.forEach((entity) => {
      const pos = positions.get(entity.id);
      if (!pos) return;

      const isApproved = approvedEntityIds.has(entity.id);
      const isRejected = rejectedEntityIds.has(entity.id);

      // Determine color based on status
      let color: string;
      let opacity: number;

      if (isApproved) {
        color = '#10b981'; // Green
        opacity = 0.4;
      } else if (isRejected) {
        color = '#ef4444'; // Red
        opacity = 0.4;
      } else {
        color = '#f59e0b'; // Amber - pending
        opacity = 0.3;
      }

      // Draw filled rectangle
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      ctx.fillRect(pos.x, pos.y, pos.width, pos.height);

      // Draw border
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);

      // Draw label
      ctx.fillStyle = color;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(entity.label, pos.x + 3, pos.y + 11);
    });
  }, [entities, zoomLevel, approvedEntityIds, rejectedEntityIds]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Account for zoom
    const scaledX = x / (zoomLevel / 100);
    const scaledY = y / (zoomLevel / 100);

    // Get entity positions
    const positions = estimateEntityPositions();

    // Find clicked entity
    entities.forEach((entity) => {
      const pos = positions.get(entity.id);
      if (!pos) return;

      if (scaledX >= pos.x && scaledX <= pos.x + pos.width && 
          scaledY >= pos.y && scaledY <= pos.y + pos.height) {
        console.log('[RedactionOverlay] Clicked entity:', entity.id, entity.text);
        onEntityClick?.(entity.id);
      }
    });
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      className="absolute top-0 left-0 cursor-pointer"
      style={{
        width: '600px',
        height: '800px',
        zIndex: 10,
        pointerEvents: 'auto',
      }}
    />
  );
};
