import React from 'react';
import {
  Activity,
  Clock,
  Camera,
  Users,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import type { LiveFeedItem, AlertItem } from '../types/api';

interface LiveFeedProps {
  feed: LiveFeedItem[];
  alerts: AlertItem[];
  onDismissAlert: (index: number) => void;
}

export const LiveFeed: React.FC<LiveFeedProps> = ({
  feed,
  alerts,
  onDismissAlert,
}) => {
  const getKindIcon = (kind: string) => {
    switch (kind) {
      case 'report':
        return <Users className="w-3.5 h-3.5 text-amber-400" />;
      case 'camera':
        return <Camera className="w-3.5 h-3.5 text-purple-400" />;
      case 'alert':
        return <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />;
      case 'time':
        return <Clock className="w-3.5 h-3.5 text-sky-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-col gap-3">
      {/* Active Watcher Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {alerts.map((a, idx) => {
            const isWarning = a.level === 'warning' || a.level === 'critical';
            return (
              <div
                key={idx}
                className={`p-3 rounded-xl border flex items-start justify-between gap-2.5 animate-fadeIn ${
                  isWarning
                    ? 'bg-rose-950/40 border-rose-600/50 text-rose-200'
                    : 'bg-sky-950/40 border-sky-600/50 text-sky-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  <ShieldAlert
                    className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                      isWarning ? 'text-rose-400' : 'text-sky-400'
                    }`}
                  />
                  <div className="text-xs">
                    <span className="font-bold uppercase tracking-wider block mb-0.5">
                      Route Watcher Alert ({a.level})
                    </span>
                    <span>{a.message}</span>
                  </div>
                </div>

                <button
                  onClick={() => onDismissAlert(idx)}
                  className="text-slate-400 hover:text-white p-0.5"
                  title="Dismiss alert"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Feed Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 className="text-sm font-semibold text-white tracking-wide uppercase flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-amber-400" />
          Live Evidence & Event Feed
        </h3>
        <span className="text-[11px] text-slate-400">
          Real-time Bayesian updates
        </span>
      </div>

      {/* Feed Stream */}
      <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
        {feed.length === 0 ? (
          <div className="text-xs text-slate-500 italic p-3 text-center">
            No live events yet.
          </div>
        ) : (
          feed.map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 flex items-start gap-2.5 text-xs text-slate-300"
            >
              <div className="p-1 rounded-md bg-slate-800 flex-shrink-0 mt-0.5">
                {getKindIcon(item.kind)}
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                  <span className="capitalize font-semibold text-slate-300">
                    {item.kind}
                  </span>
                  <span className="font-mono">{item.time}</span>
                </div>
                <p className="text-slate-200 leading-snug">{item.text}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
