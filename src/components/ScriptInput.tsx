import React, { useState, useRef } from "react";
import {
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
  FileText,
  Settings,
  Key,
  HelpCircle,
  Activity,
  Volume2,
  Play,
  TrendingUp,
  Bot,
} from "lucide-react";
import { Language, translations } from "../translations";
import { GOOGLE_TTS_LANGUAGES, VIDEO_TEMPLATES } from "../data";

interface ScriptInputProps {
  onAnalyze: (
    videoMode: "stock" | "veo" | "pollinations",
    inputMode: "script" | "keywords",
  ) => Promise<void>;
  script: string;
  setScript: (script: string) => void;
  isLoading: boolean;
  loadingStage?: string;
  language: Language;
}

export default function ScriptInput({
  onAnalyze,
  script,
  setScript,
  isLoading,
  loadingStage,
  language,
}: ScriptInputProps) {
  const t = translations[language];
  const displayedLoadingStage =
    loadingStage === "Analyzing Script..." ? t.running_analysis : loadingStage;

  const [videoMode, setVideoMode] = useState<"stock" | "veo" | "pollinations">(
    "stock",
  );
  const [inputMode, setInputMode] = useState<"script" | "keywords">("script");

  const [pexelsKey, setPexelsKey] = useState<string>(
    () => localStorage.getItem("pexels_api_key") || "",
  );
  const [pixabayKey, setPixabayKey] = useState<string>(
    () => localStorage.getItem("pixabay_api_key") || "",
  );
  const [coverrKey, setCoverrKey] = useState<string>(
    () => localStorage.getItem("coverr_api_key") || "",
  );

  const [showKey, setShowKey] = useState(false);
  const [showPixabayKey, setShowPixabayKey] = useState(false);
  const [showCoverrKey, setShowCoverrKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false);

  const runDiagnostics = async () => {
    setLoadingDiagnostic(true);
    try {
      const res = await fetch("/api/diagnose");
      if (res.ok) {
        const data = await res.json();
        setDiagResult(data);
      }
    } catch (e) {
      console.error("Diagnostic run failed:", e);
    } finally {
      setLoadingDiagnostic(false);
    }
  };

  React.useEffect(() => {
    if (showSettings) {
      runDiagnostics();
    }
  }, [showSettings]);

  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round(wordCount / 2.3);
  const minutes = Math.floor(estimatedSeconds / 60);
  const seconds = estimatedSeconds % 60;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!script.trim()) return;

    if (pexelsKey) localStorage.setItem("pexels_api_key", pexelsKey);
    else localStorage.removeItem("pexels_api_key");
    if (pixabayKey) localStorage.setItem("pixabay_api_key", pixabayKey);
    else localStorage.removeItem("pixabay_api_key");
    if (coverrKey) localStorage.setItem("coverr_api_key", coverrKey);
    else localStorage.removeItem("coverr_api_key");

    onAnalyze(
      videoMode,
      inputMode,
    );
  };

  return (
    <div
      className="bg-[#0c0c0e]/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
      id="script-panel"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-sm uppercase tracking-widest font-semibold text-zinc-300">
              {t.script_processor}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">{t.script_desc}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-lg transition-all ${
            showSettings
              ? "bg-indigo-500/20 text-indigo-400"
              : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
          }`}
          title="Toggle Credentials & Settings / ማስተካከያ"
          id="toggle-settings-btn"
        >
          <Settings size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {showSettings && (
          <div
            className="p-4 bg-zinc-950 border border-zinc-800/80 rounded-xl space-y-3.5 animate-fadeIn"
            id="settings-drawer"
          >
            <div>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-1.5">
                <Key size={13} className="text-indigo-400" />
                Pexels API Key{" "}
                <span className="text-zinc-650 font-normal lowercase">
                  (optional)
                </span>
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={pexelsKey}
                  onChange={(e) => setPexelsKey(e.target.value)}
                  placeholder="Paste your Pexels API key here..."
                  className="w-full bg-[#050505] border border-zinc-800 text-zinc-100 text-sm rounded-lg pl-3 pr-10 py-2 focus:outline-none focus:border-indigo-500/50"
                  id="pexels-key"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-350"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-1.5 mt-3">
                <Key size={13} className="text-indigo-400" />
                Pixabay API Key{" "}
                <span className="text-zinc-650 font-normal lowercase">
                  (optional)
                </span>
              </label>
              <div className="relative">
                <input
                  type={showPixabayKey ? "text" : "password"}
                  value={pixabayKey}
                  onChange={(e) => setPixabayKey(e.target.value)}
                  className="w-full bg-[#050505] border border-zinc-800 text-zinc-100 text-sm rounded-lg pl-3 pr-10 py-2 focus:outline-none focus:border-indigo-500/50"
                  id="pixabay-key"
                />
                <button
                  type="button"
                  onClick={() => setShowPixabayKey(!showPixabayKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-350"
                >
                  {showPixabayKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-1.5 mt-3">
                <Key size={13} className="text-indigo-400" />
                Coverr API Key{" "}
                <span className="text-zinc-650 font-normal lowercase">
                  (optional - Elite footage)
                </span>
              </label>
              <div className="relative">
                <input
                  type={showCoverrKey ? "text" : "password"}
                  value={coverrKey}
                  onChange={(e) => setCoverrKey(e.target.value)}
                  className="w-full bg-[#050505] border border-zinc-800 text-zinc-100 text-sm rounded-lg pl-3 pr-10 py-2 focus:outline-none focus:border-indigo-500/50"
                  id="coverr-key"
                />
                <button
                  type="button"
                  onClick={() => setShowCoverrKey(!showCoverrKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-350"
                >
                  {showCoverrKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="pt-3.5 border-t border-zinc-900 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
                  <Activity size={13} className="text-indigo-400" />
                  System Diagnostics / የሲስተም ራስ-ፈተሻ
                </span>
                <button
                  type="button"
                  onClick={runDiagnostics}
                  disabled={loadingDiagnostic}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 font-mono flex items-center gap-1"
                >
                  {loadingDiagnostic ? "Checking..." : "[🔄 ዳግም ፈትሽ]"}
                </button>
              </div>

              {diagResult ? (
                <div className="space-y-1.5 text-xs font-sans">
                  <div className="flex items-start justify-between bg-[#080808]/50 p-2 rounded border border-zinc-900/60">
                    <div>
                      <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${diagResult.geminiApiKeyConfigured ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"}`}
                        />
                        {language === "am"
                          ? "ጀሚኒ አይ ፔይንክሰል (ይዘት መፍጠሪያ)"
                          : "Gemini AI Core (Content Gen)"}
                      </div>
                    </div>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${diagResult.geminiApiKeyConfigured ? "text-emerald-400 bg-emerald-500/5" : "text-rose-450 bg-rose-500/5"}`}
                    >
                      {diagResult.geminiApiKeyConfigured
                        ? t.active
                        : t.inactive}
                    </span>
                  </div>

                  <div className="flex items-start justify-between bg-[#080808]/50 p-2 rounded border border-zinc-900/60">
                    <div className="flex-1 pr-2">
                      <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            diagResult.veoStatus?.includes("Operational")
                              ? "bg-emerald-500"
                              : "bg-rose-500"
                          }`}
                        />
                        {t.engine_veo}
                      </div>
                    </div>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${diagResult.veoStatus?.includes("Operational") ? "text-emerald-400 bg-emerald-500/5" : "text-rose-450 bg-rose-500/5"}`}
                    >
                      {diagResult.veoStatus?.includes("Operational")
                        ? t.active
                        : t.inactive}
                    </span>
                  </div>

                  <div className="flex items-start justify-between bg-[#080808]/50 p-2 rounded border border-zinc-900/60">
                    <div className="flex-1 pr-2">
                      <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            diagResult.geminiTtsStatus === "ok"
                              ? "bg-emerald-500"
                              : "bg-rose-500"
                          }`}
                        />
                        {t.engine_tts}
                      </div>
                    </div>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${diagResult.geminiTtsStatus === "ok" ? "text-emerald-400 bg-emerald-500/5" : "text-rose-450 bg-rose-500/5"}`}
                    >
                      {diagResult.geminiTtsStatus === "ok"
                        ? t.active
                        : t.inactive}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-zinc-500 italic font-mono p-2 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  {t.diagnostics_btn}...
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3 mt-4">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
              <Settings size={13} className="text-indigo-400" />
              {t.input_mode}
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => setInputMode("script")}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                inputMode === "script"
                  ? "bg-indigo-500/10 border-indigo-500/50 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.1)]"
                  : "bg-zinc-950 border-zinc-900 text-zinc-500"
              }`}
            >
              <FileText size={14} />
              <span className="text-[10px] font-bold">{t.full_script}</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode("keywords")}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border transition-all ${
                inputMode === "keywords"
                  ? "bg-purple-500/10 border-purple-500/50 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.1)]"
                  : "bg-zinc-950 border-zinc-900 text-zinc-500"
              }`}
            >
              <Sparkles size={14} />
              <span className="text-[10px] font-bold">{t.quick_reel}</span>
            </button>
          </div>

          <div className="flex items-center justify-between mb-3 mt-4">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
              <Volume2 size={13} className="text-indigo-400" />
              {t.video_source}
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button
              type="button"
              onClick={() => setVideoMode("stock")}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-center group ${
                videoMode === "stock"
                  ? "bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                  : "bg-slate-900 border-slate-800 grayscale hover:grayscale-0 hover:border-slate-700"
              }`}
            >
              <Play
                size={14}
                className={
                  videoMode === "stock" ? "text-cyan-400" : "text-slate-500"
                }
              />
              <span
                className={`text-[10px] font-bold mt-1.5 ${videoMode === "stock" ? "text-cyan-400" : "text-slate-500"}`}
              >
                {t.stock_library}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setVideoMode("veo")}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-center relative group ${
                videoMode === "veo"
                  ? "bg-fuchsia-500/10 border-fuchsia-500/50 shadow-[0_0_15px_rgba(217,70,239,0.2)]"
                  : "bg-slate-900 border-slate-800 grayscale hover:grayscale-0 hover:border-slate-700"
              }`}
            >
              <div className="absolute -top-2 -right-1 bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-[8px] font-black text-white px-1.5 py-0.5 rounded-full shadow-lg border border-fuchsia-400/50 animate-pulse">
                FREE
              </div>
              <Sparkles
                size={14}
                className={
                  videoMode === "veo" ? "text-fuchsia-400" : "text-slate-500"
                }
              />
              <span
                className={`text-[10px] font-bold mt-1.5 ${videoMode === "veo" ? "text-fuchsia-400" : "text-slate-500"}`}
              >
                {t.veo_ai_engine}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setVideoMode("pollinations")}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-center relative group ${
                videoMode === "pollinations"
                  ? "bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                  : "bg-slate-900 border-slate-800 grayscale hover:grayscale-0 hover:border-slate-700"
              }`}
            >
              <div className="absolute -top-2 -right-1 bg-blue-500 text-[8px] font-black text-white px-1.5 py-0.5 rounded-full shadow-lg border border-blue-400/50 animate-pulse">
                FREE
              </div>
              <Bot
                size={14}
                className={
                  videoMode === "pollinations"
                    ? "text-blue-400"
                    : "text-slate-500"
                }
              />
              <span
                className={`text-[10px] font-bold mt-1.5 ${videoMode === "pollinations" ? "text-blue-400" : "text-slate-500"}`}
              >
                {/* @ts-ignore */}
                {t.pollinations_engine || "3D Anim AI"}
              </span>
            </button>
          </div>

          <div className="flex items-center justify-between mb-3 mt-4">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              <TrendingUp size={13} className="text-amber-400" />
              {t.trending_templates}
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {VIDEO_TEMPLATES.map((tmp) => (
              <button
                key={tmp.id}
                type="button"
                onClick={() => {
                  setScript(tmp.prompt);
                }}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all text-center group shadow-inner"
              >
                <span className="text-[10px] font-bold text-slate-300 group-hover:text-amber-400">
                  {tmp.am}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-1.5 mt-0">
            <label className="text-xs font-semibold text-slate-400">
              {t.script_body} ({wordCount} {language === "am" ? "ቃላት" : "words"}
              )
            </label>
            <div className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {t.estimated_duration}:{" "}
              <span className="text-cyan-400 font-medium">
                {minutes > 0 ? `${minutes}${t.estimated_minutes} ` : ""}
                {seconds}
                {t.estimated_seconds}
              </span>
            </div>
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={
              inputMode === "keywords"
                ? t.placeholder_keywords
                : t.placeholder_script
            }
            rows={8}
            className="w-full bg-[#030712] border border-slate-800 text-slate-200 placeholder-slate-600 text-sm rounded-xl p-4 focus:outline-none focus:border-cyan-500/50 resize-y leading-relaxed font-sans shadow-inner"
            id="script-text-input"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
          <div className="flex flex-col justify-end">
            <button
              type="submit"
              disabled={isLoading || !script.trim()}
              className={`w-full h-[46px] flex items-center justify-center gap-2 rounded-xl text-xs font-bold uppercase tracking-widest text-white transition-all ${
                isLoading
                  ? "bg-cyan-900/40 cursor-not-allowed text-slate-400 font-medium border border-cyan-900/50"
                  : "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_20px_rgba(6,182,212,0.3)] active:scale-[0.98] ring-1 ring-white/10"
              }`}
              id="generate-button"
            >
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-1">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
                    <span className="font-bold text-cyan-100 uppercase tracking-wider text-[11px] animate-pulse">
                      {language === "am" ? "እያቀናበረ ነው..." : "Processing..."}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <Sparkles size={14} className="fill-current" />
                  {t.generate_scenes_btn}
                </>
              )}
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl flex items-center gap-3 animate-pulse">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping shrink-0" />
            <span className="text-xs font-mono text-cyan-400 font-medium">
              {displayedLoadingStage}
            </span>
          </div>
        )}
      </form>
    </div>
  );
}
