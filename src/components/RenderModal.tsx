import React, { useEffect, useState, useRef } from 'react';
import { Scene, ProjectConfig, AnimationStyle } from '../types';
import { Language, translations } from '../translations';
import { 
  Download, Loader2, Play, CheckCircle2, FileVideo, AlertCircle, Terminal,
  Zap, Settings, ShieldCheck, RefreshCw, Film
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

export interface RenderedSceneResult {
  sceneId: string;
  sceneIndex: number;
  blobUrl: string;
  blob: Blob;
  mimeType: string;
  extension: string;
  fileSize: string;
  duration: number;
  title: string;
  createdAt: string;
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
  
  // Render state
  const [renderStatus, setRenderStatus] = useState<'idle' | 'rendering' | 'completed' | 'failed'>('idle');
  const [renderingSceneIndex, setRenderingSceneIndex] = useState<number>(0);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [currentSceneTime, setCurrentSceneTime] = useState<number>(0);
  const [totalSceneDuration, setTotalSceneDuration] = useState<number>(0);
  
  const [selectedSceneMode, setSelectedSceneMode] = useState<'all' | 'single'>('all');
  const [targetSingleSceneId, setTargetSingleSceneId] = useState<string>('');

  const [renderedResults, setRenderedResults] = useState<RenderedSceneResult[]>([]);
  const [renderLogs, setRenderLogs] = useState<string[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Dedicated Render Canvas Ref
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Active execution refs
  const isAbortedRef = useRef<boolean>(false);
  const activeAnimationRef = useRef<number | null>(null);
  const activeAudioContextRef = useRef<AudioContext | null>(null);
  const activeMediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Quota state
  const [exportQuota, setExportQuota] = useState<number>(() => {
    const saved = localStorage.getItem('yotor_video_quota');
    return saved ? parseInt(saved, 10) : 3;
  });

  const handleRefillQuota = () => {
    setExportQuota(3);
    localStorage.setItem('yotor_video_quota', '3');
  };

  useEffect(() => {
    if (scenes.length > 0 && !targetSingleSceneId) {
      setTargetSingleSceneId(scenes[0].id);
    }
  }, [scenes]);

  const addLog = (msg: string) => {
    setRenderLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const cancelCurrentRender = () => {
    isAbortedRef.current = true;
    if (activeAnimationRef.current) {
      cancelAnimationFrame(activeAnimationRef.current);
      activeAnimationRef.current = null;
    }
    if (activeMediaRecorderRef.current && activeMediaRecorderRef.current.state !== 'inactive') {
      try {
        activeMediaRecorderRef.current.stop();
      } catch (_) {}
    }
    if (activeAudioContextRef.current && activeAudioContextRef.current.state !== 'closed') {
      try {
        activeAudioContextRef.current.close();
      } catch (_) {}
    }
    setRenderStatus('idle');
    addLog('⚠️ Render cancelled.');
  };

  // Helper to draw text wrapped line by line on canvas
  const drawWrappedText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    bgColor: string,
    textColor: string
  ) => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);

    const totalHeight = lines.length * lineHeight + 16;
    let maxLineWidth = 0;
    lines.forEach(line => {
      const w = ctx.measureText(line).width;
      if (w > maxLineWidth) maxLineWidth = w;
    });

    const boxWidth = Math.min(maxWidth + 24, maxLineWidth + 32);
    const boxX = x - boxWidth / 2;
    const boxY = y - totalHeight / 2;

    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxWidth, totalHeight, 12);
      ctx.fill();
    }

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, idx) => {
      ctx.fillText(line, x, startY + idx * lineHeight);
    });
  };

  // Detect supported MediaRecorder MIME types on mobile browser
  const getSupportedMimeType = (): { mimeType: string; extension: string } => {
    const types = [
      { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
      { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
      { mimeType: 'video/webm', extension: 'webm' },
      { mimeType: 'video/mp4;codecs=avc1,mp4a', extension: 'mp4' },
      { mimeType: 'video/mp4;codecs=h264,aac', extension: 'mp4' },
      { mimeType: 'video/mp4', extension: 'mp4' }
    ];

    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t.mimeType)) {
        return t;
      }
    }
    return { mimeType: '', extension: 'webm' };
  };

  // Main client-side scene recording function
  const renderSingleSceneClientSide = async (
    scene: Scene,
    sceneIndex: number,
    audioCtx: AudioContext
  ): Promise<RenderedSceneResult> => {
    addLog(`🎬 Initializing render for Scene ${sceneIndex + 1}...`);
    
    // 1. EXACT CANVAS RESOLUTION BASED ON ASPECT RATIO & QUALITY
    let width = 1280;
    let height = 720;

    if (exportQuality === '4k') {
      if (projectConfig.aspectRatio === '9:16') {
        width = 2160; height = 3840;
      } else if (projectConfig.aspectRatio === '1:1') {
        width = 2160; height = 2160;
      } else {
        width = 3840; height = 2160;
      }
    } else if (exportQuality === '1080p') {
      if (projectConfig.aspectRatio === '9:16') {
        width = 1080; height = 1920;
      } else if (projectConfig.aspectRatio === '1:1') {
        width = 1080; height = 1080;
      } else {
        width = 1920; height = 1080;
      }
    } else { // 720p
      if (projectConfig.aspectRatio === '9:16') {
        width = 720; height = 1280;
      } else if (projectConfig.aspectRatio === '1:1') {
        width = 720; height = 720;
      } else {
        width = 1280; height = 720;
      }
    }

    const canvas = renderCanvasRef.current || document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Canvas 2D context initialization failed.');
    }

    addLog(`Resolution locked to ${width}x${height} (${exportQuality}, Aspect: ${projectConfig.aspectRatio})`);

    // 2. PREPARE VISUAL MEDIA (VIDEO OR STATIC IMAGE)
    let videoElement: HTMLVideoElement | null = null;
    let imageElement: HTMLImageElement | null = null;
    let isVideoMedia = false;

    if (scene.videoUrl) {
      addLog(`Loading video source...`);
      videoElement = document.createElement('video');
      videoElement.crossOrigin = 'anonymous';
      videoElement.setAttribute('playsinline', 'true');
      videoElement.setAttribute('webkit-playsinline', 'true');
      videoElement.muted = true; // Autoplay requirement on Android Mobile
      videoElement.preload = 'auto';
      videoElement.src = scene.videoUrl;

      await new Promise<void>((resolve) => {
        if (!videoElement) return resolve();
        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        videoElement.onloadeddata = done;
        videoElement.oncanplay = done;
        videoElement.onerror = () => {
          addLog('⚠️ Video failed to load. Switching to static fallback image.');
          done();
        };
        setTimeout(done, 5000); // 5s fallback timeout
      });

      if (videoElement.readyState >= 2) {
        isVideoMedia = true;
      }
    }

    // Fallback static image loading
    if (!isVideoMedia) {
      const fallbackUrl = scene.videoThumb || scene.previewUrl || '';
      if (fallbackUrl) {
        addLog(`Loading image source...`);
        imageElement = new Image();
        imageElement.crossOrigin = 'anonymous';
        imageElement.src = fallbackUrl;

        await new Promise<void>((resolve) => {
          if (!imageElement) return resolve();
          imageElement.onload = () => resolve();
          imageElement.onerror = () => resolve();
          setTimeout(resolve, 3000);
        });
      }
    }

    // 3. AUDIO PREPARATION & DECODING
    const audioDestination = audioCtx.createMediaStreamDestination();

    // Voiceover Audio
    let voiceBufferNode: AudioBufferSourceNode | null = null;
    let targetDuration = scene.duration || 4.0;

    if (projectConfig.isVoiceEnabled !== false && scene.voiceoverUrl) {
      addLog(`Decoding voiceover audio buffer...`);
      try {
        const res = await fetch(scene.voiceoverUrl);
        const arrayBuf = await res.arrayBuffer();
        const voiceBuffer = await audioCtx.decodeAudioData(arrayBuf);

        voiceBufferNode = audioCtx.createBufferSource();
        voiceBufferNode.buffer = voiceBuffer;

        const voiceGain = audioCtx.createGain();
        voiceGain.gain.value = 1.0;
        voiceBufferNode.connect(voiceGain);
        voiceGain.connect(audioDestination);

        if (voiceBuffer.duration > targetDuration) {
          targetDuration = voiceBuffer.duration + 0.2;
        }
      } catch (err) {
        addLog(`⚠️ Voiceover decoding failed: ${err}`);
      }
    }

    // Background Music Audio
    let musicBufferNode: AudioBufferSourceNode | null = null;
    if (projectConfig.isMusicEnabled !== false && projectConfig.musicTrack) {
      addLog(`Decoding background music buffer...`);
      try {
        const res = await fetch(projectConfig.musicTrack);
        const arrayBuf = await res.arrayBuffer();
        const musicBuffer = await audioCtx.decodeAudioData(arrayBuf);

        musicBufferNode = audioCtx.createBufferSource();
        musicBufferNode.buffer = musicBuffer;
        musicBufferNode.loop = true;

        const musicGain = audioCtx.createGain();
        let musicVol = projectConfig.musicVolume ?? 0.12;
        if (projectConfig.autoDuckNarration && voiceBufferNode) {
          musicVol = Math.min(0.03, musicVol * 0.25);
        }
        musicGain.gain.value = musicVol;

        musicBufferNode.connect(musicGain);
        musicGain.connect(audioDestination);
      } catch (e) {
        console.warn('Music decode failed:', e);
      }
    }

    // Video Sound Track
    if (projectConfig.isVideoSoundEnabled !== false && isVideoMedia && videoElement) {
      try {
        videoElement.muted = false; // Unmute so Web Audio captures track
        const vidSource = audioCtx.createMediaElementSource(videoElement);
        const vidGain = audioCtx.createGain();
        vidGain.gain.value = projectConfig.videoVolume ?? 0.8;
        vidSource.connect(vidGain);
        vidGain.connect(audioDestination);
      } catch (e) {
        console.warn('Video audio node binding notice:', e);
      }
    }

    setTotalSceneDuration(targetDuration);

    // 4. COMBINE STREAMS & INITIALIZE MEDIARECORDER WITH HIGH BITRATE
    const canvasStream = canvas.captureStream(30); // 30 FPS stream
    const audioTracks = audioDestination.stream.getAudioTracks();
    const combinedTracks = [...canvasStream.getVideoTracks(), ...audioTracks];
    const combinedStream = new MediaStream(combinedTracks);

    const { mimeType, extension } = getSupportedMimeType();
    let bitrate = 8000000; // 8 Mbps for 1080p
    if (exportQuality === '4k') bitrate = 14000000;
    if (exportQuality === '720p') bitrate = 4000000;

    const recorderOptions: MediaRecorderOptions = {
      videoBitsPerSecond: bitrate
    };
    if (mimeType) {
      recorderOptions.mimeType = mimeType;
    }

    const mediaRecorder = new MediaRecorder(combinedStream, recorderOptions);
    activeMediaRecorderRef.current = mediaRecorder;

    const recordedChunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    addLog(`MediaRecorder initialized (${mimeType || 'default'}, ${Math.round(bitrate / 1000000)}Mbps)`);

    // 5. START PLAYBACK & RECORDING LOOP
    mediaRecorder.start(100);

    if (voiceBufferNode) voiceBufferNode.start(0);
    if (musicBufferNode) musicBufferNode.start(0);

    if (isVideoMedia && videoElement) {
      videoElement.currentTime = 0;
      videoElement.play().catch((e) => addLog(`Video play notice: ${e}`));
    }

    const startTime = performance.now();

    // CONTINUOUS FRAME DRAWING LOOP (FIXES CHOPPINESS & STATIC IMAGE ISSUES)
    return new Promise<RenderedSceneResult>((resolve, reject) => {
      const renderFrame = () => {
        if (isAbortedRef.current) {
          mediaRecorder.stop();
          return reject(new Error('Render cancelled by user.'));
        }

        const now = performance.now();
        const elapsedSeconds = (now - startTime) / 1000;
        setCurrentSceneTime(elapsedSeconds);

        const progressPercent = Math.min(100, (elapsedSeconds / targetDuration) * 100);
        setRenderProgress(progressPercent);

        if (onRenderFrameChange) {
          onRenderFrameChange(sceneIndex, elapsedSeconds);
        }

        // --- DRAW VISUAL BASE ON CANVAS ---
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, width, height);

        const mediaSource = isVideoMedia && videoElement ? videoElement : imageElement;

        if (mediaSource) {
          // Keep video playing if paused prematurely
          if (isVideoMedia && videoElement && videoElement.paused && elapsedSeconds < targetDuration) {
            videoElement.play().catch(() => {});
          }

          const vWidth = isVideoMedia ? (videoElement?.videoWidth || width) : (imageElement?.naturalWidth || width);
          const vHeight = isVideoMedia ? (videoElement?.videoHeight || height) : (imageElement?.naturalHeight || height);

          if (vWidth > 0 && vHeight > 0) {
            ctx.save();

            // Cover ratio calculation
            const vRatio = vWidth / vHeight;
            const cRatio = width / height;
            let sx = 0, sy = 0, sWidth = vWidth, sHeight = vHeight;

            if (vRatio > cRatio) {
              sWidth = vHeight * cRatio;
              sx = (vWidth - sWidth) / 2;
            } else {
              sHeight = vWidth / cRatio;
              sy = (vHeight - sHeight) / 2;
            }

            // Animation motion (zoom/pan) applied frame-by-frame
            let animStyle: AnimationStyle = scene.animationStyle || projectConfig.animationStyle || 'zoom-in';
            if (projectConfig.isAnimationEnabled === false) animStyle = 'static';

            const animProgress = Math.min(1, elapsedSeconds / targetDuration);
            let dynamicScale = 1.0;
            let dynamicOffsetX = 0;
            let dynamicOffsetY = 0;

            switch (animStyle) {
              case 'zoom-in':
                dynamicScale = 1.0 + 0.12 * animProgress;
                break;
              case 'zoom-out':
                dynamicScale = 1.15 - 0.15 * animProgress;
                break;
              case 'pan-lr':
                dynamicOffsetX = width * 0.08 * (animProgress - 0.5);
                break;
              case 'pan-rl':
                dynamicOffsetX = -width * 0.08 * (animProgress - 0.5);
                break;
              case 'tilt-up':
                dynamicOffsetY = height * 0.05 * (animProgress - 0.5);
                dynamicScale = 1.05;
                break;
              case 'tilt-down':
                dynamicOffsetY = -height * 0.05 * (animProgress - 0.5);
                dynamicScale = 1.05;
                break;
              default:
                break;
            }

            ctx.translate(width / 2, height / 2);
            ctx.scale(dynamicScale, dynamicScale);

            // Color Filter Application
            let filterStr = '';
            if (projectConfig.videoFilter) {
              switch (projectConfig.videoFilter) {
                case 'sepia': filterStr = 'sepia(100%)'; break;
                case 'grayscale': filterStr = 'grayscale(100%)'; break;
                case 'contrast': filterStr = 'contrast(150%) brightness(95%)'; break;
                case 'vintage': filterStr = 'sepia(40%) contrast(120%) brightness(90%) saturate(80%)'; break;
                case 'teal': filterStr = 'contrast(115%) saturate(135%) sepia(15%) hue-rotate(-15deg)'; break;
                case 'high-contrast': filterStr = 'contrast(180%) brightness(95%) saturate(125%)'; break;
              }
            }
            ctx.filter = filterStr || 'none';

            // CONTINUOUS DRAW COMMAND
            ctx.drawImage(
              mediaSource,
              sx, sy, sWidth, sHeight,
              -width / 2 + dynamicOffsetX, -height / 2 + dynamicOffsetY, width, height
            );

            ctx.restore();
            ctx.filter = 'none';
          }
        }

        // --- SUBTITLE OVERLAY ---
        const subStyle = projectConfig.subtitleStyle;
        if (projectConfig.isSubtitlesEnabled !== false && subStyle?.enabled !== false && (scene.caption || scene.text)) {
          const captionText = (subStyle?.uppercase ? (scene.caption || scene.text).toUpperCase() : (scene.caption || scene.text)).trim();
          
          const baseFontSize = subStyle?.fontSize || 42;
          const scaledFontSize = Math.round(baseFontSize * (height / 720));
          const fontFamily = subStyle?.fontFamily || 'Space Grotesk';

          ctx.font = `bold ${scaledFontSize}px "${fontFamily}", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          let posY = height - 120;
          if (subStyle?.position === 'top') posY = 120;
          if (subStyle?.position === 'middle') posY = height / 2;

          const maxWidth = width - 120;
          const lineHeight = scaledFontSize * 1.3;

          drawWrappedText(
            ctx,
            captionText,
            width / 2,
            posY,
            maxWidth,
            lineHeight,
            subStyle?.backgroundColor || 'rgba(0,0,0,0.65)',
            subStyle?.color || '#FFFFFF'
          );
        }

        // --- WATERMARK OVERLAY ---
        if (projectConfig.watermarkEnabled) {
          ctx.save();
          ctx.globalAlpha = projectConfig.watermarkOpacity ?? 0.6;
          
          const wmSize = (projectConfig.watermarkSize ?? 16) * (height / 720);
          ctx.font = `bold ${wmSize}px sans-serif`;
          
          const padding = 30;
          let wmX = width - padding;
          let wmY = height - padding;

          if (projectConfig.watermarkPosition === 'top-left') {
            wmX = padding; wmY = padding + wmSize;
            ctx.textAlign = 'left';
          } else if (projectConfig.watermarkPosition === 'top-right') {
            wmX = width - padding; wmY = padding + wmSize;
            ctx.textAlign = 'right';
          } else if (projectConfig.watermarkPosition === 'bottom-left') {
            wmX = padding; wmY = height - padding;
            ctx.textAlign = 'left';
          } else if (projectConfig.watermarkPosition === 'center') {
            wmX = width / 2; wmY = height / 2;
            ctx.textAlign = 'center';
          } else {
            ctx.textAlign = 'right';
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(projectConfig.watermarkText || '© BRAND OVERLAY', wmX, wmY);
          ctx.restore();
        }

        // FINISH OR CONTINUE FRAME LOOP
        if (elapsedSeconds >= targetDuration) {
          mediaRecorder.onstop = () => {
            if (voiceBufferNode) { try { voiceBufferNode.stop(); } catch (_) {} }
            if (musicBufferNode) { try { musicBufferNode.stop(); } catch (_) {} }
            if (videoElement) { videoElement.pause(); }

            const finalMime = mimeType || 'video/webm';
            const finalBlob = new Blob(recordedChunks, { type: finalMime });
            const blobUrl = URL.createObjectURL(finalBlob);
            const fileSizeStr = formatFileSize(finalBlob.size);

            addLog(`✅ Scene ${sceneIndex + 1} export finished! (${fileSizeStr})`);

            resolve({
              sceneId: scene.id,
              sceneIndex,
              blobUrl,
              blob: finalBlob,
              mimeType: finalMime,
              extension,
              fileSize: fileSizeStr,
              duration: targetDuration,
              title: scene.caption || scene.text || `Scene ${sceneIndex + 1}`,
              createdAt: new Date().toLocaleTimeString()
            });
          };

          mediaRecorder.stop();
        } else {
          activeAnimationRef.current = requestAnimationFrame(renderFrame);
        }
      };

      activeAnimationRef.current = requestAnimationFrame(renderFrame);
    });
  };

  // Trigger Client-Side Export Sequence
  const startClientSideRender = async () => {
    isAbortedRef.current = false;
    setRenderStatus('rendering');
    setRenderProgress(0);
    setRenderLogs([]);
    setRenderError(null);

    const scenesToProcess = selectedSceneMode === 'single'
      ? scenes.filter(s => s.id === targetSingleSceneId)
      : scenes;

    if (scenesToProcess.length === 0) {
      setRenderStatus('failed');
      setRenderError('No scenes selected for export.');
      return;
    }

    // AudioContext MUST be initialized/resumed inside user click gesture
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    activeAudioContextRef.current = audioCtx;

    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    addLog(`🚀 Starting Client-Side Canvas+MediaRecorder rendering...`);
    addLog(`Processing ${scenesToProcess.length} scene(s) at ${exportQuality} resolution (${projectConfig.aspectRatio})`);

    try {
      for (let i = 0; i < scenesToProcess.length; i++) {
        if (isAbortedRef.current) break;
        const currentScene = scenesToProcess[i];
        setRenderingSceneIndex(i);

        const result = await renderSingleSceneClientSide(currentScene, i, audioCtx);
        setRenderedResults(prev => [...prev.filter(r => r.sceneId !== result.sceneId), result]);
      }

      if (!isAbortedRef.current) {
        setRenderStatus('completed');
        setRenderProgress(100);
        addLog(`🎉 All scene exports completed!`);

        const newQuota = Math.max(0, exportQuota - 1);
        setExportQuota(newQuota);
        localStorage.setItem('yotor_video_quota', newQuota.toString());

        if (onRenderComplete) onRenderComplete();
      }
    } catch (err: any) {
      console.error('Render error:', err);
      setRenderStatus('failed');
      setRenderError(err.message || 'Client-side rendering error occurred.');
      addLog(`CRITICAL ERROR: ${err.message || 'Rendering error'}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#0F0F0F]/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn" id="render-workbench">
      <div className="bento-card max-w-2xl w-full p-6 relative overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header bar */}
        <div className="text-center pb-4 mb-4 border-b border-[#303030]">
          <h1 className="text-base font-semibold text-[#F1F1F1] justify-center flex items-center gap-2">
            <FileVideo className="text-[#3EA6FF]" size={20} />
            {t.render_studio} (100% Client-Side Engine)
          </h1>
          <p className="text-xs text-[#AAAAAA] mt-1 font-sans">
            {renderStatus === 'idle' && (language === 'am' ? 'እያንዳንዱን ክፍል በብሮውዘርዎ ላይ በቀጥታ ያቀናብሩና ያውርዱ' : 'Export each scene individually directly in your browser without cloud servers')}
            {renderStatus === 'rendering' && (language === 'am' ? '⚡ በካንቫስ እና ሚዲያ ሪኮርደር በማቀናበር ላይ...' : '⚡ Recording visuals, audio mix & MediaRecorder frame-by-frame...')}
            {renderStatus === 'completed' && (language === 'am' ? 'ቪዲዮው በተሳካ ሁኔታ ተጠናቋል!' : 'Client-side scene export completed successfully!')}
            {renderStatus === 'failed' && (language === 'am' ? 'ማቀናበሩ ተቋርጧል ወይም አልተሳካም' : 'Export process stopped or failed')}
          </p>
        </div>

        {renderStatus === 'idle' && (
          <div className="space-y-4 py-2 overflow-y-auto max-h-[72vh] pr-1 scrollbar-thin">
            
            {/* Quota & Export Info Card */}
            <div className="p-4 rounded-xl bg-[#181818] border border-[#303030] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 bg-[#3EA6FF]/10 text-[10px] font-medium text-[#3EA6FF] rounded-md uppercase tracking-wide flex items-center gap-1">
                  <ShieldCheck size={12} /> Mobile-Optimized Canvas Engine
                </span>
                
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full font-semibold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Direct Download
                </span>
              </div>

              <div className="p-3 bg-[#212121] border border-[#303030] rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs text-[#AAAAAA]">
                  <span>{t.export_quota_title}:</span>
                  <span className={`font-semibold text-sm ${exportQuota > 0 ? 'text-[#3EA6FF]' : 'text-rose-400'}`}>
                    {exportQuota} / 3 {t.ready_to_export}
                  </span>
                </div>

                <div className="flex gap-2">
                  {[1, 2, 3].map((num) => (
                    <div 
                      key={num} 
                      className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                        exportQuota >= num ? 'bg-[#3EA6FF]' : 'bg-[#303030]'
                      }`} 
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between gap-4 mt-1 text-xs text-[#AAAAAA]">
                  <p>{t.quota_pills_desc}</p>
                  <button
                    type="button"
                    onClick={handleRefillQuota}
                    className="px-3 py-1.5 bg-[#303030] hover:bg-[#404040] text-[#F1F1F1] rounded-md text-xs font-semibold transition-all shrink-0"
                  >
                    🔄 {t.refill_quota}
                  </button>
                </div>
              </div>
            </div>

            {/* Render Target Selection */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase block">
                {language === 'am' ? 'የማቀናበሪያ ክፍሎች መምረጫ' : 'Export Scene Selection'}
              </span>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedSceneMode('all')}
                  className={`p-3 border rounded-xl flex flex-col text-left transition-all ${
                    selectedSceneMode === 'all' 
                      ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 font-bold' 
                      : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <span className="text-xs font-semibold">{language === 'am' ? 'ሁሉንም ክፍሎች አዘጋጅ' : 'Render All Scenes'}</span>
                  <span className="text-[9.5px] text-zinc-500 mt-1">
                    {scenes.length} {language === 'am' ? 'ክፍሎች በአንድ ጊዜ' : 'scenes sequentially'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedSceneMode('single')}
                  className={`p-3 border rounded-xl flex flex-col text-left transition-all ${
                    selectedSceneMode === 'single' 
                      ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 font-bold' 
                      : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <span className="text-xs font-semibold">{language === 'am' ? 'አንድ ክፍል ብቻ አዘጋጅ' : 'Render Individual Scene'}</span>
                  <span className="text-[9.5px] text-zinc-500 mt-1">
                    {language === 'am' ? 'የተወሰነ ክፍል መርጠው ያውርዱ' : 'Select scene to process'}
                  </span>
                </button>
              </div>

              {selectedSceneMode === 'single' && (
                <div className="pt-2 animate-fadeIn">
                  <label className="text-[11px] font-mono text-zinc-400 block mb-1">
                    {language === 'am' ? 'ክፍል ይምረጡ:' : 'Select Target Scene:'}
                  </label>
                  <select
                    value={targetSingleSceneId}
                    onChange={(e) => setTargetSingleSceneId(e.target.value)}
                    className="w-full bg-[#181818] border border-[#303030] text-[#F1F1F1] text-xs rounded-xl px-3 py-2.5 outline-none cursor-pointer focus:border-[#3EA6FF]"
                  >
                    {scenes.map((sc, idx) => (
                      <option key={sc.id} value={sc.id}>
                        Scene {idx + 1}: {(sc.caption || sc.text || 'Untitled Scene').substring(0, 45)}... ({sc.duration || 4}s)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Quality and Aspect Ratio Config */}
            <div className="p-4 bg-[#050505] rounded-2xl border border-zinc-900 space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-semibold text-zinc-500 uppercase block">
                {t.export_res} & Aspect Ratio ({projectConfig.aspectRatio})
              </span>

              <div className="grid grid-cols-3 gap-2.5">
                {(['720p', '1080p', '4k'] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setExportQuality(q)}
                    className={`p-2.5 border rounded-xl flex flex-col text-left transition-all ${
                      exportQuality === q 
                        ? 'bg-[#3EA6FF]/10 border-[#3EA6FF] text-[#3EA6FF] font-bold' 
                        : 'border-zinc-900 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <span className="text-xs uppercase">{q} HD</span>
                    <span className="text-[9px] text-zinc-500 mt-0.5">
                      {q === '4k' ? '3840x2160' : q === '1080p' ? '1920x1080' : '1280x720'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Previously Rendered Results List */}
            {renderedResults.length > 0 && (
              <div className="p-4 bg-[#08080c] rounded-2xl border border-emerald-500/20 space-y-3">
                <span className="text-[10px] font-mono tracking-widest font-bold text-emerald-400 uppercase block flex items-center gap-1.5">
                  <CheckCircle2 size={13} /> {language === 'am' ? 'የተጠናቀቁ ክፍሎች' : 'Exported Scenes'} ({renderedResults.length})
                </span>

                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {renderedResults.map((item) => (
                    <div key={item.sceneId} className="p-2.5 bg-[#121218] border border-zinc-800 rounded-xl flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <video src={item.blobUrl} className="w-14 h-10 rounded-md object-cover bg-black shrink-0" />
                        <div className="truncate space-y-0.5">
                          <span className="font-semibold text-zinc-200 block truncate">
                            Scene {item.sceneIndex + 1}: {item.title}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500">
                            {item.duration.toFixed(1)}s • {item.fileSize} • {item.extension.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <a
                        href={item.blobUrl}
                        download={`scene_${item.sceneIndex + 1}_${Date.now()}.${item.extension}`}
                        className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-lg transition-all shrink-0 flex items-center gap-1"
                      >
                        <Download size={13} />
                        <span>{language === 'am' ? 'አውርድ' : 'Download'}</span>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="py-3 bg-zinc-900 border border-zinc-800 rounded-xl font-semibold text-xs text-zinc-400 hover:text-white transition-colors uppercase font-mono text-center"
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
                  startClientSideRender();
                }}
                className={`py-3.5 text-white font-black text-xs sm:text-sm uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-all border ${
                  exportQuota > 0
                    ? 'bg-indigo-600 hover:bg-indigo-550 border-indigo-400/30 shadow-xl shadow-indigo-600/40 active:scale-95 cursor-pointer'
                    : 'bg-zinc-800 border-zinc-900 cursor-not-allowed opacity-40'
                }`}
              >
                <Zap size={16} className={exportQuota > 0 ? "animate-pulse" : ""} />
                {language === 'am' 
                  ? (selectedSceneMode === 'single' ? 'ክፍሉን ማቀናበር ጀምር' : 'ሁሉንም ማቀናበር ጀምር') 
                  : (selectedSceneMode === 'single' ? 'RENDER SELECTED SCENE' : 'RENDER ALL SCENES')}
              </button>
            </div>
          </div>
        )}

        {/* Live Rendering State */}
        {renderStatus === 'rendering' && (
          <div className="space-y-4 py-3 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              
              {/* Visible Live Render Canvas (Acts as both view target and MediaRecorder source) */}
              <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-black flex items-center justify-center min-h-[190px] max-h-[230px]">
                <canvas
                  ref={renderCanvasRef}
                  id="render-canvas-viewport"
                  className="w-full h-auto max-h-[220px] object-contain mx-auto rounded-lg shadow-2xl"
                />
                
                <div className="absolute top-2 left-2 px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-md text-[10px] font-mono text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  REC • {currentSceneTime.toFixed(1)}s / {totalSceneDuration.toFixed(1)}s
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs text-zinc-400 font-mono">
                  <span>Rendering Scene {renderingSceneIndex + 1} of {selectedSceneMode === 'single' ? 1 : scenes.length}</span>
                  <span className="text-[#3EA6FF] font-bold">{Math.round(renderProgress)}%</span>
                </div>

                <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                  <div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-[#3EA6FF] transition-all duration-150"
                    style={{ width: `${renderProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Rendering Terminal logs */}
            <div className="bg-[#050505] border border-zinc-900 rounded-xl p-3 max-h-[110px] overflow-y-auto font-mono text-[9px] text-[#8e909a] space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-500 mb-1 border-b border-zinc-900 pb-1 shrink-0">
                <Terminal size={10} />
                <span>Mobile Canvas Render Engine Logs</span>
              </div>
              {renderLogs.map((log, lIdx) => (
                <div key={lIdx} className="leading-normal">{log}</div>
              ))}
            </div>

            <button
              onClick={cancelCurrentRender}
              className="w-full py-2.5 bg-rose-950/20 hover:bg-rose-900/40 border border-rose-900/40 text-rose-400 text-xs font-semibold rounded-xl transition-colors shrink-0 font-mono uppercase tracking-widest"
            >
              Cancel Export
            </button>
          </div>
        )}

        {/* Failed State */}
        {renderStatus === 'failed' && (
          <div className="space-y-4 py-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-xl flex items-center gap-3">
                <AlertCircle size={28} className="text-red-400 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-red-400">Export Error</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{renderError || 'An error occurred during client-side rendering.'}</p>
                </div>
              </div>

              <div className="bg-[#050505] border border-zinc-900 rounded-xl p-3 max-h-[150px] overflow-y-auto font-mono text-[9px] text-zinc-500 space-y-1">
                {renderLogs.map((log, lIdx) => (
                  <div key={lIdx}>{log}</div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRenderStatus('idle')}
                className="flex-1 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-400 hover:text-white font-mono uppercase"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={startClientSideRender}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl font-mono uppercase tracking-wider"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Completed State */}
        {renderStatus === 'completed' && (
          <div className="space-y-4 py-2 overflow-y-auto max-h-[72vh] pr-1 scrollbar-thin">
            <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl flex items-center gap-3">
              <CheckCircle2 size={30} className="text-emerald-400 shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-emerald-400">
                  {language === 'am' ? '🎉 ተሳክቷል! ቪዲዮዎችዎ ዝግጁ ናቸው።' : '🎉 Scene Export Completed Successfully!'}
                </h3>
                <p className="text-xs text-[#AAAAAA]">
                  {language === 'am' ? 'ከታች እያንዳንዱን ክፍል ማየትና ወደ መሳሪያዎ ማውረድ ይችላሉ።' : 'All selected scenes have been processed and encoded directly in your browser.'}
                </p>
              </div>
            </div>

            {/* List of Rendered Scenes with Direct Download Buttons */}
            <div className="space-y-3">
              <span className="text-[10px] font-mono tracking-widest font-bold text-zinc-400 uppercase block">
                {language === 'am' ? 'የተዘጋጁ የቪዲዮ ክፍሎች (Ready Scenes)' : 'Rendered Scenes Output'}
              </span>

              {renderedResults.map((item) => (
                <div key={item.sceneId} className="p-3.5 bg-[#121218] border border-zinc-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-white font-mono">
                      Scene {item.sceneIndex + 1}: {item.title}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {item.duration.toFixed(1)}s • {item.fileSize}
                    </span>
                  </div>

                  <div className="relative rounded-xl overflow-hidden bg-black max-h-[180px]">
                    <video
                      src={item.blobUrl}
                      controls
                      playsInline
                      className="w-full h-auto max-h-[170px] object-contain mx-auto"
                    />
                  </div>

                  <a
                    href={item.blobUrl}
                    download={`scene_${item.sceneIndex + 1}_${Date.now()}.${item.extension}`}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 uppercase tracking-widest text-center"
                  >
                    <Download size={16} />
                    <span>
                      {language === 'am' ? `ክፍል ${item.sceneIndex + 1} አውርድ (Download Scene ${item.sceneIndex + 1})` : `Download Scene ${item.sceneIndex + 1}`}
                    </span>
                  </a>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setRenderStatus('idle')}
                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs text-white font-bold uppercase font-mono transition-colors"
              >
                {language === 'am' ? 'ወደ ስቱዲዮ ተመለስ' : 'Back to Studio Workbench'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
