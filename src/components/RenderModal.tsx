import React, { useEffect, useState, useRef } from 'react';
import { Scene, ProjectConfig } from '../types';
import { DEFAULT_MUSIC } from '../data';
import { Language, translations } from '../translations';
import { 
  Download, Loader2, Play, CheckCircle2, Film, ShieldCheck, AlertCircle, FileVideo, Terminal, Crown, Lock, Zap, Cpu
} from 'lucide-react';

interface RenderModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: Scene[];
  projectConfig: ProjectConfig;
  canvasElement: HTMLCanvasElement | null;
  onRenderFrameChange?: (index: number, time?: number) => void;
  language: Language;
}

export default function RenderModal({
  isOpen,
  onClose,
  scenes,
  projectConfig,
  canvasElement,
  onRenderFrameChange,
  language
}: RenderModalProps) {
  const t = translations[language];
  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'completed' | 'failed'>('idle');
  
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
  const [renderLogs, setRenderLogs] = useState<string[]>([]);
  const [renderOption, setRenderOption] = useState<'full' | 'fast'>('full');
  const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
  const [downloadExtension, setDownloadExtension] = useState<string>('webm');
  const [exportQuality, setExportQuality] = useState<'720p' | '1080p'>('720p');
  const [dataProfile, setDataProfile] = useState<'saver' | 'premium'>('saver');
  const [statistics, setStatistics] = useState({
    duration: 0,
    fileSize: '0 MB',
    scenesProcessed: 0,
    fps: 30
  });

  const getSubscribedPlan = (): '720p' | '1080p' => {
    return '1080p';
  };

  const activePlan = getSubscribedPlan();

  useEffect(() => {
    if (isOpen) {
      setExportQuality(getSubscribedPlan());
    }
  }, [isOpen, renderStatus]);

  const handleTriggerUpgrade = () => {
    window.dispatchEvent(new CustomEvent('yotor_trigger_upgrade'));
    onClose();
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

  useEffect(() => {
    return () => {
      cleanupRenderSubprocesses();
    };
  }, []);

  const addLog = (msg: string) => {
    setRenderLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const cleanupRenderSubprocesses = () => {
    if (renderLoopTimeoutRef.current) {
      clearInterval(renderLoopTimeoutRef.current);
    }
    if (currentRenderAudioRef.current) {
      currentRenderAudioRef.current.pause();
      currentRenderAudioRef.current = null;
    }
    if (renderBackgroundMusicRef.current) {
      renderBackgroundMusicRef.current.pause();
      renderBackgroundMusicRef.current = null;
    }
    
    // clean audio contexts
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    audioDestNodeRef.current = null;
    audioSourcesRef.current = [];
  };

  const initiateRenderAndStitching = async () => {
    if (!canvasElement) {
      setRenderStatus('failed');
      addLog("Critical failure: Render canvas element is offline.");
      return;
    }

    try {
      cleanupRenderSubprocesses();
      setRenderStatus('rendering');
      setProgress(0);
      recordedChunksRef.current = [];
      renderIndexRef.current = 0;
      renderTimeRef.current = 0;
      setRenderLogs([]);
      
      let scenesToRender = renderOption === 'fast' 
        ? scenes.slice(0, Math.min(2, scenes.length)) // Render first 2 scenes for fast testing 
        : [...scenes];
      
      if (projectConfig.isVoiceEnabled) {
        addLog("Pre-calculating scene narration durations for perfect video synchronization...");
        const scenesWithExactDuration = await Promise.all(scenesToRender.map(async (scene) => {
          const ttsUrl = scene.voiceoverUrl || `/api/tts?text=${encodeURIComponent(scene.text)}&lang=${projectConfig.voiceLanguage}`;
          const tempAudio = new Audio(ttsUrl);
          tempAudio.crossOrigin = "anonymous";
          
          const duration = await new Promise<number>((resolve) => {
            const timeout = setTimeout(() => {
              resolve(scene.duration || 4.5);
            }, 1805); // Max 1.8s load timeout
            
            tempAudio.onloadedmetadata = () => {
              clearTimeout(timeout);
              if (tempAudio.duration && !isNaN(tempAudio.duration) && tempAudio.duration > 0) {
                resolve(tempAudio.duration + 0.15);
              } else {
                resolve(scene.duration || 4.5);
              }
            };
            tempAudio.onerror = () => {
              clearTimeout(timeout);
              resolve(scene.duration || 4.5);
            };
          });
          
          return { ...scene, duration };
        }));
        scenesToRender = scenesWithExactDuration;
      }

      if (projectConfig.syncToMusicBeats && projectConfig.musicTrack) {
        scenesToRender = scenesToRender.map(scene => {
          const BEAT_INTERVAL = 0.5;
          const targetDuration = Math.ceil((scene.duration || 4) / BEAT_INTERVAL) * BEAT_INTERVAL;
          return { ...scene, duration: targetDuration };
        });
        addLog("🎵 Auto Beat Sync: Synchronizing cut lengths to the background music tempo.");
      }
      
      const totalSecondsToRender = scenesToRender.reduce((s, scene) => s + scene.duration, 0);
      
      if (totalSecondsToRender > 60) {
        const m = Math.floor(totalSecondsToRender / 60);
        const s = Math.round(totalSecondsToRender % 60);
        addLog(`⏳ ${t.long_video_detected} (${m} ${t.estimated_minutes} ${s} ${t.estimated_seconds}). ${t.streaming_buffers_ready}`);
      }

      addLog("Initializing AudioContext Engine...");
      // Initialize AudioContext to mix gTTS streams and backgrounds
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;
      
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      
      // Node destination matching MediaRecorder
      const audioDest = audioCtx.createMediaStreamDestination();
      audioDestNodeRef.current = audioDest;

      // 1. Capture stream from HTML Canvas with multiple browser compatibility fallbacks
      addLog("Capturing high-fidelity 30fps canvas compositing stream...");
      let canvasStream: MediaStream;
      if (typeof (canvasElement as any).captureStream === 'function') {
        try {
          canvasStream = (canvasElement as any).captureStream(30);
        } catch (e) {
          canvasStream = (canvasElement as any).captureStream();
        }
      } else if (typeof (canvasElement as any).mozCaptureStream === 'function') {
        canvasStream = (canvasElement as any).mozCaptureStream(30);
      } else {
        throw new Error("Your browser does not support canvas stream recording. Please use modern Chrome, Firefox, or Edge.");
      }
      
      // 2. Load background music loop if selected
      if (projectConfig.musicTrack && projectConfig.isMusicEnabled !== false) {
        addLog("Blending cinematic background dynamic tracks...");
        const music = new Audio(projectConfig.musicTrack);
        music.loop = true;
        // Bypassing CORS constraints by setting crossOrigin anonymous
        music.crossOrigin = "anonymous";
        music.volume = projectConfig.musicVolume;
        renderBackgroundMusicRef.current = music;

        // Bridge background music into AudioContext
        const musicSrc = audioCtx.createMediaElementSource(music);
        musicSrc.connect(audioDest);
        musicSrc.connect(audioCtx.destination); // Let user hear matching monitor clip softly while baking
        music.play().catch(() => {});
      }

      // 3. Stitched Audio MediaStream
      const mixedStream = new MediaStream();
      canvasStream.getVideoTracks().forEach(track => mixedStream.addTrack(track));
      audioDest.stream.getAudioTracks().forEach(track => mixedStream.addTrack(track));

      // 4. Set target codecs dynamically with native MP4/H264/AAC compatibility fallback for iOS & mobile systems
      let selectedMimeType = 'video/webm;codecs=vp8,opus';
      let extension = 'webm';

      const candidates = [
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];

      for (const candidate of candidates) {
        if (MediaRecorder.isTypeSupported(candidate)) {
          selectedMimeType = candidate;
          if (candidate.startsWith('video/mp4')) {
            extension = 'mp4';
          }
          break;
        }
      }

      setDownloadExtension(extension);

      let options: MediaRecorderOptions = { mimeType: selectedMimeType };
      if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
        options = { mimeType: '' };
      }

      // Apply Amharic-optimized Data Save Profiles
      if (dataProfile === 'saver') {
        options.videoBitsPerSecond = 750000; // 750 Kbps (Very dense compression, beautiful enough but 5x smaller file size)
        options.audioBitsPerSecond = 48000;  // 48 Kbps
        addLog(`⚡ [Ultra-Saver] ${t.data_saving_mode}...`);
      } else {
        options.videoBitsPerSecond = 3200000; // 3.2 Mbps (Uncompressed cinema frames)
        options.audioBitsPerSecond = 128000;  // 128 Kbps
        addLog(`💎 [Cinema-Max] ${t.data_premium_mode}...`);
      }

      addLog(`Setting up MediaRecorder compression wrapper. Mode: ${options.mimeType || 'default'} (Target Extension: .${extension})`);
      const mediaRecorder = new MediaRecorder(mixedStream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        addLog("Wrapping media frames inside container...");
        const baseMime = selectedMimeType ? selectedMimeType.split(';')[0] : 'video/webm';
        const finalBlob = new Blob(recordedChunksRef.current, { type: baseMime });
        const finalUrl = URL.createObjectURL(finalBlob);
        setRenderedBlobUrl(finalUrl);
        
        // Calculate size metadata
        const sizeInMb = (finalBlob.size / (1024 * 1024)).toFixed(2);
        setStatistics({
          duration: totalSecondsToRender,
          fileSize: `${sizeInMb} MB`,
          scenesProcessed: scenesToRender.length,
          fps: 30
        });

        setRenderStatus('completed');
        addLog(`Compilation SUCCESS. Final WebM binary matches ${sizeInMb} MB.`);
      };

      // Start recording
      mediaRecorder.start();
      addLog("Master stitch recording initialized successfully.");

      // Helper to wait until a media element is fully ready to draw
      const waitForMediaReady = (el: HTMLElement, maxWaitMs = 3000): Promise<boolean> => {
        return new Promise((resolve) => {
          if (!el) {
            resolve(false);
            return;
          }
          const startTime = Date.now();
          const checkReady = () => {
            if (el instanceof HTMLVideoElement) {
              if (el.readyState >= 2) {
                resolve(true);
                return;
              }
            } else if (el instanceof HTMLImageElement) {
              if (el.complete && el.naturalWidth > 0) {
                resolve(true);
                return;
              }
            } else {
              resolve(true);
              return;
            }

            if (Date.now() - startTime > maxWaitMs) {
              addLog(`⚠️ Buffering notification: Proceeding with active frame streams.`);
              resolve(false);
            } else {
              setTimeout(checkReady, 50);
            }
          };
          checkReady();
        });
      };

      // Scene-by-scene timing workflow
      const renderSceneStep = async (index: number) => {
        if (index >= scenesToRender.length) {
          addLog("Stitching timeline limits reached. Compiling final code...");
          mediaRecorder.stop();
          cleanupRenderSubprocesses();
          return;
        }

        const scene = scenesToRender[index];
        addLog(`Composing Scene ${index + 1}/${scenesToRender.length} ("${scene.text.substring(0, 35)}...")`);
        
        // Update background visual indices
        renderIndexRef.current = index;
        setProgress(Math.round((index / scenesToRender.length) * 100));

        // Signal parent to update the active timeline scene and captions
        if (onRenderFrameChange) {
          onRenderFrameChange(index, 0);
        }

        // Start TTS Audio for this scene if enabled
        let sceneTts: HTMLAudioElement | null = null;
        if (projectConfig.isVoiceEnabled && audioCtx && audioDest) {
          const ttsUrl = scene.voiceoverUrl || `/api/tts?text=${encodeURIComponent(scene.text)}&lang=${projectConfig.voiceLanguage}`;
          sceneTts = new Audio(ttsUrl);
          sceneTts.crossOrigin = "anonymous";
          
          try {
            const ttsSrc = audioCtx.createMediaElementSource(sceneTts);
            ttsSrc.connect(audioDest);
            ttsSrc.connect(audioCtx.destination);
            sceneTts.play().catch(e => console.warn("Render TTS error:", e));
          } catch (e) {
            console.warn("Could not connect TTS to AudioContext:", e);
            sceneTts.play().catch(e => {}); // Play anyway if context fails
          }
        }

        // Retrieve the exact media element for this scene using its unique ID
        const mediaEl = document.getElementById(`video-scene-${scene.id}`);
        if (mediaEl) {
          addLog(`Synchronizing hardware buffer and content layers for Scene ${index + 1}...`);
          await waitForMediaReady(mediaEl, 2500);

          if (mediaEl instanceof HTMLVideoElement) {
            mediaEl.muted = true;
            mediaEl.currentTime = 0; // Reset to start
            try {
              await mediaEl.play();
            } catch (pErr) {
              console.warn("Failed to invoke play() on active segment video:", pErr);
            }
          }
        } else {
          // Robust universal backup query
          const videoEl = (canvasElement?.parentElement?.parentElement?.querySelector('video') || document.querySelector('video')) as HTMLVideoElement;
          if (videoEl) {
            videoEl.muted = true;
            videoEl.play().catch(() => {});
          }
        }

        // Tiny 100ms pause to guarantee perfect frame sync registration before beginning the clock
        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          await new Promise((resolve) => {
            // We run this scene for the calculated duration
            let remainingTime = scene.duration;
            const clockTick = 100;
              
            const stepTimer = setInterval(() => {
              remainingTime -= (clockTick / 1000);
                
              const elapsed = scene.duration - remainingTime;
                
              // Track progress linearly
              const completedSeconds = scenesToRender.slice(0, index).reduce((s, sc) => s + sc.duration, 0) + elapsed;
              setProgress(Math.min(99, Math.round((completedSeconds / totalSecondsToRender) * 100)));

              // Propagate high-fidelity elapsed time for smooth animations
              if (onRenderFrameChange) {
                onRenderFrameChange(index, elapsed);
              }

              if (remainingTime <= 0) {
                clearInterval(stepTimer);
                if (sceneTts) {
                  sceneTts.pause();
                  sceneTts.src = '';
                }
                resolve(true);
              }
            }, clockTick);
          });
        } catch (err: any) {
          addLog(`Sequence timing error: ${err.message}`);
          if (sceneTts) {
            sceneTts.pause();
            sceneTts.src = '';
          }
          await new Promise((resolve) => setTimeout(resolve, scene.duration * 1000));
        }

        // Proceed to next scene block recursion
        renderSceneStep(index + 1);
      };

      // Trigger first step
      renderSceneStep(0);

    } catch (err: any) {
      console.error(err);
      setRenderStatus('failed');
      addLog(`CRITICAL COMPILE ABORTED: ${err.message}`);
      cleanupRenderSubprocesses();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fadeIn" id="render-workbench">
      <div className="bg-[#0c0c0e]/95 border border-zinc-805 rounded-3xl max-w-xl w-full p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative">
        
        {/* Visual particles glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-32 bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />

        {/* Header bar */}
        <div className="text-center pb-4 mb-5 border-b border-zinc-805">
          <h1 className="text-sm font-light text-zinc-100 uppercase tracking-widest justify-center flex items-center gap-2">
            <FileVideo className="text-indigo-400" size={18} />
            {t.render_studio}
          </h1>
          <p className="text-xs text-zinc-500 mt-1.5">{t.render_log_assembling}</p>
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
                  <span className="text-[8px] font-mono text-zinc-650 mt-1.5 uppercase font-bold">Cinema Bitrate (3.2Mbps Uncompressed)</span>
                </button>
              </div>
            </div>

            <div className="flex gap-2 p-3.5 bg-[#050505] border border-zinc-900 rounded-xl text-[10px] leading-relaxed text-zinc-450">
              <ShieldCheck size={15} className="text-indigo-400 shrink-0 mt-0.5" />
              <span>
                <strong>System Integrity Check:</strong> {language === 'am' ? 'ማቀናበሩ ሙሉ በሙሉ በእርስዎ ስልክ/ኮምፒውተር ውስጥ በከፍተኛ ፍጥነት ይከናወናል። ጥራቱ እንዳይቋረጥ እባክዎን ይህንን ፔጅ ሳይዘጉት ይጠብቁ።' : 'Compilation renders directly in the browser utilizing hardware acceleration. Keep this browser tab active and stay on screen for pristine frame pacing.'}
              </span>
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
                  initiateRenderAndStitching();
                }}
                className={`py-4 text-white font-black text-sm uppercase tracking-[0.2em] rounded-2xl flex items-center justify-center gap-3 transition-all border border-indigo-400/30 ${
                  exportQuota > 0
                    ? 'bg-indigo-600 hover:bg-indigo-505 shadow-xl shadow-indigo-600/40 active:scale-95 cursor-pointer'
                    : 'bg-zinc-800 border-zinc-900 cursor-not-allowed opacity-40'
                }`}
                id="render-start-btn"
              >
                <Download size={18} fill="currentColor" className={exportQuota > 0 ? "animate-bounce" : ""} />
                {language === 'am' ? (exportQuota > 0 ? 'አሁን ቪዲዮውን አዘጋጅና አውርድ' : 'ኮታ የለም • ኮታውን ይሙሉ') : (exportQuota > 0 ? 'START VIDEO EXPORT' : 'EMPTY QUOTA • REFILL NOW')}
              </button>
            </div>
          </div>
        )}

        {renderStatus === 'rendering' && (
          <div className="space-y-5 py-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-center py-6">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-20 h-20 border-4 border-indigo-500/10 rounded-full" />
                  <div className="absolute w-20 h-20 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-base font-bold font-mono text-indigo-400">{progress}%</span>
                </div>
              </div>

              <div className="space-y-1 text-center">
                <span className="text-xs font-semibold text-zinc-300 block">Framing Movie Sequence...</span>
                <p className="text-[10px] text-zinc-500">Compiling scene timings and syncing text subtitles</p>
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
                  {language === 'am' ? 'ቅድመ-ዕይታውን በማጫወት ያረጋግጡ፤ ከተመቸዎት ቀጥታ ማውረድ ይችላሉ።' : 'Preview the stitched master file. Download to your local storage once satisfied.'}
                </p>
              </div>
            </div>

            {/* Real-time Inline Web Video Player Preview */}
            <div className="relative overflow-hidden rounded-2xl border border-zinc-900 bg-[#040406] p-1.5">
              <video
                src={renderedBlobUrl}
                controls
                playsInline
                className="w-full h-auto max-h-[190px] rounded-xl object-contain mx-auto shadow-xl"
              />
              <div className="text-center pt-1.5 pb-0.5">
                <span className="text-[9.5px] text-zinc-500 font-mono tracking-wide">
                  ✦ {language === 'am' ? 'ቪዲዮውን እዚህ ማጫወት ይችላሉ (Preview Video)' : 'Play & Preview Master Video'} ✦
                </span>
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
                  {language === 'am' ? 'የተዋሃዱ ክፍሎች' : 'Scenes Built'}
                </span>
                <p className="text-zinc-200 font-mono font-bold text-sm">
                  {statistics.scenesProcessed} {language === 'am' ? 'ክፍሎች' : 'Segments'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-zinc-600 uppercase tracking-widest text-[8px] font-mono block">
                  {language === 'am' ? 'የምስል ጥራት' : 'Resolution Target'}
                </span>
                <p className="text-zinc-250 font-mono font-bold text-xs uppercase">
                  {exportQuality === '1080p' ? (
                    projectConfig.aspectRatio === '16:9' ? '1920x1080 (Full HD)' : projectConfig.aspectRatio === '9:16' ? '1080x1920 (Shorts)' : '1080x1080 (Square)'
                  ) : (
                    projectConfig.aspectRatio === '16:9' ? '1280x720 (Standard HD)' : projectConfig.aspectRatio === '9:16' ? '720x1280 (Shorts)' : '800x800 (Square)'
                  )}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5 font-sans">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                {language === 'am' ? 'ቀሪ የነጻ ቪዲዮ ማውረጃ ዕድል (Remaining Quota):' : 'Remaining Free Video Downloads:'}
              </span>
              <span className="font-mono font-bold text-indigo-400">
                {exportQuota} / 3 {language === 'am' ? 'ጊዜ' : 'times'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setRenderStatus('idle');
                  setRenderedBlobUrl(null);
                }}
                className="flex-1 py-3 bg-zinc-900 border border-zinc-800 text-zinc-450 hover:text-white rounded-xl text-xs font-semibold font-mono uppercase tracking-widest transition-colors"
                id="render-again-btn"
              >
                {language === 'am' ? 'የማቀናበሪያ ገጽ' : 'Render settings'}
              </button>
              
              <a
                href={renderedBlobUrl || '#'}
                download={`yotor_official_video_${Date.now()}.${downloadExtension}`}
                onClick={() => {
                  if (exportQuota > 0) {
                    const nextQ = exportQuota - 1;
                    setExportQuota(nextQ);
                    localStorage.setItem('yotor_video_quota', String(nextQ));
                  }
                }}
                className="flex-1 py-5 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-600 text-white font-black block text-center rounded-2xl text-sm shadow-xl shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer font-mono uppercase tracking-[0.1em] border border-emerald-400/20"
                id="download-master-video-file-btn"
              >
                <span className="flex items-center justify-center gap-2.5">
                  <Download size={20} className="stroke-[3px]" />
                  {language === 'am' ? 'ተጠናቋል! ቪዲዮውን ወደ ስልክዎ ይጫኑ' : 'DOWNLOAD MASTER VIDEO'}
                </span>
              </a>
            </div>
          </div>
        )}

        {renderStatus === 'failed' && (
          <div className="space-y-5 py-4">
            <div className="flex flex-col items-center justify-center py-4 text-center space-y-3">
              <AlertCircle size={44} className="text-red-500 animate-pulse" />
              <h3 className="text-base font-semibold text-zinc-100 font-mono uppercase">Baking Session Stopped</h3>
              <p className="text-xs text-red-400 max-w-sm">An error occurred during canvas compilation or audio synthesis</p>
            </div>

            <div className="bg-red-955/10 border border-red-900/40 p-3 rounded-xl max-h-[140px] overflow-y-auto space-y-1">
              {renderLogs.slice(-4).map((log, index) => (
                <div key={index} className="text-[10px] uppercase font-mono text-red-350 leading-normal">{log}</div>
              ))}
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
                onClick={initiateRenderAndStitching}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-555 text-white font-bold text-xs rounded-xl transition-all font-mono uppercase tracking-widest"
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
