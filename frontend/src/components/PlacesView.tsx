import React, { useState } from 'react';
import {
  Building2,
  CheckCircle,
  XCircle,
  Clock,
  Edit3,
  X,
} from 'lucide-react';
import type { PlaceCard } from '../types/api';

interface PlacesViewProps {
  places: PlaceCard[];
  onUpdatePoi: (data: {
    id: string;
    entrance_steps?: number;
    ramp?: boolean;
    door_width_m?: number;
    automatic_door?: boolean;
  }) => Promise<any>;
  loading?: boolean;
  profileLabel: string;
}

export const PlacesView: React.FC<PlacesViewProps> = ({
  places,
  onUpdatePoi,
  profileLabel,
}) => {
  const [editingPoi, setEditingPoi] = useState<PlaceCard | null>(null);
  const [editSteps, setEditSteps] = useState<number>(0);
  const [editRamp, setEditRamp] = useState<boolean>(false);
  const [editDoorWidth, setEditDoorWidth] = useState<number>(0.9);
  const [editAutoDoor, setEditAutoDoor] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const startEdit = (p: PlaceCard) => {
    setEditingPoi(p);
    setEditSteps(p.entrance_steps);
    setEditRamp(p.ramp);
    setEditDoorWidth(p.door_width_m);
    setEditAutoDoor(p.automatic_door);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPoi) return;
    setSaving(true);
    try {
      await onUpdatePoi({
        id: editingPoi.id,
        entrance_steps: editSteps,
        ramp: editRamp,
        door_width_m: editDoorWidth,
        automatic_door: editAutoDoor,
      });
      setEditingPoi(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wide uppercase flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-amber-400" />
            Destination Entrance Accessibility
          </h2>
          <p className="text-xs text-slate-400">
            Entrance audits evaluated for <strong className="text-white">{profileLabel}</strong>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {places.map((p) => {
          const isAccessible = p.verdict === 'accessible';
          const isPartial = p.verdict === 'partial';

          return (
            <div
              key={p.id}
              className={`p-3.5 rounded-xl border flex flex-col justify-between transition relative overflow-hidden ${
                isAccessible
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : isPartial
                  ? 'bg-amber-950/20 border-amber-500/30'
                  : 'bg-rose-950/20 border-rose-500/30'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="font-bold text-sm text-white">{p.poi}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border flex items-center gap-1 ${
                      isAccessible
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : isPartial
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    {isAccessible ? (
                      <CheckCircle className="w-3 h-3" />
                    ) : (
                      <XCircle className="w-3 h-3" />
                    )}
                    {p.verdict.replace('_', ' ')}
                  </span>
                </div>

                <div className="text-xs text-slate-300 flex flex-col gap-1 mb-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Steps at entrance:</span>
                    <span className="font-semibold text-white">
                      {p.entrance_steps} {p.ramp ? '(Ramp installed)' : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Door width:</span>
                    <span className="font-semibold text-white">{p.door_width_m} m</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Automatic door:</span>
                    <span className="font-semibold text-white">
                      {p.automatic_door ? 'Yes' : 'Manual'}
                    </span>
                  </div>
                </div>

                {/* Audit verdict notes */}
                <div className="flex flex-col gap-1 pt-1.5 border-t border-slate-700/40 text-[11px]">
                  {p.reasons.map((r, rIdx) => (
                    <span key={rIdx} className="text-slate-300 flex items-center gap-1">
                      • {r}
                    </span>
                  ))}
                </div>
              </div>

              {/* Footer with verification age & edit button */}
              <div className="mt-3 pt-2 border-t border-slate-700/40 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  {p.last_verified_days_ago !== null
                    ? `Verified ${p.last_verified_days_ago}d ago`
                    : 'Unverified'}
                  {p.confidence === 'low' && (
                    <span className="text-amber-400 font-bold ml-1">(Stale)</span>
                  )}
                </span>

                <button
                  onClick={() => startEdit(p)}
                  className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  Update Entrance
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* In-place POI update modal */}
      {editingPoi && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  Update Entrance: {editingPoi.poi}
                </h3>
                <p className="text-xs text-slate-400">
                  Record real-world changes (e.g. new ramp built or widened door)
                </p>
              </div>
              <button
                onClick={() => setEditingPoi(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-slate-300 font-medium">Entrance Steps</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={editSteps}
                  onChange={(e) => setEditSteps(Number(e.target.value))}
                  className="bg-slate-800 text-white rounded-lg p-2 border border-slate-700"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="poi-ramp"
                  checked={editRamp}
                  onChange={(e) => setEditRamp(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-600 text-amber-400"
                />
                <label htmlFor="poi-ramp" className="text-slate-200 font-medium cursor-pointer">
                  Wheelchair Ramp is Available
                </label>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-slate-300 font-medium">Clear Door Width (metres)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="3.0"
                  value={editDoorWidth}
                  onChange={(e) => setEditDoorWidth(Number(e.target.value))}
                  className="bg-slate-800 text-white rounded-lg p-2 border border-slate-700"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="poi-auto"
                  checked={editAutoDoor}
                  onChange={(e) => setEditAutoDoor(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-600 text-amber-400"
                />
                <label htmlFor="poi-auto" className="text-slate-200 font-medium cursor-pointer">
                  Automatic Powered Door
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingPoi(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold"
                >
                  {saving ? 'Updating...' : 'Save & Re-verify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
