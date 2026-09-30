import React from 'react';
import {
  X,
  MapPin,
  TrendingDown,
  Clock,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  FileQuestion,
  Layers,
} from 'lucide-react';
import type { EdgeDetail } from '../types/api';

interface StreetInspectorProps {
  detail: EdgeDetail | null;
  onClose: () => void;
  onQuickReport: (edgeId: string) => void;
}

export const StreetInspector: React.FC<StreetInspectorProps> = ({
  detail,
  onClose,
  onQuickReport,
}) => {
  if (!detail) return null;

  const { edge, barriers } = detail;

  return (
    <div className="bg-slate-900/90 backdrop-blur rounded-2xl border border-slate-700/80 p-4 shadow-2xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">
              {edge.name || `Street Segment ${edge.id}`}
            </h3>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
              ID: {edge.id}
            </span>
          </div>
          <p className="text-xs text-slate-400 capitalize mt-0.5">
            {edge.kind} • {Math.round(edge.length)} metres length
          </p>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Physical Attributes Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-800/80 rounded-lg p-2 border border-slate-700">
          <span className="text-slate-400 text-[11px] block">Gradient / Slope</span>
          <span className="font-semibold text-white">
            {edge.slope_pct}% {Math.abs(edge.slope_pct) >= 8 ? '⚠️ Steep' : ''}
          </span>
        </div>
        <div className="bg-slate-800/80 rounded-lg p-2 border border-slate-700">
          <span className="text-slate-400 text-[11px] block">Path Width</span>
          <span className="font-semibold text-white">
            {edge.width_m} m {edge.width_m < 0.9 ? '⚠️ Narrow' : ''}
          </span>
        </div>
        <div className="bg-slate-800/80 rounded-lg p-2 border border-slate-700">
          <span className="text-slate-400 text-[11px] block">Steps</span>
          <span className="font-semibold text-white">
            {edge.steps > 0 ? `⚠️ ${edge.steps} steps` : 'None (flat)'}
          </span>
        </div>
        <div className="bg-slate-800/80 rounded-lg p-2 border border-slate-700">
          <span className="text-slate-400 text-[11px] block">Surface</span>
          <span className="font-semibold text-white capitalize">
            {edge.surface === 'broken' ? '⚠️ Broken / Uneven' : 'Smooth'}
          </span>
        </div>
      </div>

      {/* Barriers & Bayesian Beliefs */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
            Accessibility Obstacles & Beliefs ({barriers.length})
          </span>
          <button
            onClick={() => onQuickReport(edge.id)}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium underline"
          >
            + Report problem on this street
          </button>
        </div>

        {barriers.length === 0 ? (
          <div className="text-xs text-slate-400 bg-slate-800/40 p-3 rounded-xl border border-slate-800 italic">
            No known obstacles on this segment. Street appears clear.
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
            {barriers.map((b, idx) => {
              const beliefPct = Math.round(b.belief * 100);

              let badgeColor = 'bg-red-500/10 text-red-300 border-red-500/30';
              if (b.state === 'unverified') badgeColor = 'bg-orange-500/10 text-orange-300 border-orange-500/30';
              else if (b.state === 'unlikely') badgeColor = 'bg-slate-800 text-slate-400 border-slate-700';

              return (
                <div
                  key={idx}
                  className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/70 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-white">
                          {b.label}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border uppercase tracking-wider ${badgeColor}`}>
                          {b.state} ({beliefPct}%)
                        </span>
                      </div>
                      <p className="text-xs text-amber-300 font-medium mt-0.5">
                        {b.impact_text}
                      </p>
                    </div>

                    {b.half_life_days !== null && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 flex-shrink-0">
                        <Clock className="w-3 h-3 text-slate-500" />
                        t½ = {b.half_life_days}d
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex items-center justify-between border-t border-slate-700/50 pt-1.5 mt-0.5">
                    <span>Evidence Support: <strong className="text-slate-200">{b.support}</strong></span>
                    {b.from_map && <span className="text-[10px] text-slate-500">(Map Survey Base)</span>}
                  </div>

                  {/* 72-Hour Temporal Decay Forecast Graph */}
                  {b.forecast && b.forecast.length > 0 && (
                    <div className="mt-1 bg-slate-900/60 rounded-lg p-2 border border-slate-800">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                        <span className="flex items-center gap-1 font-medium">
                          <TrendingDown className="w-3 h-3 text-amber-400" />
                          Temporal Decay Forecast (Next 72 Hours)
                        </span>
                        <span>Without new reports</span>
                      </div>

                      {/* Bar graph representation */}
                      <div className="grid grid-cols-6 gap-1.5 items-end h-10 pt-1">
                        {b.forecast.slice(0, 6).map(([h, val], fIdx) => {
                          const heightPct = Math.max(8, Math.round(val * 100));
                          return (
                            <div key={fIdx} className="flex flex-col items-center gap-1 h-full justify-end">
                              <div
                                style={{ height: `${heightPct}%` }}
                                className={`w-full rounded-t transition-all ${
                                  val >= 0.6
                                    ? 'bg-rose-500'
                                    : val >= 0.25
                                    ? 'bg-amber-500'
                                    : 'bg-slate-600'
                                }`}
                                title={`+${h}h: ${Math.round(val * 100)}% belief`}
                              />
                              <span className="text-[9px] text-slate-500 font-mono">
                                +{h}h
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
