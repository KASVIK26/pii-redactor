'use client';

import React, { useMemo, useState } from 'react';
import { Entity, EntityType } from '@/types/redaction';
import { useRedactionStore } from '@/stores/redactionStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Search, ChevronDown, AlertCircle, Check } from 'lucide-react';

interface EntityListSidebarProps {
  entities: Entity[];
  onEntitySelect?: (entity: Entity) => void;
}

const ENTITY_COLORS: Record<EntityType, { bg: string; text: string }> = {
  PERSON: { bg: 'bg-red-900/20', text: 'text-red-400' },
  DATE: { bg: 'bg-blue-900/20', text: 'text-blue-400' },
  ID: { bg: 'bg-green-900/20', text: 'text-green-400' },
  ORGANIZATION: { bg: 'bg-orange-900/20', text: 'text-orange-400' },
  EMAIL: { bg: 'bg-purple-900/20', text: 'text-purple-400' },
  PHONE: { bg: 'bg-pink-900/20', text: 'text-pink-400' },
  ADDRESS: { bg: 'bg-cyan-900/20', text: 'text-cyan-400' },
  CUSTOM: { bg: 'bg-violet-900/20', text: 'text-violet-400' },
};

interface EntityGroup {
  type: EntityType;
  entities: Entity[];
  approved: number;
  rejected: number;
}

export const EntityListSidebar: React.FC<EntityListSidebarProps> = ({ entities, onEntitySelect }) => {
  const [searchText, setSearchText] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<EntityType>>(new Set(['PERSON', 'DATE', 'ID']));
  const [manualListExpanded, setManualListExpanded] = useState(true);
  const approvedEntityIds = useRedactionStore((state) => state.approvedEntityIds);
  const rejectedEntityIds = useRedactionStore((state) => state.rejectedEntityIds);
  const manuallySelectedEntityIds = useRedactionStore((state) => state.manuallySelectedEntityIds);
  const toggleManualSelection = useRedactionStore((state) => state.toggleManualSelection);

  // Log when entities are received
  React.useEffect(() => {
    console.log(`[FRONTEND] EntityListSidebar received entities:`, {
      total: entities.length,
      sample: entities.slice(0, 3).map(e => ({ text: e.text?.substring(0, 20), type: e.type, conf: e.confidence }))
    })
  }, [entities])

  // Grouped entities for "Detected Entities by Type"
  const groupedEntities = useMemo(() => {
    const filtered = entities.filter((e) => !searchText || e.text.toLowerCase().includes(searchText.toLowerCase()));
    const groups = new Map<EntityType, Entity[]>();
    filtered.forEach((entity) => { if (!groups.has(entity.type)) { groups.set(entity.type, []); } groups.get(entity.type)!.push(entity); });
    const result: EntityGroup[] = [];
    groups.forEach((groupEntities, type) => {
      const approved = groupEntities.filter((e) => approvedEntityIds.has(e.id)).length;
      const rejected = groupEntities.filter((e) => rejectedEntityIds.has(e.id)).length;
      result.push({ type, entities: groupEntities.sort((a, b) => b.confidence - a.confidence), approved, rejected });
    });
    return result.sort((a, b) => b.entities.length - a.entities.length);
  }, [entities, searchText, approvedEntityIds.size, rejectedEntityIds.size]);

  // Get IDs of all grouped entities
  const groupedEntityIds = useMemo(() => {
    const ids = new Set<string>();
    groupedEntities.forEach((group) => {
      group.entities.forEach((entity) => {
        ids.add(entity.id);
      });
    });
    console.log(`[FRONTEND] EntityListSidebar grouped entity IDs:`, ids.size)
    return ids;
  }, [groupedEntities]);

  // Manual selection entities - NOT in grouped list AND confidence >= 50%
  const manualEntities = useMemo(() => {
    const filtered = entities.filter(
      (e) => !groupedEntityIds.has(e.id) && e.confidence >= 0.5
    );
    console.log(`[FRONTEND] EntityListSidebar manual entities:`, {
      total: filtered.length,
      sample: filtered.slice(0, 3).map(e => ({ text: e.text?.substring(0, 20), type: e.type, conf: e.confidence }))
    })
    return filtered;
  }, [entities, groupedEntityIds]);

  const toggleGroup = (type: EntityType) => {
    const newExpanded = new Set(expandedGroups);
    newExpanded.has(type) ? newExpanded.delete(type) : newExpanded.add(type);
    setExpandedGroups(newExpanded);
  };

  const totalApproved = Array.from(approvedEntityIds).filter((id) => entities.some((e) => e.id === id)).length;
  const totalRejected = Array.from(rejectedEntityIds).filter((id) => entities.some((e) => e.id === id)).length;
  const totalPending = entities.length - totalApproved - totalRejected;

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="border-b border-slate-800 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input placeholder="Search entities..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-gray-500" />
        </div>
      </div>

      <div className="border-b border-slate-800 px-4 py-3 bg-slate-800/50">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="text-center"><div className="text-green-400 font-semibold">{totalApproved}</div><div className="text-gray-500">Approved</div></div>
          <div className="text-center"><div className="text-yellow-400 font-semibold">{totalPending}</div><div className="text-gray-500">Pending</div></div>
          <div className="text-center"><div className="text-red-400 font-semibold">{totalRejected}</div><div className="text-gray-500">Rejected</div></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 p-3">
        {/* Detected Entities by Type Section */}
        {groupedEntities.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span className="text-sm">No entities found</span>
          </div>
        ) : (
          groupedEntities.map((group) => (
            <div key={`group-${group.type}`} className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/30">
              <button
                onClick={() => toggleGroup(group.type)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700 transition"
              >
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className="h-4 w-4 transition-transform"
                    style={{
                      transform: expandedGroups.has(group.type) ? 'rotate(0deg)' : 'rotate(-90deg)',
                    }}
                  />
                  <span className="font-semibold text-sm">{group.type}</span>
                  <span className="text-xs bg-slate-600 text-gray-300 px-2 py-0.5 rounded-full">
                    {group.entities.length}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {group.approved > 0 && (
                    <span className="bg-green-900/50 text-green-400 px-2 py-0.5 rounded">
                      ✓ {group.approved}
                    </span>
                  )}
                  {group.rejected > 0 && (
                    <span className="bg-red-900/50 text-red-400 px-2 py-0.5 rounded">
                      ✗ {group.rejected}
                    </span>
                  )}
                </div>
              </button>

              {expandedGroups.has(group.type) && (
                <div className="border-t border-slate-700 space-y-2 p-3 bg-slate-900/50">
                  {group.entities.map((entity, idx) => {
                    const isApproved = approvedEntityIds.has(entity.id);
                    const isRejected = rejectedEntityIds.has(entity.id);
                    return (
                      <div
                        key={`entity-${group.type}-${idx}-${entity.id}`}
                        className={`p-3 rounded border transition cursor-pointer ${
                          isApproved
                            ? 'border-green-600 bg-green-900/10'
                            : isRejected
                            ? 'border-red-600 bg-red-900/10'
                            : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/30'
                        }`}
                        onClick={() => onEntitySelect?.(entity)}
                      >
                        {/* Entity Text and Status */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-200 truncate">{entity.text}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{entity.method}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                            <div className="text-right">
                              <div className="text-xs font-bold text-amber-400">
                                {Math.round(entity.confidence * 100)}%
                              </div>
                            </div>
                            {isApproved && (
                              <div className="bg-green-900/60 text-green-300 text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                                ✓ OK
                              </div>
                            )}
                            {isRejected && (
                              <div className="bg-red-900/60 text-red-300 text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                                ✗ Skip
                              </div>
                            )}
                            {!isApproved && !isRejected && (
                              <div className="bg-slate-700 text-gray-400 text-xs px-2 py-0.5 rounded whitespace-nowrap">
                                Pending
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Confidence Bar */}
                        <div className="w-full bg-slate-700 rounded-full h-1 mb-3 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all"
                            style={{ width: `${entity.confidence * 100}%` }}
                          />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              useRedactionStore.getState().approveEntity(entity.id);
                            }}
                            className={`flex-1 px-3 py-2 rounded text-xs font-semibold transition flex items-center justify-center gap-1 ${
                              isApproved
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-slate-700 text-gray-300 hover:bg-green-600/30 hover:text-green-400 border border-slate-600'
                            }`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              useRedactionStore.getState().rejectEntity(entity.id);
                            }}
                            className={`flex-1 px-3 py-2 rounded text-xs font-semibold transition flex items-center justify-center gap-1 ${
                              isRejected
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-slate-700 text-gray-300 hover:bg-red-600/30 hover:text-red-400 border border-slate-600'
                            }`}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}

        {/* Choose Manually Section - Uncertain Entities (≥50% confidence, not in detected) */}
        {manualEntities.length > 0 && (
          <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/30">
            <button
              onClick={() => setManualListExpanded(!manualListExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-700 transition"
            >
              <div className="flex items-center gap-2">
                <ChevronDown
                  className="h-4 w-4 transition-transform"
                  style={{
                    transform: manualListExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                  }}
                />
                <span className="font-semibold text-sm text-yellow-400">⚠ Choose Manually</span>
                <span className="text-xs bg-yellow-900/50 text-yellow-300 px-2 py-0.5 rounded-full">
                  {manualEntities.length}
                </span>
              </div>
              <div className="text-xs bg-purple-900/50 text-purple-400 px-2 py-0.5 rounded">
                {Array.from(manuallySelectedEntityIds).filter((id) => manualEntities.some((e) => e.id === id)).length} selected
              </div>
            </button>

            {manualListExpanded && (
              <div className="border-t border-slate-700 space-y-2 p-3 bg-slate-900/50">
                <p className="text-xs text-gray-400 mb-2 italic">
                  Additional PII detected with confidence ≥50% (not in standard categories)
                </p>
                {manualEntities.map((entity, idx) => {
                  const isSelected = manuallySelectedEntityIds.has(entity.id);

                  return (
                    <div
                      key={`manual-${entity.id}-${idx}`}
                      onClick={() => toggleManualSelection(entity.id)}
                      className={`p-2 rounded border transition cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-yellow-900/40 border-yellow-600 hover:bg-yellow-900/50'
                          : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Check
                          className={`h-4 w-4 flex-shrink-0 transition ${
                            isSelected ? 'text-yellow-400' : 'text-slate-600'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-100 truncate">{entity.text}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-xs bg-slate-700 text-gray-400 px-1.5 py-0.5 rounded">
                              {entity.type}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-yellow-300 bg-slate-700 rounded px-2 py-0.5 ml-2 flex-shrink-0">
                        {Math.round(entity.confidence * 100)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EntityListSidebar;