import React, { useState } from 'react';
import {
  CornerDownRight,
  ArrowUp,
  Volume2,
  VolumeX,
  AlertTriangle,
  Info,
  Footprints,
  Compass,
} from 'lucide-react';
import type { RouteStep } from '../types/api';

interface TurnByTurnProps {
  steps: RouteStep[];
  onSelectStepEdge: (edgeId: string) => void;
}

export const TurnByTurn: React.FC<TurnByTurnProps> = ({
  steps,
  onSelectStepEdge,
}) => {
  const [speaking, setSpeaking] = useState(false);

  const handleSpeakDirections = () => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported in this browser.');
      return;
    }

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const fullText = steps
      .map(
        (s, i) =>
          `Step ${i + 1}: ${s.text}. ${
            s.warnings.length ? 'Warning: ' + s.warnings.join('. ') : ''
          }`
      )
      .join(' ');

    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-4 shadow-xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white tracking-wide uppercase flex items-center gap-1.5">
          <CornerDownRight className="w-4 h-4 text-amber-400" />
          Turn-by-Turn Guidance
        </h3>

        {/* Audio / Voice Readout button for low-vision accessibility */}
        <button
          onClick={handleSpeakDirections}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition ${
            speaking
              ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-lg animate-pulse'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
          }`}
          title="Voice narration for visually impaired users"
        >
          {speaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          <span>{speaking ? 'Stop Audio' : 'Speak Directions'}</span>
        </button>
      </div>

      <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
        {steps.map((s, idx) => (
          <div
            key={idx}
            className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 transition flex flex-col gap-1.5 group"
          >
            <div className="flex items-start gap-2.5">
              <span className="w-6 h-6 rounded-full bg-slate-700 text-amber-300 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                {idx + 1}
              </span>

              <div className="flex-1">
                <p className="text-sm font-medium text-slate-100 leading-snug">
                  {s.text}
                </p>

                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Compass className="w-3 h-3 text-slate-500" />
                    Heading {s.heading}
                  </span>
                  <span>•</span>
                  <span>{Math.round(s.distance_m)} metres</span>
                  {s.edge_ids && s.edge_ids.length > 0 && (
                    <>
                      <span>•</span>
                      <button
                        onClick={() => onSelectStepEdge(s.edge_ids[0])}
                        className="text-amber-400 hover:underline cursor-pointer"
                      >
                        Inspect segment
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Warnings attached to this step */}
            {s.warnings && s.warnings.length > 0 && (
              <div className="ml-8 mt-1 flex flex-col gap-1">
                {s.warnings.map((w, wIdx) => {
                  const isBlocked = w.startsWith('BLOCKED');
                  const isUnverified = w.startsWith('Possible, unverified');

                  return (
                    <div
                      key={wIdx}
                      className={`text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                        isBlocked
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 font-medium'
                          : isUnverified
                          ? 'bg-orange-500/10 border-orange-500/30 text-orange-300 font-medium'
                          : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{w}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
