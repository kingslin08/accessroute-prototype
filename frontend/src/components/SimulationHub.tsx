import React, { useState } from 'react';
import {
  Users,
  Camera,
  Send,
  AlertCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sliders,
  Sparkles,
} from 'lucide-react';
import type { Barrier, Reporter, VisionLabel, Edge } from '../types/api';

interface SimulationHubProps {
  edges: Edge[];
  barriers: Barrier[];
  reporters: Reporter[];
  cameras: string[];
  visionLabels: VisionLabel[];
  selectedEdgeId: string | null;
  onSelectEdge: (id: string) => void;
  onSubmitReport: (data: {
    edge_id: string;
    barrier: string;
    reporter: string;
    confidence: number;
    present: boolean;
  }) => Promise<any>;
  onSubmitVision: (data: {
    label: string;
    edge_id?: string;
    offmap?: boolean;
    source?: string;
    confidence: number;
  }) => Promise<any>;
  loading: boolean;
}

export const SimulationHub: React.FC<SimulationHubProps> = ({
  edges,
  barriers,
  reporters,
  cameras,
  visionLabels,
  selectedEdgeId,
  onSelectEdge,
  onSubmitReport,
  onSubmitVision,
  loading,
}) => {
  const [tab, setTab] = useState<'crowd' | 'vision'>('crowd');

  // Crowd Report state
  const [targetEdge, setTargetEdge] = useState<string>(selectedEdgeId || '4-5');
  const [selectedBarrier, setSelectedBarrier] = useState<string>('construction');
  const [selectedReporter, setSelectedReporter] = useState<string>('neha');
  const [reportConfidence, setReportConfidence] = useState<number>(80);
  const [present, setPresent] = useState<boolean>(true);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  // Vision state
  const [selectedCamera, setSelectedCamera] = useState<string>(cameras[0] || 'Bus 12 camera');
  const [selectedVisionLabel, setSelectedVisionLabel] = useState<string>('construction_barrier');
  const [visionConfidence, setVisionConfidence] = useState<number>(90);
  const [isOffMap, setIsOffMap] = useState<boolean>(false);
  const [visionFeedback, setVisionFeedback] = useState<{
    accepted: any[];
    rejected: any[];
  } | null>(null);

  // Keep target edge in sync with selection
  React.useEffect(() => {
    if (selectedEdgeId) {
      setTargetEdge(selectedEdgeId);
    }
  }, [selectedEdgeId]);

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportFeedback(null);
    try {
      const res = await onSubmitReport({
        edge_id: targetEdge,
        barrier: selectedBarrier,
        reporter: selectedReporter,
        confidence: reportConfidence / 100,
        present,
      });
      if (res?.result) {
        const b = Math.round(res.result.before * 100);
        const a = Math.round(res.result.after * 100);
        setReportFeedback(`Report fused! Fused belief shifted from ${b}% to ${a}%.`);
      }
    } catch (err: any) {
      setReportFeedback(`Error: ${err.message}`);
    }
  };

  const handleVisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVisionFeedback(null);
    try {
      const res = await onSubmitVision({
        label: selectedVisionLabel,
        edge_id: isOffMap ? undefined : targetEdge,
        offmap: isOffMap,
        source: selectedCamera,
        confidence: visionConfidence / 100,
      });
      if (res?.result) {
        setVisionFeedback(res.result);
      }
    } catch (err: any) {
      setVisionFeedback({ accepted: [], rejected: [{ label: selectedVisionLabel, reason: err.message }] });
    }
  };

  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-col gap-3">
      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl">
          <button
            onClick={() => setTab('crowd')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === 'crowd'
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Crowd Report Ingest
          </button>
          <button
            onClick={() => setTab('vision')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === 'vision'
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Camera Vision Pipeline
          </button>
        </div>

        <span className="text-[11px] text-slate-400 hidden sm:inline">
          Live Bayesian Input Simulator
        </span>
      </div>

      {/* Tab 1: Crowd Reporter */}
      {tab === 'crowd' && (
        <form onSubmit={handleReportSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Street Segment */}
            <div className="flex flex-col gap-1">
              <label className="text-slate-300 font-medium">Street Segment</label>
              <select
                value={targetEdge}
                onChange={(e) => {
                  setTargetEdge(e.target.value);
                  onSelectEdge(e.target.value);
                }}
                className="bg-slate-800 text-white rounded-lg p-2 border border-slate-700"
              >
                {edges.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name || `Edge ${e.id}`} ({e.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Barrier Type */}
            <div className="flex flex-col gap-1">
              <label className="text-slate-300 font-medium">Obstacle Category</label>
              <select
                value={selectedBarrier}
                onChange={(e) => setSelectedBarrier(e.target.value)}
                className="bg-slate-800 text-white rounded-lg p-2 border border-slate-700"
              >
                {barriers.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Reporter Profile */}
            <div className="flex flex-col gap-1">
              <label className="text-slate-300 font-medium">Reporter Identity</label>
              <select
                value={selectedReporter}
                onChange={(e) => setSelectedReporter(e.target.value)}
                className="bg-slate-800 text-white rounded-lg p-2 border border-slate-700"
              >
                {reporters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (Trust: {Math.round(r.trust * 100)}%)
                  </option>
                ))}
              </select>
            </div>

            {/* Confidence Slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-300 font-medium">
                <span>Reporter Confidence</span>
                <span className="text-amber-400 font-bold">{reportConfidence}%</span>
              </div>
              <input
                type="range"
                min="30"
                max="100"
                value={reportConfidence}
                onChange={(e) => setReportConfidence(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Present vs Cleared Toggle */}
          <div className="flex items-center gap-4 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60 text-xs">
            <span className="text-slate-300 font-medium">Report Status:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="present"
                checked={present}
                onChange={() => setPresent(true)}
                className="accent-amber-400"
              />
              <span className="text-rose-300 font-medium">Obstacle is PRESENT (raises belief)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="present"
                checked={!present}
                onChange={() => setPresent(false)}
                className="accent-amber-400"
              />
              <span className="text-emerald-300 font-medium">Cleared / Solved (lowers belief)</span>
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-amber-400/10 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            Submit Crowd Report to Bayesian Fusion Store
          </button>

          {reportFeedback && (
            <div className="p-2.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-200 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>{reportFeedback}</span>
            </div>
          )}
        </form>
      )}

      {/* Tab 2: Computer Vision Pipeline */}
      {tab === 'vision' && (
        <form onSubmit={handleVisionSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Camera Source */}
            <div className="flex flex-col gap-1">
              <label className="text-slate-300 font-medium">Camera Sensor Source</label>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="bg-slate-800 text-white rounded-lg p-2 border border-slate-700"
              >
                {cameras.map((c, i) => (
                  <option key={i} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Object Detection Label */}
            <div className="flex flex-col gap-1">
              <label className="text-slate-300 font-medium">Detected Class Label</label>
              <select
                value={selectedVisionLabel}
                onChange={(e) => setSelectedVisionLabel(e.target.value)}
                className="bg-slate-800 text-white rounded-lg p-2 border border-slate-700"
              >
                {visionLabels.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.text} {!v.present ? '(Disproves Barrier)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Detector Confidence */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-slate-300 font-medium">
                <span>Model Confidence Score</span>
                <span className="text-amber-400 font-bold">{visionConfidence}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                value={visionConfidence}
                onChange={(e) => setVisionConfidence(Number(e.target.value))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            {/* Off-map Test Checkbox */}
            <div className="flex items-center gap-2 pt-5">
              <label className="flex items-center gap-2 text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOffMap}
                  onChange={(e) => setIsOffMap(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-600 text-amber-400"
                />
                <span>Simulate Frame Off-Map (Tests Spatial Rejection)</span>
              </label>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-purple-500/10 disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" />
            Inject Video Frame into Geo-Matching Engine
          </button>

          {/* Feedback */}
          {visionFeedback && (
            <div className="flex flex-col gap-2">
              {visionFeedback.accepted.map((acc, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>
                    Accepted: Geo-matched to <strong>{acc.street}</strong>. Fused belief:{' '}
                    {Math.round(acc.before * 100)}% → {Math.round(acc.after * 100)}%.
                  </span>
                </div>
              ))}
              {visionFeedback.rejected.map((rej, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2"
                >
                  <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>
                    Discarded: Detection "{rej.label}" was rejected ({rej.reason}).
                  </span>
                </div>
              ))}
            </div>
          )}
        </form>
      )}
    </div>
  );
};
