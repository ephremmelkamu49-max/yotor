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
  Save,
  Check,
  Clock,
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
  const t = translations[language] || translations.en;
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
  const [openaiKey, setOpenaiKey] = useState<string>(
    () => localStorage.getItem("openai_api_key") || "",
  );

  const [showKey, setShowKey] = useState(false);
  const [showPixabayKey, setShowPixabayKey] = useState(false);
  const [showCoverrKey, setShowCoverrKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false);

  const [pexelsSaved, setPexelsSaved] = useState(false);
  const [pixabaySaved, setPixabaySaved] = useState(false);
  const [coverrSaved, setCoverrSaved] = useState(false);
  const [openaiSaved, setOpenaiSaved] = useState(false);
  const [generatingTemplateId, setGeneratingTemplateId] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<"short" | "medium" | "long" | "docu_15min">("short");

  const handleTemplateClick = async (tmpId: string) => {
    setGeneratingTemplateId(tmpId);
    try {
      const res = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: tmpId, language, duration: selectedDuration }),
      });
      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          if (data && data.prompt) {
            setScript(data.prompt);
            return;
          }
        } catch (jsonErr) {
          console.warn("Response from server was not valid JSON:", text, jsonErr);
        }
      }
    } catch (e) {
      console.error("Failed to generate dynamic prompt:", e);
    } finally {
      setGeneratingTemplateId(null);
    }
    // Fallback if everything fails
    const found = VIDEO_TEMPLATES.find((t) => t.id === tmpId);
    if (found) {
      setScript(found.prompt);
    }
  };

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
    if (openaiKey) localStorage.setItem("openai_api_key", openaiKey);
    else localStorage.removeItem("openai_api_key");

    onAnalyze(
      videoMode,
      inputMode,
    );
  };

  return (
    <div
      className="bento-card p-6 relative overflow-hidden"
      id="script-panel"
    >
      <div className="absolute top-0 right-0 w-72 h-72 bg-[#00D2D3]/10 rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-[#FF6B6B]/10 rounded-full blur-[90px] pointer-events-none" />

      <div className="flex items-center justify-between border-b border-violet-500/15 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#00D2D3]/10 text-[#00D2D3] rounded-2xl border border-[#00D2D3]/20 shadow-[0_0_15px_rgba(0,210,211,0.2)]">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-sm uppercase tracking-widest font-extrabold text-white font-display">
              {t.script_processor}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{t.script_desc}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2.5 rounded-xl transition-all ${
            showSettings
              ? "bg-[#00D2D3]/20 text-[#00D2D3] border border-[#00D2D3]/30"
              : "btn-aurora-glass"
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
              <div className="flex gap-2">
                <div className="relative flex-1">
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
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = pexelsKey.trim();
                    if (trimmed) {
                      localStorage.setItem("pexels_api_key", trimmed);
                    } else {
                      localStorage.removeItem("pexels_api_key");
                    }
                    setPexelsSaved(true);
                    setTimeout(() => setPexelsSaved(false), 2000);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 min-w-[75px] ${
                    pexelsSaved
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white border border-transparent"
                  }`}
                  title="Save Pexels Key / አስቀምጥ"
                >
                  {pexelsSaved ? (
                    <>
                      <Check size={13} />
                      {language === "am" ? "ተቀምጧል" : "Saved"}
                    </>
                  ) : (
                    <>
                      <Save size={13} />
                      {language === "am" ? "አስቀምጥ" : "Save"}
                    </>
                  )}
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
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPixabayKey ? "text" : "password"}
                    value={pixabayKey}
                    onChange={(e) => setPixabayKey(e.target.value)}
                    placeholder="Paste your Pixabay API key here..."
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
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = pixabayKey.trim();
                    if (trimmed) {
                      localStorage.setItem("pixabay_api_key", trimmed);
                    } else {
                      localStorage.removeItem("pixabay_api_key");
                    }
                    setPixabaySaved(true);
                    setTimeout(() => setPixabaySaved(false), 2000);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 min-w-[75px] ${
                    pixabaySaved
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white border border-transparent"
                  }`}
                  title="Save Pixabay Key / አስቀምጥ"
                >
                  {pixabaySaved ? (
                    <>
                      <Check size={13} />
                      {language === "am" ? "ተቀምጧል" : "Saved"}
                    </>
                  ) : (
                    <>
                      <Save size={13} />
                      {language === "am" ? "አስቀምጥ" : "Save"}
                    </>
                  )}
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
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showCoverrKey ? "text" : "password"}
                    value={coverrKey}
                    onChange={(e) => setCoverrKey(e.target.value)}
                    placeholder="Paste your Coverr API key here..."
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
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = coverrKey.trim();
                    if (trimmed) {
                      localStorage.setItem("coverr_api_key", trimmed);
                    } else {
                      localStorage.removeItem("coverr_api_key");
                    }
                    setCoverrSaved(true);
                    setTimeout(() => setCoverrSaved(false), 2000);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 min-w-[75px] ${
                    coverrSaved
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white border border-transparent"
                  }`}
                  title="Save Coverr Key / አስቀምጥ"
                >
                  {coverrSaved ? (
                    <>
                      <Check size={13} />
                      {language === "am" ? "ተቀምጧል" : "Saved"}
                    </>
                  ) : (
                    <>
                      <Save size={13} />
                      {language === "am" ? "አስቀምጥ" : "Save"}
                    </>
                  )}
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
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-300">
              <Volume2 size={13} className="text-[#00D2D3]" />
              {t.video_source}
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            <button
              type="button"
              onClick={() => setVideoMode("stock")}
              className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all text-center group ${
                videoMode === "stock"
                  ? "bg-[#00D2D3]/15 border-[#00D2D3]/60 shadow-[0_0_20px_rgba(0,210,211,0.25)]"
                  : "bg-[#141026]/50 border-violet-500/10 text-slate-400 hover:border-violet-500/30"
              }`}
            >
              <Play
                size={16}
                className={
                  videoMode === "stock" ? "text-[#00D2D3]" : "text-slate-500"
                }
              />
              <span
                className={`text-[10px] font-bold mt-1.5 uppercase tracking-wider ${videoMode === "stock" ? "text-[#00D2D3]" : "text-slate-400"}`}
              >
                {t.stock_library}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setVideoMode("veo")}
              className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all text-center relative group ${
                videoMode === "veo"
                  ? "bg-[#FF6B6B]/15 border-[#FF6B6B]/60 shadow-[0_0_20px_rgba(255,107,107,0.25)]"
                  : "bg-[#141026]/50 border-violet-500/10 text-slate-400 hover:border-violet-500/30"
              }`}
            >
              <div className="absolute -top-2.5 -right-1 bg-gradient-to-r from-[#FF6B6B] to-[#00D2D3] text-[8px] font-black text-white px-2 py-0.5 rounded-full shadow-lg border border-white/20 animate-pulse">
                PRO
              </div>
              <Sparkles
                size={16}
                className={
                  videoMode === "veo" ? "text-[#FF6B6B]" : "text-slate-500"
                }
              />
              <span
                className={`text-[10px] font-bold mt-1.5 uppercase tracking-wider ${videoMode === "veo" ? "text-[#FF6B6B]" : "text-slate-400"}`}
              >
                {t.veo_ai_engine}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setVideoMode("pollinations")}
              className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all text-center relative group ${
                videoMode === "pollinations"
                  ? "bg-purple-500/15 border-purple-500/60 shadow-[0_0_20px_rgba(168,85,247,0.25)]"
                  : "bg-[#141026]/50 border-violet-500/10 text-slate-400 hover:border-violet-500/30"
              }`}
            >
              <div className="absolute -top-2.5 -right-1 bg-purple-500 text-[8px] font-black text-white px-2 py-0.5 rounded-full shadow-lg border border-white/20 animate-pulse">
                FREE
              </div>
              <Bot
                size={16}
                className={
                  videoMode === "pollinations"
                    ? "text-purple-400"
                    : "text-slate-500"
                }
              />
              <span
                className={`text-[10px] font-bold mt-1.5 uppercase tracking-wider ${videoMode === "pollinations" ? "text-purple-400" : "text-slate-400"}`}
              >
                {/* @ts-ignore */}
                {t.pollinations_engine || "3D Anim AI"}
              </span>
            </button>
          </div>

          <div className="flex flex-col gap-2 mt-4 mb-3">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-300">
              <Clock size={13} className="text-[#00D2D3] animate-pulse" />
              {language === "am" ? "የታሪክ ርዝማኔ (Duration)" : "Story Duration / Length"}
            </label>
            <div className="grid grid-cols-4 gap-1.5 bg-[#0B0914] p-1.5 rounded-2xl border border-violet-500/15">
              {(
                [
                  { id: "short", en: "30s Short", am: "አጭር (30ሰ)" },
                  { id: "medium", en: "1-2 Min", am: "1-2 ደቂቃ" },
                  { id: "long", en: "5 Min", am: "5 ደቂቃ" },
                  { id: "docu_15min", en: "15 Min", am: "15 ደቂቃ" },
                ] as const
              ).map((dur) => (
                <button
                  key={dur.id}
                  type="button"
                  onClick={() => setSelectedDuration(dur.id)}
                  className={`py-2 px-1 rounded-xl text-[9.5px] font-bold uppercase transition-all ${
                    selectedDuration === dur.id
                      ? "bg-[#00D2D3]/20 text-[#00D2D3] border border-[#00D2D3]/40 shadow-[0_0_10px_rgba(0,210,211,0.2)]"
                      : "text-slate-400 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  {language === "am" ? dur.am : dur.en}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between mb-3 mt-4">
            <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-300">
              <TrendingUp size={13} className="text-[#FF6B6B]" />
              {t.trending_templates} <span className="text-[9px] text-slate-500 font-normal normal-case">({language === "am" ? "አዲስ ታሪክ ይፈጥራል" : "generates fresh script"})</span>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2.5 mb-5">
            {VIDEO_TEMPLATES.map((tmp) => {
              const isGeneratingThis = generatingTemplateId === tmp.id;
              const isGeneratingAny = generatingTemplateId !== null;
              return (
                <button
                  key={tmp.id}
                  type="button"
                  disabled={isGeneratingAny}
                  onClick={() => handleTemplateClick(tmp.id)}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all text-center group relative overflow-hidden ${
                    isGeneratingThis
                      ? "bg-[#FF6B6B]/15 border-[#FF6B6B]/60 text-[#FF6B6B] animate-pulse"
                      : isGeneratingAny
                        ? "bg-[#141026]/40 border-transparent text-slate-600 opacity-40 cursor-not-allowed"
                        : "bg-[#141026]/60 border-violet-500/10 hover:border-[#FF6B6B]/50 hover:bg-[#FF6B6B]/10 cursor-pointer text-slate-300 active:scale-95"
                  }`}
                  title={language === "am" ? "አዲስ ኦሪጅናል ታሪክ ለመፍጠር ይጫኑ" : "Click to generate a unique, fresh story"}
                >
                  {isGeneratingThis ? (
                    <div className="flex flex-col items-center justify-center gap-1">
                      <div className="w-4 h-4 border-2 border-[#FF6B6B] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[8.5px] font-medium text-[#FF6B6B]">
                        {language === "am" ? "እያዘጋጀ..." : "Generating..."}
                      </span>
                    </div>
                  ) : (
                    <>
                      <Sparkles size={14} className="text-[#FF6B6B] group-hover:scale-125 transition-transform mb-1" />
                      <span className="text-[10px] font-bold group-hover:text-[#FF6B6B] font-display uppercase tracking-wider">
                        {language === "am" ? tmp.am : tmp.name}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mb-2 mt-2">
            <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wider font-display">
              {t.script_body} ({wordCount} {language === "am" ? "ቃላት" : "words"})
            </label>
            <div className="text-[10px] font-mono text-slate-300 bg-[#0B0914] px-2.5 py-1 rounded-xl border border-violet-500/20">
              {t.estimated_duration}:{" "}
              <span className="text-[#00D2D3] font-bold">
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
            className="w-full bg-[#0B0914]/90 border border-violet-500/20 text-slate-100 placeholder-slate-500 text-sm rounded-2xl p-4 focus:outline-none focus:border-[#00D2D3] resize-y leading-relaxed font-sans shadow-inner transition-all"
            id="script-text-input"
            required
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading || !script.trim()}
            className={`w-full py-4 flex items-center justify-center gap-2.5 rounded-2xl text-xs font-extrabold uppercase tracking-widest text-white transition-all ${
              isLoading
                ? "bg-[#141026] border border-[#00D2D3]/30 text-slate-400 cursor-not-allowed"
                : "btn-aurora-coral shadow-lg active:scale-95"
            }`}
            id="generate-button"
          >
            {isLoading ? (
              <div className="flex items-center gap-3">
                <div className="relative w-5 h-5 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-t-[#00D2D3] border-r-[#FF6B6B] border-b-transparent border-l-transparent animate-spin" />
                  <div className="w-2 h-2 rounded-full bg-[#00D2D3] animate-ping" />
                </div>
                <span className="font-extrabold text-[#00D2D3] uppercase tracking-wider text-[11px] animate-pulse">
                  {language === "am" ? "በጥበብ እያቀናበረ ነው..." : "GENERATING SCENES..."}
                </span>
              </div>
            ) : (
              <>
                <Sparkles size={16} className="fill-current text-white" />
                {t.generate_scenes_btn}
              </>
            )}
          </button>
        </div>

        {/* Custom Magical Rendering Ring / Loading state card */}
        {isLoading && (
          <div className="p-4 bg-[#141026]/90 border border-[#00D2D3]/40 rounded-2xl flex items-center gap-4 shadow-[0_0_25px_rgba(0,210,211,0.2)] animate-fadeIn">
            <div className="relative w-8 h-8 shrink-0 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-t-[#00D2D3] border-r-[#7000FF] border-b-[#FF6B6B] border-l-transparent animate-spin" />
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-[#00D2D3] to-[#FF6B6B] animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-mono font-extrabold text-[#00D2D3] uppercase tracking-wider truncate">
                {displayedLoadingStage}
              </div>
              <div className="w-full bg-[#0B0914] h-1.5 rounded-full overflow-hidden mt-1.5">
                <div className="h-full bg-gradient-to-r from-[#00D2D3] via-[#7000FF] to-[#FF6B6B] w-full animate-pulse" />
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
