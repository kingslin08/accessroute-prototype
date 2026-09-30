import React from 'react';
import { MapPin, ArrowRightLeft, Target, Crosshair, Sparkles } from 'lucide-react';
import type { Node, Poi } from '../types/api';

interface RoutePlannerProps {
  nodes: Node[];
  pois: Poi[];
  startNode: number;
  goalNode: number;
  onSelectStart: (id: number) => void;
  onSelectGoal: (id: number) => void;
  pickingMode: 'start' | 'goal' | null;
  onTogglePicking: (mode: 'start' | 'goal') => void;
  onSwap: () => void;
  onFindRoute: () => void;
  loading: boolean;
}

export const RoutePlanner: React.FC<RoutePlannerProps> = ({
  nodes,
  pois,
  startNode,
  goalNode,
  onSelectStart,
  onSelectGoal,
  pickingMode,
  onTogglePicking,
  onSwap,
  onFindRoute,
  loading,
}) => {
  // Named landmarks or POIs for quick selection
  const poisByNode = React.useMemo(() => {
    const map = new Map<number, string>();
    pois.forEach((p) => map.set(p.node, p.name));
    return map;
  }, [pois]);

  const getNodeDisplay = (n: Node) => {
    const poiName = poisByNode.get(n.id);
    if (poiName) return `${poiName} (Junction ${n.id})`;
    return n.label || `Junction ${n.id} (${n.x}m, ${n.y}m)`;
  };

  const handleScenario = (s: number, g: number) => {
    onSelectStart(s);
    onSelectGoal(g);
  };

  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white tracking-wide uppercase flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-amber-400" />
          Origin & Destination
        </h2>

        {/* Demo Quick Scenarios */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-400 hidden sm:inline">Demo Presets:</span>
          <button
            onClick={() => handleScenario(0, 80)}
            className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition"
            title="Metro Station to Health Centre (reveals diagonal stair trap)"
          >
            Metro → Clinic
          </button>
          <button
            onClick={() => handleScenario(0, 8)}
            className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition"
            title="Metro Station to Market (straight corridor for testing live roadblock & camera)"
          >
            Metro → Market
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-3 items-center">
        {/* Start Point */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Starting Point
            </span>
            <button
              type="button"
              onClick={() => onTogglePicking('start')}
              className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-1 transition ${
                pickingMode === 'start'
                  ? 'bg-emerald-500 text-slate-950 font-semibold animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Crosshair className="w-3 h-3" />
              {pickingMode === 'start' ? 'Click Map...' : 'Pick on Map'}
            </button>
          </label>
          <select
            value={startNode}
            onChange={(e) => onSelectStart(Number(e.target.value))}
            disabled={loading}
            className="w-full bg-slate-800/90 text-white border border-slate-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-400 focus:outline-none"
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {getNodeDisplay(n)}
              </option>
            ))}
          </select>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center pt-4 md:pt-4">
          <button
            type="button"
            onClick={onSwap}
            disabled={loading}
            title="Swap Origin and Destination"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700 transition shadow"
          >
            <ArrowRightLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Destination Point */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              Destination
            </span>
            <button
              type="button"
              onClick={() => onTogglePicking('goal')}
              className={`text-[11px] px-2 py-0.5 rounded flex items-center gap-1 transition ${
                pickingMode === 'goal'
                  ? 'bg-rose-500 text-slate-950 font-semibold animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Crosshair className="w-3 h-3" />
              {pickingMode === 'goal' ? 'Click Map...' : 'Pick on Map'}
            </button>
          </label>
          <select
            value={goalNode}
            onChange={(e) => onSelectGoal(Number(e.target.value))}
            disabled={loading}
            className="w-full bg-slate-800/90 text-white border border-slate-700 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-amber-400 focus:outline-none"
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {getNodeDisplay(n)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
