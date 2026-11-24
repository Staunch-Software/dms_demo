import * as React from 'react';
import type VesselEmail from '../VesselEmail';
import type { OcrStagingItem, DocumentCategory, TagFieldDef } from '../types/ui';
import { isMobileWidth, isTabletWidth } from '../responsive';
import { clay } from '../clayTheme';
import { Icon } from '@fluentui/react/lib/Icon';
import { DMS_TABLE_CARD, DMS_TABLE, DMS_TH, DMS_TR, DMS_TD, DMS_TD_NAME, DMS_NAME_CELL, dmsBtn, dmsControlStyle, dmsTone, DmsTone } from '../dmsDesignSystem';

// ── Production Term Store Taxonomy ───────────────────────────────────────────
export const PRODUCTION_VESSELS: string[] = [
  "Belle Lune", "Bow Fighter", "Bow Fraternity", "Cameroun Express", "Cecilie F",
  "Cote D Ivoire Express", "Dutches Emerald", "Ghana Express", "Lignum Grid",
  "Lignum Mesh", "Lignum Web", "Maersk EI Banco", "Maersk EI Palomar",
  "Maersk Ferrato", "Maersk Finisterre", "Maersk Frio", "Norse Evolution",
  "Norse Ijmuiden", "Norse New Haven", "Peissy", "Potiniere", "Senegal Express",
  "Snow Flake", "Snow Flower"
];

export const DRAWING_TAXONOMY: Record<string, string[]> = {
  "Basic": [
    "Basic Drawings", "Capacity Plan & Dead Weight", "Damage Control Plan",
    "Docking Plan", "EEDI Technical file", "Emergency Towing Booklet",
    "General Arrangement", "Loading Manual", "Ship Structure Access Manuals",
    "Trim & Stability Information"
  ],
  "Electrical": [
    "Electrical Drawings", "Emergency Switchboard Arrangement",
    "Main Switchboard Arrangement", "Power Distribution Diagram", "Single Line Diagram"
  ],
  "Hull": [
    "Bulkhead plans", "Cargo Securing Manual", "Container Stowage Plan",
    "Hull Drawings", "Makers List of Hull parts", "Midship Section",
    "Mooring Arrangement", "Painting Schedule", "Profile & Deck Plan",
    "Results of Official Sea Trial", "Rudder and Rudder stock",
    "Shell Expansion", "Superstructure"
  ],
  "Machinery": [
    "Arrangement of Engine Room", "Machinery Drawings", "Machinery Makers List",
    "Machinery Particulars", "Pipeline Diagram", "Shafting Arrangements",
    "Stern Tube", "Test Record of Official Sea Trial", "Other Drawings"
  ],
  "Safety": [
    "Fire Control Plan", "Life Saving Appliances Plan", "Safety Drawings"
  ],
  "Archive": [
    "Archive"
  ]
};

export const MANUAL_TAXONOMY: Record<string, string[]> = {
  "Automation": ["Alarm Monitoring System", "Engine Control System"],
  "Auxiliary Engine": ["Operation & Maintenance Manual"],
  "Boiler": ["Operation & Maintenance Manual"],
  "Bridge Equipments": ["Bridge Equipments"],
  "Cargo": [
    "Ballast System Manual", "Cargo Crane Manual", "Cargo Pump Manual",
    "COW Manual", "Hatch Cover Manual", "IG System Manual", "ODME Manual"
  ],
  "Deck Machinery": ["Mooring Winch Manual", "Windlass Manual"],
  "Electrical": ["Main Switchboard Manual", "Power Management System"],
  "Main Engine": ["Operation & Maintenance Manual", "Other Manuals"],
  "Pollution": [
    "BWTS Manual", "EGR System Manual", "Exhaust Gas Scrubber Manual",
    "Incinerator Manual", "OWS Manual", "SCR System Manual", "Sewage Treatment Plant Manual"
  ],
  "Propulsion": ["Shaft Generator Manual"],
  "Refrigeration": ["AC Plant Manual"],
  "Safety": [
    "CO2 System Manual", "Emergency Generator Manual",
    "Fire Alarm Manual", "Fire Detection System Manual"
  ],
  "Shafting": ["CPP Manual", "Stern Tube Manual"],
  "Steering Gear": ["Maintenance Manual", "Operation Manual"],
  "Thrusters": ["Operation & Maintenance Manual"],
  "To Be Classified": ["To Be Classified"]
};

// ── Confidence Floor ─────────────────────────────────────────────────────────
export const VESSEL_CONFIDENCE_FLOOR = 0.60;

// Helper to safely extract field values and confidence
export function getFieldData(tags: any, fieldKey: string): { value: string; confidence: number; tier: number } {
  if (!tags) return { value: '', confidence: 0, tier: 2 };
  const raw = tags[fieldKey];
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const conf = typeof raw.confidence === 'number' ? raw.confidence : 0;
    const rawVal = String(raw.value || '');
    // If field is 'vessel' and confidence is below floor (0.60), treat value as blank
    const val = (fieldKey === 'vessel' && conf < VESSEL_CONFIDENCE_FLOOR) ? '' : rawVal;
    return {
      value: val,
      confidence: conf,
      tier: raw.tier === 1 ? 1 : 2,
    };
  }
  if (typeof raw === 'string') {
    return { value: raw, confidence: 0.88, tier: 1 };
  }
  return { value: '', confidence: 0, tier: 2 };
}

// Format timestamp for OCR scan time display
export function formatScannedTime(ts?: string | number | null): string {
  if (!ts) return 'Just now';
  try {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(String(ts));
    if (isNaN(d.getTime())) return String(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

// Small badge for rendering per-field confidence and tier
export const FieldConfidenceBadge: React.FC<{ confidence: number; tier?: number }> = ({ confidence, tier }) => {
  if (confidence <= 0) return null;
  const pct = Math.round(confidence * 100);
  const isHigh = confidence >= 0.85;
  const isMed = confidence >= 0.60 && confidence < 0.85;

  const tone: DmsTone = isHigh ? 'success' : isMed ? 'warning' : 'danger';
  const { bg, fg: color } = dmsTone(tone);

  return (
    <span
      title={`Tier ${tier || 2} Extraction: ${pct}% Confidence (${isHigh ? 'High Confidence' : 'Review Recommended'})`}
      className="ocr-staging-queue-i1" style={{ background: bg, color: color, border: `1px solid ${color}` }}
    >
      <Icon iconName="CircleFill" aria-hidden="true" className="ocr-staging-queue-i2" />
      {pct}%
    </span>
  );
};

interface OcrStagingQueueProps {
  host: VesselEmail;
  categories: DocumentCategory[];
  onRefreshCategories: () => void;
}

export const OcrStagingQueue: React.FC<OcrStagingQueueProps> = ({ host, categories, onRefreshCategories }) => {
  const [items, setItems] = React.useState<OcrStagingItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  // Queue tabs: 'staged' = ready-for-review, 'unstaged' = needs_review (unclassifiable)
  const [activeQueueTab, setActiveQueueTab] = React.useState<'staged' | 'unstaged'>('staged');

  // Filters
  const [filterSource, setFilterSource] = React.useState<'all' | 'folder' | 'direct'>('all');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Edit dialog state
  const [editingItem, setEditingItem] = React.useState<OcrStagingItem | null>(null);
  const [selectedCatId, setSelectedCatId] = React.useState<number | null>(null);
  const [editTags, setEditTags] = React.useState<Record<string, any>>({});
  const [isSavingEdit, setIsSavingEdit] = React.useState<boolean>(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  // ── "Which vessel is this?" Single-Item Action Prompt State (Option A) ──────
  const [vesselPromptItem, setVesselPromptItem] = React.useState<{ item: OcrStagingItem; action: 'promote' | 'move' } | null>(null);
  const [promptVesselChoice, setPromptVesselChoice] = React.useState<string>('');
  const [isCreatingNewVesselInline, setIsCreatingNewVesselInline] = React.useState<boolean>(false);
  const [newVesselInput, setNewVesselInput] = React.useState<string>('');
  const [isSavingPrompt, setIsSavingPrompt] = React.useState<boolean>(false);
  const [promptError, setPromptError] = React.useState<string | null>(null);

  // ── Batch Vessel Assignment State for Needs Review Tab (Option 4b) ──────────
  const [selectedUnstagedIds, setSelectedUnstagedIds] = React.useState<number[]>([]);
  const [batchModalOpen, setBatchModalOpen] = React.useState<boolean>(false);
  const [batchVesselChoice, setBatchVesselChoice] = React.useState<string>('');
  const [batchPromoteImmediately, setBatchPromoteImmediately] = React.useState<boolean>(true);
  const [isApplyingBatch, setIsApplyingBatch] = React.useState<boolean>(false);
  const [batchError, setBatchError] = React.useState<string | null>(null);

  // Promoting unstaged -> staged
  const [promotingIds, setPromotingIds] = React.useState<Record<number, boolean>>({});

  // Action loading state (item id -> boolean)
  const [movingIds, setMovingIds] = React.useState<Record<number, boolean>>({});
  const [actionSuccess, setActionSuccess] = React.useState<{ id: number; message: string; path?: string; warning?: string } | null>(null);

  const fetchQueue = React.useCallback(async (showSpinner: boolean = false) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const base = host._base();
      const res = await fetch(`${base}/api/ocr/staging`, { headers: host._headers() });
      if (!res.ok) {
        throw new Error(`Failed to load staging queue (status ${res.status})`);
      }
      const data: OcrStagingItem[] = await res.json();
      setItems(data);
      void host._syncPendingVesselSuggestionsFromStaging(data, host.state.view === 'templates');
      // Count only staged items for the badge
      const stagedCount = data.filter(i => i.status !== 'needs_review').length;
      if (host.state.ocrStagingCount !== stagedCount) {
        host.setState({ ocrStagingCount: stagedCount });
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching staging items');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [host]);

  // Initial load & polling every 8s
  React.useEffect(() => {
    void fetchQueue(true);
    const interval = window.setInterval(() => {
      void fetchQueue(false);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [fetchQueue]);

  React.useEffect(() => {
    const hint = host.state.ocrQueueTabHint;
    if (!hint) return;
    setActiveQueueTab(hint);
    host.setState({ ocrQueueTabHint: null });
  }, [host, host.state.ocrQueueTabHint]);

  // Open Edit Dialog
  const handleOpenEdit = (item: OcrStagingItem) => {
    setEditingItem(item);
    const initialCatId = item.category_id || (categories.length > 0 ? categories[0].id : null);
    setSelectedCatId(initialCatId);
    
    // Normalize edit tags from either per-field objects or flat strings
    const rawTags = item.suggested_tags || {};
    const initialTags: Record<string, string> = {};
    for (const key of ['category', 'group', 'sub_category', 'vessel', 'department']) {
      const fieldData = getFieldData(rawTags, key);
      initialTags[key] = fieldData.value;
    }
    const vData = getFieldData(rawTags, 'vessel');
    if (!initialTags.category && initialCatId) {
      const cat = categories.find(c => c.id === initialCatId);
      if (cat) initialTags.category = cat.name;
    }
    setEditTags(initialTags);
    setEditError(null);
  };

  // Active category definition in edit modal
  const activeCategory = React.useMemo(() => {
    return categories.find(c => c.id === selectedCatId) || null;
  }, [categories, selectedCatId]);

  // Resolved dynamic path preview in edit modal: folder ends at Category level
  const livePreviewPath = React.useMemo(() => {
    if (!activeCategory) return '';
    let templateStr = activeCategory.dms_path_template || 'Technical & Crewing/{vessel}/Drawings and Manuals/{group}/{category}';
    templateStr = templateStr.replace(/\/\{sub_?category\}/gi, '');
    let path = templateStr;
    for (const [k, v] of Object.entries(editTags)) {
      path = path.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v || '').trim());
    }
    path = path.replace(/\{[a-z0-9_]+\}/g, '');
    path = path.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
    return path;
  }, [activeCategory, editTags]);

  // Save edited tags
  const handleSaveTags = async () => {
    if (!editingItem) return;
    setIsSavingEdit(true);
    setEditError(null);
    try {
      const base = host._base();
      const res = await fetch(`${base}/api/ocr/staging/${editingItem.id}/tags`, {
        method: 'PATCH',
        headers: host._headers(),
        body: JSON.stringify({
          category_id: selectedCatId,
          suggested_tags: editTags,
        }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Failed to update tags (status ${res.status})`);
      }
      setEditingItem(null);
      void fetchQueue(false);
    } catch (err: any) {
      setEditError(err?.message || 'Failed to save tags.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Move to SharePoint (with prompt if vessel is missing)
  const handleMoveItem = async (item: OcrStagingItem, overrideVessel?: string) => {
    const vData = getFieldData(item.suggested_tags, 'vessel');
    const vesselVal = overrideVessel || (vData.confidence >= VESSEL_CONFIDENCE_FLOOR ? vData.value : '');

    // If vessel is undetected/blank, prompt user first (Option A)
    if (!vesselVal) {
      setPromptVesselChoice('');
      setPromptError(null);
      setIsCreatingNewVesselInline(false);
      setNewVesselInput('');
      setVesselPromptItem({ item, action: 'move' });
      return;
    }

    setMovingIds(prev => ({ ...prev, [item.id]: true }));
    setActionSuccess(null);
    try {
      const base = host._base();
      const res = await fetch(`${base}/api/ocr/staging/${item.id}/move`, {
        method: 'POST',
        headers: host._headers(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Move failed with status ${res.status}`);
      }
      const data = await res.json();
      const metadataPatch = data?.metadata_patch;
      const metadataWarning = metadataPatch
        ? metadataPatch.partial_success
          ? `Metadata patch warning: ${metadataPatch.vessel_rest_error?.error || metadataPatch.warning || metadataPatch.error || metadataPatch.reason || 'Some OCR tags were not saved.'}`
          : metadataPatch.ok === false
            ? `Metadata patch warning: ${metadataPatch.error || metadataPatch.reason || 'Columns were not updated.'}`
            : undefined
        : undefined;

      setActionSuccess({
        id: item.id,
        message: `Successfully filed "${item.filename}" into SharePoint Online!`,
        path: data.target_path,
        warning: metadataWarning,
      });
      // Refresh vessel files in state
      if (vesselVal) {
        void host._mergeLiveSharePointFiles([vesselVal]).catch(() => undefined);
      }
      void fetchQueue(false);
    } catch (err: any) {
      alert(`Move error: ${err?.message || 'Could not relocate file in SharePoint'}`);
    } finally {
      setMovingIds(prev => ({ ...prev, [item.id]: false }));
    }
  };

  // Promote a needs_review item to tag_suggested (with prompt if vessel is missing)
  const handlePromoteToStaged = async (item: OcrStagingItem, overrideVessel?: string) => {
    const vData = getFieldData(item.suggested_tags, 'vessel');
    const vesselVal = overrideVessel || (vData.confidence >= VESSEL_CONFIDENCE_FLOOR ? vData.value : '') || '';

    // If vessel is undetected/blank, prompt user first (Option A)
    if (!vesselVal) {
      setPromptVesselChoice('');
      setPromptError(null);
      setIsCreatingNewVesselInline(false);
      setNewVesselInput('');
      setVesselPromptItem({ item, action: 'promote' });
      return;
    }

    setPromotingIds(prev => ({ ...prev, [item.id]: true }));
    try {
      const base = host._base();
      const res = await fetch(`${base}/api/ocr/staging/${item.id}/stage`, {
        method: 'POST',
        headers: host._headers(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Promote failed (status ${res.status})`);
      }
      setActiveQueueTab('staged');
      void fetchQueue(false);
    } catch (err: any) {
      alert(`Could not promote to staging: ${err?.message}`);
    } finally {
      setPromotingIds(prev => ({ ...prev, [item.id]: false }));
    }
  };

  // Confirm single-item vessel prompt (Option A)
  const handleConfirmVesselPrompt = async () => {
    if (!vesselPromptItem) return;
    let vesselToSet = promptVesselChoice.trim();
    if (isCreatingNewVesselInline) {
      vesselToSet = newVesselInput.trim();
      if (!vesselToSet) {
        setPromptError('Please enter a vessel name.');
        return;
      }
      try {
        const base = host._base();
        const createRes = await fetch(`${base}/api/vessels`, {
          method: 'POST',
          headers: host._headers(),
          body: JSON.stringify({ name: vesselToSet, vessel_type: 'Other' }),
        });
        if (createRes.ok) {
          const createdVessel = await createRes.json();
          if (createdVessel && createdVessel.id) {
            host.setState(prev => ({
              vessels: [...(prev.vessels || []), createdVessel],
            }));
          }
        }
      } catch (err) {
        // Proceed even if cache sync delay
      }
    }
    if (!vesselToSet) {
      setPromptError('Please select or enter a vessel name.');
      return;
    }

    setIsSavingPrompt(true);
    setPromptError(null);
    try {
      const base = host._base();
      const rawTags = vesselPromptItem.item.suggested_tags || {};
      const updatedTags: Record<string, any> = {};
      for (const k of ['group', 'category', 'sub_category', 'department']) {
        updatedTags[k] = getFieldData(rawTags, k).value;
      }
      updatedTags.vessel = vesselToSet;

      const patchRes = await fetch(`${base}/api/ocr/staging/${vesselPromptItem.item.id}/tags`, {
        method: 'PATCH',
        headers: host._headers(),
        body: JSON.stringify({
          category_id: vesselPromptItem.item.category_id,
          suggested_tags: updatedTags,
        }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        throw new Error(err.detail || `Failed to assign vessel (status ${patchRes.status})`);
      }

      const currentItem = vesselPromptItem.item;
      const action = vesselPromptItem.action;
      setVesselPromptItem(null);

      if (action === 'promote') {
        await handlePromoteToStaged(currentItem, vesselToSet);
      } else if (action === 'move') {
        await handleMoveItem(currentItem, vesselToSet);
      } else {
        void fetchQueue(false);
      }
    } catch (err: any) {
      setPromptError(err?.message || 'Error assigning vessel.');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  // Apply batch vessel assignment to selected Needs Review items (Option 4b)
  const handleApplyBatchVessel = async () => {
    if (!selectedUnstagedIds.length) return;
    const vesselToSet = batchVesselChoice.trim();
    if (!vesselToSet) {
      setBatchError('Please select a vessel name.');
      return;
    }
    setIsApplyingBatch(true);
    setBatchError(null);
    try {
      const base = host._base();
      for (const itemId of selectedUnstagedIds) {
        const item = items.find(i => i.id === itemId);
        if (!item) continue;
        const rawTags = item.suggested_tags || {};
        const updatedTags: Record<string, any> = {};
        for (const k of ['group', 'category', 'sub_category', 'department']) {
          updatedTags[k] = getFieldData(rawTags, k).value;
        }
        updatedTags.vessel = vesselToSet;

        await fetch(`${base}/api/ocr/staging/${itemId}/tags`, {
          method: 'PATCH',
          headers: host._headers(),
          body: JSON.stringify({
            category_id: item.category_id,
            suggested_tags: updatedTags,
          }),
        });

        if (batchPromoteImmediately) {
          await fetch(`${base}/api/ocr/staging/${itemId}/stage`, {
            method: 'POST',
            headers: host._headers(),
          });
        }
      }

      setBatchModalOpen(false);
      setSelectedUnstagedIds([]);
      if (batchPromoteImmediately) {
        setActiveQueueTab('staged');
      }
      void fetchQueue(false);
    } catch (err: any) {
      setBatchError(err?.message || 'Failed to apply batch vessel assignment.');
    } finally {
      setIsApplyingBatch(false);
    }
  };

  // Dismiss item
  const handleDismissItem = async (item: OcrStagingItem) => {
    if (!window.confirm(`Dismiss "${item.filename}" from the review queue?`)) return;
    try {
      const base = host._base();
      await fetch(`${base}/api/ocr/staging/${item.id}`, {
        method: 'DELETE',
        headers: host._headers(),
      });
      void fetchQueue(false);
    } catch (err: any) {
      alert(`Failed to dismiss: ${err?.message}`);
    }
  };

  // Split all items into staged and unstaged
  const stagedItems = React.useMemo(() => {
    return items.filter(item => item.status !== 'needs_review');
  }, [items]);

  const unstagedItems = React.useMemo(() => {
    return items.filter(item => item.status === 'needs_review');
  }, [items]);

  // Apply source + search filters
  const applyFilters = (list: OcrStagingItem[]) => list.filter(item => {
    if (filterSource !== 'all' && item.upload_source !== filterSource) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.filename.toLowerCase().includes(q);
      const matchVessel = (item.vessel_name || '').toLowerCase().includes(q);
      const matchCat = (item.category_name || '').toLowerCase().includes(q);
      if (!matchName && !matchVessel && !matchCat) return false;
    }
    return true;
  });

  const filteredStaged = React.useMemo(() => applyFilters(stagedItems), [stagedItems, filterSource, searchQuery]);
  const filteredUnstaged = React.useMemo(() => applyFilters(unstagedItems), [unstagedItems, filterSource, searchQuery]);
  // Backward compat — filteredItems is whichever tab is active
  const filteredItems = activeQueueTab === 'staged' ? filteredStaged : filteredUnstaged;
  const viewportWidth = host.state.windowWidth || (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const isMobile = isMobileWidth(viewportWidth);
  const isTablet = isTabletWidth(viewportWidth);
  const unidentifiedNamesLower = React.useMemo(
    () => new Set((host.state.ocrUnidentifiedFiles || []).map(n => (n || '').trim().toLowerCase()).filter(Boolean)),
    [host.state.ocrUnidentifiedFiles]
  );
  const unidentifiedRows = React.useMemo(
    () => filteredUnstaged.filter(item => unidentifiedNamesLower.has((item.filename || '').trim().toLowerCase())),
    [filteredUnstaged, unidentifiedNamesLower]
  );
  const unidentifiedFileNames = React.useMemo(
    () => Array.from(new Set(unidentifiedRows.map(item => (item.filename || '').trim()).filter(Boolean))),
    [unidentifiedRows]
  );

  const vesselOptions = React.useMemo(() => {
    const list = [...PRODUCTION_VESSELS, ...(host.state.vessels || []).map(v => v.name).filter(Boolean)];
    return Array.from(new Set(list)).sort();
  }, [host.state.vessels]);

  // Derived list of unstaged files that have no vessel assigned
  const unstagedMissingVessel = React.useMemo(() => {
    return filteredUnstaged.filter(item => {
      const vData = getFieldData(item.suggested_tags, 'vessel');
      return !vData.value && !item.vessel_name;
    });
  }, [filteredUnstaged]);

  const pendingCreateSuggestions = React.useMemo(
    () => (host.state.pendingVesselSuggestions || []).filter(s => !s.matchedExisting),
    [host.state.pendingVesselSuggestions]
  );

  return (
    <div className="ocr-staging-queue-i3">
      {pendingCreateSuggestions.length > 0 && (
        <div className="ocr-staging-queue-i4" style={{ background: dmsTone('success').bg, border: `1px solid ${clay.accentSoft}`, borderRadius: clay.radiusCard, boxShadow: clay.shadowRaised }}>
          <div className="ocr-staging-queue-i5" style={{ minWidth: 0 }}>
            <Icon iconName="Robot" aria-hidden="true" className="ocr-staging-queue-i6" />
            <div style={{ minWidth: 0 }}>
              <div className="ocr-staging-queue-i7" style={{ color: dmsTone('success').fg }}>
                New vessel suggestion{pendingCreateSuggestions.length > 1 ? 's' : ''} detected from OCR
              </div>
              <div className="ocr-staging-queue-i8" style={{ color: dmsTone('success').fg }}>
                {pendingCreateSuggestions.length} candidate{pendingCreateSuggestions.length > 1 ? 's' : ''}: {pendingCreateSuggestions.slice(0, 3).map(s => s.vesselName || 'Unnamed').join(', ')}{pendingCreateSuggestions.length > 3 ? ' ...' : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => host._openSuggestedVesselsFromSidebar()}
            style={dmsBtn('primary')}
          >
            Review / Create Vessel
          </button>
        </div>
      )}

      {/* Staged / Unstaged Tab Strip */}
      <div className="ocr-staging-queue-i9" style={{ borderBottom: `2px solid ${clay.accentSoft}` }}>
        {[
          { key: 'staged' as const, label: <><Icon iconName="ClipboardList" aria-hidden="true" className="ocr-staging-queue-i10" /> Staging Queue</>, count: stagedItems.length, color: clay.accentDark, bg: clay.accentSoft },
          { key: 'unstaged' as const, label: <><Icon iconName="Warning" aria-hidden="true" className="ocr-staging-queue-i10" /> Needs Review</>, count: unstagedItems.length, color: dmsTone('warning').fg, bg: dmsTone('warning').bg },
        ].map(tab => {
          const isActive = activeQueueTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveQueueTab(tab.key);
                setSelectedUnstagedIds([]);
              }}
              className="ocr-staging-queue-i11" style={{ background: isActive ? clay.surfaceRaised : 'transparent', color: isActive ? tab.color : clay.textMuted, borderBottom: isActive ? `3px solid ${tab.color}` : '3px solid transparent', transition: 'all 0.15s', boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.8)' : 'none' }}
            >
              {tab.label}
              <span className="ocr-staging-queue-i12" style={{ minWidth: 22, background: tab.count > 0 ? (isActive ? tab.color : tab.bg) : 'var(--vdms-surface-alt)', color: tab.count > 0 ? (isActive ? clay.surface : tab.color) : 'var(--vdms-text-faint)' }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Unstaged area notice */}
      {activeQueueTab === 'unstaged' && (
        <div className="ocr-staging-queue-i13" style={{ background: dmsTone('warning').bg, border: `1px solid ${clay.accentSoft}`, borderRadius: 10, color: dmsTone('warning').fg }}>
          <Icon iconName="Warning" aria-hidden="true" className="ocr-staging-queue-i14" />
          <div>
            <strong>Unstaged files — manual classification required.</strong>
            <div className="ocr-staging-queue-i15">
              These files could not be automatically classified because the vessel could not be identified, text extraction failed, or overall confidence was below the minimum threshold.
              Use the <strong>Edit</strong> button to set the correct Vessel, Group, Category and Sub-Category, or assign vessels in bulk below, then click <strong>Move to Staging</strong> to promote the file to the review queue.
            </div>
          </div>
        </div>
      )}

      {activeQueueTab === 'unstaged' && unidentifiedFileNames.length > 0 && (
        <div className="ocr-staging-queue-i16" style={{ background: dmsTone('danger').bg, border: `1px solid ${clay.accentSoft}`, borderRadius: 10, color: dmsTone('danger').fg }}>
          <div className="ocr-staging-queue-i17">Vessel name not identified files</div>
          <div className="ocr-staging-queue-i18">
            These uploaded files could not be mapped to a vessel during OCR extraction and are listed here for manual review.
          </div>
          <div className="ocr-staging-queue-i19">
            {unidentifiedFileNames.slice(0, 8).map(name => (
              <div key={name} className="ocr-staging-queue-i20" style={{ color: dmsTone('danger').fg }}>
                • {name}
              </div>
            ))}
            {unidentifiedFileNames.length > 8 && (
              <div className="ocr-staging-queue-i21" style={{ color: dmsTone('danger').fg }}>+{unidentifiedFileNames.length - 8} more file(s)</div>
            )}
          </div>
        </div>
      )}

      {/* ── Sticky Batch Vessel Assignment Toolbar on Needs Review Tab (Option 4b) ── */}
      {activeQueueTab === 'unstaged' && filteredUnstaged.length > 0 && (
        <div className="ocr-staging-queue-i22" style={{ background: clay.surfaceRaised, border: `1px solid ${clay.accentSoft}`, borderRadius: 12, boxShadow: clay.shadowRaised }}>
          <div className="ocr-staging-queue-i23">
            <Icon iconName="Ferry" aria-hidden="true" className="ocr-staging-queue-i6" />
            <div>
              <div className="ocr-staging-queue-i24" style={{ color: clay.text }}>
                {selectedUnstagedIds.length > 0 ? (
                  <span><Icon iconName="CheckMark" aria-hidden="true" className="ocr-staging-queue-i10" /> {selectedUnstagedIds.length} of {filteredUnstaged.length} file{filteredUnstaged.length > 1 ? 's' : ''} selected</span>
                ) : unstagedMissingVessel.length > 0 ? (
                  <span>{unstagedMissingVessel.length} file{unstagedMissingVessel.length > 1 ? 's' : ''} missing vessel assignment</span>
                ) : (
                  <span>Bulk Vessel Assignment</span>
                )}
              </div>
              <div className="ocr-staging-queue-i25" style={{ color: clay.textMuted }}>
                Select files to assign a vessel in bulk and optionally promote directly to the Staging Queue
              </div>
            </div>
          </div>

          <div className="ocr-staging-queue-i26">
            {unstagedMissingVessel.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedUnstagedIds(unstagedMissingVessel.map(i => i.id));
                }}
                style={dmsBtn('secondary')}
              >
                Select All Missing Vessel ({unstagedMissingVessel.length})
              </button>
            )}

            {selectedUnstagedIds.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setBatchVesselChoice('');
                    setBatchError(null);
                    setBatchModalOpen(true);
                  }}
                  style={dmsBtn('primary')}
                >
                  <span><Icon iconName="Ferry" aria-hidden="true" className="ocr-staging-queue-i27" /> Assign Vessel ({selectedUnstagedIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUnstagedIds([])}
                  style={dmsBtn('ghost')}
                >
                  Clear Selection
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedUnstagedIds(filteredUnstaged.map(i => i.id))}
                style={dmsBtn('secondary')}
              >
                Select All ({filteredUnstaged.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Banner / Filter Bar */}
      <div className="ocr-staging-queue-i28" style={{ background: clay.surfaceRaised, borderRadius: clay.radiusCard, border: `1px solid ${clay.accentSoft}`, boxShadow: clay.shadowRaised }}>
        <div className="ocr-staging-queue-i23">
          <span className="ocr-staging-queue-i24" style={{ color: clay.textMuted }}>Filter Source:</span>
          {(['all', 'folder', 'direct'] as const).map(src => (
            <button
              key={src}
              type="button"
              onClick={() => setFilterSource(src)}
              className="ocr-staging-queue-i29" style={{ borderColor: filterSource === src ? clay.accent : clay.accentSoft, background: filterSource === src ? clay.accentSoft : clay.surface, color: filterSource === src ? clay.accentDark : clay.textMuted, transition: 'all 0.15s' }}
            >
              {src === 'all' ? `All (${filteredItems.length})` : src === 'folder' ? <><Icon iconName="FabricFolder" aria-hidden="true" className="ocr-staging-queue-i27" /> Folder Uploads</> : <><Icon iconName="Page" aria-hidden="true" className="ocr-staging-queue-i27" /> Direct Uploads</>}
            </button>
          ))}
        </div>

        <div className="ocr-staging-queue-i5" style={{ width: isMobile ? '100%' : 'auto' }}>
          <input
            type="text"
            placeholder="Search filename or vessel..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ ...dmsControlStyle(), width: isMobile ? '100%' : 220 }}
          />
          <button
            type="button"
            onClick={() => void fetchQueue(true)}
            style={dmsBtn('secondary')}
          >
            <Icon iconName="Refresh" aria-hidden="true" className="ocr-staging-queue-i27" /> Refresh
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {actionSuccess && (
        <div className="ocr-staging-queue-i30" style={{ background: dmsTone('success').bg, border: `1px solid ${clay.pillActiveBg}`, borderRadius: clay.radiusCard, color: dmsTone('success').fg, boxShadow: clay.shadowRaised }}>
          <div>
            <strong><Icon iconName="CheckMark" aria-hidden="true" className="ocr-staging-queue-i10" /> {actionSuccess.message}</strong>
            {actionSuccess.path && (
              <div className="ocr-staging-queue-i31" style={{ fontFamily: 'monospace', color: dmsTone('success').fg }}>
                <Icon iconName="FabricFolder" aria-hidden="true" className="ocr-staging-queue-i32" /> Destination: {actionSuccess.path}
              </div>
            )}
            {actionSuccess.warning && (
              <div className="ocr-staging-queue-i33" style={{ color: dmsTone('warning').fg }}>
                <Icon iconName="Warning" aria-hidden="true" className="ocr-staging-queue-i32" /> {actionSuccess.warning}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="ocr-staging-queue-i34" style={{ color: dmsTone('success').fg }}
          >
            <Icon iconName="Cancel" aria-hidden="true" className="ocr-staging-queue-i10" />
          </button>
        </div>
      )}

      {/* Queue Table */}
      <div style={{ ...DMS_TABLE_CARD, borderRadius: clay.radiusCard, border: `1px solid ${clay.accentSoft}` }}>
        {loading && items.length === 0 ? (
          <div className="ocr-staging-queue-i35" style={{ color: clay.textMuted }}>
            <Icon iconName="Sync" aria-hidden="true" className="ocr-staging-queue-i36" /> Loading OCR staging queue...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="ocr-staging-queue-i37">
            <div className="ocr-staging-queue-i38"><Icon iconName="Completed" aria-hidden="true" className="ocr-staging-queue-i39" /></div>
            <div className="ocr-staging-queue-i40" style={{ color: clay.text }}>No Documents Pending Review</div>
            <div className="ocr-staging-queue-i41" style={{ color: clay.textMuted }}>
              When folders or single files are uploaded, they sit here for AI auto-tagging and user verification.
            </div>
          </div>
        ) : isMobile ? (
          <div className="ocr-staging-queue-i42">
            {filteredItems.map(item => {
              const isMoving = !!movingIds[item.id];
              const isPending = item.status === 'ocr_pending';
              const confidence = item.confidence || 0;
              const tags = item.suggested_tags || {};
              const catData = getFieldData(tags, 'category');
              const groupData = getFieldData(tags, 'group');
              const subCatData = getFieldData(tags, 'sub_category');
              const vesselData = getFieldData(tags, 'vessel');
              const catVal = catData.value || item.category_name || 'Drawing';
              const groupVal = groupData.value || '—';
              const subCatVal = subCatData.value || '—';
              // Strictly apply confidence floor to vessel value
              const vesselConfident = vesselData.confidence >= VESSEL_CONFIDENCE_FLOOR;
              const vesselVal = (vesselConfident ? (vesselData.value || item.vessel_name) : '') || '';

              const isSelected = selectedUnstagedIds.includes(item.id);

              return (
                <div key={item.id} className="ocr-staging-queue-i43" style={{ border: isSelected ? `2px solid ${clay.accent}` : `1px solid ${clay.accentSoft}`, borderRadius: 12, background: isSelected ? clay.surfaceRaised : clay.surface }}>
                  <div className="ocr-staging-queue-i44">
                    <div className="ocr-staging-queue-i45" style={{ color: clay.text }}>{item.filename}</div>
                    {activeQueueTab === 'unstaged' && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedUnstagedIds(prev => [...prev, item.id]);
                          } else {
                            setSelectedUnstagedIds(prev => prev.filter(id => id !== item.id));
                          }
                        }}
                        className="ocr-staging-queue-i46" style={{ width: 18 }}
                      />
                    )}
                  </div>
                  <div className="ocr-staging-queue-i47">
                    <span className="ocr-staging-queue-i48" style={{ borderRadius: 12, background: dmsTone(confidence >= 0.85 ? 'success' : confidence >= 0.60 ? 'warning' : 'danger').bg, color: dmsTone(confidence >= 0.85 ? 'success' : confidence >= 0.60 ? 'warning' : 'danger').fg }}>
                      {(confidence * 100).toFixed(0)}% Match
                    </span>
                    <span className="ocr-staging-queue-i48" style={{ borderRadius: 12, background: dmsTone(item.status === 'needs_review' ? 'danger' : 'accent').bg, color: dmsTone(item.status === 'needs_review' ? 'danger' : 'accent').fg }}>
                      {item.status === 'needs_review' ? 'Needs Review' : item.status === 'ocr_pending' ? 'OCR Pending' : 'Staged'}
                    </span>
                  </div>
                  <div className="ocr-staging-queue-i49" style={{ color: clay.textMuted }}>
                    <strong>Vessel:</strong>
                    {vesselVal ? (
                      <span className="ocr-staging-queue-i50" style={{ color: clay.text }}>
                        {vesselVal}
                        <FieldConfidenceBadge confidence={vesselData.confidence} tier={vesselData.tier} />
                      </span>
                    ) : (
                      <span className="ocr-staging-queue-i51" style={{ background: dmsTone('danger').bg, color: dmsTone('danger').fg, border: `1px dashed ${dmsTone('danger').fg}` }}>
                        <Icon iconName="Warning" aria-hidden="true" className="ocr-staging-queue-i32" /> Not detected
                      </span>
                    )}
                  </div>
                  <div className="ocr-staging-queue-i52" style={{ color: clay.textMuted }}>
                    <strong><Icon iconName="Clock" aria-hidden="true" className="ocr-staging-queue-i27" /> Scanned:</strong>
                    <span>{formatScannedTime(item.updated_at || item.created_at)}</span>
                  </div>
                  <div className="ocr-staging-queue-i53" style={{ color: clay.textMuted }}>
                    <strong>Source:</strong> {item.upload_source === 'folder' ? 'Folder' : 'Direct'}
                  </div>
                  <div className="ocr-staging-queue-i54">
                    <button type="button" onClick={() => handleOpenEdit(item)} style={{ ...dmsBtn('secondary'), minHeight: 44, width: '100%' }}>Edit</button>
                    {item.status === 'needs_review' ? (
                      <button type="button" disabled={!!promotingIds[item.id]} onClick={() => handlePromoteToStaged(item)} style={{ ...dmsBtn('primary', !promotingIds[item.id]), background: promotingIds[item.id] ? 'var(--vdms-surface-alt)' : dmsTone('warning').bg, color: promotingIds[item.id] ? 'var(--vdms-text-faint)' : dmsTone('warning').fg, minHeight: 44, width: '100%' }}>
                        {promotingIds[item.id] ? 'Moving...' : 'Move to Staging'}
                      </button>
                    ) : (
                      <button type="button" disabled={isMoving || isPending} onClick={() => handleMoveItem(item)} style={{ ...dmsBtn('primary', !(isMoving || isPending)), background: isMoving || isPending ? 'var(--vdms-surface-alt)' : dmsTone('success').bg, color: isMoving || isPending ? 'var(--vdms-text-faint)' : dmsTone('success').fg, minHeight: 44, width: '100%' }}>
                        {isMoving ? 'Moving...' : 'Move'}
                      </button>
                    )}
                  </div>
                  <details className="ocr-staging-queue-i55">
                    <summary className="ocr-staging-queue-i56" style={{ color: clay.accent }}>Details</summary>
                    <div className="ocr-staging-queue-i57" style={{ color: clay.textMuted }}>
                      <div><strong>Group:</strong> {groupVal}</div>
                      <div><strong>Category:</strong> {catVal}</div>
                      <div><strong>Sub-Category:</strong> {subCatVal}</div>
                      <div><strong>Scanned Time:</strong> {formatScannedTime(item.updated_at || item.created_at)}</div>
                      <div className="ocr-staging-queue-i58"><strong>Target Path:</strong> {item.final_path || `Technical & Crewing/${vesselVal || '{vessel}'}/Drawings and Manuals/${groupVal}/${catVal}`}</div>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ocr-staging-queue-i59">
          <table style={{ ...DMS_TABLE, minWidth: isTablet ? 1120 : 980, textAlign: 'left' }}>
            <thead>
              <tr className="ocr-staging-queue-i60" style={{ background: clay.surfaceRaised, borderBottom: `1px solid ${clay.accentSoft}`, color: clay.textMuted }}>
                {activeQueueTab === 'unstaged' && (
                  <th style={{ ...DMS_TH, width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={filteredUnstaged.length > 0 && selectedUnstagedIds.length === filteredUnstaged.length}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedUnstagedIds(filteredUnstaged.map(i => i.id));
                        } else {
                          setSelectedUnstagedIds([]);
                        }
                      }}
                      title="Select all"
                      className="ocr-staging-queue-i61"
                    />
                  </th>
                )}
                <th style={{ ...DMS_TH, width: 56 }}>#</th>
                <th style={{ ...DMS_TH, position: 'sticky', left: activeQueueTab === 'unstaged' ? 92 : 56, zIndex: 3, background: clay.surfaceRaised }}>Document Name</th>
                <th style={DMS_TH}>Source</th>
                <th style={DMS_TH}>Status &amp; AI Match</th>
                <th style={DMS_TH}>SharePoint Metadata Tags</th>
                <th style={{ ...DMS_TH, width: 290, minWidth: 290 }}>Target DMS Path</th>
                <th style={{ ...DMS_TH, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, idx) => {
                const isMoving = !!movingIds[item.id];
                const isPending = item.status === 'ocr_pending';
                const confidence = item.confidence || 0;

                // Extract per-field data from suggested_tags
                const tags = item.suggested_tags || {};
                const catData = getFieldData(tags, 'category');
                const groupData = getFieldData(tags, 'group');
                const subCatData = getFieldData(tags, 'sub_category');
                const vesselData = getFieldData(tags, 'vessel');

                const catVal = catData.value || item.category_name || 'Drawing';
                const groupVal = groupData.value || '—';
                const subCatVal = subCatData.value || '—';
                // Strictly apply confidence floor to vessel value
                const vesselConfident = vesselData.confidence >= VESSEL_CONFIDENCE_FLOOR;
                const vesselVal = (vesselConfident ? (vesselData.value || item.vessel_name) : '') || '';

                const isSelected = selectedUnstagedIds.includes(item.id);

                // Check how many fields achieved high confidence (>= 85%)
                const confidentFieldsCount = [
                  catData.confidence >= 0.85,
                  groupData.confidence >= 0.85,
                  subCatData.confidence >= 0.85,
                  vesselData.confidence >= 0.85,
                ].filter(Boolean).length;

                return (
                  <tr key={item.id} style={{ ...DMS_TR, background: isSelected ? clay.surfaceRaised : clay.surface }}>
                    {activeQueueTab === 'unstaged' && (
                      <td style={{ ...DMS_TD, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedUnstagedIds(prev => [...prev, item.id]);
                            } else {
                              setSelectedUnstagedIds(prev => prev.filter(id => id !== item.id));
                            }
                          }}
                          className="ocr-staging-queue-i61"
                        />
                      </td>
                    )}
                    <td style={DMS_TD}>{idx + 1}</td>

                    {/* Filename, Preview & Scanned Time */}
                    <td style={{ ...DMS_TD_NAME, maxWidth: 230, position: 'sticky', left: activeQueueTab === 'unstaged' ? 92 : 56, zIndex: 2, background: isSelected ? clay.surfaceRaised : clay.surface }}>
                      <div className="ocr-staging-queue-i62" style={{ color: clay.text }}>
                        {item.filename}
                      </div>
                      {item.ocr_text_preview && (
                        <div className="ocr-staging-queue-i63" style={{ color: clay.textMuted, maxWidth: 210 }}>
                          "{item.ocr_text_preview.slice(0, 60)}..."
                        </div>
                      )}
                      <div className="ocr-staging-queue-i64" style={{ color: dmsTone('accent').fg, background: dmsTone('accent').bg, border: `1px solid ${clay.accentSoft}` }}>
                        <Icon iconName="Clock" aria-hidden="true" className="ocr-staging-queue-i65" />
                        <span>Scanned: {formatScannedTime(item.updated_at || item.created_at)}</span>
                      </div>
                    </td>

                    {/* Source */}
                    <td style={{ ...DMS_TD, whiteSpace: 'nowrap' }}>
                      <span className="ocr-staging-queue-i66" style={{ borderRadius: 6, background: dmsTone(item.upload_source === 'folder' ? 'success' : 'accent').bg, color: dmsTone(item.upload_source === 'folder' ? 'success' : 'accent').fg, borderColor: dmsTone(item.upload_source === 'folder' ? 'success' : 'accent').fg }}>
                        {item.upload_source === 'folder' ? <><Icon iconName="FabricFolder" aria-hidden="true" className="ocr-staging-queue-i32" /> Folder</> : <><Icon iconName="Page" aria-hidden="true" className="ocr-staging-queue-i32" /> Direct</>}
                      </span>
                    </td>

                    {/* Status & Confidence */}
                    <td style={{ ...DMS_TD, whiteSpace: 'nowrap' }}>
                      {item.status === 'needs_review' ? (
                        <div>
                          <span className="ocr-staging-queue-i67" style={{ borderRadius: 12, background: dmsTone('danger').bg, color: dmsTone('danger').fg, border: `1px solid ${dmsTone('danger').fg}` }}>
                            <Icon iconName="Warning" aria-hidden="true" className="ocr-staging-queue-i32" /> Needs Review
                          </span>
                          <div className="ocr-staging-queue-i68" style={{ color: clay.textMuted }}>
                            <span><Icon iconName="Clock" aria-hidden="true" className="ocr-staging-queue-i65" /> {formatScannedTime(item.updated_at || item.created_at)}</span>
                          </div>
                          {item.error && (
                            <div className="ocr-staging-queue-i69" style={{ color: dmsTone('danger').fg, maxWidth: 180 }}>
                              {item.error.replace(/^\s*\[/, '').replace(/\]\s*$/, '')}
                            </div>
                          )}
                        </div>
                      ) : isPending ? (
                        <div className="ocr-staging-queue-i70" style={{ color: dmsTone('accent').fg }}>
                          <span className="ocr-staging-queue-i71"><Icon iconName="Sync" aria-hidden="true" className="ocr-staging-queue-i27" /></span> OCR Extracting...
                        </div>
                      ) : (
                        <div>
                          <span className="ocr-staging-queue-i66" style={{ borderRadius: 12, background: dmsTone(confidence >= 0.85 ? 'success' : confidence >= 0.60 ? 'warning' : 'danger').bg, color: dmsTone(confidence >= 0.85 ? 'success' : confidence >= 0.60 ? 'warning' : 'danger').fg, borderColor: dmsTone(confidence >= 0.85 ? 'success' : confidence >= 0.60 ? 'warning' : 'danger').fg }}>
                            {confidence >= 0.85 ? <Icon iconName="BullseyeTarget" aria-hidden="true" className="ocr-staging-queue-i32" /> : confidence >= 0.60 ? <Icon iconName="LightningBolt" aria-hidden="true" className="ocr-staging-queue-i32" /> : <Icon iconName="Warning" aria-hidden="true" className="ocr-staging-queue-i32" />} {(confidence * 100).toFixed(0)}% Match ({confidentFieldsCount}/4 high)
                          </span>
                          <div className="ocr-staging-queue-i72" style={{ color: clay.textMuted }}>
                            <span><Icon iconName="Clock" aria-hidden="true" className="ocr-staging-queue-i65" /> {formatScannedTime(item.updated_at || item.created_at)}</span>
                          </div>
                          {item.matched_keywords && item.matched_keywords.length > 0 && (
                            <div className="ocr-staging-queue-i73" style={{ color: clay.textMuted }}>
                              #{item.matched_keywords.slice(0, 2).join(' #')}
                            </div>
                          )}
                          {item.error && (
                            <div className="ocr-staging-queue-i74" style={{ color: dmsTone('warning').fg, maxWidth: 180 }}>
                              <Icon iconName="Warning" aria-hidden="true" className="ocr-staging-queue-i65" /> {item.error.replace(/^\s*\[/, '').replace(/\]\s*$/, '')}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 4 SharePoint Columns with per-field confidence */}
                    <td style={{ ...DMS_TD, minWidth: 260 }}>
                      <div className="ocr-staging-queue-i75">
                        <span className="ocr-staging-queue-i76" style={{ background: dmsTone('accent').bg, color: dmsTone('accent').fg }}>
                          {groupVal}
                          <FieldConfidenceBadge confidence={groupData.confidence} tier={groupData.tier} />
                        </span>
                        <span className="ocr-staging-queue-i77">›</span>
                        <span className="ocr-staging-queue-i78" style={{ background: dmsTone('neutral').bg, color: dmsTone('neutral').fg }}>
                          {catVal}
                          <FieldConfidenceBadge confidence={catData.confidence} tier={catData.tier} />
                        </span>
                        <span className="ocr-staging-queue-i77">›</span>
                        <span className="ocr-staging-queue-i79" style={{ color: clay.text }}>
                          {subCatVal}
                          <FieldConfidenceBadge confidence={subCatData.confidence} tier={subCatData.tier} />
                        </span>
                      </div>
                      {/* Vessel Row: shows vessel name + badge, or highlighted 'Not detected' pill */}
                      {vesselVal ? (
                        <div className="ocr-staging-queue-i80" style={{ color: clay.textMuted }}>
                          <span><Icon iconName="Ferry" aria-hidden="true" className="ocr-staging-queue-i32" /> Vessel:&nbsp;</span>
                          <strong style={{ color: clay.text }}>{vesselVal}</strong>
                          <FieldConfidenceBadge confidence={vesselData.confidence} tier={vesselData.tier} />
                        </div>
                      ) : (
                        <div className="ocr-staging-queue-i81" style={{ color: dmsTone('danger').fg }}>
                          <span><Icon iconName="Ferry" aria-hidden="true" className="ocr-staging-queue-i32" /> Vessel:&nbsp;</span>
                          <span className="ocr-staging-queue-i82" style={{ background: dmsTone('danger').bg, color: dmsTone('danger').fg, border: `1px dashed ${dmsTone('danger').fg}` }}>
                            <Icon iconName="Warning" aria-hidden="true" className="ocr-staging-queue-i65" /> Not detected
                          </span>
                          {vesselData.confidence > 0 && <FieldConfidenceBadge confidence={vesselData.confidence} tier={vesselData.tier} />}
                        </div>
                      )}
                    </td>

                    {/* Destination Path Preview */}
                    <td style={{ ...DMS_TD, width: 290, minWidth: 290, verticalAlign: 'top' }}>
                      <div className="ocr-staging-queue-i83" style={{ color: dmsTone('success').fg, fontFamily: 'monospace', background: dmsTone('success').bg, borderRadius: 6, border: `1px solid ${clay.accentSoft}` }}>
                        <Icon iconName="FabricFolder" aria-hidden="true" className="ocr-staging-queue-i32" /> {item.final_path || `Technical & Crewing/${vesselVal || '{vessel}'}/Drawings and Manuals/${groupVal}/${catVal}`}
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ ...DMS_TD, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div className="ocr-staging-queue-i84">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          style={{ ...dmsBtn('secondary'), height: 'auto', padding: '5px 10px', fontSize: 11 }}
                        >
                          <Icon iconName="Edit" aria-hidden="true" className="ocr-staging-queue-i32" /> Edit
                        </button>
                        {item.status === 'needs_review' ? (
                          <button
                            type="button"
                            disabled={!!promotingIds[item.id]}
                            onClick={() => handlePromoteToStaged(item)}
                            title="After assigning vessel and fields, click to move this file to the Staging Queue for filing"
                            style={{
                              ...dmsBtn('primary', !promotingIds[item.id]),
                              background: promotingIds[item.id] ? 'var(--vdms-surface-alt)' : dmsTone('warning').bg,
                              color: promotingIds[item.id] ? 'var(--vdms-text-faint)' : dmsTone('warning').fg,
                              height: 'auto', padding: '5px 12px', fontSize: 11,
                            }}
                          >
                            {promotingIds[item.id] ? <><Icon iconName="Sync" aria-hidden="true" className="ocr-staging-queue-i32" /> Moving...</> : <><Icon iconName="ClipboardList" aria-hidden="true" className="ocr-staging-queue-i32" /> Move to Staging</>}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isMoving || isPending}
                            onClick={() => handleMoveItem(item)}
                            style={{
                              ...dmsBtn('primary', !(isMoving || isPending)),
                              background: isMoving || isPending ? 'var(--vdms-surface-alt)' : dmsTone('success').bg,
                              color: isMoving || isPending ? 'var(--vdms-text-faint)' : dmsTone('success').fg,
                              height: 'auto', padding: '5px 12px', fontSize: 11,
                            }}
                          >
                            {isMoving ? <><Icon iconName="Sync" aria-hidden="true" className="ocr-staging-queue-i32" /> Moving...</> : <><Icon iconName="Rocket" aria-hidden="true" className="ocr-staging-queue-i32" /> Move</>}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDismissItem(item)}
                          style={{ ...dmsBtn('ghost'), height: 'auto', minHeight: 44, fontSize: 14, padding: '0 8px' }}
                          title="Dismiss from queue"
                        >
                          <Icon iconName="Cancel" aria-hidden="true" className="ocr-staging-queue-i36" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── Edit Tags Modal ── */}
      {editingItem && (
        <div
          role="presentation"
          onClick={() => setEditingItem(null)}
          className="ocr-staging-queue-i85" style={{ position: 'fixed', background: 'rgba(15,23,42,0.6)', padding: isMobile ? 12 : 24 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
            className="ocr-staging-queue-i86" style={{ width: isMobile ? '95vw' : 600, background: clay.surface, borderRadius: clay.radiusCard, boxShadow: clay.shadowRaisedHover }}
          >
            {/* Modal Header */}
            <div className="ocr-staging-queue-i87" style={{ borderBottom: `1px solid ${clay.accentSoft}`, background: clay.surfaceRaised }}>
              <div>
                <div className="ocr-staging-queue-i88" style={{ color: clay.text }}>
                  Review &amp; Edit SharePoint Metadata Tags
                </div>
                <div className="ocr-staging-queue-i89" style={{ color: clay.textMuted }}>
                  {editingItem.filename}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="ocr-staging-queue-i90" style={{ color: clay.textMuted }}
              >
                <Icon iconName="Cancel" aria-hidden="true" className="ocr-staging-queue-i91" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="ocr-staging-queue-i92">
              {editError && (
                <div className="ocr-staging-queue-i93" style={{ background: dmsTone('danger').bg, border: `1px solid ${dmsTone('danger').fg}`, color: dmsTone('danger').fg, borderRadius: 8 }}>
                  <Icon iconName="ErrorBadge" aria-hidden="true" className="ocr-staging-queue-i27" /> {editError}
                </div>
              )}

              {/* Secondary Multi-Engine Validation Section */}
              {(() => {
                const tags = editingItem.suggested_tags || {};
                const valInfo = (tags as any)._validation || {};
                const details = valInfo.field_details || {};
                const engines = valInfo.engines_used || ['primary_ocr'];
                const hasValidation = Object.keys(details).length > 0;

                if (!hasValidation) return null;

                return (
                  <div className="ocr-staging-queue-i94" style={{ background: valInfo.overall_status === 'validated' ? dmsTone('success').bg : dmsTone('warning').bg, border: `1px solid ${valInfo.overall_status === 'validated' ? dmsTone('success').fg : dmsTone('warning').fg}`, borderRadius: 10 }}>
                    <div className="ocr-staging-queue-i95">
                      <div className="ocr-staging-queue-i96" style={{ color: valInfo.overall_status === 'validated' ? dmsTone('success').fg : dmsTone('warning').fg }}>
                        <span>{valInfo.overall_status === 'validated' ? <><Icon iconName="CheckMark" aria-hidden="true" className="ocr-staging-queue-i10" /> Multi-Engine Cross-Validation: Validated</> : <><Icon iconName="Warning" aria-hidden="true" className="ocr-staging-queue-i10" /> Multi-Engine Cross-Validation: Review Suggested</>}</span>
                      </div>
                      <span className="ocr-staging-queue-i97" style={{ color: clay.textMuted }}>Engines: {engines.join(', ')}</span>
                    </div>

                    <div className="ocr-staging-queue-i98">
                      {['vessel', 'group', 'category', 'sub_category'].map(fKey => {
                        const fDetail = details[fKey];
                        if (!fDetail) return null;
                        const labelMap: Record<string, string> = { vessel: 'Vessel Name', group: 'Group', category: 'Category', sub_category: 'Sub-Category' };
                        const isMatch = fDetail.status === 'validated';
                        return (
                          <div key={fKey} className="ocr-staging-queue-i99" style={{ background: clay.surface, borderRadius: 6, border: `1px solid ${clay.accentSoft}` }}>
                            <div>
                              <strong style={{ color: clay.textMuted }}>{labelMap[fKey] || fKey}:</strong>{' '}
                              <span style={{ color: clay.text }}>{fDetail.primary_value || '—'}</span>
                              {fDetail.secondary_value && fDetail.secondary_value !== fDetail.primary_value && (
                                <span className="ocr-staging-queue-i100" style={{ color: dmsTone('warning').fg }}>
                                  (Secondary: <strong>{fDetail.secondary_value}</strong>)
                                </span>
                              )}
                            </div>
                            <div className="ocr-staging-queue-i101">
                              {fDetail.secondary_value && fDetail.secondary_value !== fDetail.primary_value && (
                                <button
                                  type="button"
                                  onClick={() => setEditTags(prev => ({ ...prev, [fKey]: fDetail.secondary_value }))}
                                  className="ocr-staging-queue-i102" style={{ background: dmsTone('accent').bg, border: `1px solid ${clay.accentSoft}`, color: dmsTone('accent').fg }}
                                >
                                  Use Secondary
                                </button>
                              )}
                              <span className="ocr-staging-queue-i103" style={{ color: isMatch ? dmsTone('success').fg : dmsTone('warning').fg }}>
                                {isMatch ? <><Icon iconName="CheckMark" aria-hidden="true" className="ocr-staging-queue-i32" /> Agreed</> : <><Icon iconName="Warning" aria-hidden="true" className="ocr-staging-queue-i32" /> Differing</>}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* 4 SharePoint Managed Metadata Fields (Cascading) */}
              {(() => {
                const tags = editingItem.suggested_tags || {};
                const grpData = getFieldData(tags, 'group');
                const catData = getFieldData(tags, 'category');
                const subCatData = getFieldData(tags, 'sub_category');
                const vData = getFieldData(tags, 'vessel');

                return (
                  <div className="ocr-staging-queue-i104" style={{ gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                    {/* 1. Group (Drawing / Manual) */}
                    <div>
                      <label className="ocr-staging-queue-i105" style={{ color: clay.textMuted }}>
                        <Icon iconName="FabricFolder" aria-hidden="true" className="ocr-staging-queue-i27" /> Group (Drawing / Manual) <span className="ocr-staging-queue-i106" style={{ color: dmsTone('danger').fg }}>*</span>
                        <FieldConfidenceBadge confidence={grpData.confidence} tier={grpData.tier} />
                      </label>
                      <select
                        value={editTags.group || 'Drawing'}
                        onChange={e => {
                          const newGroup = e.target.value;
                          const isManual = newGroup === 'Manual';
                          const catOptions = isManual ? Object.keys(MANUAL_TAXONOMY) : Object.keys(DRAWING_TAXONOMY);
                          const newCat = catOptions[0] || 'Basic';
                          const subCatOptions = (isManual ? MANUAL_TAXONOMY[newCat] : DRAWING_TAXONOMY[newCat]) || [];
                          setEditTags(prev => ({
                            ...prev,
                            group: newGroup,
                            category: newCat,
                            sub_category: subCatOptions[0] || '',
                          }));
                        }}
                        style={{ ...dmsControlStyle(), width: '100%', fontWeight: 600 }}
                      >
                        <option value="Drawing">Drawing</option>
                        <option value="Manual">Manual</option>
                      </select>
                    </div>

                    {/* 2. Category (Cascading based on Group) */}
                    <div>
                      <label className="ocr-staging-queue-i105" style={{ color: clay.textMuted }}>
                        <Icon iconName="Bookmarks" aria-hidden="true" className="ocr-staging-queue-i27" /> Category <span className="ocr-staging-queue-i106" style={{ color: dmsTone('danger').fg }}>*</span>
                        <FieldConfidenceBadge confidence={catData.confidence} tier={catData.tier} />
                      </label>
                      {(() => {
                        const isManual = editTags.group === 'Manual';
                        const catOptions = isManual ? Object.keys(MANUAL_TAXONOMY) : Object.keys(DRAWING_TAXONOMY);
                        return (
                          <select
                            value={editTags.category || catOptions[0]}
                            onChange={e => {
                              const newCat = e.target.value;
                              const availableSubCats = (isManual ? MANUAL_TAXONOMY[newCat] : DRAWING_TAXONOMY[newCat]) || [];
                              setEditTags(prev => ({
                                ...prev,
                                category: newCat,
                                sub_category: availableSubCats[0] || '',
                              }));
                            }}
                            style={{ ...dmsControlStyle(), width: '100%', fontWeight: 600 }}
                          >
                            {catOptions.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        );
                      })()}
                    </div>

                    {/* 3. Sub-Category (Cascading based on Category) */}
                    <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                      <label className="ocr-staging-queue-i105" style={{ color: clay.textMuted }}>
                        <Icon iconName="Tag" aria-hidden="true" className="ocr-staging-queue-i27" /> Sub-Category (Specific Term) <span className="ocr-staging-queue-i106" style={{ color: dmsTone('danger').fg }}>*</span>
                        <FieldConfidenceBadge confidence={subCatData.confidence} tier={subCatData.tier} />
                      </label>
                      {(() => {
                        const isManual = editTags.group === 'Manual';
                        const currentCat = editTags.category || (isManual ? Object.keys(MANUAL_TAXONOMY)[0] : Object.keys(DRAWING_TAXONOMY)[0]);
                        const subCatOptions = (isManual ? MANUAL_TAXONOMY[currentCat] : DRAWING_TAXONOMY[currentCat]) || [];
                        return (
                          <select
                            value={editTags.sub_category || (subCatOptions[0] || '')}
                            onChange={e => setEditTags(prev => ({ ...prev, sub_category: e.target.value }))}
                            style={{ ...dmsControlStyle(), width: '100%', fontWeight: 600 }}
                          >
                            {subCatOptions.map(sc => (
                              <option key={sc} value={sc}>{sc}</option>
                            ))}
                          </select>
                        );
                      })()}
                    </div>

                    {/* 4. Vessel Name */}
                    <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                      <label className="ocr-staging-queue-i105" style={{ color: clay.textMuted }}>
                        <Icon iconName="Ferry" aria-hidden="true" className="ocr-staging-queue-i27" /> Vessel Name <span className="ocr-staging-queue-i106" style={{ color: dmsTone('danger').fg }}>*</span>
                        <FieldConfidenceBadge confidence={vData.confidence} tier={vData.tier} />
                      </label>
                      <select
                        value={editTags.vessel || ''}
                        onChange={e => setEditTags(prev => ({ ...prev, vessel: e.target.value }))}
                        style={{ ...dmsControlStyle(), width: '100%', fontWeight: 600 }}
                      >
                        <option value="">-- Select Vessel --</option>
                        {vesselOptions.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })()}

              {/* Dynamic SharePoint Destination Path Preview */}
              <div className="ocr-staging-queue-i107" style={{ background: clay.surfaceRaised, border: `1px solid ${clay.accentSoft}`, borderRadius: 10 }}>
                <div className="ocr-staging-queue-i108" style={{ color: clay.textMuted }}>
                  Live Destination Path Preview
                </div>
                <div className="ocr-staging-queue-i109" style={{ color: dmsTone('success').fg, fontFamily: 'monospace' }}>
                  <Icon iconName="FabricFolder" aria-hidden="true" className="ocr-staging-queue-i27" /> {livePreviewPath || `Technical & Crewing/${editTags.vessel || '[Vessel]'}/Drawings and Manuals/${editTags.group || 'Drawing'}/${editTags.category || 'Basic'}`}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="ocr-staging-queue-i110" style={{ borderTop: `1px solid ${clay.accentSoft}`, background: clay.surfaceRaised, flexDirection: isMobile ? 'column' : 'row' }}>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                style={{ ...dmsBtn('secondary'), minHeight: 44, height: 'auto', width: isMobile ? '100%' : 'auto', padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSaveTags}
                style={{ ...dmsBtn('primary', !isSavingEdit), minHeight: 44, height: 'auto', width: isMobile ? '100%' : 'auto', padding: '8px 20px', cursor: isSavingEdit ? 'wait' : 'pointer' }}
              >
                {isSavingEdit ? <><Icon iconName="Sync" aria-hidden="true" className="ocr-staging-queue-i10" /> Saving...</> : <><Icon iconName="Save" aria-hidden="true" className="ocr-staging-queue-i10" /> Save Tags</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── "Which Vessel Is This?" Single-File Action Prompt Modal (Option A) ── */}
      {vesselPromptItem && (
        <div
          role="presentation"
          onClick={() => setVesselPromptItem(null)}
          className="ocr-staging-queue-i111" style={{ position: 'fixed', background: 'rgba(15,23,42,0.65)', padding: isMobile ? 12 : 24 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
            className="ocr-staging-queue-i112" style={{ width: isMobile ? '95vw' : 520, background: clay.surface, boxShadow: clay.shadowRaisedHover }}
          >
            {/* Header */}
            <div className="ocr-staging-queue-i113" style={{ borderBottom: `1px solid ${clay.accentSoft}`, background: clay.surfaceRaised }}>
              <div className="ocr-staging-queue-i5">
                <div className="ocr-staging-queue-i114" style={{ borderRadius: 10, background: dmsTone('accent').bg, color: dmsTone('accent').fg }}>
                  <Icon iconName="Ferry" aria-hidden="true" className="ocr-staging-queue-i91" />
                </div>
                <div>
                  <div className="ocr-staging-queue-i88" style={{ color: clay.text }}>
                    Which vessel is this?
                  </div>
                  <div className="ocr-staging-queue-i115" style={{ color: dmsTone('accent').fg }}>
                    Vessel required before {vesselPromptItem.action === 'promote' ? 'moving to staging' : 'moving to SharePoint'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVesselPromptItem(null)}
                className="ocr-staging-queue-i90" style={{ color: clay.textMuted }}
              >
                <Icon iconName="Cancel" aria-hidden="true" className="ocr-staging-queue-i91" />
              </button>
            </div>

            {/* Body */}
            <div className="ocr-staging-queue-i116">
              <div className="ocr-staging-queue-i117" style={{ background: clay.surfaceRaised, border: `1px solid ${clay.accentSoft}`, borderRadius: 10, color: clay.textMuted }}>
                <Icon iconName="Page" aria-hidden="true" className="ocr-staging-queue-i118" />
                <strong className="ocr-staging-queue-i58">{vesselPromptItem.item.filename}</strong>
              </div>

              <div className="ocr-staging-queue-i119" style={{ color: clay.textMuted }}>
                The vessel could not be identified automatically with high confidence. Please select which vessel this document belongs to:
              </div>

              {promptError && (
                <div className="ocr-staging-queue-i120" style={{ background: dmsTone('danger').bg, border: `1px solid ${dmsTone('danger').fg}`, color: dmsTone('danger').fg, borderRadius: 8 }}>
                  <Icon iconName="ErrorBadge" aria-hidden="true" className="ocr-staging-queue-i27" /> {promptError}
                </div>
              )}

              {!isCreatingNewVesselInline ? (
                <div>
                  <label className="ocr-staging-queue-i121" style={{ color: clay.textMuted }}>
                    Select Vessel <span style={{ color: dmsTone('danger').fg }}>*</span>
                  </label>
                  <select
                    value={promptVesselChoice}
                    onChange={e => setPromptVesselChoice(e.target.value)}
                    style={{ ...dmsControlStyle(), width: '100%', padding: '10px 14px', fontWeight: 600 }}
                  >
                    <option value="">-- Choose a vessel --</option>
                    {vesselOptions.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>

                  <div className="ocr-staging-queue-i122">
                    <button
                      type="button"
                      onClick={() => setIsCreatingNewVesselInline(true)}
                      className="ocr-staging-queue-i123" style={{ color: dmsTone('accent').fg }}
                    >
                      + Create new vessel not in list
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ocr-staging-queue-i43" style={{ background: dmsTone('accent').bg, border: `1px solid ${clay.accentSoft}`, borderRadius: 10 }}>
                  <label className="ocr-staging-queue-i121" style={{ color: dmsTone('accent').fg }}>
                    New Vessel Name <span style={{ color: dmsTone('danger').fg }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Pacific Explorer"
                    value={newVesselInput}
                    onChange={e => setNewVesselInput(e.target.value)}
                    style={{ ...dmsControlStyle(), width: '100%', fontWeight: 600 }}
                  />
                  <div className="ocr-staging-queue-i122">
                    <button
                      type="button"
                      onClick={() => setIsCreatingNewVesselInline(false)}
                      className="ocr-staging-queue-i124" style={{ color: clay.textMuted }}
                    >
                      ← Back to existing vessels list
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="ocr-staging-queue-i125" style={{ borderTop: `1px solid ${clay.accentSoft}`, background: clay.surfaceRaised }}>
              <button
                type="button"
                onClick={() => setVesselPromptItem(null)}
                style={{ ...dmsBtn('secondary'), minHeight: 40, height: 'auto', padding: '8px 16px' }}
              >
                Skip for Now
              </button>

              <button
                type="button"
                disabled={isSavingPrompt}
                onClick={handleConfirmVesselPrompt}
                style={{ ...dmsBtn('primary', !isSavingPrompt), minHeight: 40, height: 'auto', padding: '8px 20px', cursor: isSavingPrompt ? 'wait' : 'pointer' }}
              >
                {isSavingPrompt ? <><Icon iconName="Sync" aria-hidden="true" className="ocr-staging-queue-i10" /> Saving & Proceeding...</> : vesselPromptItem.action === 'promote' ? 'Confirm & Move to Staging' : 'Confirm & Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Batch Vessel Assignment Modal (Option 4b) ── */}
      {batchModalOpen && (
        <div
          role="presentation"
          onClick={() => setBatchModalOpen(false)}
          className="ocr-staging-queue-i111" style={{ position: 'fixed', background: 'rgba(15,23,42,0.65)', padding: isMobile ? 12 : 24 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
            className="ocr-staging-queue-i112" style={{ width: isMobile ? '95vw' : 520, background: clay.surface, boxShadow: clay.shadowRaisedHover }}
          >
            {/* Header */}
            <div className="ocr-staging-queue-i87" style={{ borderBottom: `1px solid ${clay.accentSoft}`, background: clay.surfaceRaised }}>
              <div>
                <div className="ocr-staging-queue-i88" style={{ color: clay.text }}>
                  <Icon iconName="Ferry" aria-hidden="true" className="ocr-staging-queue-i118" /> Batch Assign Vessel
                </div>
                <div className="ocr-staging-queue-i89" style={{ color: clay.textMuted }}>
                  Assign a single vessel to {selectedUnstagedIds.length} selected document{selectedUnstagedIds.length > 1 ? 's' : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                className="ocr-staging-queue-i90" style={{ color: clay.textMuted }}
              >
                <Icon iconName="Cancel" aria-hidden="true" className="ocr-staging-queue-i91" />
              </button>
            </div>

            {/* Body */}
            <div className="ocr-staging-queue-i116">
              {batchError && (
                <div className="ocr-staging-queue-i120" style={{ background: dmsTone('danger').bg, border: `1px solid ${dmsTone('danger').fg}`, color: dmsTone('danger').fg, borderRadius: 8 }}>
                  <Icon iconName="ErrorBadge" aria-hidden="true" className="ocr-staging-queue-i27" /> {batchError}
                </div>
              )}

              <div>
                <label className="ocr-staging-queue-i121" style={{ color: clay.textMuted }}>
                  Target Vessel <span style={{ color: dmsTone('danger').fg }}>*</span>
                </label>
                <select
                  value={batchVesselChoice}
                  onChange={e => setBatchVesselChoice(e.target.value)}
                  style={{ ...dmsControlStyle(), width: '100%', padding: '10px 14px', fontWeight: 600 }}
                >
                  <option value="">-- Select vessel to apply to all selected --</option>
                  {vesselOptions.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="ocr-staging-queue-i126" style={{ background: clay.surfaceRaised, border: `1px solid ${clay.accentSoft}`, borderRadius: 8 }}>
                <input
                  type="checkbox"
                  id="batchPromoteCheckbox"
                  checked={batchPromoteImmediately}
                  onChange={e => setBatchPromoteImmediately(e.target.checked)}
                  className="ocr-staging-queue-i127" style={{ width: 16 }}
                />
                <label htmlFor="batchPromoteCheckbox" className="ocr-staging-queue-i128" style={{ color: clay.textMuted }}>
                  Also promote all selected files directly to Staging Queue
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="ocr-staging-queue-i110" style={{ borderTop: `1px solid ${clay.accentSoft}`, background: clay.surfaceRaised }}>
              <button
                type="button"
                onClick={() => setBatchModalOpen(false)}
                style={{ ...dmsBtn('secondary'), minHeight: 40, height: 'auto', padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isApplyingBatch}
                onClick={handleApplyBatchVessel}
                style={{
                  ...dmsBtn('primary', !isApplyingBatch), minHeight: 40, height: 'auto', padding: '8px 20px',
                  cursor: isApplyingBatch ? 'wait' : 'pointer',
                }}
              >
                {isApplyingBatch ? <><Icon iconName="Sync" aria-hidden="true" className="ocr-staging-queue-i10" /> Applying...</> : `Apply to ${selectedUnstagedIds.length} File${selectedUnstagedIds.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

