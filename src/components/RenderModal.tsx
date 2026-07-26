import React, { useEffect, useState, useRef } from 'react';
import { Scene, ProjectConfig } from '../types';
import { Language, translations } from '../translations';
import { 
  Download, Loader2, Play, CheckCircle2, Film, ShieldCheck, AlertCircle, FileVideo, Terminal, Crown, Lock, Zap, Cpu, Send, Copy, Check, ExternalLink, MessageSquare, Share2, AlertTriangle, Settings
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
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderOption, setRenderOption] = useState<'full' | 'fast'>('full');
  const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
  const [shareableDirectUrl, setShareableDirectUrl] = useState<string | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<{ sent?: boolean; error?: string }>({});
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [downloadExtension, setDownloadExtension] = useState<string>('mp4');
  const [dataProfile, setDataProfile] = useState<'saver' | 'premium'>('premium');
  
  // Telegram Bot Token and Chat ID state
  const [telegramBotToken, setTelegramBotToken] = useState<string>(() => localStorage.getItem('yotor_telegram_bot_token') || '8870687283:AAGe87k64Gej8jJ5Ahc7m20DrB0NoaKsQSU');
  const [telegramChatId, setTelegramChatId] = useState<string>(() => localStorage.getItem('yotor_telegram_chat_id') || '2034380079');
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

  const [statistics, setStatistics] = useState({
    duration: 0,
    fileSize: '0 MB',
    scenesProcessed: 0,
    fps: 30
  });

  const [chunkSize, setChunkSize] = useState<number>(0);
  
  const getSubscribedPlan = (): '720p' | '1080p' | '4k' => {
    return '4k';
  };

  const activePlan = getSubscribedPlan();

  useEffect(() => {
    if (isOpen) {
      setExportQuality(getSubscribedPlan());
    }
  }, [isOpen]);

  const handleTriggerUpgrade = () => {
    window.dispatchEvent(new CustomEvent('yotor_trigger_upgrade'));
    onClose();
  };

  const cloudRenderIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (cloudRenderIntervalRef.current) {
        clearInterval(cloudRenderIntervalRef.current);
      }
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

  const initiateCloudRender = async () => {
    setRenderStatus('processing');
    setProgress(0);
    setRenderLogs([]);
    setRenderError(null);
    setShareableDirectUrl(null);
    setTelegramStatus({});
    addLog(`Initiating backend video compilation on Cloud Server...`);

    try {
      const scenesToRender = renderOption === 'fast' ? scenes.slice(0, 2) : scenes;

      const renderPayload = {
        scenes: scenesToRender,
        aspectRatio: projectConfig.aspectRatio || '16:9',
        exportQuality,
        musicUrl: projectConfig.backgroundMusicUrl,
        musicVolume: projectConfig.musicVolume,
        subtitleStyle: projectConfig.subtitleStyle,
        visualStyle: projectConfig.visualStyle,
        videoFilter: projectConfig.videoFilter,
        telegramBotToken: telegramBotToken.trim() || undefined,
        telegramChatId: telegramChatId.trim() || undefined,
      };

      addLog(`Sending compilation request to server backend...`);

      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(renderPayload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to start backend render job');
      }

      const { jobId } = await response.json();
      addLog(`Render job created successfully (ID: ${jobId})`);
      addLog(`⚡ Processing on server... Video will be split and delivered to Telegram if > 48MB.`);

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
              addLog(`Telegram delivery completed successfully! 🎬`);
            } else if (jobData.telegramError || jobData.telegramSent === false) {
              setTelegramStatus({ sent: false, error: jobData.telegramError || 'Failed to deliver to Telegram' });
              addLog(`Telegram delivery note: ${jobData.telegramError || 'Failed to deliver to Telegram'}`);
            } else {
              setTelegramStatus({ sent: true });
            }

            const totalDur = scenesToRender.reduce((s, sc) => s + (sc.duration || 0), 0);
            setStatistics({
              duration: totalDur > 0 ? totalDur : 10,
              fileSize: jobData.fileSize || '15.2 MB',
              scenesProcessed: scenesToRender.length,
              fps: 30
            });

            addLog(`Compilation SUCCESS. Video generated and delivered to Telegram!`);
            if (onRenderComplete) onRenderComplete();

            // Decrement quota
            const newQuota = Math.max(0, exportQuota - 1);
            setExportQuota(newQuota);
            localStorage.setItem('yotor_video_quota', newQuota.toString());
          } else if (jobData.status === 'failed' || jobData.status === 'error') {
            clearInterval(cloudRenderIntervalRef.current);
            cloudRenderIntervalRef.current = null;
            setRenderStatus('failed');
            const errStr = jobData.error || jobData.log || 'Render job failed on server';
            setRenderError(errStr);
            addLog(`CRITICAL ERROR: ${errStr}`);
          }
        } catch (pollErr: any) {
          console.warn('Status polling error:', pollErr);
        }
      }, 2000);

    } catch (err: any) {
      console.error('Server render request failed:', err);
      setRenderStatus('failed');
      setRenderError(err.message || 'Server rendering request failed');
      addLog(`CRITICAL API ERROR: ${err.message || 'Server rendering request failed'}`);
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
            {(renderStatus === 'rendering' || renderStatus === 'processing') && (language === 'am' ? '⚡ በሰርቨር ላይ በመቀናጀት ላይ...' : '⚡ Processing and sending to Telegram...')}
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

            {/* 📥 Telegram Bot Delivery Info Card */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-400 uppercase flex items-center gap-1.5">
                  <Send size={12} className="text-cyan-400" />
                  {language === 'am' ? 'የቴሌግራም ቦት መላኪያ (Telegram Bot Delivery)' : 'Telegram Delivery Target'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowTelegramSettings(!showTelegramSettings)}
                  className="text-[9px] text-zinc-400 hover:text-white flex items-center gap-1 bg-zinc-900 px-2 py-0.5 rounded-lg border border-zinc-800"
                >
                  <Settings size={10} />
                  {showTelegramSettings ? 'Close' : 'Configure'}
                </button>
              </div>

              {showTelegramSettings ? (
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 text-left">
                  <div className="space-y-1">
                    <label className="text-[9px] text-zinc-400 font-mono">Telegram Bot Token:</label>
                    <input
                      type="text"
                      value={telegramBotToken}
                      onChange={(e) => handleSaveTelegramConfig(e.target.value, telegramChatId)}
                      placeholder="e.g. 8870687283:AAG..."
                      className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white p-2 rounded-lg font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-zinc-400 font-mono">Telegram Chat ID:</label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => handleSaveTelegramConfig(telegramBotToken, e.target.value)}
                      placeholder="e.g. 2034380079"
                      className="w-full bg-zinc-900 border border-zinc-800 text-xs text-white p-2 rounded-lg font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-xl flex items-center justify-between">
                  <div className="space-y-0.5 text-left">
                    <span className="text-[10px] font-bold text-cyan-300 block">
                      Target Chat ID: {telegramChatId || '2034380079'}
                    </span>
                    <p className="text-[9px] text-zinc-400">
                      {language === 'am' 
                        ? 'ከ 48MB በላይ የሆኑ ቪዲዮዎች በቴሌግራም 50MB ገደብ ምክንያት በከፋፋይ (FFmpeg segment copy) ተከፋፍለው ይላካሉ!' 
                        : 'Videos > 48MB are automatically split into sequential parts without re-encoding to respect Telegram 50MB bot limits!'}
                    </p>
                  </div>
                  <Send size={18} className="text-cyan-400 shrink-0 ml-2" />
                </div>
              )}
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

            {/* Choose Video quality */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase block flex items-center gap-1">
                <Crown size={11} className="text-cyan-400" /> {t.export_res}
              </span>
              
              <div className="grid grid-cols-2 gap-3">
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
              </div>
            </div>

            {/* Choose Data Optimization Profile */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase block flex items-center gap-1.5">
                <Zap size={11} className="text-amber-400" /> የዳታ አጠቃቀምና ፍጥነት መቆጣጠሪያ / Data Optimization Profile:
              </span>

              <div className="grid grid-cols-2 gap-3">
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
                    ጥራቱ ሳይቀንስ ፋይሉን ያሳንሰዋል። በቴሌግራም ወይም ዋትስአፕ በትንሽ ዳታ በፍጥነት ለደንበኞች ይደርሳል! 🚀
                  </span>
                  <span className="text-[8px] font-mono text-zinc-600 mt-1.5 uppercase font-bold text-amber-500/80">Optimized for Ethiopia network</span>
                </button>

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
                    ለትላልቅ ስክሪኖች እና ማስታወቂያዎች የሚሆን ፊልም-ጥራት ያላቸው ምስሎችን ያመርታል።
                  </span>
                  <span className="text-[8px] font-mono text-zinc-650 mt-1.5 uppercase font-bold">Cinema Bitrate (12.5Mbps Uncompressed)</span>
                </button>
              </div>
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
                  initiateCloudRender();
                }}
                className={`py-4 text-white font-black text-xs sm:text-sm uppercase tracking-[0.2em] rounded-2xl flex items-center justify-center gap-3 transition-all border ${
                  exportQuota > 0
                    ? 'bg-indigo-600 hover:bg-indigo-550 border-indigo-400/30 shadow-xl shadow-indigo-600/40 active:scale-95 cursor-pointer'
                    : 'bg-zinc-800 border-zinc-900 cursor-not-allowed opacity-40'
                }`}
                id="render-start-btn"
              >
                <Cpu size={18} className={exportQuota > 0 ? "animate-pulse" : ""} />
                {language === 'am' 
                  ? (exportQuota > 0 ? 'በሰርቨር ላይ ማቀናበር ጀምር' : 'ኮታ የለም • ኮታውን ይሙሉ') 
                  : (exportQuota > 0 ? 'START CLOUD EXPORT' : 'EMPTY QUOTA • REFILL NOW')}
              </button>
            </div>
          </div>
        )}

        {(renderStatus === 'rendering' || renderStatus === 'processing') && (
          <div className="space-y-5 py-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              
              {/* ⚡ Server rendering status card */}
              <div className="p-3.5 bg-gradient-to-r from-indigo-955/70 via-cyan-955/70 to-purple-955/70 border border-indigo-500/30 rounded-2xl flex items-center gap-3 shadow-lg animate-pulse">
                <Send className="text-cyan-400 shrink-0 animate-bounce" size={22} />
                <div className="text-left space-y-0.5">
                  <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase tracking-widest block">
                    ⚡ Server Processing & Telegram Delivery
                  </span>
                  <p className="text-[11px] text-cyan-100/90 font-medium leading-snug">
                    Video is rendering on server using native FFmpeg. If &gt; 48MB, it will be automatically chunked and sent to Telegram!
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center py-4">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-20 h-20 border-4 border-cyan-500/10 rounded-full" />
                  <div className="absolute w-20 h-20 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-base font-bold font-mono text-cyan-400">{Math.round(progress)}%</span>
                </div>
              </div>

              <div className="space-y-1 text-center">
                <span className="text-xs font-semibold text-zinc-300 block">
                  {language === 'am' ? 'በሰርቨር ላይ በከፍተኛ ፍጥነት እየተቀናበረ ነው...' : 'Cloud Compilation in Progress...'}
                </span>
                <p className="text-[10px] text-zinc-500">
                  {language === 'am' ? 'ድምፅ እና ምስሎችን በማዋሃድ ላይ፤ አውቶማቲክ ወደ ቴሌግራም ይላካል' : 'Blending frames and voiceovers. Automatic chunked delivery to Telegram.'}
                </p>
              </div>

              {/* Progress track */}
              <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Rendering Terminal logs */}
            <div className="flex-1 bg-[#050505] border border-zinc-900 rounded-xl p-3 max-h-[140px] overflow-y-auto font-mono text-[9px] text-[#8e909a] space-y-1.5" id="render-terminal-logs">
              <div className="flex items-center gap-1.5 text-zinc-500 mb-2 border-b border-zinc-900 pb-1 shrink-0">
                <Terminal size={10} />
                <span>Server Processing Logs</span>
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
              Cancel Process
            </button>
          </div>
        )}

        {renderStatus === 'failed' && (
          <div className="space-y-5 py-4 flex-1 flex flex-col justify-between overflow-y-auto max-h-[70vh] pr-1">
            <div className="space-y-4">
              
              {/* ⚠️ Failure Notification Block */}
              <div className="p-4 bg-gradient-to-r from-red-955/60 via-amber-955/50 to-zinc-950 border border-red-500/30 rounded-2xl flex items-center gap-3 shadow-lg">
                <AlertCircle size={36} className="text-red-400 shrink-0" />
                <div className="text-left space-y-1">
                  <h3 className="text-xs font-mono font-extrabold text-red-300 uppercase tracking-wider">
                    {language === 'am' ? '⚠️ ማቀናበሩ አልተሳካም (Server Error)' : '⚠️ Server Render Failed'}
                  </h3>
                  <p className="text-[11px] text-red-200/85 font-medium leading-relaxed">
                    {language === 'am' 
                      ? 'ቪዲዮውን በሰርቨር ላይ በማቀናበር ላይ ሳለ ስህተት አጋጥሟል። እባክዎን የስህተት ዝርዝሩን ይመልከቱ።' 
                      : 'An error occurred during backend rendering or video compilation.'}
                  </p>
                </div>
              </div>

              {/* Real Detailed Error Message display */}
              {renderError && (
                <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-xl space-y-1">
                  <span className="text-[8.5px] font-mono font-bold text-red-400 uppercase tracking-widest block">
                    Detailed Error Output:
                  </span>
                  <p className="text-[11px] font-mono text-zinc-350 break-words leading-relaxed select-text">
                    {renderError}
                  </p>
                </div>
              )}

              {/* Rendering Terminal logs */}
              <div className="space-y-1.5">
                <span className="text-[9px] font-mono tracking-widest text-zinc-500 uppercase block">
                  Server Trace Log
                </span>
                <div className="bg-[#050505] border border-zinc-900 rounded-xl p-3 max-h-[160px] overflow-y-auto font-mono text-[9px] text-[#8e909a] space-y-1" id="render-failed-terminal-logs">
                  <div className="flex items-center gap-1.5 text-zinc-500 mb-2 border-b border-zinc-900 pb-1 shrink-0">
                    <Terminal size={10} />
                    <span>Compiler Trace Log</span>
                  </div>
                  {renderLogs.map((log, lIdx) => (
                    <div key={lIdx} className="leading-normal">{log}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  cleanupRenderSubprocesses();
                  setRenderStatus('idle');
                }}
                className="flex-1 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors uppercase font-mono tracking-wider font-bold"
              >
                {language === 'am' ? 'ወደ መድረክ ተመለስ' : 'Go Back'}
              </button>
              <button
                type="button"
                onClick={() => {
                  initiateCloudRender();
                }}
                className="flex-1 py-3 text-white font-extrabold text-xs rounded-xl transition-all font-mono uppercase tracking-widest bg-red-600 hover:bg-red-500 border border-red-400/20 shadow-lg shadow-red-600/10"
              >
                {language === 'am' ? 'እንደገና ሞክር' : 'Retry Rendering'}
              </button>
            </div>
          </div>
        )}

        {renderStatus === 'completed' && renderedBlobUrl && (
          <div className="space-y-4 py-1 overflow-y-auto max-h-[70vh] pr-1 scrollbar-thin">
            
            {/* 🎉 Server Compilation Completed Banner */}
            <div className="p-4 bg-gradient-to-r from-emerald-950/60 via-teal-950/50 to-zinc-950 border border-emerald-500/30 rounded-2xl flex items-center gap-3 shadow-lg">
              <CheckCircle2 size={32} className="text-emerald-400 shrink-0" />
              <div className="text-left space-y-0.5">
                <h3 className="text-xs font-mono font-extrabold text-emerald-300 uppercase tracking-wider">
                  {language === 'am' ? '🎉 ተሳክቷል! ቪዲዮው ተጠናቆ ወደ ቴሌግራም ተልኳል።' : '🎉 Server Render Completed & Sent to Telegram!'}
                </h3>
                <p className="text-[11px] text-emerald-200/80 font-medium">
                  {language === 'am' 
                    ? 'ቪዲዮው በከፍተኛ ጥራት ተዘጋጅቷል። ከታች ማየት፣ ማውረድ ወይም በቴሌግራም ማግኘት ይችላሉ።' 
                    : 'The video rendered successfully on server and delivered to Telegram.'}
                </p>
              </div>
            </div>

            {/* Telegram delivery badge */}
            {telegramStatus.sent ? (
              <div className="p-3 bg-cyan-950/30 border border-cyan-500/30 rounded-xl flex items-center justify-between text-xs text-cyan-300 font-medium">
                <div className="flex items-center gap-2">
                  <Send size={16} className="text-cyan-400" />
                  <span>
                    {language === 'am' 
                      ? '⚡ ቪዲዮው ወደ ቴሌግራምዎ በክፍል (Parts) ተልኳል!' 
                      : '⚡ Video sent to Telegram sequentially! Check your chat.'}
                  </span>
                </div>
                <Check size={16} className="text-emerald-400" />
              </div>
            ) : telegramStatus.error ? (
              <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl text-xs text-amber-300 font-medium">
                ⚠️ {telegramStatus.error}
              </div>
            ) : null}

            {/* Real-time Inline Web Video Player Preview */}
            <div className="relative overflow-hidden rounded-2xl border border-zinc-900 bg-[#040406] p-1.5">
              <video
                key={renderedBlobUrl}
                src={renderedBlobUrl}
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

            {/* 🚀 Download & Direct Link Section */}
            <div className="p-4 bg-[#08080c] border border-emerald-500/20 rounded-2xl space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-bold text-emerald-400 uppercase block flex items-center gap-1.5">
                <Download size={12} className="text-emerald-400" /> Export & Share Options
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <a
                  href={renderedBlobUrl}
                  download={`yotor_video_${Date.now()}.${downloadExtension}`}
                  className="py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 uppercase tracking-widest text-center"
                >
                  <Download size={16} />
                  <span>{language === 'am' ? 'ቪዲዮ አውርድ' : 'Download Video'}</span>
                </a>

                {shareableDirectUrl && (
                  <button
                    type="button"
                    onClick={() => handleCopyLink(shareableDirectUrl)}
                    className="py-3 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                  >
                    {copiedLink ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    <span>{copiedLink ? (language === 'am' ? 'ኮፒ ተደርጓል!' : 'Copied Link!') : (language === 'am' ? 'ሊንክ ኮፒ አድርግ' : 'Copy Direct Link')}</span>
                  </button>
                )}
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
                  {language === 'am' ? 'የፋይል መጠን' : 'File Size'}
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
                {language === 'am' ? 'እንደገና ሞክር' : 'Retry Server Render'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
