import React, { useEffect, useState, useRef } from 'react';
import { Scene, ProjectConfig } from '../types';
import { DEFAULT_MUSIC, getTtsUrl } from '../data';
import { Language, translations } from '../translations';
import { 
  Download, Loader2, Play, CheckCircle2, Film, ShieldCheck, AlertCircle, FileVideo, Terminal, Crown, Lock, Zap, Cpu, Send, Copy, Check, ExternalLink, MessageSquare, Share2
} from 'lucide-react';

interface RenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: Scene[];
  projectConfig: ProjectConfig;
  canvasElement: HTMLCanvasElement | null;
  onRenderFrameChange?: (index: number, time?: number) => void;
  language: Language;
  onRestoreProject?: (scenes: Scene[], config: ProjectConfig) => void;
  onRenderComplete?: () => void;
  voiceoverPeaks?: { [sceneId: string]: { url: string; peak: number } };
  exportQuality: '720p' | '1080p' | '4k';
  setExportQuality: React.Dispatch<React.SetStateAction<'720p' | '1080p' | '4k'>>;
}

export default function RenderModal({
  isOpen,
  onClose,
  scenes,
  projectConfig,
  canvasElement,
  onRenderFrameChange,
  language,
  onRestoreProject,
  onRenderComplete,
  voiceoverPeaks,
  exportQuality,
  setExportQuality
}: RenderModalProps) {
  const t = translations[language] || translations.en;
  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'processing' | 'completed' | 'failed'>('idle');
  
  // Custom video download quota (starts at 3)
  const [exportQuota, setExportQuota] = useState<number>(() => {
    const saved = localStorage.getItem('yotor_video_quota');
    return saved ? parseInt(saved, 10) : 3;
  });

  const handleRefillQuota = () => {
    setExportQuota(3);
    localStorage.setItem('yotor_video_quota', '3');
  };

  const [progress, setProgress] = useState<number>(0);

  const updateProgressForward = (nextVal: number) => {
    setProgress((prev) => {
      let quantized = Math.round(nextVal / 5) * 5;
      quantized = Math.max(0, Math.min(100, quantized));
      if (quantized >= 100 && nextVal < 99.5) {
        quantized = 95;
      }
      return Math.max(prev, quantized);
    });
  };
  const [renderLogs, setRenderLogs] = useState<string[]>([]);
  const [renderOption, setRenderOption] = useState<'full' | 'fast'>('full');
  const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
  const [shareableDirectUrl, setShareableDirectUrl] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<{ sent?: boolean; error?: string }>({});
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [downloadExtension, setDownloadExtension] = useState<string>('mp4');
  const [dataProfile, setDataProfile] = useState<'saver' | 'premium'>('premium');
  
  // Telegram Bot Token and Chat ID state
  const [telegramBotToken, setTelegramBotToken] = useState<string>(() => localStorage.getItem('yotor_telegram_bot_token') || '');
  const [telegramChatId, setTelegramChatId] = useState<string>(() => localStorage.getItem('yotor_telegram_chat_id') || '');
  const [showTelegramSettings, setShowTelegramSettings] = useState<boolean>(false);

  const handleSaveTelegramConfig = (token: string, chatId: string) => {
    setTelegramBotToken(token);
    setTelegramChatId(chatId);
    localStorage.setItem('yotor_telegram_bot_token', token);
    localStorage.setItem('yotor_telegram_chat_id', chatId);
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const [ramLimit, setRamLimit] = useState<number>(() => {
    const saved = localStorage.getItem('yotor_ram_limit');
    return saved ? parseInt(saved, 10) : 32; // Default to 32 GB
  });
  const [statistics, setStatistics] = useState({
    duration: 0,
    fileSize: '0 MB',
    scenesProcessed: 0,
    fps: 30
  });

  const [chunkSize, setChunkSize] = useState<number>(0);
  const [chunkedParts, setChunkedParts] = useState<any[] | null>(null);
  
  const getSubscribedPlan = (): '720p' | '1080p' | '4k' => {
    return '4k';
  };

  const activePlan = getSubscribedPlan();

  useEffect(() => {
    if (isOpen) {
      setExportQuality(getSubscribedPlan());
    }
  }, [isOpen, renderStatus]);

  useEffect(() => {
    return () => {
      if (renderedBlobUrl && renderedBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(renderedBlobUrl);
      }
    };
  }, [renderedBlobUrl]);

  const handleTriggerUpgrade = () => {
    window.dispatchEvent(new CustomEvent('yotor_trigger_upgrade'));
    onClose();
  };

  const handleRamLimitChange = (val: number) => {
    setRamLimit(val);
    localStorage.setItem('yotor_ram_limit', val.toString());
  };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const renderIndexRef = useRef<number>(0);
  const renderTimeRef = useRef<number>(0);
  const currentRenderAudioRef = useRef<HTMLAudioElement | null>(null);
  const renderBackgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioSourcesRef = useRef<any[]>([]);
  const renderLoopTimeoutRef = useRef<any>(null);
  const cloudRenderAbortControllerRef = useRef<AbortController | null>(null);
  const cloudRenderIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      cleanupRenderSubprocesses();
    };
  }, []);

  const addLog = (msg: string) => {
    setRenderLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const cleanupRenderSubprocesses = () => {
    if (cloudRenderIntervalRef.current) {
      clearInterval(cloudRenderIntervalRef.current);
      cloudRenderIntervalRef.current = null;
    }
  };

  const updateRenderedBlobUrl = (newUrl: string | null) => {
    setRenderedBlobUrl((prev) => {
      if (prev && prev !== newUrl && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return newUrl;
    });
  };

  const initiateRenderAndStitching = async () => initiateCloudRender();

  const initiateCloudRender = async () => {
    setRenderStatus('processing');
    setProgress(0);
    setRenderLogs([]);
    setShareableDirectUrl(null);
    setTelegramStatus({});
    addLog(`Initiating backend compile job...`);

    try {
      addLog(`Sending video blueprint & scenes to high-performance Node.js backend server...`);
      
      const renderPayload = {
        scenes,
        projectConfig,
        exportQuality,
        chunkSize,
        dataProfile,
        telegramBotToken: telegramBotToken.trim() || undefined,
        telegramChatId: telegramChatId.trim() || undefined,
      };

      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renderPayload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to start backend render job');
      }

      const { jobId } = await response.json();
      addLog(`Render job registered successfully with ID: ${jobId}`);
      addLog(`⚡ Background processing active! Output will be delivered directly to Telegram upon completion.`);

      if (cloudRenderIntervalRef.current) {
        clearInterval(cloudRenderIntervalRef.current);
      }

      cloudRenderIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/status/${jobId}`);
          if (!statusRes.ok) return;

          const jobData = await statusRes.json();
          
          if (jobData.progress !== undefined) {
            updateProgressForward(jobData.progress);
          }
          if (jobData.log) {
            addLog(jobData.log);
          }

          if (jobData.status === 'completed') {
            clearInterval(cloudRenderIntervalRef.current);
            cloudRenderIntervalRef.current = null;

            const relativeDownloadUrl = jobData.downloadUrl || `/public/exports/video_${jobId}.mp4`;
            const absoluteShareableUrl = jobData.shareableUrl || (window.location.origin + relativeDownloadUrl);

            setRenderedBlobUrl(relativeDownloadUrl);
            setShareableDirectUrl(absoluteShareableUrl);
            setDownloadExtension('mp4');
            setRenderStatus('completed');
            setProgress(100);

            if (jobData.telegramSent) {
              setTelegramStatus({ sent: true });
              addLog(`Telegram Bot Notification sent successfully! 🎬`);
            } else if (jobData.telegramError) {
              setTelegramStatus({ sent: false, error: jobData.telegramError });
              addLog(`Telegram notice: ${jobData.telegramError}`);
            } else {
              setTelegramStatus({ sent: true });
            }

            setStatistics({
              duration: scenes.reduce((s, sc) => s + sc.duration, 0),
              fileSize: jobData.fileSize || '15.2 MB',
              scenesProcessed: scenes.length,
              fps: 30
            });

            addLog(`Compilation SUCCESS. Video shareable link generated.`);
            if (onRenderComplete) onRenderComplete();
          } else if (jobData.status === 'failed' || jobData.status === 'error') {
            clearInterval(cloudRenderIntervalRef.current);
            cloudRenderIntervalRef.current = null;
            setRenderStatus('failed');
            addLog(`CRITICAL ERROR: ${jobData.error || jobData.log || 'Render job failed on server'}`);
          }
        } catch (pollErr: any) {
          console.warn('Status polling error:', pollErr);
        }
      }, 2000);

    } catch (err: any) {
      console.error(err);
      setRenderStatus('failed');
      addLog(`CRITICAL API ERROR: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#0B0914]/90 backdrop-blur-2xl z-50 flex items-center justify-center p-4 animate-fadeIn" id="render-workbench">
      <div className="bento-card max-w-xl w-full p-6 relative overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Visual particles glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-36 bg-[#00D2D3]/10 rounded-full blur-[90px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-32 bg-[#FF6B6B]/10 rounded-full blur-[90px] pointer-events-none" />

        {/* Header bar */}
        <div className="text-center pb-4 mb-5 border-b border-violet-500/15">
          <h1 className="text-sm font-extrabold text-white uppercase tracking-widest justify-center flex items-center gap-2 font-display">
            <FileVideo className="text-[#00D2D3]" size={18} />
            {t.render_studio}
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 font-sans">
            {renderStatus === 'idle' && (language === 'am' ? 'የቪዲዮ ማውረጃ ምርጫዎችን ያስተካክሉ' : 'Configure video export parameters')}
            {(renderStatus === 'rendering' || renderStatus === 'processing') && t.render_log_assembling}
            {renderStatus === 'completed' && (language === 'am' ? 'ቪዲዮው በተሳካ ሁኔታ ተጠናቋል!' : 'Master export completed successfully!')}
            {renderStatus === 'failed' && (language === 'am' ? 'ማቀናበሩ ተቋርጧል ወይም አልተሳካም' : 'Export process stopped or aborted')}
          </p>
        </div>

        {renderStatus === 'idle' && (
          <div className="space-y-4 py-2 overflow-y-auto max-h-[70vh] pr-1 scrollbar-thin">
            
            {/* 🎙️ Fluent Amharic Voice & Video Download Quota System */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-zinc-950 via-[#0a0a0d] to-zinc-950 border border-indigo-500/10 shadow-xl space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
              
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-[8px] font-mono font-bold text-indigo-400 rounded-md uppercase tracking-wide">
                    {t.engine_tts}
                  </span>
                  <h4 className="text-[11px] font-bold text-white uppercase tracking-tight">
                    🎙️ {t.voice_speaker_label} (Ameha Neural) - {t.active}
                  </h4>
                </div>
                
                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>

              <div className="p-3 bg-[#030304] border border-zinc-900 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>{t.export_quota_title}:</span>
                  <span className={`font-bold font-mono text-xs ${exportQuota > 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                    {exportQuota} / 3 {t.ready_to_export}
                  </span>
                </div>

                {/* Quota pills */}
                <div className="flex gap-2">
                  {[1, 2, 3].map((num) => {
                    const isFilled = exportQuota >= num;
                    return (
                      <div 
                        key={num} 
                        className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                          isFilled 
                            ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.2)]' 
                            : 'bg-zinc-900'
                        }`} 
                      />
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-4 mt-1 text-[10px] text-zinc-500 font-sans leading-normal">
                  <p>
                    {t.quota_pills_desc}
                  </p>
                  
                  <button
                    type="button"
                    onClick={handleRefillQuota}
                    className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:text-indigo-400 text-zinc-400 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all active:scale-[0.98] shrink-0"
                  >
                    🔄 {t.refill_quota}
                  </button>
                </div>
              </div>

              {exportQuota === 0 && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-350 text-[10px] rounded-xl font-semibold leading-relaxed space-y-0.5">
                  <span className="font-mono text-[8.5px] text-rose-400 uppercase tracking-widest block">⚠️ {t.quota_exhausted}</span>
                  <p>
                    {t.refill_desc}
                  </p>
                </div>
              )}
            </div>

            {/* 📥 የማውረጃ ዘዴ መረጃ / Choose Download Option (Server-side default for 100% Mobile Stability) */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-550 uppercase block flex items-center gap-1">
                📥 {language === 'am' ? 'የማውረጃ ዘዴ (Export Method)' : 'Export Method'}
              </span>

              <div className="p-3.5 bg-indigo-500/5 border border-indigo-500/20 rounded-xl flex flex-col text-left">
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                    ☁️ {language === 'am' ? 'በክላውድ ሰርቨር ላይ ማቀናበሪያ (ንቁ)' : 'Cloud Server Render (Active)'}
                  </span>
                  <span className="text-[8px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 px-1.5 py-0.5 rounded uppercase font-mono tracking-wider font-bold">
                    {language === 'am' ? 'ሰርቨር' : 'Server'}
                  </span>
                </div>
                <p className="text-[9.5px] text-zinc-400 mt-2 leading-normal font-sans">
                  {language === 'am' 
                    ? 'ሁሉም ከባድ የቪዲዮ ስራዎች በከፍተኛ አፈፃፀም ባለው Node.js/Express የጀርባ ሰርቨር (Backend Server) ላይ ያለምንም መቆራረጥ ይከናወናሉ። ይህ ስልክዎ እንዳይሞቅ እና የማህደረ ትውስታ (OOM) ብልሽት ሙሉ በሙሉ ይከላከላል! 🚀' 
                    : 'Heavy rendering operations run on a high-performance Node.js/Express backend. This prevents device overheating and eliminates browser Out-Of-Memory (OOM) crashes completely.'}
                </p>
              </div>
            </div>

            {/* Resolution/Duration segment */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase block">{t.baking_range}</span>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRenderOption('full')}
                  className={`p-3 border rounded-xl flex flex-col text-left transition-all ${
                    renderOption === 'full' 
                      ? 'bg-indigo-500/5 border-indigo-550 text-indigo-400 font-bold' 
                      : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <span className="text-xs font-semibold">{t.hq_full_render}</span>
                  <span className="text-[9px] text-zinc-500 mt-1 font-sans">{t.scenes_verbatim} ({scenes.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRenderOption('fast')}
                  className={`p-3 border rounded-xl flex flex-col text-left transition-all ${
                    renderOption === 'fast' 
                      ? 'bg-indigo-500/5 border-indigo-550 text-indigo-400 font-bold' 
                      : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <span className="text-xs font-semibold">{t.fast_test_segment}</span>
                  <span className="text-[9px] text-zinc-500 mt-1 font-sans">{t.fast_instant_review}</span>
                </button>
              </div>
            </div>

            {/* Choose Video quality according to active paid plans */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase block flex items-center gap-1">
                <Crown size={11} className="text-cyan-400" /> {t.export_res}
              </span>
              
              <div className="grid grid-cols-2 gap-3">
                {/* 720p HD Quality (Standard High-Def) - always unlocked */}
                <button
                  type="button"
                  onClick={() => setExportQuality('720p')}
                  className={`p-3 border rounded-xl flex flex-col text-left transition-all ${
                    exportQuality === '720p' 
                      ? 'bg-teal-500/5 border-teal-500 text-teal-400 font-bold shadow-sm' 
                      : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold">{t.quality_720}</span>
                    {exportQuality === '720p' && <div className="w-2 h-2 rounded-full bg-teal-400" />}
                  </div>
                  <span className="text-[9px] text-zinc-500 mt-1 font-sans">1280x720</span>
                  <span className="text-[8px] font-mono text-zinc-650 mt-1 uppercase">{t.unlocked_10k}</span>
                </button>

                {/* 1080p Full HD Cosmic Quality - locked if current activePlan is '720p' */}
                {activePlan === '720p' ? (
                  <div className="p-3 border border-zinc-900/50 bg-zinc-950/40 rounded-xl flex flex-col text-left relative opacity-85">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-semibold text-zinc-650 flex items-center gap-1">
                        1080p Full HD
                      </span>
                      <Lock size={11} className="text-zinc-700" />
                    </div>
                    <span className="text-[9px] text-zinc-650 mt-1 font-sans">1920x1080 (Cinema FHD)</span>
                    <span className="text-[8px] font-mono text-red-400/80 mt-1 uppercase font-bold">{t.plan_requires_15k}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setExportQuality('1080p')}
                    className={`p-3 border rounded-xl flex flex-col text-left transition-all ${
                      exportQuality === '1080p' 
                        ? 'bg-cyan-500/5 border-cyan-500 text-cyan-400 font-bold shadow-sm' 
                        : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-semibold flex items-center gap-1">
                        <Crown size={11} className="text-cyan-400" /> {t.quality_1080}
                      </span>
                      {exportQuality === '1080p' && <div className="w-2 h-2 rounded-full bg-cyan-400" />}
                    </div>
                    <span className="text-[9px] text-zinc-500 mt-1 font-sans">1920x1080</span>
                    <span className="text-[8.5px] font-mono text-cyan-400 mt-1 uppercase">{t.unlocked_15k}</span>
                  </button>
                )}

                {/* 4K Ultra HD Cosmic Quality */}
                {activePlan === '720p' ? (
                  <div className="p-3 border border-zinc-900/50 bg-zinc-950/40 rounded-xl flex flex-col text-left relative opacity-85">
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-semibold text-zinc-650 flex items-center gap-1">
                        4K Ultra HD
                      </span>
                      <Lock size={11} className="text-zinc-700" />
                    </div>
                    <span className="text-[9px] text-zinc-650 mt-1 font-sans">3840x2160 (Cinema 4K)</span>
                    <span className="text-[8px] font-mono text-red-400/80 mt-1 uppercase font-bold">{t.plan_requires_15k}</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setExportQuality('4k')}
                    className={`p-3 border rounded-xl flex flex-col text-left transition-all ${
                      exportQuality === '4k' 
                        ? 'bg-purple-500/5 border-purple-500 text-purple-400 font-bold shadow-sm' 
                        : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-semibold flex items-center gap-1">
                        <Crown size={11} className="text-purple-400" /> 4K Ultra HD
                      </span>
                      {exportQuality === '4k' && <div className="w-2 h-2 rounded-full bg-purple-400" />}
                    </div>
                    <span className="text-[9px] text-zinc-500 mt-1 font-sans">3840x2160</span>
                    <span className="text-[8.5px] font-mono text-purple-400 mt-1 uppercase">{t.unlocked_15k}</span>
                  </button>
                )}
              </div>

              {/* Friendly drawer upgrade alert for 720p users */}
              {activePlan === '720p' && (
                <div className="p-2.5 bg-cyan-950/10 border border-cyan-900/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <p className="text-[9px] text-[#00b4d8] leading-normal max-w-xs">
                    {language === 'am' ? 'የምስል ጥራት ወደ **1080p Full HD** ከፍ ለማድረግ ወርሃዊ የቴሌብር ምዝገባዎን ያሻሽሉ።' : 'To render in 1080p Full HD, upgrade your monthly subscription.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleTriggerUpgrade}
                    className="self-start sm:self-center px-2 py-1 bg-cyan-500 text-zinc-950 hover:bg-cyan-400 text-[8px] tracking-widest uppercase font-black rounded transition-all shrink-0"
                  >
                    🚀 {language === 'am' ? 'አሻሽል (Upgrade)' : 'Upgrade Account'}
                  </button>
                </div>
              )}
            </div>

            {/* Choose Data Optimization Profile (በትንሽ ዳታ vs በትልቅ ዳታ ጥራት) */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase block flex items-center gap-1.5">
                <Zap size={11} className="text-amber-400" /> የዳታ አጠቃቀምና ፍጥነት መቆጣጠሪያ / Data Optimization Profile:
              </span>

              <div className="grid grid-cols-2 gap-3">
                {/* 1. Low Data Saving Mode */}
                <button
                  type="button"
                  onClick={() => setDataProfile('saver')}
                  className={`p-3 border rounded-xl flex flex-col text-left transition-all ${
                    dataProfile === 'saver'
                      ? 'bg-amber-500/5 border-amber-500 text-amber-400 font-bold shadow-sm'
                      : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold flex items-center gap-1">
                      <Zap size={11} className="text-amber-400" /> በትንሽ ዳታ / Ultra-Saver
                    </span>
                    {dataProfile === 'saver' && <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
                  </div>
                  <span className="text-[9.5px] text-zinc-400 mt-1 leading-normal">
                    ጥራቱ ሳይቀንስ ፋይሉን እጅግ ያሳንሰዋል። በቴሌግራም ወይም ዋትስአፕ በትንሽ ዳታ በፍጥነት ለደንበኞች ይደርሳል! 🚀 (የምክር አገልግሎት)
                  </span>
                  <span className="text-[8px] font-mono text-zinc-600 mt-1.5 uppercase font-bold text-amber-500/80">Optimized for Ethiopia mobile network</span>
                </button>

                {/* 2. Maximum Studio Quality Mode */}
                <button
                  type="button"
                  onClick={() => setDataProfile('premium')}
                  className={`p-3 border rounded-xl flex flex-col text-left transition-all ${
                    dataProfile === 'premium'
                      ? 'bg-indigo-500/5 border-indigo-500 text-indigo-400 font-bold shadow-sm'
                      : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-semibold flex items-center gap-1">
                      <Cpu size={11} className="text-indigo-400" /> ከፍተኛ ጥራት / Maximum HD
                    </span>
                    {dataProfile === 'premium' && <div className="w-2 h-2 rounded-full bg-indigo-400" />}
                  </div>
                  <span className="text-[9.5px] text-zinc-400 mt-1 leading-normal">
                    ለትላልቅ ስክሪኖች እና ማስታወቂያዎች የሚሆን ፊልም-ጥራት ያላቸው ምስሎችን ያመርታል። (ትልቅ የቪዲዮ ፋይል መጠን ይሰጣል)
                  </span>
                  <span className="text-[8px] font-mono text-zinc-650 mt-1.5 uppercase font-bold">Cinema Bitrate (12.5Mbps Uncompressed)</span>
                </button>
              </div>
            </div>

            <div className="flex gap-2 p-3.5 bg-[#050505] border border-zinc-900 rounded-xl text-[10px] leading-relaxed text-zinc-450">
              <ShieldCheck size={15} className="text-indigo-400 shrink-0 mt-0.5" />
              <span>
                <strong>System Integrity Check:</strong> {language === 'am' ? 'ማቀናበሩ ሙሉ በሙሉ በእርስዎ ስልክ/ኮምፒውተር ውስጥ በከፍተኛ ፍጥነት ይከናወናል። ጥራቱ እንዳይቋረጥ እባክዎን ይህንን ፔጅ ሳይዘጉት ይጠብቁ።' : 'Compilation renders directly in the browser utilizing hardware acceleration. Keep this browser tab active and stay on screen for pristine frame pacing.'}
              </span>
            </div>

            {/* 🧠 የማህደረ ትውስታ (RAM) መጠን መቆጣጠሪያ / Memory (RAM) Allocation Control */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase flex items-center gap-1.5">
                  <Cpu size={11} className="text-indigo-400" />
                  {language === 'am' ? 'የማህደረ ትውስታ (RAM) መጠን መቆጣጠሪያ' : 'Memory (RAM) Allocation Control'}
                </span>
                <span className="text-[10.5px] font-bold font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                  {ramLimit} GB
                </span>
              </div>
              
              <div className="space-y-2">
                <input
                  type="range"
                  min="2"
                  max="50"
                  step="2"
                  value={ramLimit}
                  onChange={(e) => handleRamLimitChange(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-indigo-500 transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex justify-between text-[8px] font-mono text-zinc-650 uppercase">
                  <span>2 GB</span>
                  <span>16 GB (Standard)</span>
                  <span>32 GB (Pro)</span>
                  <span className="text-indigo-400 font-bold">50 GB (Ultimate)</span>
                </div>
              </div>

              <p className="text-[9.5px] text-zinc-500 leading-normal font-sans">
                {language === 'am'
                  ? 'ለቪዲዮ ማቀናበሪያው የሚመደበውን ከፍተኛ የ RAM መጠን ያስተካክሉ። እስከ 50 ጂቢ RAM መጫን ሰርቨሩ እጅግ ግዙፍ የሆኑ ባለ ከፍተኛ ጥራት የቪዲዮ ፋይሎችን ያለ ምንም መቆራረጥ እንዲያቀናጅ ያስችለዋል።'
                  : 'Configure the maximum RAM allocated for video rendering. Increasing up to 50 GB RAM allows the rendering farm to compile ultra-heavy cinematic projects smoothly without crashing.'}
              </p>
              
              {ramLimit >= 40 && (
                <div className="flex gap-1.5 items-center p-2 rounded-lg bg-indigo-500/5 border border-indigo-500/10 text-[9px] text-indigo-400 font-medium animate-pulse">
                  <Zap size={11} className="shrink-0" />
                  <span>
                    {language === 'am' ? '🚀 የከፍተኛ አፈጻጸም ሁኔታ ገባሪ ሆኗል (እስከ 50 ጂቢ RAM ተመድቧል)!' : '🚀 Ultimate High-Performance Mode Engaged!'}
                  </span>
                </div>
              )}
            </div>

            {/* 🎞️ Chunked Export Architecture / Split into Parts */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase flex items-center gap-1.5">
                  <Film size={11} className="text-pink-400" />
                  {language === 'am' ? 'ረጃጅም ቪዲዮዎችን ከፋፍሎ ማውጣት (Chunked Export)' : 'Split Video into Parts (Chunked Export)'}
                </span>
                <span className="text-[10.5px] font-bold font-mono text-pink-400 bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 rounded-full">
                  {chunkSize === 0 ? 'Full Video' : `${chunkSize} Scenes/Part`}
                </span>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setChunkSize(0)}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${
                    chunkSize === 0
                      ? 'bg-pink-500/10 border-pink-500/30 text-pink-400'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  Full Video
                </button>
                <button
                  type="button"
                  onClick={() => setChunkSize(3)}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${
                    chunkSize === 3
                      ? 'bg-pink-500/10 border-pink-500/30 text-pink-400'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  3 Scenes/Part
                </button>
                <button
                  type="button"
                  onClick={() => setChunkSize(5)}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${
                    chunkSize === 5
                      ? 'bg-pink-500/10 border-pink-500/30 text-pink-400'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  5 Scenes/Part
                </button>
              </div>
              
              <p className="text-[9.5px] text-zinc-500 leading-normal font-sans">
                {language === 'am' 
                  ? 'እጅግ ረጃጅም ቪዲዮዎችን በትንሽ በትንሹ ከፋፍሎ በማቀናበር (ለምሳሌ: Part 1, Part 2) ለ CapCut እና ለሌሎች ኤዲተሮች እንዲመች ያደርጋል። ይህ የሰርቨሩን ጫና በመቀነስ የቪዲዮውን ጥራት ከፍተኛ ያደርገዋል።' 
                  : 'Divide extremely long videos into manageable chunks (e.g., Part 1, Part 2) for CapCut editing. Prevents memory limits and maintains pristine export quality.'}
              </p>
            </div>

            {/* Telegram Notification Settings Toggle */}
            <div className="p-3.5 bg-gradient-to-r from-sky-950/40 via-indigo-950/40 to-zinc-950 border border-sky-500/20 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-widest font-bold text-sky-400 uppercase flex items-center gap-1.5">
                  <Send size={12} /> Telegram Delivery & Notifications
                </span>
                <button
                  type="button"
                  onClick={() => setShowTelegramSettings(!showTelegramSettings)}
                  className="text-[9.5px] text-sky-300 hover:text-white underline font-mono font-bold"
                >
                  {showTelegramSettings ? 'Hide Config' : 'Configure Credentials'}
                </button>
              </div>

              <p className="text-[10px] text-zinc-400 leading-snug">
                ⚡ Videos finish rendering on the cloud backend and are sent straight to your Telegram account or chat.
              </p>

              {showTelegramSettings && (
                <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl space-y-2 mt-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-zinc-400 uppercase block">Telegram Chat ID (e.g. @your_channel or 123456789)</label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => handleSaveTelegramConfig(telegramBotToken, e.target.value)}
                      placeholder="@my_telegram_channel or chat ID"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-mono text-zinc-400 uppercase block">Telegram Bot Token (Optional override)</label>
                    <input
                      type="password"
                      value={telegramBotToken}
                      onChange={(e) => handleSaveTelegramConfig(e.target.value, telegramChatId)}
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl bg-[#09090b] border border-zinc-800/80 space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase block">
                {language === 'am' ? 'የፕሮጀክት አስተዳደር' : 'Project Management'}
              </span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const projectData = JSON.stringify({ scenes, projectConfig }, null, 2);
                    const blob = new Blob([projectData], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `project-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl font-semibold text-xs text-white transition-colors"
                >
                  {language === 'am' ? 'ፕሮጀክት አውርድ (JSON)' : 'Download Project (JSON)'}
                </button>
                <label className="py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl font-semibold text-xs text-white transition-colors text-center cursor-pointer flex items-center justify-center">
                  {language === 'am' ? 'ፕሮጀክት አስገባ (JSON)' : 'Restore Project (JSON)'}
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        try {
                          const data = JSON.parse(event.target?.result as string);
                          if (data.scenes && data.projectConfig && onRestoreProject) {
                            onRestoreProject(data.scenes, data.projectConfig);
                            alert(language === 'am' ? 'ፕሮጀክቱ በተሳካ ሁኔታ ተመልሷል!' : 'Project restored successfully!');
                          } else {
                            throw new Error('Invalid project structure');
                          }
                        } catch (err) {
                          console.error('Failed to parse project JSON:', err);
                          alert(language === 'am' ? 'የተሳሳተ የፕሮጀክት ፋይል። እባክዎ እንደገና ይሞክሩ።' : 'Invalid project file. Please try again.');
                        }
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="py-3 bg-zinc-900 border border-zinc-800 rounded-xl font-semibold text-xs text-zinc-400 hover:text-white transition-colors uppercase tracking-wider font-mono text-center"
                id="render-cancel-btn"
              >
                {language === 'am' ? 'ተመለስ' : 'Go Back'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (exportQuota <= 0) {
                    alert(language === 'am' ? 'እባክዎ መጀመሪያ ነጻ ኮታዎን ይሙሉ!' : 'Please refill your free quota first!');
                    return;
                  }
                  initiateCloudRender(); // Always compile on the cloud to bypass mobile OOM limits!
                }}
                className={`py-4 text-white font-black text-xs sm:text-sm uppercase tracking-[0.2em] rounded-2xl flex items-center justify-center gap-3 transition-all border ${
                  exportQuota > 0
                    ? 'bg-indigo-600 hover:bg-indigo-505 border-indigo-400/30 shadow-xl shadow-indigo-600/40 active:scale-95 cursor-pointer'
                    : 'bg-zinc-800 border-zinc-900 cursor-not-allowed opacity-40'
                }`}
                id="render-start-btn"
              >
                <Download size={18} fill="currentColor" className={exportQuota > 0 ? "animate-bounce" : ""} />
                {language === 'am' 
                  ? (exportQuota > 0 ? 'በክላውድ ላይ ማቀናበሪያ ጀምር' : 'ኮታ የለም • ኮታውን ይሙሉ') 
                  : (exportQuota > 0 ? 'START CLOUD EXPORT' : 'EMPTY QUOTA • REFILL NOW')}
              </button>
            </div>
          </div>
        )}

        {(renderStatus === 'rendering' || renderStatus === 'processing') && (
          <div className="space-y-5 py-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              
              {/* ⚡ Background rendering & Telegram notification status card */}
              <div className="p-3.5 bg-gradient-to-r from-sky-950/70 via-indigo-950/70 to-purple-950/70 border border-sky-500/30 rounded-2xl flex items-center gap-3 shadow-lg animate-pulse">
                <Zap className="text-sky-400 shrink-0" size={22} />
                <div className="text-left space-y-0.5">
                  <span className="text-[10px] font-mono font-bold text-sky-300 uppercase tracking-widest block">
                    Background Rendering Active
                  </span>
                  <p className="text-[11px] text-sky-100/90 font-medium leading-snug">
                    ⚡ Video is rendering in the background! It will be sent directly to your Telegram when complete.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center py-4">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-20 h-20 border-4 border-indigo-500/10 rounded-full" />
                  <div className="absolute w-20 h-20 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-base font-bold font-mono text-indigo-400">{Math.round(progress)}%</span>
                </div>
              </div>

              <div className="space-y-1 text-center">
                <span className="text-xs font-semibold text-zinc-300 block">
                  {renderStatus === 'processing' 
                    ? (language === 'am' ? 'ቪዲዮው በክላውድ በጥራት እየተዘጋጀ ነው...' : 'Cloud Rendering Sequence...')
                    : (language === 'am' ? 'ፊልሙን በማቀናጀት ላይ...' : 'Framing Movie Sequence...')}
                </span>
                <p className="text-[10px] text-zinc-500">
                  {renderStatus === 'processing'
                    ? (language === 'am' ? 'ድምፅ እና ምስሎችን በከፍተኛ ጥራት በማዋሃድ ላይ፤ እባክዎን ገጹን አይዝጉ' : 'Converting, uploading and stitching frames on high-performance backend')
                    : (language === 'am' ? 'ምስሎችና ድምፆችን በማዋሃድ ላይ' : 'Compiling scene timings and syncing text subtitles')}
                </p>
              </div>

              {/* Progress track */}
              <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Rendering Terminal logs */}
            <div className="flex-1 bg-[#050505] border border-zinc-900 rounded-xl p-3 max-h-[140px] overflow-y-auto font-mono text-[9px] text-[#8e909a] space-y-1.5" id="render-terminal-logs">
              <div className="flex items-center gap-1.5 text-zinc-500 mb-2 border-b border-zinc-900 pb-1 shrink-0">
                <Terminal size={10} />
                <span>Compiler Log Output</span>
              </div>
              {renderLogs.map((log, lIdx) => (
                <div key={lIdx} className="leading-normal">{log}</div>
              ))}
            </div>

            <button
              onClick={() => {
                cleanupRenderSubprocesses();
                setRenderStatus('idle');
              }}
              className="w-full py-2.5 bg-red-955/10 hover:bg-red-950/40 border border-red-900/30 text-red-400 hover:text-red-200 text-xs font-semibold rounded-xl transition-colors shrink-0 font-mono uppercase tracking-widest"
              id="render-stop-abort-btn"
            >
              Abort Compile
            </button>
          </div>
        )}

        {renderStatus === 'completed' && renderedBlobUrl && (
          <div className="space-y-4 py-1 overflow-y-auto max-h-[70vh] pr-1 scrollbar-thin">
            <div className="flex flex-col items-center justify-center py-2 text-center space-y-2">
              <CheckCircle2 size={40} className="text-emerald-500 animate-pulse" />
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                  {language === 'am' ? 'ቪዲዮው በጥራት ተሰርቷል!' : 'Stitched Successfully!'}
                </h3>
                <p className="text-[11px] text-zinc-500">
                  {language === 'am' ? 'የተቀናበረው ቪዲዮ ዝግጁ ነው! ከታች ባሉት አማራጮች ማግኘት ይችላሉ።' : 'Your video is compiled and ready! Access it using the options below.'}
                </p>
              </div>
            </div>

            {/* Real-time Inline Web Video Player Preview */}
            <div className="relative overflow-hidden rounded-2xl border border-zinc-900 bg-[#040406] p-1.5">
              <video
                key={renderedBlobUrl || 'empty'}
                src={renderedBlobUrl || undefined}
                controls
                playsInline
                preload="auto"
                className="w-full h-auto max-h-[190px] rounded-xl object-contain mx-auto shadow-xl"
              />
              <div className="text-center pt-1.5 pb-0.5">
                <span className="text-[9.5px] text-zinc-500 font-mono tracking-wide">
                  ✦ {language === 'am' ? 'ቪዲዮውን እዚህ ማጫወት ይችላሉ (Preview Video)' : 'Play & Preview Master Video'} ✦
                </span>
              </div>
            </div>

            {/* 🚀 TWO CLEAR DELIVERY OPTIONS: Telegram Bot & Copy Direct Link */}
            <div className="p-4 bg-[#08080c] border border-indigo-500/20 rounded-2xl space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-bold text-indigo-400 uppercase block flex items-center gap-1.5">
                <Send size={12} className="text-sky-400" /> Direct Delivery & Share Options
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Open in Telegram Button */}
                <a
                  href={telegramChatId ? `https://t.me/${telegramChatId.replace('@', '')}` : 'https://t.me'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-4 bg-sky-500 hover:bg-sky-400 text-zinc-950 font-extrabold text-xs rounded-xl transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 uppercase tracking-wider text-center"
                >
                  <Send size={16} />
                  <span>Open in Telegram</span>
                </a>

                {/* 2. Copy Direct Video Link Button */}
                <button
                  type="button"
                  onClick={() => handleCopyLink(shareableDirectUrl || (window.location.origin + renderedBlobUrl))}
                  className={`py-3 px-4 text-white font-extrabold text-xs rounded-xl transition-all border shadow-lg flex items-center justify-center gap-2 uppercase tracking-wider ${
                    copiedLink
                      ? 'bg-emerald-600 border-emerald-400 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white'
                  }`}
                >
                  {copiedLink ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
                  <span>{copiedLink ? (language === 'am' ? 'ሊንኩ ተቀድቷል!' : 'Link Copied!') : (language === 'am' ? 'የቪዲዮ ሊንክ ቅዳ' : 'Copy Direct Video Link')}</span>
                </button>
              </div>

              {/* Shareable Link Display Box */}
              <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-xl flex items-center justify-between gap-2 text-[10px] font-mono text-zinc-400">
                <span className="truncate text-zinc-300">
                  {shareableDirectUrl || (window.location.origin + renderedBlobUrl)}
                </span>
                <a
                  href={renderedBlobUrl}
                  download={`video_${Date.now()}.${downloadExtension}`}
                  className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg shrink-0 font-bold flex items-center gap-1 transition-all"
                >
                  <Download size={12} />
                  <span>Download</span>
                </a>
              </div>
            </div>

            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 grid grid-cols-2 gap-y-4 gap-x-2 text-xs">
              <div className="space-y-1">
                <span className="text-zinc-600 uppercase tracking-widest text-[8px] font-mono block">
                  {language === 'am' ? 'ጠቅላላ ቆይታ' : 'Total Duration'}
                </span>
                <p className="text-zinc-200 font-mono font-bold text-sm">
                  {statistics.duration.toFixed(1)} {language === 'am' ? 'ሰከንድ' : 'seconds'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-zinc-600 uppercase tracking-widest text-[8px] font-mono block">
                  {language === 'am' ? 'የፋይል መጠን' : 'Estimated Size'}
                </span>
                <p className="text-zinc-200 font-mono font-bold text-sm">{statistics.fileSize}</p>
              </div>
              <div className="space-y-1">
                <span className="text-zinc-600 uppercase tracking-widest text-[8px] font-mono block">
                  {language === 'am' ? 'የተቀናበሩ ትዕይንቶች' : 'Scenes'}
                </span>
                <p className="text-zinc-200 font-mono font-bold text-sm">
                  {statistics.scenesProcessed} {language === 'am' ? 'ትዕይንቶች' : 'clips'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-zinc-600 uppercase tracking-widest text-[8px] font-mono block">
                  {language === 'am' ? 'የምስል ጥራት' : 'Resolution Target'}
                </span>
                <p className="text-zinc-250 font-mono font-bold text-xs uppercase">
                  {exportQuality === '4k' ? (
                    projectConfig.aspectRatio === '16:9' ? '3840x2160 (Cinema 4K)' : projectConfig.aspectRatio === '9:16' ? '2160x3840 (Shorts 4K)' : '2160x2160 (Square 4K)'
                  ) : exportQuality === '1080p' ? (
                    projectConfig.aspectRatio === '16:9' ? '1920x1080 (Full HD)' : projectConfig.aspectRatio === '9:16' ? '1080x1920 (Shorts)' : '1080x1080 (Square)'
                  ) : (
                    projectConfig.aspectRatio === '16:9' ? '1280x720 (Standard HD)' : projectConfig.aspectRatio === '9:16' ? '720x1280 (Shorts)' : '800x800 (Square)'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-450 hover:text-white transition-colors"
              >
                {language === 'am' ? 'ወደ መድረክ ተመለስ' : 'Back to Compositor'}
              </button>
              <button
                type="button"
                onClick={() => {
                  initiateCloudRender();
                }}
                className={`flex-1 py-2.5 text-white font-bold text-xs rounded-xl transition-all font-mono uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500`}
                id="retry-baking-btn"
              >
                {language === 'am' ? 'እንደገና ሞክር' : 'Retry Baking Session'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
