import React from 'react';
import { Clock, RotateCcw, FastForward, ShieldAlert, Sparkles, Navigation } from 'lucide-react';
import type { Clock as ClockType } from '../types/api';

interface NavbarProps {
  clock: ClockType | null;
  onAdvanceTime: (hours: number) => void;
  onResetDemo: () => void;
  loading: boolean;
  activeAlertCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  clock,
  onAdvanceTime,
  onResetDemo,
  loading,
  activeAlertCount,
}) => {
  return (
    <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur sticky top-0 z-50 px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-amber-400/20">
              <Navigation className="w-6 h-6 transform -rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  AccessRoute
                </h1>
                <span className="bg-amber-400/10 text-amber-400 text-xs px-2 py-0.5 rounded-full font-semibold border border-amber-400/20">
                  Live Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Uncertainty-aware accessibility navigation with temporal decay
              </p>
            </div>
          </div>

          {activeAlertCount > 0 && (
            <div className="flex md:hidden items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-medium border border-rose-500/30 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{activeAlertCount} alert{activeAlertCount > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Feature Pills */}
        <div className="hidden lg:flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Bayesian Fusion
          </span>
          <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            Dynamic Decay
          </span>
          <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            Proactive Watcher
          </span>
          <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            Computer Vision Ingest
          </span>
        </div>

        {/* Simulated Time Controls */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400 font-medium">Simulated:</span>
            <span className="font-semibold text-white tracking-wide">
              {clock ? clock.label : 'Loading...'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onAdvanceTime(1)}
              disabled={loading}
              title="Advance simulated time by 1 hour"
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-lg border border-slate-700 transition disabled:opacity-50 flex items-center gap-1"
            >
              <FastForward className="w-3 h-3 text-amber-400" />
              +1h
            </button>
            <button
              onClick={() => onAdvanceTime(6)}
              disabled={loading}
              title="Advance simulated time by 6 hours"
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-lg border border-slate-700 transition disabled:opacity-50"
            >
              +6h
            </button>
            <button
              onClick={() => onAdvanceTime(24)}
              disabled={loading}
              title="Advance simulated time by 1 day (decays temporary obstacles)"
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-lg border border-slate-700 transition disabled:opacity-50"
            >
              +1d
            </button>
            <button
              onClick={onResetDemo}
              disabled={loading}
              title="Reset simulation to original baseline"
              className="p-1.5 text-xs font-medium bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 rounded-lg border border-slate-700 hover:border-rose-800 transition disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
