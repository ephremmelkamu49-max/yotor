import React, { useEffect, useRef, useState } from "react";
import { Scene, AspectRatio, ProjectConfig, AnimationStyle } from "../types";
import { DEFAULT_MUSIC, DEFAULT_CATALOG, GOOGLE_TTS_LANGUAGES } from "../data";
import { Language, translations } from "../translations";
import { getTtsUrl } from "../App";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  Maximize,
  RefreshCw,
  Layers,
  Check,
  Sparkles,
  Eye,
  EyeOff,
  Cpu,
} from "lucide-react";

interface VideoCanvasProps {
  scenes: Scene[];
  setScenes?: React.Dispatch<React.SetStateAction<Scene[]>>;
  activeSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  projectConfig: ProjectConfig;
  onUpdateConfig: (updated: Partial<ProjectConfig>) => void;
  playbackIndex: number;
  setPlaybackIndex: React.Dispatch<React.SetStateAction<number>>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  isRendering?: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  renderTime?: number;
  language: Language;
  voiceoverPeaks?: { [sceneId: string]: { url: string; peak: number } };
  setVoiceoverPeaks?: React.Dispatch<React.SetStateAction<{ [sceneId: string]: { url: string; peak: number } }>>;
}

async function analyzeAudioPeak(url: string): Promise<number> {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return 1.0;
    const ctx = new AudioContext();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const buf = await res.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(buf);
    const channel = audioBuf.getChannelData(0);
    let max = 0;
    for (let i = 0; i < channel.length; i++) {
      const val = Math.abs(channel[i]);
      if (val > max) max = val;
    }
    await ctx.close();
    return max || 1.0;
  } catch (e) {
    console.error("[Peak Detection] Error analyzing audio peak:", e);
    return 1.0;
  }
}

export default function VideoCanvas({
  scenes,
  setScenes,
  activeSceneId,
  onSelectScene,
  projectConfig,
  onUpdateConfig,
  playbackIndex,
  setPlaybackIndex,
  isPlaying,
  setIsPlaying,
  isRendering,
  canvasRef,
  renderTime,
  language,
  voiceoverPeaks,
  setVoiceoverPeaks,
}: VideoCanvasProps) {
  const t = translations[language];
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  const thumbRefs = useRef<{ [key: string]: HTMLImageElement | null }>({});
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const audioSrcRefs = useRef<{ [key: string]: string }>({});
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const progressTimerRef = useRef<any>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const prevLogoUrlRef = useRef<string>("");

  const [currentSceneTime, setCurrentSceneTime] = useState<number>(0);
  const currentSceneTimeRef = useRef<number>(0);
  const playbackIndexRef = useRef<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [showConfigTabs, setShowConfigTabs] = useState<
    "ratio" | "subtitle" | "music" | "motion" | "filters" | "analyzer"
  >("ratio");
  const [loadedTtsPercentage, setLoadedTtsPercentage] = useState<number>(0);

  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisPrompt, setAnalysisPrompt] = useState<string>(
    "Identify and describe all visible objects, color palette, pacing, and overall mood in this scene.",
  );
  const [analysisError, setAnalysisError] = useState<string>("");
  const [isAnalyzingBeats, setIsAnalyzingBeats] = useState<boolean>(false);

  // AI Copilot States
  const [aiSubTab, setAiSubTab] = useState<"copilot" | "analyzer">("copilot");
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >(() => [
    {
      role: "assistant",
      text: t.copilot_greeting,
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const handleSendCopilotMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || chatInput;
    if (!promptToSend.trim() || isChatLoading) return;

    // Add user message
    const updatedHistory = [
      ...chatMessages,
      { role: "user" as const, text: promptToSend },
    ];
    setChatMessages(updatedHistory);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const historyPayload = updatedHistory.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        text: m.text,
      }));

      const safeScenes = scenes.map(s => ({
        id: s.id,
        text: s.text,
        keywords: s.keywords,
        duration: s.duration,
        caption: s.caption,
        videoUrl: s.videoUrl,
        videoThumb: s.videoThumb,
        voiceoverUrl: s.voiceoverUrl,
        animationStyle: s.animationStyle,
        transitionToNext: s.transitionToNext
      }));

      // In case projectConfig got mutated with DOM nodes
      const safeConfig = JSON.parse(JSON.stringify(projectConfig, (key, value) => {
        if (value instanceof Element || (value && typeof value === 'object' && value.current !== undefined)) return undefined;
        return value;
      }));

      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: promptToSend,
          scenes: safeScenes,
          projectConfig: safeConfig,
          chatHistory: historyPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to communicate with Yotor AI.");
      }

      // Add AI reply
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.message },
      ]);

      // Process Config edits
      if (data.updateConfig && Object.keys(data.updateConfig).length > 0) {
        onUpdateConfig(data.updateConfig);
      }

      // Process Scene operations
      if (data.updateScenes && setScenes) {
        const { action, scenesList } = data.updateScenes;
        if (action === "recreate" && Array.isArray(scenesList)) {
          const mapped = scenesList.map((sc, i) => {
            const fallbackVid = DEFAULT_CATALOG[i % DEFAULT_CATALOG.length];
            return {
              id: `scene_${i}_${Date.now()}`,
              text: sc.text,
              keywords: sc.keywords || "cinematic epic visual slow mo",
              duration: sc.duration || 5,
              caption: sc.text,
              videoUrl: fallbackVid.url,
              videoThumb: fallbackVid.thumbnail,
              videoAuthor: fallbackVid.author,
              videoAuthorUrl: "#",
              voiceoverUrl: null,
              originalIndex: i,
            };
          });
          setScenes(mapped);
          setPlaybackIndex(0);
        } else if (action === "add" && Array.isArray(scenesList)) {
          const startIdx = scenes.length;
          const mapped = scenesList.map((sc, i) => {
            const fallbackVid =
              DEFAULT_CATALOG[(startIdx + i) % DEFAULT_CATALOG.length];
            return {
              id: `scene_added_${i}_${Date.now()}`,
              text: sc.text,
              keywords: sc.keywords || "cinematic epic visual slow mo",
              duration: sc.duration || 5,
              caption: sc.text,
              videoUrl: fallbackVid.url,
              videoThumb: fallbackVid.thumbnail,
              videoAuthor: fallbackVid.author,
              videoAuthorUrl: "#",
              voiceoverUrl: null,
              originalIndex: startIdx + i,
            };
          });
          setScenes((prev) => [...prev, ...mapped]);
        }
      }
    } catch (err: any) {
      console.error(err);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            language === "am"
              ? `⚠️ ስህተት ተፈጥሯል፡ ${err.message}`
              : `⚠️ An error occurred: ${err.message}`,
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleAnalyzeVideo = async () => {
    if (!currentScene?.videoUrl) return;
    setIsAnalyzing(true);
    setAnalysisError("");
    setAnalysisResult("");
    try {
      const response = await fetch("/api/analyze-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: String(currentScene.videoUrl || ""),
          prompt: String(analysisPrompt || ""),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze video clip.");
      }
      setAnalysisResult(data.analysis);
    } catch (err: any) {
      console.error(err);
      setAnalysisError(
        err.message || "An error occurred during video analysis.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSnapToBeats = async () => {
    if (!projectConfig.musicTrack || !setScenes) return;
    setIsAnalyzingBeats(true);
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      const res = await fetch(projectConfig.musicTrack);
      const buf = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(buf);
      
      const channel = audioBuf.getChannelData(0);
      let max = 0;
      for (let i = 0; i < channel.length; i++) {
        if (Math.abs(channel[i]) > max) max = Math.abs(channel[i]);
      }
      
      const peaks: number[] = [];
      const threshold = max * 0.8;
      const sampleRate = audioBuf.sampleRate;
      
      for (let i = 0; i < channel.length; i++) {
        if (Math.abs(channel[i]) > threshold) {
          const time = i / sampleRate;
          if (peaks.length === 0 || time - peaks[peaks.length - 1] > 0.3) {
            peaks.push(time);
          }
        }
      }

      if (peaks.length > 0) {
        let currentCumulative = 0;
        const newScenes = scenes.map(scene => {
            const targetEnd = currentCumulative + scene.duration;
            // Find closest peak to targetEnd
            let closestPeak = peaks[0];
            let minDiff = Math.abs(targetEnd - peaks[0]);
            for(let p of peaks) {
                if(Math.abs(targetEnd - p) < minDiff) {
                    minDiff = Math.abs(targetEnd - p);
                    closestPeak = p;
                }
            }
            // Ensure the duration doesn't become too small
            let newDuration = closestPeak - currentCumulative;
            if (newDuration < 1.0) newDuration = scene.duration; // Fallback to original if peak is too close
            
            currentCumulative += newDuration;
            return { ...scene, duration: parseFloat(newDuration.toFixed(1)) };
        });
        setScenes(newScenes);
        alert(language === "am" ? "የክፍሎቹ ጊዜ ከሙዚቃው ምት ጋር ተስተካክሏል!" : "Scenes snapped to nearest beats successfully!");
      }
    } catch (err) {
      console.error("Beat sync failed:", err);
      alert(language === "am" ? "የምት ትንተና አልተሳካም።" : "Beat analysis failed.");
    }
    setIsAnalyzingBeats(false);
  };

  const renderTimePropRef = useRef<number | undefined>(renderTime);
  const isRenderingRef = useRef<boolean>(!!isRendering);
  useEffect(() => {
    renderTimePropRef.current = renderTime;
    isRenderingRef.current = !!isRendering;
  }, [renderTime, isRendering]);

  // Active scene accessor
  const currentScene = scenes[playbackIndex] || null;

  // Synchronize playing the active video during export / rendering
  useEffect(() => {
    if (renderTime !== undefined) {
      // 1. Play and precise sync current active scene video
      if (currentScene) {
        const video = videoRefs.current[currentScene.id];
        if (video && video instanceof HTMLVideoElement) {
          video.muted = isMuted || !projectConfig.isVideoSoundEnabled;
          video.volume = projectConfig.videoVolume ?? 0.5;
          if (video.paused) {
            video.play().catch(() => {});
          }
          // Precision Sync: keep video's currentTime in tight step with renderTime
          const diff = Math.abs(video.currentTime - renderTime);
          if (diff > 0.15) {
            video.currentTime = renderTime;
          }
        }
      }

      // 2. Play and sync previous video if we are in transition period
      const transitionDuration = projectConfig.transitionDuration || 0.5;
      if (playbackIndex > 0 && renderTime < transitionDuration) {
        const prevScene = scenes[playbackIndex - 1];
        const prevVideo = prevScene ? videoRefs.current[prevScene.id] : null;
        if (prevVideo && prevVideo instanceof HTMLVideoElement) {
          prevVideo.muted = isMuted || !projectConfig.isVideoSoundEnabled;
          prevVideo.volume = projectConfig.videoVolume ?? 0.5;
          if (prevVideo.paused) {
            prevVideo.play().catch(() => {});
          }
          // The previous video should be in its final segment
          const prevDuration = prevScene.duration || 4;
          const targetPrevTime = Math.max(
            0,
            prevDuration - (transitionDuration - renderTime),
          );
          const diff = Math.abs(prevVideo.currentTime - targetPrevTime);
          if (diff > 0.15) {
            prevVideo.currentTime = targetPrevTime;
          }
        }
      }
    }
  }, [
    renderTime,
    currentScene?.id,
    playbackIndex,
    projectConfig.transitionDuration,
    scenes,
    projectConfig.isVideoSoundEnabled,
    projectConfig.videoVolume,
  ]);
  
  // Helper to compute the volume of background music depending on active scene overrides and auto-ducking
  const getMusicVolumeForScene = (index: number) => {
    if (isMuted || !projectConfig.isMusicEnabled) {
      return 0;
    }
    const scene = scenes[index];
    if (!scene) {
      return projectConfig.musicVolume;
    }

    // 1. Explicit per-scene music volume override keyframe
    if (scene.musicVolume !== undefined && scene.musicVolume !== null) {
      return scene.musicVolume;
    }

    // 2. Auto-ducking when narration is present
    if (projectConfig.autoDuckNarration) {
      const hasNarration = projectConfig.isVoiceEnabled && (scene.voiceoverUrl || (scene.text && scene.text.trim().length > 0));
      if (hasNarration) {
        // Duck to a low volume level (e.g. 0.03, max 25% of global music volume)
        return Math.min(0.03, projectConfig.musicVolume * 0.25);
      }
    }

    return projectConfig.musicVolume;
  };

  // Initialize and keep background music sync
  useEffect(() => {
    if (!musicAudioRef.current) {
      musicAudioRef.current = new Audio();
    }
    const music = musicAudioRef.current;

    if (projectConfig.musicTrack && projectConfig.isMusicEnabled) {
      music.src = projectConfig.musicTrack;
      music.loop = true;
      music.volume = getMusicVolumeForScene(playbackIndex);
      if (isPlaying) {
        music.play().catch(() => {});
      } else {
        music.pause();
      }
    } else {
      music.pause();
      music.src = "";
    }

    return () => {
      music.pause();
    };
  }, [projectConfig.musicTrack, isPlaying]);

  // Sync background music volume
  useEffect(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.volume = getMusicVolumeForScene(playbackIndex);
    }
  }, [
    playbackIndex,
    scenes,
    projectConfig.musicVolume,
    projectConfig.autoDuckNarration,
    projectConfig.isVoiceEnabled,
    isMuted,
    projectConfig.isMusicEnabled
  ]);

  // Synchronize muted / volume of all scene videos according to projectConfig
  useEffect(() => {
    Object.values(videoRefs.current).forEach((vid) => {
      if (vid && vid instanceof HTMLVideoElement) {
        vid.muted = isMuted || !projectConfig.isVideoSoundEnabled;
        vid.volume = projectConfig.videoVolume ?? 0.5;
      }
    });
  }, [projectConfig.isVideoSoundEnabled, projectConfig.videoVolume, scenes, isMuted]);

  // Synchronize muted state for TTS voiceovers
  useEffect(() => {
    Object.values(audioRefs.current).forEach((aud) => {
      if (aud && aud instanceof HTMLAudioElement) {
        aud.muted = isMuted;
      }
    });
  }, [isMuted, scenes]);

  // Handle active scene changes (audio & timer)
  useEffect(() => {
    if (!currentScene) return;

    if (isPlaying && playbackIndex > 0 && playbackIndex > playbackIndexRef.current) {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext && !isMuted) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(400, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);
          
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.15);
        }
      } catch (err) {
        // fail silently if audio context is restricted
      }
    }

    stopAllTtsAudios();
    setCurrentSceneTime(0);
    currentSceneTimeRef.current = 0;

    playbackIndexRef.current = playbackIndex;

    if (isPlaying) {
      playActiveSceneTtsAndVideo();
    }
  }, [playbackIndex, currentScene?.id, isPlaying, isMuted]);

  // Handle overall Play/Pause toggles
  useEffect(() => {
    if (isPlaying) {
      // Start Video
      const video = currentScene ? videoRefs.current[currentScene.id] : null;
      if (video && video instanceof HTMLVideoElement) {
        video.play().catch(() => {});
      }
      playActiveSceneTtsAndVideo();
      startTimelineTimer();
    } else {
      // Pause Video
      (
        Object.values(videoRefs.current) as (
          | HTMLVideoElement
          | HTMLImageElement
          | null
        )[]
      ).forEach((vid) => {
        if (vid && vid instanceof HTMLVideoElement) vid.pause();
      });
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
      }
      stopAllTtsAudios();
      clearTimelineTimer();
    }

    return () => {
      clearTimelineTimer();
    };
  }, [isPlaying, isRendering, currentScene?.id]);

  const stopAllTtsAudios = () => {
    (Object.values(audioRefs.current) as HTMLAudioElement[]).forEach((aud) => {
      aud.pause();
      aud.currentTime = 0;
    });
  };

  const playActiveSceneTtsAndVideo = () => {
    if (!currentScene) return;

    // Pause all other videos, play current
    (
      Object.entries(videoRefs.current) as [
        string,
        HTMLVideoElement | HTMLImageElement | null,
      ][]
    ).forEach(([id, vid]) => {
      if (!vid) return;
      if (vid instanceof HTMLVideoElement) {
        if (id === currentScene.id) {
          vid.play().catch(() => {});
        } else {
          // Keep previous video playing slightly for transition
          const prevScene =
            playbackIndex > 0 ? scenes[playbackIndex - 1] : null;
          if (prevScene && id === prevScene.id) {
            setTimeout(() => {
              if (vid && vid instanceof HTMLVideoElement) vid.pause();
            }, 1000);
          } else {
            vid.pause();
          }
        }
      }
    });

    // Preload next scene video
    if (playbackIndex < scenes.length - 1) {
      const nextVid = videoRefs.current[scenes[playbackIndex + 1].id];
      // Preloading the next video silently handles the browser buffering delay
      if (
        nextVid &&
        nextVid instanceof HTMLVideoElement &&
        nextVid.readyState < 3
      ) {
        nextVid.load();
      }
    }

    // Play Narration Voiceover if enabled
    if (projectConfig.isVoiceEnabled) {
      const audio = audioRefs.current[currentScene.id];
      if (audio) {
        console.log(
          `[TTS] Attempting playback for scene ${currentScene.id}, src: ${audio.src}`,
        );
        audio.currentTime = currentSceneTimeRef.current;
        
        let targetVolume = 1.0;
        if (projectConfig.autoLevelVoiceover && voiceoverPeaks) {
          const peakData = voiceoverPeaks[currentScene.id];
          if (peakData && peakData.peak > 0) {
            targetVolume = Math.min(1.0, 0.85 / peakData.peak);
          }
        }
        audio.volume = isMuted ? 0 : targetVolume;

        // Pause before play to reset state, avoiding "interrupted by pause" errors
        audio.pause();

        // Small delay to ensure browser processed the pause
        setTimeout(() => {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise
              .then((_) => {
                console.log(
                  `[TTS] Playback started for scene ${currentScene.id}`,
                );
              })
              .catch((err) => {
                // Ignore play interruptions as they are expected during rapid scene scrubbing
              });
          }
        }, 50);
      } else {
        console.warn(
          `[TTS] Audio element not found for scene ${currentScene.id}`,
        );
      }
    }

    // Handle music play if active
    if (musicAudioRef.current && projectConfig.musicTrack) {
      musicAudioRef.current.volume = isMuted ? 0 : projectConfig.musicVolume;
      musicAudioRef.current.play().catch(() => {});
    }
  };

  // Timeline pacing ticking
  const startTimelineTimer = () => {
    clearTimelineTimer();

    const intervalTime = 100; // Tick every 100ms
    progressTimerRef.current = setInterval(() => {
      let targetDuration = currentScene?.duration || 4;
      const currentAudio =
        currentScene && projectConfig.isVoiceEnabled
          ? audioRefs.current[currentScene.id]
          : null;
      const currentVideo = currentScene ? videoRefs.current[currentScene.id] : null;

      // Active Buffering Detection: Holds timeline from running ahead on poor connections
      let isVideoBuffering = false;
      if (isPlaying && currentVideo && currentVideo instanceof HTMLVideoElement) {
        if (currentVideo.readyState < 2) {
          isVideoBuffering = true;
        }
      }

      let isAudioBuffering = false;
      if (isPlaying && currentAudio) {
        if (currentAudio.readyState < 2) {
          isAudioBuffering = true;
        }
      }

      const activeBuffering = isVideoBuffering || isAudioBuffering;
      setIsBuffering(activeBuffering);

      if (activeBuffering) {
        // Pause playback targets to allow buffering, skip tick
        if (currentVideo && currentVideo instanceof HTMLVideoElement && !currentVideo.paused) {
          try { currentVideo.pause(); } catch (_) {}
        }
        if (currentAudio && !currentAudio.paused) {
          try { currentAudio.pause(); } catch (_) {}
        }
        return;
      } else {
        // Resume playbacks if they were buffering
        if (isPlaying && currentVideo && currentVideo instanceof HTMLVideoElement && currentVideo.paused) {
          try { currentVideo.play().catch(() => {}); } catch (_) {}
        }
        if (isPlaying && currentAudio && currentAudio.paused) {
          try { currentAudio.play().catch(() => {}); } catch (_) {}
        }
      }

      let nextTime;
      let hasEnded = false;

      if (currentAudio) {
        if (!isNaN(currentAudio.duration) && currentAudio.duration > 0) {
          targetDuration = currentAudio.duration + 0.3;
          if (currentAudio.ended) {
            nextTime = currentSceneTimeRef.current + intervalTime / 1000;
            if (nextTime >= targetDuration) hasEnded = true;
          } else {
            nextTime = currentAudio.currentTime;
          }
        } else {
          // Audio still loading or metadata pending
          const currentVal = currentSceneTimeRef.current;
          nextTime = currentVal + intervalTime / 1000;
        }
      } else {
        const currentVal = currentSceneTimeRef.current;
        nextTime = currentVal + intervalTime / 1000;
      }

      // Auto Beat Sync Simulation Overrides
      if (projectConfig.syncToMusicBeats && projectConfig.musicTrack) {
        // Assume roughly 120bpm for syncing cuts (0.5 seconds per beat)
        const BEAT_INTERVAL = 0.5;
        targetDuration =
          Math.ceil(targetDuration / BEAT_INTERVAL) * BEAT_INTERVAL;
      }

      if (hasEnded || nextTime >= targetDuration) {
        // Go to next scene or loop
        if (playbackIndexRef.current < scenes.length - 1) {
          const nextIndex = playbackIndexRef.current + 1;
          playbackIndexRef.current = nextIndex;
          setPlaybackIndex(nextIndex);
          currentSceneTimeRef.current = 0;
          setCurrentSceneTime(0);
        } else {
          // Reached absolute script end
          setIsPlaying(false);
          playbackIndexRef.current = 0;
          setPlaybackIndex(0);
          currentSceneTimeRef.current = 0;
          setCurrentSceneTime(0);
        }
      } else {
        currentSceneTimeRef.current = nextTime;
        setCurrentSceneTime(nextTime);
      }
    }, intervalTime);
  };

  const clearTimelineTimer = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  // Canvas Frame Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Define standard composition dims
    let width = 1280;
    let height = 720; // 16:9 widescreen default

    if (projectConfig.aspectRatio === "9:16") {
      width = 720;
      height = 1280; // Shorts Vertical height
    } else if (projectConfig.aspectRatio === "1:1") {
      width = 800;
      height = 800; // Instagram Square
    }

    canvas.width = width;
    canvas.height = height;

    const render = (timeMs?: DOMHighResTimeStamp) => {
      // Clear Canvas
      ctx.fillStyle = "#090d16";
      ctx.fillRect(0, 0, width, height);

      // Smooth cTime interpolation
      const currentVideo = currentScene
        ? videoRefs.current[currentScene.id]
        : null;
      let smoothTime = currentSceneTimeRef.current;

      // Use the actual underlying video's current time for ultra-smooth sync if it's playing
      if (
        !isRenderingRef.current &&
        currentVideo &&
        currentVideo instanceof HTMLVideoElement &&
        !currentVideo.paused &&
        currentVideo.currentTime > 0
      ) {
        smoothTime = currentVideo.currentTime;
      } else if (renderTimePropRef.current !== undefined) {
        smoothTime = renderTimePropRef.current;
      }

      // Helper to draw a video frame onto the staging canvas with scaling/panning support
      const drawVideoFrame = (
        vid: HTMLVideoElement | HTMLImageElement,
        alpha: number,
        overrideAnimation?: AnimationStyle,
        scale: number = 1.0,
        offsetX: number = 0,
        offsetY: number = 0,
        clipRect?: { x: number; y: number; width: number; height: number },
        sceneId?: string,
      ) => {
        if (!vid) return;

        let vWidth = 0;
        let vHeight = 0;
        let isReady = false;

        if (vid instanceof HTMLVideoElement) {
          isReady = vid.readyState >= 2;
          vWidth = vid.videoWidth;
          vHeight = vid.videoHeight;
        } else {
          isReady =
            (vid as HTMLImageElement).complete &&
            (vid as HTMLImageElement).naturalWidth > 0;
          vWidth = (vid as HTMLImageElement).naturalWidth;
          vHeight = (vid as HTMLImageElement).naturalHeight;
        }

        // Slow Network / Buffering Fallback: If video is loading, draw static thumbnail with matching animations
        let resolvedSceneId = sceneId;
        if (!resolvedSceneId && vid) {
          const foundScene = scenes.find((s) => videoRefs.current[s.id] === vid);
          if (foundScene) {
            resolvedSceneId = foundScene.id;
          }
        }

        if (vid instanceof HTMLVideoElement && (!isReady || vWidth === 0 || vHeight === 0)) {
          const fallbackThumb = resolvedSceneId ? thumbRefs.current[resolvedSceneId] : null;
          if (fallbackThumb && fallbackThumb.complete && fallbackThumb.naturalWidth > 0) {
            drawVideoFrame(
              fallbackThumb,
              alpha,
              overrideAnimation,
              scale,
              offsetX,
              offsetY,
              clipRect,
              resolvedSceneId
            );
            return;
          }
        }

        if (!isReady || vWidth === 0 || vHeight === 0) return;

        ctx.save();
        if (clipRect) {
          ctx.beginPath();
          ctx.rect(clipRect.x, clipRect.y, clipRect.width, clipRect.height);
          ctx.clip();
        }

        ctx.globalAlpha = alpha;
        const vRatio = vWidth / vHeight;
        const cRatio = width / height;

        let sx = 0,
          sy = 0,
          sWidth = vWidth,
          sHeight = vHeight;

        if (vRatio > cRatio) {
          sWidth = vHeight * cRatio;
          sx = (vWidth - sWidth) / 2;
        } else {
          sHeight = vWidth / cRatio;
          sy = (vHeight - sHeight) / 2;
        }

        // Apply Image Animation Style (Movement)
        let animStyle =
          overrideAnimation || projectConfig.animationStyle || "zoom-in";

        // Respect global enable flag
        if (projectConfig.isAnimationEnabled === false) {
          animStyle = "static";
        }

        // Handle "dynamic" by picking a random-ish stable style based on the video's ID
        if (animStyle === "dynamic" && vid.src) {
          const charSum = vid.src
            .split("")
            .reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const dynamicStyles: AnimationStyle[] = [
            "zoom-in",
            "zoom-out",
            "pan-lr",
            "pan-rl",
            "tilt-up",
            "tilt-down",
          ];
          animStyle = dynamicStyles[charSum % dynamicStyles.length];
        }

        const sceneDuration = currentScene?.duration || 4;
        const animProgress = Math.min(1, smoothTime / sceneDuration);

        let dynamicScale = scale;
        let dynamicOffsetX = offsetX;
        let dynamicOffsetY = offsetY;

        // Cinematic Motion Library
        switch (animStyle) {
          case "zoom-in":
            dynamicScale *= 1 + 0.12 * animProgress;
            break;
          case "zoom-out":
            dynamicScale *= 1.15 - 0.15 * animProgress;
            break;
          case "pan-lr":
            dynamicOffsetX += width * 0.08 * (animProgress - 0.5);
            break;
          case "pan-rl":
            dynamicOffsetX -= width * 0.08 * (animProgress - 0.5);
            break;
          case "tilt-up":
            dynamicOffsetY += height * 0.05 * (animProgress - 0.5);
            dynamicScale *= 1.05;
            break;
          case "tilt-down":
            dynamicOffsetY -= height * 0.05 * (animProgress - 0.5);
            dynamicScale *= 1.05;
            break;
          case "diagonal-br":
            dynamicOffsetX += width * 0.04 * (animProgress - 0.5);
            dynamicOffsetY += height * 0.04 * (animProgress - 0.5);
            dynamicScale *= 1.1;
            break;
          case "diagonal-bl":
            dynamicOffsetX -= width * 0.04 * (animProgress - 0.5);
            dynamicOffsetY += height * 0.04 * (animProgress - 0.5);
            dynamicScale *= 1.1;
            break;
          default:
            // static
            break;
        }

        ctx.translate(width / 2, height / 2);
        ctx.scale(dynamicScale, dynamicScale);

        const baseFilter = ctx.filter === "none" ? "" : ctx.filter;
        let currentFilter = baseFilter;

        if (projectConfig.videoFilter) {
          switch (projectConfig.videoFilter) {
            case "sepia":
              currentFilter += " sepia(100%)";
              break;
            case "grayscale":
              currentFilter += " grayscale(100%)";
              break;
            case "contrast":
              currentFilter += " contrast(150%) brightness(95%)";
              break;
            case "vintage":
              currentFilter += " sepia(40%) contrast(120%) brightness(90%) saturate(80%)";
              break;
            case "teal":
              currentFilter += " contrast(115%) saturate(135%) sepia(15%) hue-rotate(-15deg)";
              break;
            case "high-contrast":
              currentFilter += " contrast(180%) brightness(95%) saturate(125%)";
              break;
          }
        }
        ctx.filter = currentFilter.trim() || "none";

        ctx.drawImage(
          vid,
          sx,
          sy,
          sWidth,
          sHeight,
          -width / 2 + dynamicOffsetX,
          -height / 2 + dynamicOffsetY,
          width,
          height,
        );
        
        // The context is restored via ctx.restore() right after this
        ctx.restore();

        ctx.globalAlpha = 1.0;
      };

      // 1. Draw Stock Video Frame with Cinematic Transitions

      const pIndex = playbackIndexRef.current;
      const prevSceneForTransition = pIndex > 0 ? scenes[pIndex - 1] : null;

      const sceneTransition = prevSceneForTransition?.transitionToNext || prevSceneForTransition?.transitionType;
      let tSource = sceneTransition && sceneTransition !== "none" 
        ? sceneTransition 
        : (projectConfig.transitionType || "crossfade");

      const transitionDuration = projectConfig.transitionDuration || 0.5;

      if (tSource === "random") {
        const tList = ["crossfade", "slide", "wipe", "flicker", "morph", "zoom", "spin", "blur", "glitch", "pixelate"];
        tSource = tList[(pIndex * 7 + 13) % tList.length] as any;
      }

      const isTransitioning =
        projectConfig.isTransitionsEnabled !== false &&
        pIndex > 0 &&
        smoothTime < transitionDuration &&
        tSource !== "none";

      if (isTransitioning) {
        const prevScene = scenes[pIndex - 1];
        const prevVideo = prevScene ? videoRefs.current[prevScene.id] : null;
        const progress = Math.max(
          0,
          Math.min(1, smoothTime / transitionDuration),
        ); // 0 to 1

        if (tSource === "crossfade") {
          if (prevVideo)
            drawVideoFrame(
              prevVideo,
              1.0 - progress,
              prevScene?.animationStyle,
            );
          if (currentVideo)
            drawVideoFrame(
              currentVideo,
              progress,
              currentScene?.animationStyle,
            );
        } else if (tSource === "slide") {
          // Previous video slides LEFT out of bounds
          if (prevVideo) {
            drawVideoFrame(
              prevVideo,
              1.0,
              prevScene?.animationStyle,
              1.0,
              -progress * width,
              0,
            );
          }
          // Current video slides LEFT in bounds
          if (currentVideo) {
            drawVideoFrame(
              currentVideo,
              1.0,
              currentScene?.animationStyle,
              1.0,
              (1.0 - progress) * width,
              0,
            );
          }
        } else if (tSource === "wipe") {
          // Base/Background layer is the previous video
          if (prevVideo) {
            drawVideoFrame(prevVideo, 1.0, prevScene?.animationStyle);
          }
          // Current video is wiped in (clipped left to right)
          if (currentVideo) {
            drawVideoFrame(
              currentVideo,
              1.0,
              currentScene?.animationStyle,
              1.0,
              0,
              0,
              { x: 0, y: 0, width: progress * width, height: height },
            );
          }
        } else if (tSource === "morph") {
          // Morph: Crossfade with an intense blur + scale jump
          const blurIntensity = Math.sin(progress * Math.PI) * 15;
          const scaleBoost = Math.sin(progress * Math.PI) * 0.2;

          ctx.filter = `blur(${blurIntensity}px) brightness(${100 + blurIntensity * 3}%)`;
          if (prevVideo)
            drawVideoFrame(
              prevVideo,
              1.0 - progress,
              prevScene?.animationStyle,
              1.0 + scaleBoost,
            );
          if (currentVideo)
            drawVideoFrame(
              currentVideo,
              progress,
              currentScene?.animationStyle,
              1.0 + scaleBoost,
            );
          ctx.filter = "none";
        } else if (tSource === "flicker") {
          // Flicker / Strobe transition
          const flickerRate = 0.1; // seconds
          const showPrev = Math.floor(smoothTime / flickerRate) % 2 === 0;

          if (showPrev && prevVideo) {
            drawVideoFrame(prevVideo, 1.0, prevScene?.animationStyle);
          } else if (!showPrev && currentVideo) {
            drawVideoFrame(currentVideo, 1.0, currentScene?.animationStyle);
          }

          // Add a brief white flash at the exact cut point
          if (progress < 0.2) {
            ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress * 5})`;
            ctx.fillRect(0, 0, width, height);
          }
        } else if (tSource === "zoom") {
          if (prevVideo)
            drawVideoFrame(
              prevVideo,
              1.0 - progress,
              prevScene?.animationStyle,
              1.0 + progress * 1.5,
            );
          if (currentVideo)
            drawVideoFrame(
              currentVideo,
              progress,
              currentScene?.animationStyle,
              0.5 + progress * 0.5,
            );
        } else if (tSource === "spin") {
          if (prevVideo) {
            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.rotate(progress * Math.PI);
            ctx.translate(-width / 2, -height / 2);
            drawVideoFrame(prevVideo, 1.0 - progress, prevScene?.animationStyle, 1.0 - progress * 0.5);
            ctx.restore();
          }
          if (currentVideo) {
            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.rotate((progress - 1) * Math.PI);
            ctx.translate(-width / 2, -height / 2);
            drawVideoFrame(currentVideo, progress, currentScene?.animationStyle, 0.5 + progress * 0.5);
            ctx.restore();
          }
        } else if (tSource === "blur") {
          const blurAmt = Math.sin(progress * Math.PI) * 20;
          ctx.filter = `blur(${blurAmt}px)`;
          if (prevVideo)
            drawVideoFrame(prevVideo, 1.0 - progress, prevScene?.animationStyle);
          if (currentVideo)
            drawVideoFrame(currentVideo, progress, currentScene?.animationStyle);
          ctx.filter = "none";
        } else if (tSource === "glitch") {
          if (prevVideo && progress < 0.5) {
            drawVideoFrame(prevVideo, 1.0, prevScene?.animationStyle);
            if (Math.random() > 0.5) {
              ctx.fillStyle = `rgba(0, 255, 0, 0.3)`;
              ctx.fillRect(0, Math.random() * height, width, Math.random() * 50);
              ctx.fillStyle = `rgba(255, 0, 255, 0.3)`;
              ctx.fillRect(0, Math.random() * height, width, Math.random() * 50);
            }
          }
          if (currentVideo && progress >= 0.5) {
            drawVideoFrame(currentVideo, 1.0, currentScene?.animationStyle);
            if (Math.random() > 0.5) {
              ctx.fillStyle = `rgba(0, 255, 255, 0.3)`;
              ctx.fillRect(Math.random() * width, 0, Math.random() * 50, height);
            }
          }
        } else if (tSource === "pixelate") {
          // Pixelate effect by scaling down and up without smoothing (simulated with standard draw)
          if (prevVideo) drawVideoFrame(prevVideo, 1.0 - progress, prevScene?.animationStyle);
          if (currentVideo) drawVideoFrame(currentVideo, progress, currentScene?.animationStyle);
          // Blocky overlay
          const blockSize = 10 + Math.sin(progress * Math.PI) * 50;
          if (blockSize > 11) {
            ctx.fillStyle = `rgba(0, 0, 0, ${Math.sin(progress * Math.PI) * 0.5})`;
            for (let y = 0; y < height; y += blockSize) {
              for (let x = 0; x < width; x += blockSize) {
                if ((x + y) % 2 === 0) ctx.fillRect(x, y, blockSize, blockSize);
              }
            }
          }
        } else {
          // Playback fallback
          if (currentVideo)
            drawVideoFrame(currentVideo, 1.0, currentScene?.animationStyle);
        }
      } else {
        if (currentVideo)
          drawVideoFrame(currentVideo, 1.0, currentScene?.animationStyle);
      }

      // 2. Cinematic shadow vignette backdrop filter
      const grad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.3,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.7,
      );
      grad.addColorStop(0, "rgba(0, 0, 0, 0)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // 2b. Cinematic Color Grading Harmonizer (unifies stock video colors)
      const visualStyle = projectConfig.visualStyle || "realistic";
      ctx.save();
      if (visualStyle === "realistic") {
        // Warm cinematic golden amber grading layer
        ctx.globalCompositeOperation = "color-burn";
        ctx.fillStyle = "rgba(251, 191, 36, 0.04)"; // very subtle warm amber
        ctx.fillRect(0, 0, width, height);

        ctx.globalCompositeOperation = "soft-light";
        ctx.fillStyle = "rgba(13, 148, 136, 0.05)"; // subtle teal-orange tint shadow
        ctx.fillRect(0, 0, width, height);
      } else if (visualStyle === "cyberpunk") {
        // Neon cyberpunk purple-blue electric grading filter
        ctx.globalCompositeOperation = "color";
        ctx.fillStyle = "rgba(168, 85, 247, 0.06)"; // purple bloom tint
        ctx.fillRect(0, 0, width, height);

        ctx.globalCompositeOperation = "soft-light";
        ctx.fillStyle = "rgba(6, 182, 212, 0.10)"; // cyan electric shadows
        ctx.fillRect(0, 0, width, height);
      } else if (visualStyle === "3d-animation") {
        // Bright Pixar vibrance grading filter
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = "rgba(250, 150, 10, 0.04)";
        ctx.fillRect(0, 0, width, height);
      } else if (visualStyle === "watercolor") {
        // Soft vintage wash
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = "rgba(254, 243, 199, 0.08)"; // soft warm cream vintage wash
        ctx.fillRect(0, 0, width, height);
      } else if (visualStyle === "anime") {
        // Vibrant dreamy pastel filter
        ctx.globalCompositeOperation = "soft-light";
        ctx.fillStyle = "rgba(244, 63, 94, 0.06)"; // pastel rose sky bloom
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();

      // 3. Draw Captions/Subtitles
      if (currentScene && projectConfig.subtitleStyle.enabled) {
        const fullText = projectConfig.subtitleStyle.uppercase
          ? currentScene.caption.toUpperCase()
          : currentScene.caption;

        const animType = projectConfig.subtitleStyle.animation || "none";
        const progress =
          currentScene.duration > 0 ? smoothTime / currentScene.duration : 1;

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Dynamic scaled font sizing relative to resolution
        const baseFontSize = projectConfig.subtitleStyle.fontSize;
        const scaleFactor = width / 1280;
        const finalFontSize = Math.max(
          16,
          Math.floor(baseFontSize * scaleFactor),
        );

        ctx.font = `600 ${finalFontSize}px "${projectConfig.subtitleStyle.fontFamily}", system-ui, sans-serif`;

        const allWords = fullText.split(" ");
        const lines: string[] = [];
        let currentLine = "";
        const maxLineWidth = width * 0.85;

        // Wrap words to fit canvas width neatly
        for (let n = 0; n < allWords.length; n++) {
          const testLine = currentLine + allWords[n] + " ";
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxLineWidth && n > 0) {
            lines.push(currentLine.trim());
            currentLine = allWords[n] + " ";
          } else {
            currentLine = testLine;
          }
        }
        lines.push(currentLine.trim());

        // Subtitle layout adjustments
        const lineHeight = finalFontSize * 1.35;
        const totalTextHeight = lines.length * lineHeight;

        let py = height * 0.82; // standard bottom
        if (projectConfig.subtitleStyle.position === "middle") {
          py = height / 2;
        } else if (projectConfig.subtitleStyle.position === "top") {
          py = height * 0.18;
        }

        const startY = py - totalTextHeight / 2 + lineHeight / 2;

        // Animation calculations
        const visibleCharsTotal =
          animType === "typewriter"
            ? Math.floor(fullText.length * Math.min(1, progress * 1.3))
            : fullText.length;

        const activeWordIndexTotal =
          animType === "karaoke"
            ? Math.floor(allWords.length * Math.min(0.99, progress))
            : -1;

        let charCounter = 0;
        let wordGlobalCounter = 0;

        // Draw backdrop and text
        lines.forEach((line, index) => {
          const ly = startY + index * lineHeight;
          const textWidth = ctx.measureText(line).width;

          // Translucent padding capsule background box
          if (projectConfig.subtitleStyle.backgroundColor) {
            ctx.fillStyle = projectConfig.subtitleStyle.backgroundColor;
            const px = 18 * scaleFactor;
            const pyBox = 8 * scaleFactor;
            ctx.beginPath();
            ctx.roundRect(
              width / 2 - textWidth / 2 - px,
              ly - lineHeight / 2 - pyBox + finalFontSize * 0.08,
              textWidth + px * 2,
              lineHeight + pyBox * 2 - finalFontSize * 0.16,
              10 * scaleFactor,
            );
            ctx.fill();
          }

          // Subtle text shadow effect
          ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
          ctx.shadowBlur = 8 * scaleFactor;
          ctx.shadowOffsetX = 2 * scaleFactor;
          ctx.shadowOffsetY = 2 * scaleFactor;

          if (animType === "karaoke") {
            // Draw word by word for karaoke highlight
            const lineWords = line.split(" ");
            let currentX = width / 2 - textWidth / 2;

            lineWords.forEach((word) => {
              const isHighlighted = wordGlobalCounter === activeWordIndexTotal;
              ctx.fillStyle = isHighlighted
                ? projectConfig.subtitleStyle.highlightColor
                : projectConfig.subtitleStyle.color;

              // Scale highlight for emphasize effect
              if (isHighlighted) {
                ctx.font = `800 ${finalFontSize * 1.05}px "${projectConfig.subtitleStyle.fontFamily}", system-ui, sans-serif`;
              } else {
                ctx.font = `600 ${finalFontSize}px "${projectConfig.subtitleStyle.fontFamily}", system-ui, sans-serif`;
              }

              ctx.textAlign = "left";
              ctx.fillText(word, currentX, ly);
              currentX += ctx.measureText(word + " ").width;
              wordGlobalCounter++;
            });
          } else if (animType === "typewriter") {
            // Typewriter slice
            const lineVisibleChars = Math.max(
              0,
              visibleCharsTotal - charCounter,
            );
            const lineToDraw = line.slice(0, lineVisibleChars);
            ctx.textAlign = "center";
            ctx.fillStyle = projectConfig.subtitleStyle.color;
            ctx.fillText(lineToDraw, width / 2, ly);
            charCounter += line.length + 1;
          } else if (animType === "bounce") {
            // Soft bounce/scale in
            const scale = 1 + Math.sin(progress * Math.PI) * 0.05;
            ctx.save();
            ctx.translate(width / 2, ly);
            ctx.scale(scale, scale);
            ctx.textAlign = "center";
            ctx.fillStyle = projectConfig.subtitleStyle.color;
            ctx.fillText(line, 0, 0);
            ctx.restore();
          } else if (animType === "slide-up") {
            const slideProgress = Math.min(1, progress * 4); // Quick slide up
            const yOffset = (1 - slideProgress) * 20;
            ctx.save();
            ctx.globalAlpha = slideProgress;
            ctx.textAlign = "center";
            ctx.fillStyle = projectConfig.subtitleStyle.color;
            ctx.fillText(line, width / 2, ly + yOffset);
            ctx.restore();
          } else {
            // Normal static render
            ctx.textAlign = "center";
            ctx.fillStyle = projectConfig.subtitleStyle.color;
            ctx.fillText(line, width / 2, ly);
          }

          // Reset shadows
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        });
      }

      // 3.5. Draw Watermark / Branding Overlay
      if (projectConfig.watermarkEnabled) {
        ctx.save();
        ctx.globalAlpha = projectConfig.watermarkOpacity !== undefined ? projectConfig.watermarkOpacity : 0.6;

        const padding = 24 * (width / 1280); // scaled padding
        const size = projectConfig.watermarkSize !== undefined ? projectConfig.watermarkSize : 14;
        const scaleFactor = width / 1280;
        const finalSize = Math.max(10, Math.floor(size * scaleFactor));
        const position = projectConfig.watermarkPosition || "bottom-right";

        let wx = padding;
        let wy = padding;

        if (projectConfig.watermarkType === "logo" && projectConfig.watermarkLogoUrl) {
          if (prevLogoUrlRef.current !== projectConfig.watermarkLogoUrl) {
            prevLogoUrlRef.current = projectConfig.watermarkLogoUrl;
            const img = new Image();
            img.src = projectConfig.watermarkLogoUrl;
            img.onload = () => {
              logoImageRef.current = img;
            };
          }

          const img = logoImageRef.current;
          if (img && img.complete && img.naturalWidth > 0) {
            const imgAspectRatio = img.naturalWidth / img.naturalHeight;
            const logoHeight = finalSize * 2.5;
            const logoWidth = logoHeight * imgAspectRatio;

            if (position === "top-left") {
              wx = padding;
              wy = padding;
            } else if (position === "top-right") {
              wx = width - logoWidth - padding;
              wy = padding;
            } else if (position === "bottom-left") {
              wx = padding;
              wy = height - logoHeight - padding;
            } else if (position === "bottom-right") {
              wx = width - logoWidth - padding;
              wy = height - logoHeight - padding;
            } else if (position === "center") {
              wx = (width - logoWidth) / 2;
              wy = (height - logoHeight) / 2;
            }

            ctx.drawImage(img, wx, wy, logoWidth, logoHeight);
          }
        } else if (projectConfig.watermarkType === "text" && projectConfig.watermarkText) {
          ctx.font = `bold ${finalSize}px "${projectConfig.subtitleStyle.fontFamily || "Space Grotesk"}", system-ui, sans-serif`;
          ctx.textBaseline = "middle";

          const textWidth = ctx.measureText(projectConfig.watermarkText).width;
          const textHeight = finalSize;

          if (position === "top-left") {
            wx = padding;
            wy = padding + textHeight / 2;
            ctx.textAlign = "left";
          } else if (position === "top-right") {
            wx = width - padding;
            wy = padding + textHeight / 2;
            ctx.textAlign = "right";
          } else if (position === "bottom-left") {
            wx = padding;
            wy = height - padding - textHeight / 2;
            ctx.textAlign = "left";
          } else if (position === "bottom-right") {
            wx = width - padding;
            wy = height - padding - textHeight / 2;
            ctx.textAlign = "right";
          } else if (position === "center") {
            wx = width / 2;
            wy = height / 2;
            ctx.textAlign = "center";
          }

          // Legibility shadow
          ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
          ctx.shadowBlur = 4 * scaleFactor;
          ctx.shadowOffsetX = 1 * scaleFactor;
          ctx.shadowOffsetY = 1 * scaleFactor;

          ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
          ctx.fillText(projectConfig.watermarkText, wx, wy);
        }

        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [projectConfig, currentScene]);

  const handleNext = () => {
    if (playbackIndex < scenes.length - 1) {
      setPlaybackIndex((p) => {
        playbackIndexRef.current = p + 1;
        return p + 1;
      });
    } else {
      setPlaybackIndex(0);
      playbackIndexRef.current = 0;
    }
    setCurrentSceneTime(0);
    currentSceneTimeRef.current = 0;
  };

  const handlePrev = () => {
    if (playbackIndex > 0) {
      setPlaybackIndex((p) => {
        playbackIndexRef.current = p - 1;
        return p - 1;
      });
    } else {
      setPlaybackIndex(scenes.length - 1);
      playbackIndexRef.current = scenes.length - 1;
    }
    setCurrentSceneTime(0);
    currentSceneTimeRef.current = 0;
  };

  // Ratio dynamic aspect bounds utility
  const getAspectClass = (ratio: AspectRatio) => {
    if (ratio === "9:16") return "aspect-[9/16] max-h-[500px] w-auto mx-auto";
    if (ratio === "1:1") return "aspect-square max-h-[450px] w-auto mx-auto";
    return "aspect-video w-full";
  };

  return (
    <div
      className="bg-[#0c0c0e]/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 flex flex-col h-full justify-between"
      id="visual-studio"
    >
      {/* Aspect Ratio and Configurations Head */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-indigo-400 font-bold bg-indigo-500/5 px-2.5 py-1 rounded-md border border-indigo-500/15">
              <Sparkles size={11} className="fill-current" />
              {language === "am"
                ? "የቀጥታ ቅንብር (Live Compositor)"
                : "Live Compositor"}
            </span>
          </div>

          {/* Dynamic tabs */}
          <div className="flex items-center overflow-x-auto whitespace-nowrap flex-nowrap scrollbar-none max-w-full bg-slate-900/80 p-1 border border-slate-800 rounded-xl text-xs gap-1">
            <button
              onClick={() => setShowConfigTabs("ratio")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${showConfigTabs === "ratio" ? "bg-cyan-600 text-white font-bold shadow" : "text-slate-500 hover:text-slate-300"}`}
            >
              {t.tab_size}
            </button>
            <button
              onClick={() => setShowConfigTabs("subtitle")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${showConfigTabs === "subtitle" ? "bg-indigo-650 text-white font-bold" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {t.tab_subtitles}
            </button>
            <button
              onClick={() => setShowConfigTabs("music")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${showConfigTabs === "music" ? "bg-indigo-650 text-white font-bold" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {t.tab_music}
            </button>
            <button
              onClick={() => setShowConfigTabs("motion")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${showConfigTabs === "motion" ? "bg-indigo-650 text-white font-bold" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {t.tab_motion}
            </button>
            <button
              onClick={() => setShowConfigTabs("filters")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${showConfigTabs === "filters" ? "bg-indigo-650 text-white font-bold" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Filters
            </button>
            <button
              onClick={() => setShowConfigTabs("analyzer")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 flex items-center gap-1 ${showConfigTabs === "analyzer" ? "bg-indigo-650 text-white font-bold" : "text-indigo-400 hover:text-indigo-300"}`}
              title="Analyze active video scene with Gemini 3.1 Pro"
            >
              <Cpu
                size={12}
                className={
                  showConfigTabs === "analyzer"
                    ? "text-white"
                    : "text-indigo-400"
                }
              />
              <span>{t.tab_analyzer}</span>
            </button>
          </div>
        </div>

        {/* Configurations Dynamic Sub Panels */}
        <div className="p-4 bg-[#050505] border border-zinc-900 rounded-xl text-xs min-h-[70px] flex items-center">
          {showConfigTabs === "ratio" && (
            <div className="w-full grid grid-cols-3 gap-3">
              {(["16:9", "9:16", "1:1"] as AspectRatio[]).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => onUpdateConfig({ aspectRatio: ratio })}
                  className={`py-2 px-3 border rounded-xl flex flex-col items-center gap-1 transition-all ${
                    projectConfig.aspectRatio === ratio
                      ? "bg-indigo-500/5 border-indigo-500 text-indigo-400 font-bold"
                      : "border-zinc-900 hover:border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-xs font-semibold">
                    {ratio === "16:9"
                      ? language === "am"
                        ? "ባለሰፊ ስክሪን (Landscape)"
                        : "Landscape"
                      : ratio === "9:16"
                        ? language === "am"
                          ? "የሞባይል ቪዲዮ (Vertical)"
                          : "Vertical Shorts"
                        : language === "am"
                          ? "አራት ማዕዘን (Square)"
                          : "Square"}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {ratio}
                  </span>
                </button>
              ))}
            </div>
          )}

          {showConfigTabs === "subtitle" && (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between mb-1 pb-1 border-b border-zinc-900/50">
                <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest">
                  {t.subtitle_style_title}
                </span>
                <button
                  onClick={() =>
                    onUpdateConfig({
                      subtitleStyle: {
                        ...projectConfig.subtitleStyle,
                        enabled: !projectConfig.subtitleStyle.enabled,
                      },
                    })
                  }
                  className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold transition-all border ${
                    projectConfig.subtitleStyle.enabled
                      ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-400"
                      : "bg-zinc-900 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {projectConfig.subtitleStyle.enabled ? (
                    <>
                      <Eye size={10} /> CAPTIONS ON
                    </>
                  ) : (
                    <>
                      <EyeOff size={10} /> CAPTIONS OFF
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">
                    {t.subtitle_animation}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        "none",
                        "typewriter",
                        "karaoke",
                        "bounce",
                        "slide-up",
                      ] as const
                    ).map((anim) => (
                      <button
                        key={anim}
                        onClick={() =>
                          onUpdateConfig({
                            subtitleStyle: {
                              ...projectConfig.subtitleStyle,
                              animation: anim,
                            },
                          })
                        }
                        className={`py-1.5 px-2 border rounded-lg text-[9px] font-bold transition-all ${
                          projectConfig.subtitleStyle.animation === anim
                            ? "bg-zinc-900 border-indigo-500 text-indigo-400"
                            : "bg-black border-zinc-900 text-zinc-600 hover:text-zinc-400"
                        }`}
                      >
                        {anim === "none"
                          ? t.anim_none
                          : anim === "typewriter"
                            ? t.anim_typewriter
                            : anim === "karaoke"
                              ? t.anim_karaoke
                              : anim === "bounce"
                                ? t.anim_bounce
                                : t.anim_slide_up}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">
                    {t.text_position}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["top", "middle", "bottom"] as const).map((pos) => (
                      <button
                        key={pos}
                        onClick={() =>
                          onUpdateConfig({
                            subtitleStyle: {
                              ...projectConfig.subtitleStyle,
                              position: pos,
                            },
                          })
                        }
                        className={`py-1.5 border rounded-lg text-[9px] font-bold uppercase transition-all ${
                          projectConfig.subtitleStyle.position === pos
                            ? "bg-zinc-900 border-indigo-500 text-indigo-400"
                            : "bg-black border-zinc-900 text-zinc-600 hover:text-zinc-400"
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-zinc-900/40">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-zinc-500 font-mono uppercase text-[8px] tracking-wider">
                      {t.text_color}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[
                        "#FFFFFF",
                        "#FACC15",
                        "#4ADE80",
                        "#F87171",
                        "#60A5FA",
                      ].map((c) => (
                        <button
                          key={c}
                          onClick={() =>
                            onUpdateConfig({
                              subtitleStyle: {
                                ...projectConfig.subtitleStyle,
                                color: c,
                              },
                            })
                          }
                          className={`w-4 h-4 rounded-full border border-black transition-transform hover:scale-110 ${(projectConfig.subtitleStyle.color || '').toUpperCase() === c.toUpperCase() ? "ring-2 ring-indigo-500 ring-offset-1 ring-offset-black" : ""}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 pl-3 border-l border-zinc-900">
                    <span className="text-zinc-500 font-mono uppercase text-[8px] tracking-wider">
                      {t.highlight_color}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[
                        "#FBBF24",
                        "#22D3EE",
                        "#A855F7",
                        "#FAFAFA",
                        "#10B981",
                      ].map((c) => (
                        <button
                          key={c}
                          onClick={() =>
                            onUpdateConfig({
                              subtitleStyle: {
                                ...projectConfig.subtitleStyle,
                                highlightColor: c,
                              },
                            })
                          }
                          className={`w-4 h-4 rounded-full border border-black transition-transform hover:scale-110 ${(projectConfig.subtitleStyle.highlightColor || '').toUpperCase() === c.toUpperCase() ? "ring-2 ring-indigo-500 ring-offset-1 ring-offset-black" : ""}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-zinc-500 font-mono uppercase text-[8px] tracking-wider">
                      Font
                    </span>
                    <select
                      value={projectConfig.subtitleStyle.fontFamily}
                      onChange={(e) =>
                        onUpdateConfig({
                          subtitleStyle: {
                            ...projectConfig.subtitleStyle,
                            fontFamily: e.target.value as any,
                          },
                        })
                      }
                      className="bg-zinc-950 border border-zinc-850 rounded px-2 py-0.5 text-[10px] text-zinc-300"
                    >
                      <option value="Space Grotesk">Space Grotesk</option>
                      <option value="Inter">Inter</option>
                      <option value="JetBrains Mono">JetBrains Mono</option>
                      <option value="Playfair Display">Playfair Display</option>
                      <option value="Anton">Anton (Shorts)</option>
                      <option value="Archivo Black">Archivo Black</option>
                      <option value="Outfit">Outfit</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateConfig({
                        aspectRatio: "9:16",
                        subtitleStyle: {
                          ...projectConfig.subtitleStyle,
                          fontFamily: "Anton",
                          uppercase: true,
                          fontSize: 45,
                          position: "middle",
                          animation: "karaoke",
                          highlightColor: "#FBBF24",
                        },
                      })
                    }
                    className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[8px] font-black uppercase tracking-widest rounded-lg hover:bg-amber-500/20 transition-all shadow-sm"
                  >
                    🔥 SHORTS AUTO-TUNE
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-zinc-900/60 mt-2">
                <div className="flex flex-col">
                  <span className="text-zinc-300 font-bold text-[11px] uppercase tracking-wider">
                    {language === 'am' ? 'የጊዜ አሰላለፍ (Auto-Align Subtitles)' : 'Auto-Align Subtitles'}
                  </span>
                  <span className="text-zinc-500 text-[9px]">
                    {language === 'am' ? 'የንዑስ ርዕስ ቆይታን ከድምፅ ጋር በትክክል ማዛመድ' : 'Adjust subtitle display duration based on actual voiceover length'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateConfig({
                      autoAlignVoiceover: !projectConfig.autoAlignVoiceover,
                    })
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-[10px] font-bold transition-all shadow-sm ${
                    projectConfig.autoAlignVoiceover
                      ? "bg-indigo-500/10 border-indigo-500/40 text-indigo-400"
                      : "bg-zinc-900 border-zinc-800 text-zinc-500"
                  }`}
                >
                  {projectConfig.autoAlignVoiceover ? "✓ ENABLED" : "✗ DISABLED"}
                </button>
              </div>
            </div>
          )}

          {showConfigTabs === "music" && (
            <div className="w-full space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DEFAULT_MUSIC.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => onUpdateConfig({ musicTrack: track.url })}
                    className={`p-1.5 border rounded-lg text-left truncate flex flex-col justify-center relative ${
                      projectConfig.musicTrack === track.url
                        ? "bg-indigo-500/5 border-indigo-500 text-indigo-400 font-bold"
                        : "border-[#0c0c0e] text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                      <span className="font-semibold block truncate leading-tight flex-1">
                        {language === "am" && track.am
                          ? track.am
                          : track.title.split(" (")[0]}
                      </span>
                      {track.category && (
                        <span
                          className={`text-[7px] px-1 rounded font-bold shrink-0 ${track.category === "Short" ? "bg-amber-500/20 text-amber-500" : "bg-blue-500/20 text-blue-400"}`}
                        >
                          {track.category}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-zinc-650 block truncate">
                      {track.vibe}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 flex-1 max-w-[200px]">
                  <Volume2 size={13} className="text-zinc-500" />
                  <input
                    type="range"
                    min="0"
                    max="0.5" // limit ambient max so narration is pristine
                    step="0.01"
                    value={projectConfig.musicVolume}
                    onChange={(e) =>
                      onUpdateConfig({
                        musicVolume: parseFloat(e.target.value),
                      })
                    }
                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                    {Math.round(projectConfig.musicVolume * 200)}%
                  </span>
                </div>
                {/* Custom Audio Upload */}
                <div className="flex items-center gap-2 pr-2 border-l border-zinc-900 pl-4 ml-2">
                  <label className="text-[10px] text-zinc-400 font-mono tracking-widest uppercase cursor-pointer hover:text-indigo-400 transition-colors">
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                           const url = URL.createObjectURL(file);
                           onUpdateConfig({ musicTrack: url });
                        }
                      }}
                    />
                    Upload BGM
                  </label>
                </div>
                
                {/* Auto Beat Sync Button */}
                <div className="flex items-center gap-2 pr-2 border-l border-zinc-900 pl-4 ml-2">
                  <button
                    onClick={handleSnapToBeats}
                    disabled={isAnalyzingBeats || !projectConfig.musicTrack}
                    className="text-[10px] bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-bold font-mono tracking-widest uppercase px-2 py-1 rounded hover:bg-indigo-600/40 disabled:opacity-50 transition-colors"
                  >
                    {isAnalyzingBeats ? "Analyzing..." : "Snap to Beats"}
                  </button>
                </div>

                {/* Global Music Toggle */}
                <div className="flex items-center gap-2 pr-2 border-l border-zinc-900 pl-4 ml-2">
                  <span className="text-[10px] text-zinc-400 font-mono tracking-widest uppercase">
                    ENABLE BGM
                  </span>
                  <button
                    onClick={() =>
                      onUpdateConfig({
                        isMusicEnabled: !projectConfig.isMusicEnabled,
                      })
                    }
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none ${
                      projectConfig.isMusicEnabled
                        ? "bg-indigo-500"
                        : "bg-zinc-800"
                    }`}
                    role="switch"
                    aria-checked={projectConfig.isMusicEnabled}
                  >
                    <span className="sr-only">Use setting</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none absolute left-0 inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
                        projectConfig.isMusicEnabled
                          ? "translate-x-3.5"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Original Video Audio Controls */}
              <div className="pt-2.5 border-t border-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider">
                    🔊 {t.video_sound_title}
                  </span>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 flex-1">
                  {/* Volume Slider */}
                  <div className="flex items-center gap-1.5 flex-1 max-w-[200px]">
                    <Volume2 size={13} className="text-zinc-500" />
                    <input
                      type="range"
                      min="0"
                      max="1.0"
                      step="0.05"
                      disabled={!projectConfig.isVideoSoundEnabled}
                      value={projectConfig.videoVolume !== undefined ? projectConfig.videoVolume : 0.5}
                      onChange={(e) =>
                        onUpdateConfig({
                          videoVolume: parseFloat(e.target.value),
                        })
                      }
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-40"
                    />
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                      {Math.round((projectConfig.videoVolume !== undefined ? projectConfig.videoVolume : 0.5) * 100)}%
                    </span>
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex items-center gap-2 pl-4 border-l border-zinc-900 shrink-0">
                    <span className="text-[10px] text-zinc-400 font-mono tracking-widest uppercase">
                      PLAY AUDIO
                    </span>
                    <button
                      onClick={() =>
                        onUpdateConfig({
                          isVideoSoundEnabled: !projectConfig.isVideoSoundEnabled,
                        })
                      }
                      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none ${
                        projectConfig.isVideoSoundEnabled
                          ? "bg-indigo-500"
                          : "bg-zinc-800"
                      }`}
                      role="switch"
                      aria-checked={projectConfig.isVideoSoundEnabled}
                    >
                      <span className="sr-only">Use setting</span>
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute left-0 inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
                          projectConfig.isVideoSoundEnabled
                            ? "translate-x-3.5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showConfigTabs === "motion" && (
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest">
                      Animations
                    </span>
                    <button
                      onClick={() =>
                        onUpdateConfig({
                          isAnimationEnabled: !projectConfig.isAnimationEnabled,
                        })
                      }
                      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none ${
                        projectConfig.isAnimationEnabled
                          ? "bg-indigo-500"
                          : "bg-zinc-800"
                      }`}
                      role="switch"
                      aria-checked={projectConfig.isAnimationEnabled}
                    >
                      <span className="sr-only">Use setting</span>
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute left-0 inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
                          projectConfig.isAnimationEnabled
                            ? "translate-x-3.5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 border-l border-zinc-900 pl-4">
                    <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest">
                      Transitions
                    </span>
                    <button
                      onClick={() =>
                        onUpdateConfig({
                          isTransitionsEnabled:
                            !projectConfig.isTransitionsEnabled,
                        })
                      }
                      className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none ${
                        projectConfig.isTransitionsEnabled
                          ? "bg-indigo-500"
                          : "bg-zinc-800"
                      }`}
                      role="switch"
                      aria-checked={projectConfig.isTransitionsEnabled}
                    >
                      <span className="sr-only">Use setting</span>
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute left-0 inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
                          projectConfig.isTransitionsEnabled
                            ? "translate-x-3.5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div
                className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-[10px] opacity-80"
                style={{
                  pointerEvents: projectConfig.isTransitionsEnabled
                    ? "auto"
                    : "none",
                  opacity: projectConfig.isTransitionsEnabled ? 1 : 0.4,
                }}
              >
                {(
                  [
                    { id: "none", label: "Hard Cut" },
                    { id: "random", label: "🎲 Random" },
                    { id: "crossfade", label: "Crossfade" },
                    { id: "slide", label: "Slide" },
                    { id: "wipe", label: "Wipe" },
                    { id: "zoom", label: "Zoom" },
                    { id: "spin", label: "Spin" },
                    { id: "blur", label: "Blur" },
                    { id: "flicker", label: "⚡ Flicker" },
                    { id: "morph", label: "🧬 Morph" },
                    { id: "glitch", label: "👾 Glitch" },
                    { id: "pixelate", label: "Pixelate" },
                  ] as const
                ).map((tOpt) => (
                  <button
                    key={tOpt.id}
                    type="button"
                    onClick={() =>
                      onUpdateConfig({ transitionType: tOpt.id as any })
                    }
                    className={`py-1.5 border rounded-lg ${projectConfig.transitionType === tOpt.id ? "bg-zinc-900 border-indigo-500 text-indigo-400 font-bold" : "border-zinc-900/60 text-zinc-500 hover:bg-zinc-800"}`}
                  >
                    {tOpt.label}
                  </button>
                ))}
              </div>

              {/* Animation Styles */}
              <div
                className="space-y-1.5"
                style={{
                  pointerEvents: projectConfig.isAnimationEnabled
                    ? "auto"
                    : "none",
                  opacity: projectConfig.isAnimationEnabled ? 1 : 0.4,
                }}
              >
                <div className="flex justify-between items-center px-1">
                  <span className="text-[9px] uppercase tracking-tighter text-zinc-600 font-bold">
                    Image Animation Style (እንቅስቃሴ)
                  </span>
                  <span className="text-[8px] text-zinc-500 font-serif italic">
                    Ken Burns Effects
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {(
                    [
                      "zoom-in",
                      "zoom-out",
                      "pan-lr",
                      "pan-rl",
                      "tilt-up",
                      "tilt-down",
                      "diagonal-br",
                      "diagonal-bl",
                      "static",
                      "dynamic",
                    ] as const
                  ).map((style) => (
                    <button
                      key={style}
                      onClick={() => onUpdateConfig({ animationStyle: style })}
                      className={`py-1.5 rounded-md text-[9px] border transition-all uppercase tracking-tight ${
                        (projectConfig.animationStyle || "zoom-in") === style
                          ? "bg-indigo-500/15 border-indigo-500 text-indigo-400 font-bold ring-1 ring-indigo-500/20"
                          : "border-zinc-900 text-zinc-650 hover:text-zinc-500 hover:border-zinc-800"
                      }`}
                    >
                      {style === "dynamic"
                        ? "✨ Dynamic"
                        : style.replace("-", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-zinc-500 font-mono text-[10px]">
                  Duration (s)
                </span>
                <input
                  type="range"
                  min="0"
                  max="2.0"
                  step="0.1"
                  value={projectConfig.transitionDuration}
                  onChange={(e) =>
                    onUpdateConfig({
                      transitionDuration: parseFloat(e.target.value),
                    })
                  }
                  className="w-48 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <span className="text-[10px] font-mono text-indigo-400">
                  {projectConfig.transitionDuration}s
                </span>
              </div>
            </div>
          )}

          {showConfigTabs === "filters" && (
            <div className="w-full space-y-4">
              <div className="flex items-center gap-4 px-1">
                <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest">
                  Video CSS Filters
                </span>
                <div className="h-px bg-zinc-900 flex-1"></div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(["none", "sepia", "grayscale", "contrast", "vintage", "teal", "high-contrast"] as const).map(
                  (filter) => (
                    <button
                      key={filter}
                      onClick={() =>
                        onUpdateConfig({ videoFilter: filter })
                      }
                      className={`py-3 rounded-lg text-xs font-semibold tracking-wider transition-all uppercase border ${
                        (projectConfig.videoFilter || "none") === filter
                          ? "bg-indigo-500/10 border-indigo-500 text-indigo-400 ring-1 ring-indigo-500/20"
                          : "border-zinc-900 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                      }`}
                    >
                      {filter}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {showConfigTabs === "analyzer" && (
            <div className="w-full space-y-3.5 animate-fadeIn">
              {/* Main Tab Label */}
              <div className="flex items-center justify-between border-b border-zinc-900 pb-2 mb-1">
                <div className="flex items-center gap-2">
                  <div className="p-1 px-1.5 bg-indigo-550/10 text-indigo-400 border border-indigo-500/20 rounded font-bold font-mono text-[9px] uppercase tracking-wider">
                    Yotor Intelligence
                  </div>
                  <span className="font-bold text-zinc-300 text-[11px] tracking-wider uppercase font-mono">
                    Director AI Studio
                  </span>
                </div>
                <span className="text-[9px] font-mono bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 px-2 py-0.5 rounded">
                  gemini-2.5-flash
                </span>
              </div>

              {/* Sub tabs switcher */}
              <div className="grid grid-cols-2 gap-1 px-1.5 py-1 bg-[#09090b] rounded-xl border border-zinc-850/60">
                <button
                  type="button"
                  onClick={() => setAiSubTab("copilot")}
                  className={`py-1.5 rounded-lg text-[10.5px] font-semibold tracking-wide transition-all ${
                    aiSubTab === "copilot"
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-zinc-550 hover:text-zinc-300"
                  }`}
                >
                  💬{" "}
                  {language === "am"
                    ? "የግል ረዳት አይ (Copilot)"
                    : "Personal AI Copilot"}
                </button>
                <button
                  type="button"
                  onClick={() => setAiSubTab("analyzer")}
                  className={`py-1.5 rounded-lg text-[10.5px] font-semibold tracking-wide transition-all ${
                    aiSubTab === "analyzer"
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-zinc-550 hover:text-zinc-300"
                  }`}
                >
                  🔍{" "}
                  {language === "am" ? "ምስል መርማሪ (Analyzer)" : "Video Analyzer"}
                </button>
              </div>

              {/* Tab 1: AI Copilot & Controller */}
              {aiSubTab === "copilot" && (
                <div className="space-y-3">
                  <div className="h-[210px] overflow-y-auto p-3.5 bg-[#050505] border border-zinc-900 rounded-2xl flex flex-col gap-3 custom-scrollbar">
                    {chatMessages.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex flex-col max-w-[85%] ${
                          msg.role === "user"
                            ? "self-end items-end"
                            : "self-start items-start"
                        }`}
                      >
                        <div className="text-[9px] font-mono mb-1 text-zinc-550 uppercase tracking-widest">
                          {msg.role === "user"
                            ? language === "am"
                              ? "እርስዎ"
                              : "You"
                            : "Yotor Copilot"}
                        </div>
                        <div
                          className={`p-3 rounded-2xl text-[11px] leading-relaxed whitespace-pre-wrap ${
                            msg.role === "user"
                              ? "bg-indigo-650 text-white rounded-tr-none font-sans font-medium"
                              : "bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none font-sans"
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {isChatLoading && (
                      <div className="flex items-center gap-2 self-start bg-zinc-900 border border-zinc-800 p-3 rounded-2xl rounded-tl-none text-[10px] text-indigo-400 font-mono animate-pulse">
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-75" />
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-150" />
                        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-225" />
                        <span>Copilot is adjusting movie controls...</span>
                      </div>
                    )}
                  </div>

                  {/* Contextual Smart Helper Chips */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono text-zinc-650 uppercase tracking-wider block">
                      Suggested Directives / ፈጣን ትዕዛዞች
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        {
                          am: "🎬 ታሪኩን ወደ አማርኛ ቀይር",
                          en: "🎬 Translate into Amharic",
                          prompt:
                            "Translate all cinematic scene narration script values into Amharic language perfectly verbatim, but keep keywords in English",
                        },
                        {
                          am: "📏 የ9:16 መጠን አድርግ",
                          en: "📏 Shift to Tall 9:16",
                          prompt:
                            "Change video project aspect ratio to vertical tall 9:16 screen format",
                        },
                        {
                          am: "🔊 የድምፅ ንባብ አግብር",
                          en: "🔊 Turn On TTS Narration",
                          prompt:
                            "Enable text to speech narrator option on project",
                        },
                        {
                          am: "🎵 ማጀቢያ ሙዚቃ ክፈት",
                          en: "🎵 Spark Backing Soundtrack",
                          prompt:
                            "Turn on atmosphere background music tracks with volume at 0.25",
                        },
                      ].map((sugg, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleSendCopilotMessage(sugg.prompt)}
                          className="text-[9px] font-sans px-2.5 py-1.5 bg-[#09090b] border border-zinc-850 hover:border-indigo-500/30 text-zinc-400 hover:text-indigo-300 rounded-lg transition-all"
                        >
                          {language === "am" ? sugg.am : sugg.en}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submission Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendCopilotMessage();
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={
                        language === "am"
                          ? "ረዳት አይ-ን እዚህ ያዙት (ለምሳሌ 'ቪዲዮውን 9:16 አድርግ')..."
                          : "Obedient AI (e.g. 'Make aspect ratio 9:16', 'write a short Amharic story')..."
                      }
                      className="flex-1 bg-[#050505] border border-zinc-800 text-zinc-200 placeholder-zinc-700 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500/50"
                    />
                    <button
                      type="submit"
                      disabled={isChatLoading || !chatInput.trim()}
                      className="px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-650/10 active:scale-[0.98]"
                    >
                      {language === "am" ? "እዘዝ" : "Send"}
                    </button>
                  </form>
                </div>
              )}

              {/* Tab 2: Classic Video Analyzer (Multimodal) */}
              {aiSubTab === "analyzer" && (
                <div className="space-y-3">
                  {currentScene?.videoUrl ? (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-zinc-500 font-mono uppercase">
                            Preset Analysis Tasks / ፈጣን ምርመራዎች
                          </label>
                          <span className="text-[9px] text-indigo-400 font-bold font-mono">
                            SCENE WORKSPACE
                          </span>
                        </div>
                        <select
                          onChange={(e) => setAnalysisPrompt(e.target.value)}
                          className="w-full bg-[#050505] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-350 text-xs focus:outline-none focus:border-indigo-500/50"
                          defaultValue="Identify and describe all visible elements, key actions, visual pacing, color grading palette, and lighting style of this video clip."
                        >
                          <option value="Identify and describe all visible elements, key actions, visual pacing, color grading palette, and lighting style of this video clip.">
                            🔍 Identify objects, actions, palette & lighting
                            styles
                          </option>
                          <option value='Compare the raw visual elements in this scenery with the narrated script text: "${currentScene.text}". Do they contextually match? Does it enhance the theme? Propose alternative keywords if not alignment perfectly.'>
                            🎬 Evaluate video alignment with narration script
                          </option>
                          <option value="Draft an alternative, highly detailed, visually stunning english search prompt (keywords) to query stock clip databases for this scene's message.">
                            💡 Suggest alternative premium footage keywords
                          </option>
                          <option value="Identify the mood, tempo, and atmosphere of this clip and suggest what style of music/sound fx would make a cinematic ambient soundscape for it.">
                            🎵 Propose advanced cinematic soundscapes
                          </option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-zinc-500 font-mono uppercase">
                          Fine-Tune Prompt or Ask Anything / የራስዎን ጥያቄ ያክሉ
                        </label>
                        <textarea
                          value={analysisPrompt}
                          onChange={(e) => setAnalysisPrompt(e.target.value)}
                          placeholder="Ask the AI Director anything about this video (e.g., 'What is the focal length or camera angle?')..."
                          rows={2}
                          className="w-full bg-[#050505] border border-zinc-800 text-zinc-200 placeholder-zinc-700 text-xs rounded-xl p-3 focus:outline-none focus:border-indigo-500/50 resize-y font-sans leading-relaxed"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleAnalyzeVideo}
                        disabled={isAnalyzing}
                        className="w-full h-[38px] flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs tracking-wider uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-600/10 active:scale-[0.99]"
                      >
                        {isAnalyzing ? (
                          <>
                            <RefreshCw
                              size={13}
                              className="animate-spin text-white"
                            />
                            <span className="animate-pulse">
                              Deep Multi-Modal Analyzing... (እባክዎ ይጠብቁ - up to
                              20s)
                            </span>
                          </>
                        ) : (
                          <>
                            <Cpu size={13} className="text-white" />
                            <span>
                              Analyze Active Clip in Gemini Pro / ቪዲዮውን መርምር
                            </span>
                          </>
                        )}
                      </button>

                      {analysisError && (
                        <div className="p-3 bg-rose-500/5 border border-rose-500/20 text-rose-400 rounded-xl text-[10.5px] leading-relaxed">
                          ⚠️ <strong>Multimodal Error:</strong> {analysisError}
                        </div>
                      )}

                      {analysisResult && (
                        <div className="p-4 bg-[#050505] border border-zinc-800/80 rounded-xl space-y-2 animate-fadeIn max-h-[180px] overflow-y-auto custom-scrollbar">
                          <div className="flex items-center justify-between border-b border-zinc-900 pb-1.5 mb-1.5 font-semibold text-indigo-400 text-[10px] tracking-wider uppercase font-mono">
                            <span>Director Report</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(analysisResult);
                                alert("Copied analysis to clipboard!");
                              }}
                              className="text-[9px] text-[#818cf8] hover:text-indigo-300 font-mono uppercase bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 transition-all"
                            >
                              Copy Report
                            </button>
                          </div>
                          <p className="text-zinc-300 font-sans text-[11px] leading-relaxed whitespace-pre-wrap">
                            {analysisResult}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-zinc-800 flex flex-col items-center justify-center text-center text-zinc-500 py-6">
                      <Cpu
                        size={24}
                        className="text-zinc-650 mb-2 animate-pulse"
                      />
                      <p className="text-xs font-semibold text-zinc-400">
                        No scene is currently loaded or selected.
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Please enter a story script on the left side and
                        generate some visual scenes first.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actual Composition Monitor Layout */}
      <div className="relative flex-1 flex items-center justify-center p-3 bg-[#050505] rounded-3xl border border-zinc-900 overflow-hidden my-4">
        {/* Transparent grid backing */}
        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />

        {/* The canvas target */}
        <div className="relative shadow-2xl rounded-2xl overflow-hidden border border-zinc-900 max-w-full">
          <canvas
            ref={canvasRef}
            className={`${getAspectClass(projectConfig.aspectRatio)} rounded-2xl shadow-2xl shadow-black/80`}
            id="rendering-canvas"
          />
          
          {/* Elegant Amharic/English Data Saver indicator overlay */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-full border border-emerald-500/30 text-emerald-400 text-[9.5px] font-sans font-medium tracking-wide shadow-lg shadow-black/40">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full absolute left-2.5" />
            <span>ዳታ ቆጣቢ ንቁ ነው / Data Saver (SD Preview, 1080p Export)</span>
          </div>

          {/* Beautiful Buffering Indicator Overlay */}
          {isBuffering && isPlaying && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center gap-3 transition-all duration-350">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <span className="absolute w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
                <Sparkles className="text-indigo-400 animate-pulse" size={18} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-xs font-semibold text-zinc-100 font-sans tracking-wide">
                  ቪዲዮ በመጫን ላይ...
                </p>
                <p className="text-[10px] text-zinc-400 font-mono tracking-wider uppercase">
                  Buffering Video (Slow Connection)...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Hidden active videos/images for crossfade rendering */}
        {scenes.map((s, idx) => {
          // Preload active and immediate next scene only - saves 75% background data
          const isNear = idx === playbackIndex || idx === playbackIndex + 1;
          const isImage =
            s.videoUrl &&
            (s.videoUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i) ||
              s.videoUrl.includes("pollinations.ai"));
              
          // Prefer compressed previewUrl for rapid browser rendering, fall back to master high-quality videoUrl
          const activeSrc = s.previewUrl || s.videoUrl;
          const srcProps = isNear && activeSrc ? { src: activeSrc } : {};
          const thumbSrc = s.videoThumb || DEFAULT_CATALOG[idx % DEFAULT_CATALOG.length]?.thumbnail;

          if (isImage) {
            return (
              <img
                key={s.id}
                id={`video-scene-${s.id}`}
                ref={(el) => {
                  videoRefs.current[s.id] = el as any;
                }}
                {...srcProps}
                crossOrigin="anonymous"
                className="absolute pointer-events-none opacity-0 w-1 h-1"
                alt="scene frame"
              />
            );
          }

          return (
            <React.Fragment key={s.id}>
              <video
                id={`video-scene-${s.id}`}
                ref={(el) => {
                  videoRefs.current[s.id] = el;
                }}
                {...srcProps}
                loop
                muted={isMuted || !projectConfig.isVideoSoundEnabled}
                playsInline
                crossOrigin="anonymous"
                className="absolute pointer-events-none opacity-0 w-1 h-1"
                preload={isNear ? "auto" : "none"}
                onWaiting={() => {
                  if (idx === playbackIndex && isPlaying) {
                    setIsBuffering(true);
                  }
                }}
                onPlaying={() => {
                  if (idx === playbackIndex) {
                    setIsBuffering(false);
                  }
                }}
                onLoadedData={() => {
                  if (idx === playbackIndex) {
                    setIsBuffering(false);
                  }
                }}
                onSeeked={() => {
                  if (idx === playbackIndex) {
                    setIsBuffering(false);
                  }
                }}
              />
              {thumbSrc && (
                <img
                  key={`thumb-${s.id}`}
                  id={`thumb-scene-${s.id}`}
                  ref={(el) => {
                    thumbRefs.current[s.id] = el;
                  }}
                  src={thumbSrc}
                  crossOrigin="anonymous"
                  className="absolute pointer-events-none opacity-0 w-1 h-1"
                  alt="scene thumb fallback"
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Hidden active audio for Preloading TTS Voiceovers */}
        {scenes.map((s, idx) => {
          const isNear = Math.abs(idx - playbackIndex) <= 2;
          const audioUrl = s.voiceoverUrl || (s.text && s.text.trim().length > 0 ? getTtsUrl(s.text, projectConfig.voiceLanguage) : "");
          
          if (!audioUrl || !isNear) {
            if (audioRefs.current[s.id] && !isNear) {
              try {
                audioRefs.current[s.id].pause();
              } catch (_) {}
            }
            delete audioRefs.current[s.id];
            return null;
          }

          return (
          <audio
            key={`audio_${s.id}`}
            ref={(el) => {
              if (el) {
                audioRefs.current[s.id] = el;
              } else {
                delete audioRefs.current[s.id];
              }
            }}
            src={audioUrl}
            muted={isMuted}
            className="hidden"
            crossOrigin="anonymous"
            preload="auto"
            onError={(e) => {
              if (audioUrl) {
                console.warn(`[TTS] Note: Audio preloading skipped or delayed for scene ${s.id} (browser policy or loading):`, e);
              }
            }}
            onLoadedMetadata={(e) => {
              // Update scene duration if audio length differs from current scene duration
              const aud = e.currentTarget;
              if (aud.duration && aud.duration > 0.1) {
                if (projectConfig.autoAlignVoiceover) {
                  const targetDur = parseFloat(aud.duration.toFixed(2));
                  if (Math.abs(s.duration - targetDur) > 0.05) {
                    if (setScenes) {
                      setScenes((prev) =>
                        prev.map((scene) => {
                          if (scene.id === s.id) {
                            return { ...scene, duration: targetDur };
                          }
                          return scene;
                        })
                      );
                    }
                  }
                }
              }

              // Peak amplitude analysis for auto-leveling
              if (audioUrl && setVoiceoverPeaks) {
                analyzeAudioPeak(audioUrl).then((peak) => {
                  setVoiceoverPeaks((prev) => {
                    if (prev[s.id]?.url === audioUrl && prev[s.id]?.peak === peak) {
                      return prev;
                    }
                    return { ...prev, [s.id]: { url: audioUrl, peak } };
                  });
                }).catch((err) => {
                  console.error("Failed to analyze peak", err);
                });
              }
            }}
          />
        )})}
      </div>

      {/* Mechanical Playback Control Deck */}
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        {/* Cumulative Timeline Scroll */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>
              Scene {playbackIndex + 1} of {scenes.length}
            </span>
            <span className="text-indigo-400 font-bold font-mono">
              {currentSceneTime.toFixed(1)}s / {currentScene?.duration || 4}s
            </span>
          </div>

          <div
            className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden cursor-pointer border border-zinc-850"
            onClick={(e) => {
              // Click to skip scenes instantly
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              const sceneTargetIdx = Math.floor(percent * scenes.length);
              if (sceneTargetIdx >= 0 && sceneTargetIdx < scenes.length) {
                setPlaybackIndex(sceneTargetIdx);
                setCurrentSceneTime(0);
              }
            }}
          >
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-100"
              style={{
                width: `${((playbackIndex + currentSceneTime / (currentScene?.duration || 4)) / scenes.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Action button deck */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              type="button"
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors"
              title="Prev Scene"
            >
              <SkipBack size={18} />
            </button>
            <button
              onClick={() => {
                if (!isPlaying) {
                  playActiveSceneTtsAndVideo();
                }
                setIsPlaying(!isPlaying);
              }}
              type="button"
              className="p-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-full transform transition-all active:scale-95 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
              id="compositor-play-btn"
            >
              {isPlaying ? (
                <Pause size={18} className="fill-current text-white" />
              ) : (
                <Play size={18} className="fill-current text-white" />
              )}
            </button>
            <button
              onClick={handleNext}
              type="button"
              className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-lg transition-colors"
              title="Next Scene"
            >
              <SkipForward size={18} />
            </button>
          </div>

          <div className="text-[11px] text-zinc-400 max-w-[200px] truncate text-right">
            <span className="block font-semibold text-zinc-300 truncate">
              S-{playbackIndex + 1}: {currentScene?.keywords.split(" ")[0]} clip
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
