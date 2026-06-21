import React, { useState } from 'react';
import { Eye, EyeOff, Sparkles, AlertCircle, FileText, Settings, Key, HelpCircle, Activity } from 'lucide-react';
import { Language, translations } from '../translations';

interface ScriptInputProps {
  onAnalyze: (script: string, pexelsKey: string, pixabayKey: string, coverrKey: string) => Promise<void>;
  isLoading: boolean;
  loadingStage?: string;
  language: Language;
}

export default function ScriptInput({ onAnalyze, isLoading, loadingStage, language }: ScriptInputProps) {
  const t = translations[language];
  const displayedLoadingStage = loadingStage === "Analyzing Script..." ? t.running_analysis : loadingStage;

  const [script, setScript] = useState<string>(
    "We stand on the edge of a new cosmos. Stars flicker in the endless fabric of space, calling us to explore what lies beyond. For generations, we have looked up and wondered. Now, we build the engines of discovery. We journey through deep nebulae, seeking new horizons and celestial wonders. This is the story of our infinite horizon, and the endless search for knowledge."
  );
  const [pexelsKey, setPexelsKey] = useState<string>(() => {
    return localStorage.getItem('pexels_api_key') || '';
  });
  const [pixabayKey, setPixabayKey] = useState<string>(() => {
    return localStorage.getItem('pixabay_api_key') || '';
  });
  const [coverrKey, setCoverrKey] = useState<string>(() => {
    return localStorage.getItem('coverr_api_key') || '';
  });
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

  // Approximate reading speed helper (estimating ~140 words per minute, i.e., 2.3 words/second)
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round(wordCount / 2.3);
  const minutes = Math.floor(estimatedSeconds / 60);
  const seconds = estimatedSeconds % 60;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!script.trim()) return;
    
    // Persist key locally for convenience
    if (pexelsKey) {
      localStorage.setItem('pexels_api_key', pexelsKey);
    } else {
      localStorage.removeItem('pexels_api_key');
    }
    
    // Persist Pixabay key locally
    if (pixabayKey) {
      localStorage.setItem('pixabay_api_key', pixabayKey);
    } else {
      localStorage.removeItem('pixabay_api_key');
    }
    
    // Persist Coverr key locally
    if (coverrKey) {
      localStorage.setItem('coverr_api_key', coverrKey);
    } else {
      localStorage.removeItem('coverr_api_key');
    }
    
    onAnalyze(script, pexelsKey, pixabayKey, coverrKey);
  };

  return (
    <div className="bg-[#0c0c0e]/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden" id="script-panel">
      {/* Visual background lights */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
            <FileText size={20} />
          </div>
          <div>
            <h2 className="text-sm uppercase tracking-widest font-semibold text-zinc-300">{t.script_processor}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{t.script_desc}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-lg transition-all ${
            showSettings ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
          }`}
          title="Toggle Credentials & Settings / ማስተካከያ"
          id="toggle-settings-btn"
        >
          <Settings size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Settings and Pexels integration keys */}
        {showSettings && (
          <div className="p-4 bg-zinc-950 border border-zinc-800/80 rounded-xl space-y-3.5 animate-fadeIn" id="settings-drawer">
            <div>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-1.5">
                <Key size={13} className="text-indigo-400" />
                Pexels API Key <span className="text-zinc-650 font-normal lowercase">(optional)</span>
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
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
                If left blank, the applet automatically uses a **premium pre-curated cinematic library** with stunning 4K landscape footage so you can generate professional clips instantly. Get a free API key at{" "}
                <a href="https://www.pexels.com/api/" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                  pexels.com/api
                </a>
              </p>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-1.5 mt-3">
                <Key size={13} className="text-indigo-400" />
                Pixabay API Key <span className="text-zinc-650 font-normal lowercase">(optional)</span>
              </label>
              <div className="relative">
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
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
                Pixabay images/videos will be used if provided. Get a free API key at{" "}
                <a href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                  pixabay.com/api/docs
                </a>
              </p>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400 mb-1.5 mt-3">
                <Key size={13} className="text-indigo-400" />
                Coverr API Key <span className="text-zinc-650 font-normal lowercase">(optional - Elite footage)</span>
              </label>
              <div className="relative">
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
              <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
                Rare cinematic videos will be searched via Coverr API if provided.
              </p>
            </div>

            {/* System Diagnostic Center */}
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
                  {/* Gemini Key Status */}
                  <div className="flex items-start justify-between bg-[#080808]/50 p-2 rounded border border-zinc-900/60">
                    <div>
                      <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${diagResult.geminiApiKeyConfigured ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
                        Gemini AI Core (ይዘት መፍጠሪያ)
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {diagResult.geminiApiKeyConfigured ? "የቪዲዮ ይዘት መከፋፈያና Copilot ሞተር ዝግጁ ነው" : "ይዘት ለመፍጠር የGemini ቁልፍ ማዋቀር ያስፈልጋል"}
                      </p>
                    </div>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${diagResult.geminiApiKeyConfigured ? 'text-emerald-400 bg-emerald-500/5' : 'text-rose-450 bg-rose-500/5'}`}>
                      {diagResult.geminiApiKeyConfigured ? "ONLINE" : "MISSING"}
                    </span>
                  </div>

                  {/* Gemini TTS Capability */}
                  <div className="flex items-start justify-between bg-[#080808]/50 p-2 rounded border border-zinc-900/60">
                    <div className="flex-1 pr-2">
                      <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          diagResult.geminiTtsStatus === 'ok' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : (diagResult.geminiTtsStatus === 'quota_limit' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500')
                        }`} />
                        Premium Amharic Narrator (የተራኪ ድምፅ)
                      </div>
                      <p className="text-[10.5px] text-zinc-450 mt-1 leading-relaxed">
                        {diagResult.geminiTtsMessage}
                      </p>
                    </div>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                      diagResult.geminiTtsStatus === 'ok' 
                        ? 'text-emerald-400 bg-emerald-500/5' 
                        : (diagResult.geminiTtsStatus === 'quota_limit' ? 'text-amber-400 bg-amber-500/5' : 'text-rose-400 bg-rose-500/5')
                    }`}>
                      {diagResult.geminiTtsStatus.toUpperCase()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-zinc-500 italic font-mono p-2 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  {language === 'am' ? 'ዳይናሚክ ሲስተም ምርመራ...' : 'Dynamic system verification...'}
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5 mt-4">
            <label className="text-xs font-semibold text-zinc-400">{language === 'am' ? `የታሪኩ ዝርዝር (${wordCount} ቃላት)` : `Script Body (${wordCount} words)`}</label>
            <div className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
              {t.estimated_duration}: <span className="text-indigo-400 font-medium">{minutes > 0 ? `${minutes}${t.estimated_minutes} ` : ''}{seconds}{t.estimated_seconds}</span>
            </div>
          </div>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={t.script_placeholder}
            rows={8}
            className="w-full bg-[#050505] border border-zinc-800 text-zinc-200 placeholder-zinc-650 text-sm rounded-xl p-4 focus:outline-none focus:border-indigo-500/50 resize-y leading-relaxed font-sans"
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
                  ? 'bg-indigo-600/40 cursor-not-allowed text-zinc-400 font-medium'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] active:scale-[0.98]'
              }`}
              id="generate-button"
            >
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-1">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="font-bold text-white uppercase tracking-wider text-[11px] animate-pulse">{language === 'am' ? 'እያቀናበረ ነው...' : 'Processing...'}</span>
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
          <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex items-center gap-3 animate-pulse">
            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping shrink-0" />
            <span className="text-xs font-mono text-indigo-400 font-medium">{displayedLoadingStage}</span>
          </div>
        )}

        <div className="flex items-start gap-2 p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl text-[10.5px] text-zinc-400 leading-relaxed">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-indigo-400" />
          <span>
            <strong>System Security Verification:</strong> {language === 'am' ? 'ይህ ዮቶር የፊልም አቀናባሪ ታሪክዎን በቀጥታ ከቪዲዮ በይነመረብ ጋር በሰከንዶች ውስጥ በማገናኘት እጅግ ማራኪ የሆኑ ቪዲዮዎችን እንዲሰሩ ያስችልዎታል።' : 'The visual text segmenter maps your narration to high-definition footage in real-time. This server uses standard clean models for safety.'}
          </span>
        </div>
      </form>
    </div>
  );
}
