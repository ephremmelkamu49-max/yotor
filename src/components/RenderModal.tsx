import React, { useEffect, useState, useRef } from 'react';
import { Scene, ProjectConfig } from '../types';
import { DEFAULT_MUSIC, getTtsUrl } from '../data';
import { Language, translations } from '../translations';
import { 
  Download, Loader2, Play, CheckCircle2, Film, ShieldCheck, AlertCircle, FileVideo, Terminal, Crown, Lock, Zap, Cpu
} from 'lucide-react';
import fixWebmDuration from 'fix-webm-duration';
import { downloadLargeMediaFile } from '../utils/streamDownloader';
import { mediaStorage } from '../utils/indexedDBStorage';

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
      let quantized = Math.round(nextVal / 10) * 10;
      quantized = Math.max(0, Math.min(100, quantized));
      if (quantized >= 100 && nextVal < 99.5) {
        quantized = 90;
      }
      return Math.max(prev, quantized);
    });
  };
  const [renderLogs, setRenderLogs] = useState<string[]>([]);
  const [renderOption, setRenderOption] = useState<'full' | 'fast'>('full');
  const [renderedBlobUrl, setRenderedBlobUrl] = useState<string | null>(null);
  const [downloadExtension, setDownloadExtension] = useState<string>('webm');
  const [dataProfile, setDataProfile] = useState<'saver' | 'premium'>('premium');
  const [exportMethod, setExportMethod] = useState<'local' | 'cloud'>('cloud');
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
    if (renderLoopTimeoutRef.current) {
      clearInterval(renderLoopTimeoutRef.current);
    }
    if (cloudRenderIntervalRef.current) {
      clearInterval(cloudRenderIntervalRef.current);
      cloudRenderIntervalRef.current = null;
    }
    if (cloudRenderAbortControllerRef.current) {
      cloudRenderAbortControllerRef.current.abort();
      cloudRenderAbortControllerRef.current = null;
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
    recordedChunksRef.current = [];
  };

  const updateRenderedBlobUrl = (newUrl: string | null) => {
    setRenderedBlobUrl((prev) => {
      if (prev && prev !== newUrl && prev.startsWith('blob:')) {
        URL.revokeObjectURL(prev);
      }
      return newUrl;
    });
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
          if (!scene.voiceoverUrl && (!scene.text || scene.text.trim().length === 0)) {
            return scene; // No TTS for this scene
          }
          const ttsUrl = scene.voiceoverUrl || getTtsUrl(scene.text, projectConfig.voiceLanguage);
          const tempAudio = new Audio(ttsUrl);
          tempAudio.crossOrigin = "anonymous";
          
          const duration = await new Promise<number>((resolve) => {
            const timeout = setTimeout(() => {
              resolve(scene.duration || 4.5);
            }, 1805); // Max 1.8s load timeout
            
            tempAudio.onloadedmetadata = () => {
              clearTimeout(timeout);
              if (tempAudio.duration && !isNaN(tempAudio.duration) && tempAudio.duration > 0 && tempAudio.duration !== Infinity) {
                resolve(tempAudio.duration + 0.15);
              } else {
                resolve(scene.duration || 4.5);
              }
            };
            tempAudio.onerror = (e) => {
              clearTimeout(timeout);
              console.error("[TTS Duration] Failed to load audio metadata:", e);
              resolve(scene.duration || 4.5);
            };
          });
          
          // Explicit DOM & memory cleanup
          tempAudio.onloadedmetadata = null;
          tempAudio.onerror = null;
          tempAudio.pause();
          tempAudio.src = "";
          tempAudio.load();

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
      let selectedMimeType = 'video/mp4';
      let extension = 'mp4';

      const candidates = [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=h264,aac',
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
          } else if (candidate.startsWith('video/webm')) {
            extension = 'webm';
          }
          break;
        }
      }

      setDownloadExtension(extension);

      let options: MediaRecorderOptions = { mimeType: selectedMimeType };
      if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
        options = { mimeType: '' };
      }

      // Dynamic Premium Media Encoding Bitrates based on Output Resolution & Profiles
      let vBps = 12500000; // default 12.5 Mbps (1080p Cinematic)
      let aBps = 192000;   // default 192 Kbps

      if (exportQuality === '4k') {
        if (dataProfile === 'saver') {
          vBps = 25000000; // 25 Mbps
          aBps = 192000;
        } else {
          vBps = 45000000; // 45 Mbps (Ultra-High Fidelity Cinema 4K)
          aBps = 320000;   // 320 Kbps Audiophile stereo
        }
      } else if (exportQuality === '1080p') {
        if (dataProfile === 'saver') {
          vBps = 450000;   // 4.5 Mbps
          aBps = 128000;
        } else {
          vBps = 15000000; // 15 Mbps
          aBps = 192000;
        }
      } else { // 720p
        if (dataProfile === 'saver') {
          vBps = 2500000;  // 2.5 Mbps
          aBps = 96000;
        } else {
          vBps = 7500000;  // 7.5 Mbps
          aBps = 192000;
        }
      }

      options.videoBitsPerSecond = vBps;
      options.audioBitsPerSecond = aBps;
      
      if (dataProfile === 'saver') {
        addLog(`⚡ [Ultra-Saver] ${t.data_saving_mode} (${(vBps / 1000000).toFixed(1)} Mbps Video)...`);
      } else {
        addLog(`💎 [Cinema-Max] ${t.data_premium_mode} (${(vBps / 1000000).toFixed(1)} Mbps Video)...`);
      }

      addLog(`Setting up MediaRecorder compression wrapper. Mode: ${options.mimeType || 'default'} (Target Extension: .${extension})`);
      const mediaRecorder = new MediaRecorder(mixedStream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.onerror = (e: any) => {
        console.error("MediaRecorder error:", e);
        addLog(`⚠️ MediaRecorder error: ${e?.message || 'Encoder buffer overflow or resource limitation.'}`);
        setRenderStatus('failed');
      };

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      let actualRenderStartTime = 0;

      mediaRecorder.onstop = async () => {
        addLog("Wrapping media frames inside container...");
        
        // Clean up all playing media, sound streams and close AudioContext safely 
        // after the recorder has completely finished receiving tracks and flushed all data.
        cleanupRenderSubprocesses();

        const baseMime = selectedMimeType ? selectedMimeType.split(';')[0] : 'video/webm';
        let finalBlob = new Blob(recordedChunksRef.current, { type: baseMime });
        
        const actualDurationMs = Date.now() - actualRenderStartTime;
        
        if (baseMime === 'video/webm') {
           try {
             addLog("Fixing WebM metadata duration headers...");
             finalBlob = await fixWebmDuration(finalBlob, actualDurationMs, { logger: false });
           } catch (e) {
             console.warn("Failed to fix WebM duration", e);
           }
        }
        
        const finalUrl = URL.createObjectURL(finalBlob);
        updateRenderedBlobUrl(finalUrl);
        recordedChunksRef.current = [];
        
        // Calculate size metadata
        const sizeInMb = (finalBlob.size / (1024 * 1024)).toFixed(2);
        setStatistics({
          duration: Math.round(actualDurationMs / 1000),
          fileSize: `${sizeInMb} MB`,
          scenesProcessed: scenes.length,
          fps: 30
        });
        setRenderStatus('completed');
        setProgress(100);
        addLog(`Compilation SUCCESS. Final WebM binary matches ${sizeInMb} MB.`);
      };

      // Start recording
      actualRenderStartTime = Date.now();
      mediaRecorder.start(1000);
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
        // Yield to main UI thread to prevent browser tab freezing
        await new Promise((resolve) => setTimeout(resolve, 0));

        if (index >= scenesToRender.length) {
          addLog("Stitching timeline limits reached. Compiling final code...");
          mediaRecorder.stop();
          return;
        }

        const scene = scenesToRender[index];
        addLog(`Composing Scene ${index + 1}/${scenesToRender.length} ("${scene.text.substring(0, 35)}...")`);
        
        // Update background visual indices
        renderIndexRef.current = index;
        updateProgressForward((index / scenesToRender.length) * 100);

        // Signal parent to update the active timeline scene and captions
        if (onRenderFrameChange) {
          onRenderFrameChange(index, 0);
        }

        // Start TTS Audio for this scene if enabled
        let sceneTts: HTMLAudioElement | null = null;
        if (projectConfig.isVoiceEnabled && audioCtx && audioDest) {
          if (scene.voiceoverUrl || (scene.text && scene.text.trim().length > 0)) {
            const ttsUrl = scene.voiceoverUrl || getTtsUrl(scene.text, projectConfig.voiceLanguage);
            sceneTts = new Audio(ttsUrl);
            sceneTts.crossOrigin = "anonymous";
            
            let targetVolume = 1.0;
            if (projectConfig.autoLevelVoiceover && voiceoverPeaks) {
              const peakData = voiceoverPeaks[scene.id];
              if (peakData && peakData.peak > 0) {
                targetVolume = Math.min(1.0, 0.85 / peakData.peak);
              }
            }
            sceneTts.volume = targetVolume;
            
            try {
              const ttsSrc = audioCtx.createMediaElementSource(sceneTts);
              ttsSrc.connect(audioDest);
              ttsSrc.connect(audioCtx.destination);
            } catch (e) {
              console.warn("Could not connect TTS to AudioContext:", e);
            }

            addLog("Synchronizing voiceover track...");
            await new Promise((resolve) => {
              const timeout = setTimeout(() => {
                addLog("⚠️ Voiceover buffering timeout, proceeding with fallback duration.");
                resolve(true);
              }, 6000);

              if (sceneTts!.readyState >= 1) {
                clearTimeout(timeout);
                resolve(true);
              } else {
                sceneTts!.onloadedmetadata = () => {
                  clearTimeout(timeout);
                  resolve(true);
                };
                sceneTts!.onerror = () => {
                  clearTimeout(timeout);
                  resolve(true);
                };
              }
            });

            try {
              await sceneTts.play();
            } catch (e) {
              // Ignore play interruption during render
            }
          }
        }

        // Retrieve the exact media element for this scene using its unique ID
        const mediaEl = document.getElementById(`video-scene-${scene.id}`);
        if (mediaEl) {
          addLog(`Synchronizing hardware buffer and content layers for Scene ${index + 1}...`);
          await waitForMediaReady(mediaEl, 2500);

          if (mediaEl instanceof HTMLVideoElement) {
            mediaEl.muted = !projectConfig.isVideoSoundEnabled;
            mediaEl.volume = projectConfig.videoVolume !== undefined ? projectConfig.videoVolume : 0.5;
            mediaEl.currentTime = 0; // Reset to start

            // Bridge video audio to audioCtx if enabled & supported
            if (projectConfig.isVideoSoundEnabled && audioCtx && audioDest) {
              try {
                if (!(mediaEl as any).__audioConnected) {
                  const videoSrc = audioCtx.createMediaElementSource(mediaEl);
                  videoSrc.connect(audioDest);
                  videoSrc.connect(audioCtx.destination);
                  (mediaEl as any).__audioConnected = true;
                }
              } catch (e) {
                console.warn("Could not connect video element to AudioContext:", e);
              }
            }

            try {
              await mediaEl.play();
            } catch (pErr) {
              // Ignore play interruption during render
            }
          }
        } else {
          // Robust universal backup query
          const videoEl = (canvasElement?.parentElement?.parentElement?.querySelector('video') || document.querySelector('video')) as HTMLVideoElement;
          if (videoEl) {
            videoEl.muted = !projectConfig.isVideoSoundEnabled;
            videoEl.volume = projectConfig.videoVolume !== undefined ? projectConfig.videoVolume : 0.5;

            // Bridge backup video audio to audioCtx if enabled
            if (projectConfig.isVideoSoundEnabled && audioCtx && audioDest) {
              try {
                if (!(videoEl as any).__audioConnected) {
                  const srcNode = audioCtx.createMediaElementSource(videoEl);
                  srcNode.connect(audioDest);
                  srcNode.connect(audioCtx.destination);
                  (videoEl as any).__audioConnected = true;
                }
              } catch (e) {
                console.warn("Could not connect backup video to AudioContext:", e);
              }
            }

            videoEl.play().catch(() => {});
          }
        }

        // Tiny 100ms pause to guarantee perfect frame sync registration before beginning the clock
        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          await new Promise((resolve) => {
            // We run this scene dynamically matching TTS or min duration
            let elapsed = 0;
            const clockTick = 100;
              
            const stepTimer = setInterval(() => {
              elapsed += (clockTick / 1000);
              
              let targetDuration = scene.duration;
              if (sceneTts && !isNaN(sceneTts.duration) && sceneTts.duration > 0 && sceneTts.duration !== Infinity) {
                targetDuration = sceneTts.duration + 0.3;
              }

              if (projectConfig.syncToMusicBeats && projectConfig.musicTrack) {
                const BEAT_INTERVAL = 0.5;
                targetDuration = Math.ceil(targetDuration / BEAT_INTERVAL) * BEAT_INTERVAL;
              }
                
              // Track progress linearly
              const completedSeconds = scenesToRender.slice(0, index).reduce((s, sc) => s + sc.duration, 0) + Math.min(elapsed, targetDuration !== Infinity ? targetDuration : elapsed);
              updateProgressForward((completedSeconds / totalSecondsToRender) * 100);

              // Propagate high-fidelity elapsed time for smooth animations
              if (onRenderFrameChange) {
                onRenderFrameChange(index, elapsed);
              }

              const isAudioFinished = sceneTts ? sceneTts.ended || (sceneTts.error !== null) : false;
              const hasReachedTarget = elapsed >= targetDuration;
              // If targetDuration is Infinity, fallback to scene.duration but also wait for audio to finish
              const hasReachedFallback = elapsed >= scene.duration && isAudioFinished;

              if (hasReachedTarget || hasReachedFallback || (targetDuration === Infinity && isAudioFinished)) {
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

  const initiateCloudRender = async () => {
    setRenderStatus('processing');
    setProgress(0);
    setRenderLogs([]);
    addLog(`Initiating remote compile via /api/render-ffmpeg...`);

    if (cloudRenderIntervalRef.current) clearInterval(cloudRenderIntervalRef.current);
    if (cloudRenderAbortControllerRef.current) cloudRenderAbortControllerRef.current.abort();

    const abortController = new AbortController();
    cloudRenderAbortControllerRef.current = abortController;

    const uploadBlobUrl = async (blobUrl: string, filename: string): Promise<string> => {
      const blobRes = await fetch(blobUrl, { signal: abortController.signal });
      const blobData = await blobRes.blob();
      const formData = new FormData();
      formData.append("file", blobData, filename);
      
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        signal: abortController.signal
      });
      if (!uploadRes.ok) {
        throw new Error(`Upload failed with status ${uploadRes.status}`);
      }
      const data = await uploadRes.json();
      return data.url;
    };

    try {
      const payloadScenes = [];
      let currentIdx = 0;
      for (const scene of scenes) {
        currentIdx++;
        // Non-blocking async pause to give the main thread breathing room
        await new Promise((resolve) => setTimeout(resolve, 0));

        if (abortController.signal.aborted) throw new DOMException("Aborted", "AbortError");
        addLog(`[Prep] Processing scene ${currentIdx} of ${scenes.length}...`);
        updateProgressForward((currentIdx / scenes.length) * 15);
        
        let ttsAudioBuffer = undefined;
        let targetDuration = scene.duration;
        
        // Fetch the voiceover URL if voice is enabled and convert it to base64 for reliable server-side mixing
        if (projectConfig.isVoiceEnabled && scene.text && scene.text.trim().length > 0) {
          const ttsUrl = scene.voiceoverUrl || getTtsUrl(scene.text, projectConfig.voiceLanguage);
          if (ttsUrl) {
            try {
              addLog(`  -> Preparing voiceover narrative...`);
              const audioRes = await fetch(ttsUrl, { signal: abortController.signal });
              if (!audioRes.ok) {
                throw new Error(`TTS server returned status ${audioRes.status}`);
              }
              const contentType = audioRes.headers.get("content-type") || "";
              if (!contentType.includes("audio") && !contentType.includes("octet-stream")) {
                throw new Error(`TTS server returned unexpected content-type: ${contentType}`);
              }
              const audioBlob = await audioRes.blob();
              
              // Pre-calculate exact audio duration for flawless server-side video alignment
              const audioUrl = URL.createObjectURL(audioBlob);
              const tempAudio = new Audio(audioUrl);
              tempAudio.crossOrigin = "anonymous";
              
              let calculatedDuration = scene.duration || 4.5;
              try {
                calculatedDuration = await new Promise<number>((resolve) => {
                  const timeout = setTimeout(() => {
                    resolve(scene.duration || 4.5);
                  }, 3000); // 3-second load timeout
                  
                  tempAudio.onloadedmetadata = () => {
                    clearTimeout(timeout);
                    if (tempAudio.duration && !isNaN(tempAudio.duration) && tempAudio.duration > 0 && tempAudio.duration !== Infinity) {
                      resolve(tempAudio.duration + 0.15);
                    } else {
                      resolve(scene.duration || 4.5);
                    }
                  };
                  tempAudio.onerror = (e) => {
                    clearTimeout(timeout);
                    console.error("[Cloud Prep TTS] Audio metadata error:", e);
                    resolve(scene.duration || 4.5);
                  };
                });
              } finally {
                tempAudio.onloadedmetadata = null;
                tempAudio.onerror = null;
                tempAudio.pause();
                tempAudio.src = "";
                tempAudio.load();
                URL.revokeObjectURL(audioUrl);
              }

              targetDuration = calculatedDuration;
              addLog(`  -> Narrative duration: ${targetDuration.toFixed(2)}s`);

              const reader = new FileReader();
              const base64Audio = await new Promise<string>((resolve, reject) => {
                if (abortController.signal.aborted) {
                  reject(new DOMException("Aborted", "AbortError"));
                  return;
                }
                reader.onloadend = () => {
                  const res = reader.result as string;
                  const m = res.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                  resolve(m ? m[2] : "");
                };
                reader.readAsDataURL(audioBlob);
              });
              if (base64Audio) {
                ttsAudioBuffer = base64Audio;
              }
            } catch (e: any) {
              if (e.name === 'AbortError') throw e;
              console.warn("Failed to fetch and convert TTS to base64, using silent fallback for this scene", e);
              addLog(`  ⚠️ Voiceover prepare skipped for scene ${currentIdx} (using fallback silence).`);
            }
          }
        }

        if (projectConfig.syncToMusicBeats && projectConfig.musicTrack) {
          const BEAT_INTERVAL = 0.5;
          targetDuration = Math.ceil(targetDuration / BEAT_INTERVAL) * BEAT_INTERVAL;
          addLog(`  -> Beat Sync aligned duration: ${targetDuration.toFixed(2)}s`);
        }

        let sceneMusicVolume = undefined;
        if (typeof scene.musicVolume === 'number') {
           sceneMusicVolume = scene.musicVolume;
        }
        let finalVideoUrl = scene.videoUrl || "";
        if (finalVideoUrl.startsWith('blob:')) {
          try {
            addLog(`  -> Caching local video buffer to server...`);
            finalVideoUrl = await uploadBlobUrl(finalVideoUrl, `scene_video_${scene.id}.mp4`);
            addLog(`  -> Cache complete!`);
          } catch(e: any) {
            if (e.name === 'AbortError') throw e;
            console.warn("Failed to convert video", e);
          }
        } else {
          addLog(`  -> Linking remote visual clip...`);
        }

        payloadScenes.push({
          id: scene.id,
          videoUrl: finalVideoUrl,
          ttsAudioBuffer,
          duration: targetDuration,
          musicVolume: sceneMusicVolume,
          caption: scene.caption
        });
      }

      addLog("Uploading structural manifest to remote rendering farm...");
      updateProgressForward(20);

      let finalMusicUrl = projectConfig.isMusicEnabled ? projectConfig.musicTrack : undefined;
      if (finalMusicUrl && finalMusicUrl.startsWith('blob:')) {
        try {
          addLog("Mixing cinematic music background track...");
          finalMusicUrl = await uploadBlobUrl(finalMusicUrl, "custom_music.mp3");
          addLog("Upload complete!");
        } catch(e: any) {
          if (e.name === 'AbortError') throw e;
          console.warn("Failed to convert music to base64", e);
        }
      } else if (finalMusicUrl) {
        addLog("Linking remote cinematic music background...");
      }

      const payload = {
        scenes: payloadScenes,
        aspectRatio: projectConfig.aspectRatio,
        exportQuality: exportQuality,
        musicUrl: finalMusicUrl,
        musicVolume: projectConfig.musicVolume,
        ramLimit: ramLimit,
        subtitleStyle: projectConfig.subtitleStyle,
        visualStyle: projectConfig.visualStyle,
        videoFilter: projectConfig.videoFilter
      };
      
      addLog("Starting backend compilation...");
      
      const response = await fetch("/api/render-ffmpeg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.signal
      });

      if (!response.ok) {
        let errMsg = response.statusText;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg || `Cloud render failed: status ${response.status}`);
      }

      const { jobId } = await response.json();
      addLog(`Job submitted. Remote ID: ${jobId}. Waiting for rendering farm...`);

      // Poll for status with connection robustness/glitch tolerance for long video renderings
      let consecutiveErrors = 0;
      const pollJob = async () => {
        if (abortController.signal.aborted) return;

        try {
          const statusRes = await fetch(`/api/render-status?jobId=${jobId}`, { signal: abortController.signal });
          
          if (!statusRes.ok) {
            consecutiveErrors++;
            if (consecutiveErrors < 15) {
              console.warn(`[Render Poll] status is ${statusRes.status}, retrying shortly (attempt ${consecutiveErrors}/15)...`);
              setTimeout(pollJob, 3500);
              return;
            }
            const text = await statusRes.text().catch(() => "");
            let errMsg = `Server status check failed: ${statusRes.status}`;
            try {
              const errData = JSON.parse(text);
              if (errData && errData.error) errMsg = errData.error;
            } catch (_) {}
            throw new Error(errMsg);
          }
          
          const text = await statusRes.text();
          if (text.trim().startsWith("<")) {
            consecutiveErrors++;
            if (consecutiveErrors < 15) {
              console.warn(`[Render Poll] received HTML instead of JSON, retrying shortly (attempt ${consecutiveErrors}/15)...`);
              setTimeout(pollJob, 3500);
              return;
            }
            throw new Error("Received invalid HTML page instead of status JSON from server");
          }
          
          let job;
          try {
            job = JSON.parse(text);
          } catch (e) {
            consecutiveErrors++;
            if (consecutiveErrors < 15) {
              console.warn(`[Render Poll] failed to parse JSON, retrying shortly (attempt ${consecutiveErrors}/15)...`);
              setTimeout(pollJob, 3500);
              return;
            }
            throw new Error("Failed to parse server status JSON");
          }

          // Reset error counter upon receiving a valid, parsed status
          consecutiveErrors = 0;

          if (job.status === 'processing') {
            setProgress(job.progress || 0);
            if (job.log) addLog(job.log);
            setTimeout(pollJob, 2500);
          } else if (job.status === 'done') {
            addLog("✅ [Cloud Render] Remote compilation complete!");
            setProgress(100);

            const downloadUrl = `${window.location.origin}/api/render-download?jobId=${jobId}`;
            setDownloadExtension("mp4");
            
            const totalDur = scenes.reduce((s, sc) => s + sc.duration, 0);
            setStatistics({
              duration: Math.round(totalDur),
              fileSize: job.fileSize || "15.00 MB",
              scenesProcessed: scenes.length,
              fps: 30
            });

            // Immediately mark as completed so the user can stream, view, and download natively without waiting for slow local caching!
            setRenderedBlobUrl(downloadUrl);
            setRenderStatus('completed');
            addLog("✅ [Direct Download] ቪዲዮው በተሳካ ሁኔታ ተጠናቋል። አሁን በቀጥታ በከፍተኛ ፍጥነት ማውረድ ይችላሉ! (Video completed successfully! Ready for high-speed direct download!)");
            cloudRenderAbortControllerRef.current = null;
            if (onRenderComplete) onRenderComplete();
          } else if (job.status === 'error') {
            throw new Error(job.error || job.log || "Unknown server rendering error");
          }
        } catch (pollErr: any) {
          if (pollErr.name === 'AbortError') return;
          console.warn("Polling connection glitch:", pollErr);
          consecutiveErrors++;
          if (consecutiveErrors < 15) {
            addLog(`⚠️ Connection glitch (retrying status check... attempt ${consecutiveErrors}/15)`);
            setTimeout(pollJob, 3500);
          } else {
            setRenderStatus('failed');
            addLog(`❌ [Cloud Render] Polling FAILED after 15 consecutive attempts: ${pollErr.message}`);
          }
        }
      };

      pollJob();
    } catch (err: any) {
      if (cloudRenderIntervalRef.current) {
        clearInterval(cloudRenderIntervalRef.current);
        cloudRenderIntervalRef.current = null;
      }
      cloudRenderAbortControllerRef.current = null;
      if (err.name === 'AbortError') {
        addLog("Compilation aborted by user.");
        return;
      }
      console.error(err);
      setRenderStatus('failed');
      addLog(`❌ [Cloud Render] FAILED: ${err.message}`);
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
              <div className="flex items-center justify-center py-6">
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
                  {language === 'am' ? 'ቅድመ-ዕይታውን በማጫወት ያረጋግጡ፤ ከተመቸዎት ቀጥታ ማውረድ ይችላሉ።' : 'Preview the stitched master file. Download to your local storage once satisfied.'}
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
                preload="metadata"
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
                className="flex-1 py-3 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-semibold font-mono uppercase tracking-widest transition-colors animate-fade-in"
                id="render-again-btn"
              >
                {language === 'am' ? 'የማቀናበሪያ ገጽ' : 'Render settings'}
              </button>
              
              <button
                type="button"
                onClick={async () => {
                  if (exportQuota > 0) {
                    const nextQ = exportQuota - 1;
                    setExportQuota(nextQ);
                    localStorage.setItem('yotor_video_quota', String(nextQ));
                  }

                  if (renderedBlobUrl) {
                    try {
                      const fileName = `yotor_official_video_${Date.now()}.${downloadExtension}`;
                      if (renderedBlobUrl.startsWith('blob:')) {
                        const res = await fetch(renderedBlobUrl);
                        const blob = await res.blob();
                        await downloadLargeMediaFile({
                          filename: fileName,
                          blob,
                        });
                      } else {
                        const a = document.createElement('a');
                        a.href = renderedBlobUrl.includes('download=true') ? renderedBlobUrl : `${renderedBlobUrl}&download=true`;
                        a.download = fileName;
                        a.target = '_blank';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => document.body.removeChild(a), 1000);
                      }
                    } catch (err) {
                      window.open(renderedBlobUrl, '_blank');
                    }
                  }
                }}
                className="flex-1 py-5 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-600 text-white font-black block text-center rounded-2xl text-sm shadow-xl shadow-emerald-600/30 active:scale-95 transition-all cursor-pointer font-mono uppercase tracking-[0.1em] border border-emerald-400/20"
                id="download-master-video-file-btn"
              >
                <span className="flex items-center justify-center gap-2.5">
                  <Download size={20} className="stroke-[3px]" />
                  {language === 'am' ? 'ተጠናቋል! ቪዲዮውን ወደ ስልክዎ ይጫኑ' : 'DOWNLOAD MASTER VIDEO'}
                </span>
              </button>
            </div>

            {/* Direct High-Speed Download Buttons for Chrome / Telegram Export */}
            <div className="p-4 bg-gradient-to-r from-blue-950/20 to-indigo-950/20 border border-blue-500/10 rounded-2xl space-y-3 mt-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  {language === 'am' ? 'ፈጣን ቀጥታ ማውረጃ (Direct High-Speed Export)' : 'Direct High-Speed Download Mirror'}
                </span>
                <span className="text-[9px] bg-blue-500/10 text-blue-300 font-mono font-bold px-1.5 py-0.5 rounded border border-blue-500/20 uppercase">
                  100% Native Speed
                </span>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <a
                  href={
                    renderedBlobUrl
                      ? renderedBlobUrl.includes('download=true')
                        ? renderedBlobUrl
                        : `${renderedBlobUrl}&download=true`
                      : '#'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (exportQuota > 0) {
                      const nextQ = exportQuota - 1;
                      setExportQuota(nextQ);
                      localStorage.setItem('yotor_video_quota', String(nextQ));
                    }
                  }}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-650 hover:from-blue-500 hover:to-indigo-600 text-white text-xs font-bold font-sans rounded-xl shadow-lg hover:shadow-blue-500/20 active:scale-[0.98] transition-all text-center block border border-blue-400/20 uppercase tracking-wider"
                >
                  📥 {language === 'am' ? 'በቀጥታ አውርድ (Direct High-Speed MP4)' : 'NATIVE DIRECT MP4 DOWNLOAD'}
                </a>
                
                <p className="text-[10px] text-zinc-450 leading-relaxed font-sans text-center">
                  {language === 'am' 
                    ? 'ይህ ማውረጃ በቀጥታ ሰርቨሩን በማገናኘት እንደ Telegram, Chrome ወይም YouTube እጅግ በከፍተኛ ፍጥነት እና ያለ ምንም መቆራረጥ በቀጥታ እንዲያወርዱ ያስችልዎታል።' 
                    : 'This directly initiates a native browser download stream at maximum server bandwidth (similar to Chrome/Telegram downloaders).'}
                </p>
              </div>
            </div>

            {/* Google AI Studio Iframe sandbox bypass help card */}
            <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl space-y-2 mt-2">
              <h4 className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5 font-sans">
                ⚠️ {language === 'am' ? 'ማሳሰቢያ (Iframe Security Notice)' : 'Troubleshooting / Download Notice'}
              </h4>
              <p className="text-[10.5px] text-zinc-350 leading-relaxed font-sans">
                {language === 'am' ? (
                  <>
                    በስልክዎ የጎግል አይ ስቱዲዮ (Google AI Studio) ውስጥ ቪዲዮውን ማጫወት ወይም ማውረድ ካልቻሉ፣ እባክዎ ከላይ በስተቀኝ ያለውን <strong className="text-amber-300">"Open in new tab"</strong> የሚለውን ቁልፍ በመጫን አፑን በአዲስ ገጽ ይክፈቱት። በአዲስ ታብ ላይ ምንም ዓይነት የደህንነት ገደብ ስለማይኖርበት ቪዲዮው በጥራት ይጫናል፤ በፍጥነትም ይወርዳል!
                  </>
                ) : (
                  <>
                    If you are unable to preview or download the video inside the Google AI Studio preview window, please click the <strong className="text-amber-300">"Open in new tab"</strong> button at the top right of the page. Opening the app in a new tab bypasses iframe sandbox restrictions, allowing the video to stream and download flawlessly!
                  </>
                )}
              </p>
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
                onClick={() => {
                  if (exportMethod === 'local') {
                    initiateRenderAndStitching();
                  } else {
                    initiateCloudRender();
                  }
                }}
                className={`flex-1 py-2.5 text-white font-bold text-xs rounded-xl transition-all font-mono uppercase tracking-widest ${
                  exportMethod === 'local' ? 'bg-emerald-600 hover:bg-emerald-550' : 'bg-indigo-600 hover:bg-indigo-555'
                }`}
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
