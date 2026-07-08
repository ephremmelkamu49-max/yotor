import React, { useState } from "react";
import { Scene } from "../types";
import { X, Check, Sparkles, Layers, RefreshCw, Zap, Sliders } from "lucide-react";
import { Language } from "../translations";

interface TransitionPlannerProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: Scene[];
  onUpdateScene: (id: string, updates: Partial<Scene>) => void;
  language: Language;
}

const AVAILABLE_TRANSITIONS = [
  { id: "none", name: "None / Cut", amName: "ምንም", desc: "Hard cut between scenes", icon: "✂️" },
  { id: "crossfade", name: "Crossfade", amName: "ክሮስፌድ", desc: "Smooth overlay blend", icon: "🌅" },
  { id: "slide", name: "Slide", amName: "ስላይድ", desc: "Slide transition effect", icon: "➡️" },
  { id: "wipe", name: "Wipe", amName: "ዋይፕ", desc: "Wipe from side to side", icon: "🧹" },
  { id: "zoom", name: "Zoom Transition", amName: "ዙም", desc: "Scale transition zoom", icon: "🔍" },
  { id: "spin", name: "Spin", amName: "ስፒን", desc: "Spin transition rotate", icon: "🔄" },
  { id: "blur", name: "Blur Fade", amName: "ብዥታ", desc: "Out-of-focus blur transition", icon: "🌫️" },
  { id: "flicker", name: "Flicker / Strobe", amName: "ፍሊከር", desc: "Retro flicker transition", icon: "⚡" },
  { id: "glitch", name: "Glitch / Distortion", amName: "ግሊች", desc: "Cyberpunk chromatic glitch", icon: "👾" },
  { id: "pixelate", name: "Pixelate", amName: "ፒክሰል", desc: "Retro mosaic pixel blend", icon: "🧱" },
  { id: "random", name: "Random Mix", amName: "ደራሽ", desc: "Pick a transition at random", icon: "🎲" },
];

export default function TransitionPlanner({
  isOpen,
  onClose,
  scenes,
  onUpdateScene,
  language,
}: TransitionPlannerProps) {
  const [selectedBatchTransition, setSelectedBatchTransition] = useState<string>("crossfade");

  if (!isOpen) return null;

  const handleApplyBatch = () => {
    // Apply selected transition to all scenes except the last one
    scenes.forEach((scene, index) => {
      if (index < scenes.length - 1) {
        onUpdateScene(scene.id, {
          transitionToNext: selectedBatchTransition as any,
          transitionType: selectedBatchTransition as any,
        });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-[#0c0c0e] border border-zinc-800/80 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-900 bg-zinc-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Sparkles size={20} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight uppercase">
                {language === "am" ? "የእይታ ሽግግር እቅድ አውጪ" : "Visual Transition Planner"}
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {language === "am"
                  ? "በቪዲዮ ትዕይንቶች መካከል የሚከሰቱትን ልዩ የሽግግር ውጤቶች ያቅዱ"
                  : "Design and customize specific cinematic transitions between your scenes."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-900 rounded-xl text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Batch Tools Panel */}
        {scenes.length > 1 && (
          <div className="p-5 bg-indigo-500/5 border-b border-indigo-500/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sliders size={16} className="text-indigo-400" />
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                {language === "am" ? "በጅምላ ማስተካከያ (Batch Action)" : "Batch Apply Transition"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedBatchTransition}
                onChange={(e) => setSelectedBatchTransition(e.target.value)}
                className="bg-zinc-950 border border-zinc-900 text-zinc-300 text-xs rounded-xl px-3.5 py-2 outline-none cursor-pointer hover:border-zinc-800 transition-all font-sans font-semibold"
              >
                {AVAILABLE_TRANSITIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.icon} {language === "am" ? t.amName : t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyBatch}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/10 active:scale-95 flex items-center gap-1.5 uppercase tracking-wider"
              >
                <Layers size={13} />
                {language === "am" ? "ሁሉንም ቀይር" : "Apply to All Transitions"}
              </button>
            </div>
          </div>
        )}

        {/* Scrollable list of transitions */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {scenes.length <= 1 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500">
              <Zap size={32} className="text-zinc-600 mb-2 animate-bounce" />
              <p className="text-sm font-semibold">
                {language === "am" ? "ሽግግር ለማቀድ ቢያንስ ሁለት ትዕይንቶች ያስፈልጋሉ" : "At least two scenes are required to plan transitions."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {scenes.map((scene, idx) => {
                if (idx === scenes.length - 1) return null; // No transition after the last scene

                const nextScene = scenes[idx + 1];
                const currentTransition = scene.transitionToNext || scene.transitionType || "none";

                return (
                  <div
                    key={`trans-${scene.id}`}
                    className="bg-zinc-950/40 border border-zinc-900 hover:border-zinc-800/80 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-6 transition-all"
                  >
                    {/* Source Scene S-i */}
                    <div className="flex items-center gap-3 shrink-0 w-full md:w-[180px]">
                      {scene.videoThumb ? (
                        <div className="w-16 h-12 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 shrink-0">
                          <img
                            src={scene.videoThumb}
                            alt=""
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-12 rounded-lg border border-zinc-800 bg-zinc-900 shrink-0 flex items-center justify-center text-zinc-600 text-xs">
                          S-{idx + 1}
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
                          Scene {idx + 1}
                        </span>
                        <p className="text-xs text-zinc-300 font-semibold truncate">
                          {scene.text || "(No Text)"}
                        </p>
                      </div>
                    </div>

                    {/* Transition Selector */}
                    <div className="flex-1 w-full py-2 px-4 bg-zinc-950 rounded-xl border border-zinc-900/60 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-semibold text-lg">
                          {AVAILABLE_TRANSITIONS.find((t) => t.id === currentTransition)?.icon || "⚡"}
                        </div>
                        <div>
                          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">
                            Transition Effect
                          </span>
                          <span className="text-xs font-bold text-white uppercase tracking-wide">
                            {language === "am"
                              ? AVAILABLE_TRANSITIONS.find((t) => t.id === currentTransition)?.amName || currentTransition
                              : AVAILABLE_TRANSITIONS.find((t) => t.id === currentTransition)?.name || currentTransition}
                          </span>
                        </div>
                      </div>

                      {/* Dropdown for specific transition selection */}
                      <select
                        value={currentTransition}
                        onChange={(e) => {
                          const val = e.target.value;
                          onUpdateScene(scene.id, {
                            transitionToNext: val as any,
                            transitionType: val as any,
                          });
                        }}
                        className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-lg px-3 py-1.5 outline-none cursor-pointer transition-colors font-sans font-bold w-full sm:w-[160px]"
                      >
                        {AVAILABLE_TRANSITIONS.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.icon} {language === "am" ? t.amName : t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Target Scene S-(i+1) */}
                    <div className="flex items-center gap-3 shrink-0 w-full md:w-[180px] md:justify-end">
                      <div className="min-w-0 md:text-right">
                        <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-wider">
                          Scene {idx + 2}
                        </span>
                        <p className="text-xs text-zinc-300 font-semibold truncate">
                          {nextScene.text || "(No Text)"}
                        </p>
                      </div>
                      {nextScene.videoThumb ? (
                        <div className="w-16 h-12 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 shrink-0">
                          <img
                            src={nextScene.videoThumb}
                            alt=""
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-12 rounded-lg border border-zinc-800 bg-zinc-900 shrink-0 flex items-center justify-center text-zinc-600 text-xs">
                          S-{idx + 2}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-zinc-950/40 border-t border-zinc-900 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-bold rounded-2xl transition-all uppercase tracking-wider"
          >
            {language === "am" ? "ዝጋ" : "Close Planner"}
          </button>
        </div>

      </div>
    </div>
  );
}
