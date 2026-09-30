import React from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Milestone,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import type { RouteData, NaiveData } from '../types/api';

interface RouteComparisonProps {
  route: RouteData | null;
  naive: NaiveData | null;
  profileLabel: string;
}

export const RouteComparison: React.FC<RouteComparisonProps> = ({
  route,
  naive,
  profileLabel,
}) => {
  if (!route) return null;

  const isBestEffort = route.status === 'best_effort';
  const hasNaiveTraps = naive && naive.blocking > 0;
  const detourDistance = naive ? route.distance_m - naive.distance_m : 0;

  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-col gap-3">
      {/* Route Status Banner */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {route.fully_accessible ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Fully Accessible Route Found</span>
            </div>
          ) : isBestEffort ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold">
              <ShieldAlert className="w-4 h-4" />
              <span>Best Effort Route (Obstacles Listed)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4" />
              <span>Route with Caution Warnings</span>
            </div>
          )}

          {route.unverified > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-300 border border-orange-500/20">
              {route.unverified} unverified warning{route.unverified > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="text-xs font-medium text-slate-400">
          Profile: <span className="text-white font-semibold">{profileLabel}</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex flex-col">
          <span className="text-slate-400 text-xs flex items-center gap-1">
            <Milestone className="w-3.5 h-3.5 text-amber-400" />
            Distance
          </span>
          <span className="text-lg font-bold text-white mt-0.5">
            {Math.round(route.distance_m)} m
          </span>
          {detourDistance > 0 && (
            <span className="text-[10px] text-slate-400">
              +{Math.round(detourDistance)} m safe detour
            </span>
          )}
        </div>

        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex flex-col">
          <span className="text-slate-400 text-xs flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            Est. Time
          </span>
          <span className="text-lg font-bold text-white mt-0.5">
            {Math.round(route.minutes)} min
          </span>
          <span className="text-[10px] text-slate-400">
            at walking pace
          </span>
        </div>

        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex flex-col">
          <span className="text-slate-400 text-xs flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Blockers Avoided
          </span>
          <span className="text-lg font-bold text-emerald-400 mt-0.5">
            {naive ? naive.blocking : 0}
          </span>
          <span className="text-[10px] text-slate-400">
            on shortest path
          </span>
        </div>

        <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/60 flex flex-col">
          <span className="text-slate-400 text-xs flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            Turn-by-Turn
          </span>
          <span className="text-lg font-bold text-white mt-0.5">
            {route.steps.length}
          </span>
          <span className="text-[10px] text-slate-400">
            navigation steps
          </span>
        </div>
      </div>

      {/* Naive Route Failure Breakdown */}
      {hasNaiveTraps && (
        <div className="bg-rose-950/20 border border-rose-800/40 rounded-xl p-3.5 text-xs text-rose-200 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-bold text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>Why Distance-Only Navigation Fails:</span>
          </div>
          <p className="text-rose-200/90 leading-relaxed">
            A standard navigation engine would suggest the shortest path of{' '}
            <strong className="text-white">{Math.round(naive!.distance_m)} m</strong>, but it exposes a{' '}
            <strong>{profileLabel.toLowerCase()}</strong> to{' '}
            <strong className="text-white underline">{naive!.blocking} impassable barrier(s)</strong>:
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {naive!.issues
              .filter((i) => i.blocking)
              .map((i, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 rounded bg-rose-900/40 border border-rose-700/40 text-rose-200 font-medium text-[11px]"
                >
                  ⚠️ {i.street}: {i.label} {i.detail ? `(${i.detail})` : ''}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Backend Route Summary Text */}
      <div className="bg-slate-800/40 rounded-xl p-3 text-xs text-slate-300 border border-slate-700/40 italic">
        "{route.summary}"
      </div>
    </div>
  );
};
