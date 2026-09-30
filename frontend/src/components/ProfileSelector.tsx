import React from 'react';
import {
  Accessibility,
  Eye,
  UserCheck,
  Footprints,
  Navigation2,
} from 'lucide-react';
import type { Profile } from '../types/api';

interface ProfileSelectorProps {
  profiles: Profile[];
  selectedProfile: string;
  onSelectProfile: (key: string) => void;
  loading: boolean;
}

interface ProfileMeta {
  icon: React.ReactNode;
  hint: string;
  speed: string;
  hardBlocks: string[];
  sensitiveTo: string[];
}

const PROFILE_DETAILS: Record<string, ProfileMeta> = {
  wheelchair: {
    icon: <Accessibility className="w-5 h-5 text-amber-400" />,
    hint: 'Stairs, steep slopes, broken surfaces & missing ramps are impassable.',
    speed: '1.0 m/s',
    hardBlocks: ['Stairs', 'Steep Slopes (≥8%)', 'Broken Pavement', 'Roadworks', 'Missing Curb Ramps', 'Narrow Sidewalks (<0.9m)'],
    sensitiveTo: [],
  },
  elderly: {
    icon: <UserCheck className="w-5 h-5 text-sky-400" />,
    hint: 'Walking aid / reduced stamina: minimizes stairs, steep inclines, and rough surfaces.',
    speed: '0.8 m/s',
    hardBlocks: [],
    sensitiveTo: ['Stairs (8× penalty)', 'Construction (6× penalty)', 'Rough Ground (3× penalty)'],
  },
  low_vision: {
    icon: <Eye className="w-5 h-5 text-purple-400" />,
    hint: 'Requires tactile paving at crossings; strictly avoids construction hazards.',
    speed: '1.1 m/s',
    hardBlocks: ['Construction Zones'],
    sensitiveTo: ['No Tactile Paving (4× penalty)', 'Obstacles (6× penalty)', 'Broken Surface (2.5× penalty)'],
  },
  injured: {
    icon: <Footprints className="w-5 h-5 text-emerald-400" />,
    hint: 'Crutches / temporary injury: avoids steps, steep slopes, and broken paths.',
    speed: '0.7 m/s',
    hardBlocks: [],
    sensitiveTo: ['Stairs (10× penalty)', 'Construction (6× penalty)', 'Slopes (3× penalty)'],
  },
  standard: {
    icon: <Navigation2 className="w-5 h-5 text-slate-400" />,
    hint: 'No accessibility needs: shortest geometric distance (standard navigation app trap).',
    speed: '1.4 m/s',
    hardBlocks: [],
    sensitiveTo: [],
  },
};

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  profiles,
  selectedProfile,
  onSelectProfile,
  loading,
}) => {
  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white tracking-wide uppercase">
            Mobility Profile
          </h2>
          <span className="text-xs text-slate-400">
            (Engine adapts path costs and hard blocks per profile)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {profiles.map((p) => {
          const isSelected = p.key === selectedProfile;
          const meta = PROFILE_DETAILS[p.key] || {
            icon: <Accessibility className="w-5 h-5" />,
            hint: '',
            speed: '1.0 m/s',
            hardBlocks: [],
            sensitiveTo: [],
          };

          return (
            <button
              key={p.key}
              onClick={() => onSelectProfile(p.key)}
              disabled={loading}
              className={`text-left p-3 rounded-xl border transition flex flex-col justify-between h-full relative overflow-hidden group ${
                isSelected
                  ? 'bg-amber-400/10 border-amber-400/60 shadow-lg shadow-amber-400/5 ring-1 ring-amber-400/40'
                  : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              {isSelected && (
                <div className="absolute top-0 right-0 w-12 h-12 bg-amber-400/20 blur-xl rounded-full -mr-4 -mt-4 pointer-events-none" />
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-amber-400/20' : 'bg-slate-700/60'}`}>
                    {meta.icon}
                  </div>
                  <span className="text-[11px] font-mono font-medium text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                    {meta.speed}
                  </span>
                </div>

                <div className="font-semibold text-sm text-white mb-1 group-hover:text-amber-300 transition-colors">
                  {p.label}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                  {meta.hint}
                </p>
              </div>

              {isSelected && (
                <div className="mt-2.5 pt-2 border-t border-amber-400/20 text-[10px] text-amber-300 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping inline-block" />
                  Active Profile
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
