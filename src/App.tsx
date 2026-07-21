import React, { useState, useEffect, useRef, useCallback } from "react";
import { Scene, ProjectConfig, AspectRatio, SavedProject } from "./types";
import {
  DEFAULT_CATALOG,
  DEFAULT_MUSIC,
  GOOGLE_TTS_LANGUAGES,
  VISUAL_STYLES,
} from "./data";
import ScriptInput from "./components/ScriptInput";
import Timeline from "./components/Timeline";
import VideoCanvas from "./components/VideoCanvas";
import RenderModal from "./components/RenderModal";
import AccessGate from "./components/AccessGate";
import ProjectLibrary from "./components/ProjectLibrary";
import { Language, translations } from "./translations";

// --- DEBUG PATCH ---
const originalStringify = JSON.stringify;
JSON.stringify = function (value: any, replacer?: any, space?: string | number): string {
  try {
    return originalStringify(value, replacer, space);
  } catch (err: any) {
    if (err.message && err.message.includes('circular structure')) {
       console.error("CIRCULAR STRINGIFY DETECTED. Value keys:", value ? Object.keys(value) : value);
    }
    throw err;
  }
};
// -------------------
import {
  Sparkles,
  Download,
  Video,
  Palette,
  Library,
  Info,
  HelpCircle,
  Terminal,
  Send,
  X,
  Bot,
  Sliders,
  Eye,
  EyeOff,
  MessageSquare,
  Volume2,
  Zap,
  SlidersHorizontal,
  Command,
  Image as ImageIcon,
  Languages,
  Settings,
  RefreshCw,
  Trash2,
  Undo2,
  Redo2,
} from "lucide-react";

export const getTtsUrl = (text: string, lang: string): string => {
  let url = `/api/tts?text=${encodeURIComponent(text)}&lang=${lang}`;
  if (lang && lang.startsWith("openai-")) {
    const key = localStorage.getItem("openai_api_key") || "";
    if (key) {
      url += `&openai_key=${encodeURIComponent(key)}`;
    }
  }
  return url;
};

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("app_language");
    return (saved === "am" || saved === "en") ? saved : "en";
  });

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("app_language", lang);
  };

  const t = translations[language] || translations.en;

  const [scenes, setScenesState] = useState<Scene[]>([]);
  const [undoStack, setUndoStack] = useState<Scene[][]>([]);
  const [redoStack, setRedoStack] = useState<Scene[][]>([]);

  const setScenes = useCallback((newScenesOrFn: Scene[] | ((prev: Scene[]) => Scene[])) => {
    setScenesState((prev) => {
      const next = typeof newScenesOrFn === "function" ? newScenesOrFn(prev) : newScenesOrFn;
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        if (prev && prev.length > 0) {
          setUndoStack((prevUndo) => {
            const limited = prevUndo.length >= 50 ? prevUndo.slice(1) : prevUndo;
            return [...limited, prev];
          });
          setRedoStack([]);
        }
      }
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, scenes]);
    setScenesState(previous);
  }, [undoStack, scenes]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, scenes]);
    setScenesState(next);
  }, [redoStack, scenes]);

  const [voiceoverPeaks, setVoiceoverPeaks] = useState<{ [sceneId: string]: { url: string; peak: number } }>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if (modifier && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleUndo, handleRedo]);

  const [script, setScript] = useState<string>(
    "Here are 3 mind-blowing facts that will leave you speechless! Number one, honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old! Number two, water can boil and freeze at the same time. And number three, bananas are berries, but strawberries aren't. Follow for more crazy facts!",
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStage, setLoadingStage] = useState<string>(
    "Analyzing narration text...",
  );
  const [isRenderOpen, setIsRenderOpen] = useState<boolean>(false);
  const [exportQuality, setExportQuality] = useState<'720p' | '1080p' | '4k'>('4k');

  // PWA & Settings states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandaloneApp, setIsStandaloneApp] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Shared Playback state for real-time play elements
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [renderTime, setRenderTime] = useState<number | undefined>(undefined);
  const activeSceneId = scenes[playbackIndex]?.id || null;
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Ref inside parent to access the compiled canvas directly from RenderModal
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [projectConfig, setProjectConfig] = useState<ProjectConfig>({
    aspectRatio: "9:16",
    musicTrack: DEFAULT_MUSIC[1].url, // Meditative pad default
    musicVolume: 0.12,
    voiceLanguage: "en-US-Standard-D",
    voiceType: "male",
    subtitleStyle: {
      enabled: true,
      fontSize: 48,
      color: "#FFFFFF",
      backgroundColor: "transparent",
      position: "center",
      fontFamily: "Space Grotesk",
      uppercase: true,
      animation: "karaoke",
      highlightColor: "#FBBF24",
    },
    transitionType: "crossfade",
    transitionDuration: 0.5,
    isVoiceEnabled: true,
    syncToMusicBeats: true,
    isAnimationEnabled: true,
    isTransitionsEnabled: true,
    isSubtitlesEnabled: true,
    isMusicEnabled: true,
    visualStyle: "realistic",
    isVideoSoundEnabled: true,
    videoVolume: 0.5,
    videoFilter: "none",
    autoDuckNarration: true,
    autoAlignVoiceover: true,
    autoLevelVoiceover: true,
    watermarkEnabled: false,
    watermarkType: "text",
    watermarkText: "© BRAND OVERLAY",
    watermarkLogoUrl: "",
    watermarkPosition: "bottom-right",
    watermarkOpacity: 0.6,
    watermarkSize: 14,
  });

  // Load spectacular cosmic startup template
  useEffect(() => {
    loadStartupCosmicTemplate();

    // Check custom standalone app states
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    const handleInstalled = () => {
      setIsStandaloneApp(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("appinstalled", handleInstalled);

    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsStandaloneApp(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  // Sync scene voiceover URLs when project voice settings change
  useEffect(() => {
    if (scenes.length > 0) {
      setScenes((prev) =>
        prev.map((s) => ({
          ...s,
          voiceoverUrl: getTtsUrl(s.text, projectConfig.voiceLanguage),
        })),
      );
    }
  }, [projectConfig.voiceLanguage, projectConfig.voiceType]);

  const triggerPwaInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleTestVoice = () => {
    const testText =
      language === "am"
        ? "እንኳን ወደ ይቶር ሲኒማቲክ ስቱዲዮ በሰላም መጡ። ይህ የድምፅ መሞከሪያ ነው።"
        : "Welcome to Yotor Cinematic Studio. This is a voice test.";
    const url = getTtsUrl(testText, projectConfig.voiceLanguage);
    const audio = new Audio(url);
    audio.play().catch((e) => {
      // Ignore
    });
  };

  // Autosave active draft to localStorage
  useEffect(() => {
    if (scenes.length > 0) {
      const activeDraft = {
        script,
        scenes,
        projectConfig
      };
      
      const replacer = (key: string, value: any) => {
        if (
          (typeof Element !== "undefined" && value instanceof Element) ||
          (value && typeof value === 'object' && value.current !== undefined)
        ) {
          return undefined;
        }
        if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object HTMLAudioElement]') {
          return undefined;
        }
        return value;
      };

      try {
        localStorage.setItem("yotor_active_draft", JSON.stringify(activeDraft, replacer));
      } catch (err) {
        console.error("Failed to save draft:", err);
      }
    }
  }, [script, scenes, projectConfig]);

  const loadStartupCosmicTemplate = () => {
    // Attempt to load active draft from localStorage
    const savedDraft = localStorage.getItem("yotor_active_draft");
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed.scenes && parsed.scenes.length > 0) {
          setScript(parsed.script ?? "");
          setScenes(parsed.scenes);
          if (parsed.projectConfig) {
            setProjectConfig(prev => ({
              ...prev,
              ...parsed.projectConfig,
              subtitleStyle: {
                ...prev.subtitleStyle,
                ...(parsed.projectConfig.subtitleStyle || {})
              }
            }));
          }
          setPlaybackIndex(0);
          return;
        }
      } catch (e) {
        console.error("Failed to load active draft from storage:", e);
      }
    }

    const defaultSentences = [
      {
        text: "We stand on the edge of a new cosmos.",
        query: "starry galaxy slow motion space",
      },
      {
        text: "Stars flicker in the endless fabric of space, calling us to explore.",
        query: "cosmic universe nebulas",
      },
      {
        text: "For generations, we have looked up and wondered.",
        query: "happy man looking up sky starry night",
      },
      {
        text: "And now, we build the engines of discovery.",
        query: "futuristic machinery space cockpit",
      },
    ];

    const initialScenes: Scene[] = defaultSentences.map((s, index) => {
      // Find matching index in our beautiful default catalog so they have actual assets!
      const fallbackVid = DEFAULT_CATALOG[index % DEFAULT_CATALOG.length];
      return {
        id: `sc_${index}_${Date.now()}`,
        text: s.text,
        keywords: s.query,
        caption: s.text,
        duration: 4.5,
        videoUrl: fallbackVid.url,
        previewUrl: fallbackVid.url,
        videoThumb: fallbackVid.thumbnail,
        videoAuthor: fallbackVid.author,
        videoAuthorUrl: "#",
        voiceoverUrl: null,
        originalIndex: index,
        transitionToNext: "random" as any,
      };
    });

    setScenes(initialScenes);
    setPlaybackIndex(0);
  };

  // Triggers Gemini parser pipeline
  const handleAnalyzeScript = async (
    videoMode: "stock" | "veo" | "pollinations" = "stock",
    inputMode: "script" | "keywords" = "script",
  ) => {
    setIsLoading(true);
    setLoadingStage(
      videoMode === "veo" ? t.stage_veo_dreaming : t.stage_analyzing_director,
    );
    // Sync credentials
    const pexelsKey = localStorage.getItem("pexels_api_key") || "";
    const pixabayKey = localStorage.getItem("pixabay_api_key") || "";
    const coverrKey = localStorage.getItem("coverr_api_key") || "";

    setIsPlaying(false);
    setPlaybackIndex(0);

    try {
      const response = await fetch("/api/analyze-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          script: script,
          visualStyle: projectConfig.visualStyle,
          isKeywordsOnly: inputMode === "keywords",
        }),
      });

      const data = await response.json();

      if (data.info) {
        setLoadingStage(`${data.info}: ${t.stage_segmenting}`);
      }

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze script");
      }

      const rawScenes = data.scenes || [];
      if (rawScenes.length === 0) {
        throw new Error(t.error_no_scenes);
      }

      if (videoMode === "stock" || videoMode === "pollinations") {
        const stylePrefix =
          videoMode === "pollinations"
            ? "3d pixar animation cinematic highly detailed "
            : "cinematic professional movement high depth of field ";
        setLoadingStage(t.stage_matching_cinematic);

        // Parallelize searches to speed up process significantly while staying respectul of limits
        const populatedScenes: Scene[] = await Promise.all(
          rawScenes.map(async (scene: any, i: number) => {
            let videoUrl = "";
            let previewUrl = "";
            let videoThumb = "";
            let author = "";

            // Random jitter to spread out hits slightly even in parallel
            await new Promise((r) => setTimeout(r, i * 120));

            // Format search query dynamically to prevent extremely long prompts and non-ASCII character URLs (e.g. Amharic) which trigger 431 errors
            let cleanKeywords = (scene.keywords || "")
              // Strip brackets like [0:00 - 1:15]
              .replace(/\[\d+:\d+\s*-\s*\d+:\d+\]/gi, "")
              .replace(/\(\s*The\s+Hook\s*\)/gi, "")
              .replace(/['"“»«]/g, "")
              .trim();

            // Extract ASCII only characters (English/numbers) so we don't blow up the url encode
            let asciiKeywords = cleanKeywords.replace(/[^\x00-\x7F]+/g, " ").replace(/\s+/g, " ").trim();

            if (!asciiKeywords || asciiKeywords.length < 3) {
              // Extract English terms from scene.text if any exist
              const textAscii = (scene.text || "").replace(/[^\x00-\x7F]+/g, " ").trim();
              const words = textAscii.split(/\s+/).filter(w => w.length > 2 && !w.includes("[") && !w.includes("]"));
              if (words.length > 0) {
                asciiKeywords = words.slice(0, 5).join(" ");
              } else {
                asciiKeywords = "cinematic highly detailed epic storytelling visual";
              }
            }

            // Cap overall length at 120 characters to guarantee no 431 HTTP error
            if (asciiKeywords.length > 120) {
              asciiKeywords = asciiKeywords.substring(0, 120).trim();
            }

            const searchQuery = `${stylePrefix}${asciiKeywords}`;

            if (videoMode === "pollinations") {
              // Use Pollinations AI (Free 3D Animation Image Generator)
              const seed = Math.floor(Math.random() * 1000000);
              videoUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(searchQuery)}?width=1280&height=720&nologo=true&seed=${seed}`;
              videoThumb = videoUrl;
              author = "Pollinations Model";
            } else {
              // Stock mode: Clean and formulate adaptive fallback queries
              // Stock search engines do not understand long styles, so we try multiple levels of specificity
              const cleanWords = (scene.keywords || "")
                .replace(/cinematic|professional|movement|high depth of field|hd|4k|photorealistic|ultra|3d pixar style animation|cute expressive characters|vibrant volumetric lighting|disney style 3d render|2d handdrawn animation|flat colors|expressive line art|illustrative style|studio ghibli aesthetic|anime style background|detailed characters|japanese animation|soft watercolor painting|artistic bleeding colors|paper texture|impressionist|cyberpunk aesthetic|neon colored lights|futuristic cityscape|rainy night|high tech|silhouette|handdrawn pencil sketch|charcoal texture|artistic line work|detailed|realistic|epic|storytelling|aesthetic|vibrant|beautiful|gorgeous|artistic|stunning|glorious|breathtaking|highly|background|concept|art|render|style|illustration|digital|painting/gi, "")
                .replace(/[^a-zA-Z0-9\s]/g, "")
                .replace(/\s+/g, " ")
                .trim();

              // For stock search, we MUST put the pure, clean visual subject FIRST!
              // Prepending a stylePrefix (like "cinematic 4k ...") to stock searches breaks them
              // because stock APIs look for exact words. They don't know what "cinematic 4k" means!
              const queriesToTry = [
                cleanWords, // 1: Perfect clean subject (e.g., "coffee ceremony") - EXACT MATCH
                cleanWords.split(" ").slice(0, 4).join(" "), // 2: First 4 words
                cleanWords.split(" ").slice(0, 3).join(" "), // 3: First 3 words
                cleanWords.split(" ").slice(0, 2).join(" "), // 4: First 2 words
                cleanWords.split(" ")[0], // 5: Single primary noun
              ].filter(q => q && q.trim().length > 1);

              // Add style-prefixed query as a final low-priority fallback only
              if (searchQuery && searchQuery !== cleanWords) {
                queriesToTry.push(searchQuery);
              }

              // Distinct values
              const uniqueQueries = Array.from(new Set(queriesToTry));

              // Attempt each query until success
              for (const query of uniqueQueries) {
                if (videoUrl) break;

                // Try Pexels first
                if (pexelsKey || !pixabayKey) {
                  try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 6000);
                    const pexelsResponse = await fetch(
                      `/api/pexels/search?query=${encodeURIComponent(query)}`,
                      {
                        headers: { "x-pexels-key": pexelsKey || "" },
                        signal: controller.signal,
                      },
                    );
                    clearTimeout(timeout);
                    if (pexelsResponse.ok) {
                      const text = await pexelsResponse.text();
                      if (text && !text.trim().startsWith("<")) {
                        const pexelsData = JSON.parse(text);
                        if (pexelsData.videos?.length > 0) {
                          const bestClip = pexelsData.videos[0];
                          const files = bestClip.video_files || [];
                          const mp4Files = files.filter(
                            (f: any) =>
                              f.file_type === "video/mp4" || f.link.includes(".mp4"),
                          );
                          // Sort MP4 files by resolution descending to get absolute maximum quality!
                          const sortedMp4Files = [...mp4Files].sort((a: any, b: any) => {
                            const sizeA = (Number(a.width) || 0) * (Number(a.height) || 0);
                            const sizeB = (Number(b.width) || 0) * (Number(b.height) || 0);
                            return sizeB - sizeA;
                          });
                          const highestQualityVid = sortedMp4Files[0];
                          // Select a lighter file for real-time browser preview (typically width between 640 and 1280) so editing remains lag-free
                          const previewVid = sortedMp4Files.find((f: any) => f.width <= 1280 && f.width >= 640) || sortedMp4Files.find((f: any) => f.width < 640) || highestQualityVid;
                          videoUrl = highestQualityVid?.link || "";
                          previewUrl = previewVid?.link || videoUrl;
                          videoThumb = bestClip.video_pictures?.[0]?.picture || "";
                          author = bestClip.user?.name || "Stock Creator";
                        }
                      }
                    }
                  } catch (e) {
                    console.warn(`Pexels try for "${query}" failed/timed out:`, e);
                  }
                }

                // If Pexels fails, try Pixabay
                if (!videoUrl && (pixabayKey || !pexelsKey)) {
                  try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 6000);
                    const pixabayResponse = await fetch(
                      `/api/pixabay/search?query=${encodeURIComponent(query)}`,
                      {
                        headers: { "x-pixabay-key": pixabayKey || "" },
                        signal: controller.signal,
                      },
                    );
                    clearTimeout(timeout);
                    if (pixabayResponse.ok) {
                      const text = await pixabayResponse.text();
                      if (text && !text.trim().startsWith("<")) {
                        const pixabayData = JSON.parse(text);
                        if (pixabayData.hits?.length > 0) {
                          const bestClip = pixabayData.hits[0];
                          const videos = bestClip.videos || {};
                          const selectedVid =
                            videos.large ||
                            videos.medium ||
                            videos.small ||
                            videos.tiny;
                          const previewVid =
                            videos.tiny ||
                            videos.small ||
                            videos.medium ||
                            videos.large;
                          if (selectedVid) {
                            videoUrl = selectedVid.url;
                            previewUrl = previewVid?.url || videoUrl;
                            videoThumb = bestClip.picture_id
                              ? `https://i.vimeocdn.com/video/${bestClip.picture_id}_295x166.jpg`
                              : "";
                            author = bestClip.user || "Pixabay Creator";
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.warn(`Pixabay try for "${query}" failed/timed out:`, e);
                  }
                }

                // If Pexels & Pixabay fail, try Coverr
                if (!videoUrl && (coverrKey || (!pexelsKey && !pixabayKey))) {
                  try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 6000);
                    const coverrResponse = await fetch(
                      `/api/coverr/search?query=${encodeURIComponent(query)}`,
                      {
                        headers: { "x-coverr-key": coverrKey || "" },
                        signal: controller.signal,
                      },
                    );
                    clearTimeout(timeout);
                    if (coverrResponse.ok) {
                      const text = await coverrResponse.text();
                      if (text && !text.trim().startsWith("<")) {
                        const coverrData = JSON.parse(text);
                        if (coverrData.hits?.length > 0) {
                          const bestClip = coverrData.hits[0];
                          const selectedVid = bestClip.urls?.mp4 || bestClip.urls?.mp4_download || '';
                          if (selectedVid) {
                            videoUrl = selectedVid;
                            videoThumb = bestClip.thumbnail || "";
                            author = bestClip.author?.name || "Coverr Creator";
                          }
                        }
                      }
                    }
                  } catch (e) {
                    console.warn(`Coverr try for "${query}" failed/timed out:`, e);
                  }
                }
              }

              // Fallback to stock catalog if both APIs returned zero
              if (!videoUrl) {
                const fallbackVid = DEFAULT_CATALOG[i % DEFAULT_CATALOG.length];
                videoUrl = fallbackVid.url;
                videoThumb = fallbackVid.thumbnail;
                author = fallbackVid.author;
              }

              // Ultimate security failover
              if (!videoUrl) {
                videoUrl =
                  "https://samplelib.com/lib/preview/mp4/sample-5s.mp4";
              }
            }

            return {
              id: scene.id || `sc_${i}_${Date.now()}`,
              text: scene.text,
              keywords: scene.keywords,
              caption: scene.caption || scene.text,
              duration: scene.duration || 4.5,
              videoUrl,
              previewUrl: previewUrl || videoUrl,
              videoThumb,
              videoAuthor: author,
              videoAuthorUrl: "#",
              voiceoverUrl: getTtsUrl(scene.text, projectConfig.voiceLanguage),
              originalIndex: i,
              transitionToNext: "random" as any,
            };
          }),
        );

        setScenes(populatedScenes);
      } else {
        // Veo Mode: Generate AI Video
        setLoadingStage(
          language === "am"
            ? `🎬 የቪኦ ቪዲዮ መፍጠር ተጀምሯል (${rawScenes.length} ክፍሎች)...`
            : `🎬 Dreaming ${rawScenes.length} AI scenes with Veo...`,
        );

        const populatedScenes: Scene[] = await Promise.all(
          rawScenes.map(async (scene: any, i: number) => {
            try {
              // Step 1: Start Generation
              const genRes = await fetch("/api/generate-video", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: scene.keywords }),
              });
              const { operationName } = await genRes.json();

              if (!operationName)
                throw new Error("Could not start Veo operation");

              // Step 2: Poll for completion
              let isDone = false;
              let attempts = 0;
              while (!isDone && attempts < 60) {
                // Max 10 mins
                attempts++;
                await new Promise((r) => setTimeout(r, 10000)); // Poll every 10s
                setLoadingStage(
                  language === "am"
                    ? `✨ ክፍል ${i + 1} እየተሰራ ነው... (${attempts * 10} ሰከንድ)`
                    : `✨ Generating Scene ${i + 1}... (${attempts * 10}s)`,
                );

                const pollRes = await fetch("/api/video-status", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ operationName }),
                });
                const pollData = await pollRes.json();
                isDone = pollData.done;
              }

              if (!isDone) throw new Error("Veo generation timed out");

              // Step 3: Success URL
              // In the real flow we'd use /api/video-download, but for the canvas we'll proxy it
              const videoUrl = `/api/video-download-get?op=${encodeURIComponent(operationName)}`;

              return {
                id: scene.id || `sc_${i}_${Date.now()}`,
                text: scene.text,
                keywords: scene.keywords,
                caption: scene.caption || scene.text,
                duration: scene.duration || 4.5,
                videoUrl,
                videoThumb: "", // Veo doesn't give thumb easily
                videoAuthor: "Veo 3.1 AI",
                videoAuthorUrl: "#",
                voiceoverUrl: getTtsUrl(scene.text, projectConfig.voiceLanguage),
                originalIndex: i,
                transitionToNext: "random" as any,
              };
            } catch (e) {
              console.warn("Veo scene failed, using stock fallback:", e);
              const fallbackVid = DEFAULT_CATALOG[i % DEFAULT_CATALOG.length];
              return {
                id: scene.id || `sc_${i}_${Date.now()}`,
                text: scene.text,
                keywords: scene.keywords,
                caption: scene.caption || scene.text,
                duration: scene.duration || 4.5,
                videoUrl: fallbackVid.url,
                previewUrl: fallbackVid.url,
                videoThumb: fallbackVid.thumbnail,
                videoAuthor: fallbackVid.author,
                videoAuthorUrl: "#",
                voiceoverUrl: getTtsUrl(scene.text, projectConfig.voiceLanguage),
                originalIndex: i,
                transitionToNext: "random" as any,
              };
            }
          }),
        );

        setScenes(populatedScenes);
      }

      setPlaybackIndex(0);
    } catch (err: any) {
      console.warn("Generation failed:", err);
      // Better local fallback: support Amharic punctuation and sequential logic
      const sentences = script
        .split(/(?<=[.!?።፤፧])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const manualScenes: Scene[] = sentences.map((s, index) => {
        const fallbackVid = DEFAULT_CATALOG[index % DEFAULT_CATALOG.length];
        return {
          id: `manual_sc_${index}_${Date.now()}`,
          text: s.trim(),
          keywords: "cinematic landscape",
          caption: s.trim(),
          duration: Math.max(4.0, s.split(/\s+/).length / 2.1),
          videoUrl: fallbackVid.url,
          previewUrl: fallbackVid.url,
          videoThumb: fallbackVid.thumbnail,
          videoAuthor: fallbackVid.author,
          videoAuthorUrl: "#",
          voiceoverUrl: null,
          originalIndex: index,
          transitionToNext: "random" as any,
        };
      });

      setScenes(manualScenes);
      setPlaybackIndex(0);
      alert(
        language === "am"
          ? "AI ማቀናበሩ አልተሳካም። ቀለል ያለ አማራጭ እየተጠቀምን ነው።"
          : "AI analysis failed. Using a simplified local breakdown.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Modify individual scene keys
  const handleUpdateScene = (sceneId: string, updatedData: Partial<Scene>) => {
    setScenes((prev) =>
      prev.map((scene) => {
        if (scene.id === sceneId) {
          return { ...scene, ...updatedData };
        }
        return scene;
      }),
    );
  };

  // Dynamic Scene addition
  const handleAddScene = () => {
    const fallbackCatalogIdx = scenes.length;
    const fallbackVid =
      DEFAULT_CATALOG[fallbackCatalogIdx % DEFAULT_CATALOG.length];

    const newScene: Scene = {
      id: `sc_new_${Date.now()}`,
      text: "Add some beautiful narrative phrase here.",
      keywords: "cinematic corporate visual",
      caption: "Add some beautiful narrative phrase here.",
      duration: 5.0,
      videoUrl: fallbackVid.url,
      previewUrl: fallbackVid.url,
      videoThumb: fallbackVid.thumbnail,
      videoAuthor: fallbackVid.author,
      videoAuthorUrl: "#",
      voiceoverUrl: null,
      originalIndex: scenes.length,
      transitionToNext: "random" as any,
    };

    setScenes([...scenes, newScene]);
    setPlaybackIndex(scenes.length);
  };

  const handleDeleteScene = (sceneId: string) => {
    if (scenes.length <= 1) return;

    const targetIdx = scenes.findIndex((s) => s.id === sceneId);
    const filtered = scenes.filter((s) => s.id !== sceneId);
    setScenes(filtered);

    if (playbackIndex === targetIdx) {
      setPlaybackIndex(Math.max(0, targetIdx - 1));
    } else if (playbackIndex > targetIdx) {
      setPlaybackIndex((prev) => prev - 1);
    }
  };

  // Segment order sorting
  const handleMoveScene = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= scenes.length) return;

    const copy = [...scenes];
    const target = copy[index];
    copy[index] = copy[nextIndex];
    copy[nextIndex] = target;

    setScenes(copy);
    setPlaybackIndex(nextIndex);
  };

  const handleSelectScene = useCallback(
    (sceneId: string) => {
      const idx = scenes.findIndex((s) => s.id === sceneId);
      if (idx !== -1) {
        setPlaybackIndex(idx);
      }
    },
    [scenes],
  );

  const handleUpdateConfig = useCallback(
    (updated: Partial<ProjectConfig>) => {
      setProjectConfig((prev) => {
        const nextConfig = { ...prev, ...updated };
        if (updated.subtitleStyle) {
          nextConfig.subtitleStyle = {
            ...prev.subtitleStyle,
            ...updated.subtitleStyle
          };
        }
        return nextConfig;
      });
    },
    [setProjectConfig]
  );

  const handleLoadSavedProject = (project: SavedProject) => {
    setScript(project.script);
    setScenes(project.scenes);
    setProjectConfig(project.projectConfig);
    setPlaybackIndex(0);
    setIsPlaying(false);
  };

  return (
    <AccessGate>
      <div className="min-h-screen bg-[#020617] text-slate-100 font-sans antialiased pb-12 selection:bg-cyan-500/30 selection:text-cyan-200">
        {/* Absolute visual space sparks */}
        <div className="fixed top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-cyan-950/20 via-blue-900/10 to-transparent blur-[120px] pointer-events-none" />
        <div className="absolute top-4 left-6 py-1 px-3 bg-cyan-500/10 border border-cyan-500/20 text-[10px] uppercase font-mono tracking-widest text-cyan-400 rounded-full flex items-center gap-1.5 shadow-lg shadow-cyan-500/5">
          <Sparkles size={11} className="fill-current text-cyan-500" />
          YOTOR STUDIO NEXUS
        </div>

        {/* Main Container Head */}
        <header className="max-w-[90rem] mx-auto px-6 pt-16 pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 relative z-10 border-b border-white/5">
          <div>
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-gradient-to-br from-cyan-400 to-blue-600 text-white rounded-2xl shadow-xl shadow-cyan-500/20 ring-1 ring-white/10">
                <Video size={26} className="text-white drop-shadow-md" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_12px_rgba(34,211,238,0.8)] animate-pulse"></span>
                  <span className="text-[10px] uppercase tracking-[0.25em] font-black text-cyan-400">
                    {t.logo_sub || "CINEMATIC ENGINE"}
                  </span>
                </div>
                <h1 className="text-4xl font-black text-white font-sans tracking-tight uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                  {t.studio_title}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-3">
            {/* Visual Undo Button */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-2xl border transition-all text-[10px] uppercase tracking-wider font-bold ${
                undoStack.length > 0
                  ? "bg-slate-900/80 backdrop-blur-md border-white/10 text-slate-200 hover:bg-slate-800 hover:text-white hover:border-white/20 active:scale-[0.98]"
                  : "bg-slate-950/40 border-white/5 text-slate-600 cursor-not-allowed opacity-50"
              }`}
              title={language === "am" ? "ድርጊት መልስ (Ctrl+Z)" : "Undo Last Action (Ctrl+Z)"}
            >
              <Undo2 size={13} className={undoStack.length > 0 ? "text-indigo-400" : "text-slate-600"} />
              <span className="hidden xl:inline">{language === "am" ? "መልስ" : "Undo"}</span>
            </button>

            {/* Visual Redo Button */}
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className={`flex items-center justify-center gap-1.5 px-3.5 py-3 rounded-2xl border transition-all text-[10px] uppercase tracking-wider font-bold ${
                redoStack.length > 0
                  ? "bg-slate-900/80 backdrop-blur-md border-white/10 text-slate-200 hover:bg-slate-800 hover:text-white hover:border-white/20 active:scale-[0.98]"
                  : "bg-slate-950/40 border-white/5 text-slate-600 cursor-not-allowed opacity-50"
              }`}
              title={language === "am" ? "የተመለሰውን መልስ (Ctrl+Y)" : "Redo Action (Ctrl+Y)"}
            >
              <Redo2 size={13} className={redoStack.length > 0 ? "text-indigo-400" : "text-slate-600"} />
              <span className="hidden xl:inline">{language === "am" ? "ድገም" : "Redo"}</span>
            </button>

            {/* Elegant Settings Toggle Button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-900/80 backdrop-blur-md border border-white/10 hover:border-white/20 hover:bg-slate-800 text-slate-300 hover:text-white text-[10px] uppercase tracking-widest font-bold rounded-2xl transition-all relative"
            >
              <Settings size={14} className="text-slate-400" />
              <span>{t.settings}</span>
              {deferredPrompt && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500 ring-2 ring-[#020617]"></span>
                </span>
              )}
            </button>

            {/* Application Refresh / Hard Reset */}
            <button
              type="button"
              onClick={() => {
                const replacer = (key: string, value: any) => {
                  if (value instanceof Element || (value && typeof value === 'object' && value.current !== undefined)) return undefined;
                  if (value && typeof value === 'object' && value.toString && value.toString() === '[object HTMLAudioElement]') return undefined;
                  return value;
                };
                const activeDraft = { script, scenes, projectConfig };
                localStorage.setItem("yotor_active_draft", JSON.stringify(activeDraft, replacer));
                window.location.reload();
              }}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-slate-900/80 backdrop-blur-md border border-white/10 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-white/20 text-[10px] uppercase tracking-widest font-bold rounded-2xl transition-all"
              title="Refresh / Reload Application"
            >
              <RefreshCw size={14} />
              <span className="hidden sm:inline">Refresh App</span>
            </button>


            <button
              onClick={() => setIsRenderOpen(true)}
              disabled={scenes.length === 0}
              className="group relative flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-[11px] uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-30 disabled:pointer-events-none active:scale-[0.98] ring-1 ring-white/20"
              id="bake-video-btn"
            >
              <Download size={16} className="stroke-[2.5px] drop-shadow-md" />
              {t.ready_to_export}
            </button>
          </div>
        </header>

        {/* Primary Layout Grid */}
        <main className="max-w-[90rem] mx-auto px-6 pt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
          {/* Left Column: Inputs & Scenarios Sequence (Grids 7) */}
          <div className="lg:col-span-7 space-y-8 flex flex-col">
            <ScriptInput
              script={script}
              setScript={setScript}
              onAnalyze={handleAnalyzeScript}
              isLoading={isLoading}
              loadingStage={loadingStage}
              language={language}
            />

            <Timeline
              scenes={scenes}
              activeSceneId={activeSceneId}
              onSelectScene={handleSelectScene}
              onUpdateScene={handleUpdateScene}
              onAddScene={handleAddScene}
              onDeleteScene={handleDeleteScene}
              onMoveScene={handleMoveScene}
              language={language}
              visualStyle={projectConfig.visualStyle}
              projectConfig={projectConfig}
              onUpdateConfig={handleUpdateConfig}
              voiceoverPeaks={voiceoverPeaks}
            />
          </div>

          {/* Right Column: Composite Viewer Studio Console (Grids 5) */}
          <div className="lg:col-span-5 h-full">
            <div className="sticky top-6">
              <VideoCanvas
                scenes={scenes}
                setScenes={setScenes}
                activeSceneId={activeSceneId}
                onSelectScene={handleSelectScene}
                projectConfig={projectConfig}
                onUpdateConfig={handleUpdateConfig}
                playbackIndex={playbackIndex}
                setPlaybackIndex={setPlaybackIndex}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                isRendering={isRenderOpen}
                exportQuality={exportQuality}
                canvasRef={canvasRef}
                renderTime={renderTime}
                language={language}
                voiceoverPeaks={voiceoverPeaks}
                setVoiceoverPeaks={setVoiceoverPeaks}
              />
            </div>
          </div>
        </main>

        {/* Floating rendering wizard panel */}
        <RenderModal
          isOpen={isRenderOpen}
          onClose={() => {
            setIsRenderOpen(false);
            setRenderTime(undefined);
          }}
          scenes={scenes}
          projectConfig={projectConfig}
          canvasElement={canvasRef.current}
          onRenderFrameChange={(idx, time) => {
            setPlaybackIndex(idx);
            setRenderTime(time);
          }}
          language={language}
          voiceoverPeaks={voiceoverPeaks}
          onRestoreProject={(restoredScenes, restoredConfig) => {
            setScenes(restoredScenes);
            setProjectConfig(restoredConfig);
          }}
          exportQuality={exportQuality}
          setExportQuality={setExportQuality}
        />

        {/* App Settings and PWA Installer Modal */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
            <div className="relative w-full max-w-lg bg-[#0c0c0e] border border-zinc-800/80 rounded-3xl overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between p-5 border-b border-zinc-900 bg-zinc-950/40">
                <div className="flex items-center gap-2">
                  <Settings size={18} className="text-indigo-400" />
                  <h3 className="text-sm font-bold text-white tracking-tight uppercase">
                    {language === "am"
                      ? "የመተግበሪያ ቅንብሮች & መጫኛ"
                      : "Settings & App Installer"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1 px-2.5 bg-zinc-900 hover:bg-zinc-850 hover:text-white text-zinc-400 rounded-lg text-xs transition-all font-mono"
                >
                  ESC ✕
                </button>
              </div>

              {/* Content body */}
              <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
                {/* 1. Voice / Narration Settings (The requested "Voice memokriya" - Prominent / Front) */}
                <div className="space-y-4 pb-5 border-b border-zinc-900/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[10px] font-mono text-zinc-550 uppercase tracking-widest block">
                        {language === "am"
                          ? "የድምፅ ንባብ (Voiceover Narration)"
                          : "Voiceover Narration"}
                      </label>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {language === "am"
                          ? "ቪዲዮው ላይ የሰው ድምፅ እንዲኖር ያድርጉ።"
                          : "Enable realistic narration for your project."}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        handleUpdateConfig({
                          isVoiceEnabled: !projectConfig.isVoiceEnabled,
                        })
                      }
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none ${
                        projectConfig.isVoiceEnabled
                          ? "bg-indigo-600"
                          : "bg-zinc-800"
                      }`}
                    >
                      <span
                        className={`pointer-events-none absolute left-0 inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
                          projectConfig.isVoiceEnabled
                            ? "translate-x-[22px]"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {projectConfig.isVoiceEnabled && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block">
                          Select Narration Voice / ድምፅ ይምረጡ
                        </span>
                        <select
                          value={
                            projectConfig.voiceLanguage || "am-yotor-epic-male"
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            let type: "male" | "female" = "male";
                            if (val.includes("female")) type = "female";
                            handleUpdateConfig({
                              voiceLanguage: val,
                              voiceType: type,
                            });
                          }}
                          className="w-full bg-zinc-950 border border-zinc-900 text-zinc-300 text-xs rounded-xl px-3 py-2.5 outline-none cursor-pointer hover:border-zinc-800 transition-all font-sans"
                        >
                          {GOOGLE_TTS_LANGUAGES.map((langOpt) => (
                            <option key={langOpt.code} value={langOpt.code}>
                              {langOpt.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={handleTestVoice}
                        className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-indigo-400 hover:text-indigo-300 font-bold text-[11px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        🔊{" "}
                        {language === "am"
                          ? "የድምፅ መሞከሪያ (Memokriya)"
                          : "Test Voice Output"}
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Visual Style Selection (Animation support requested) */}
                <div className="space-y-4 pb-5 border-b border-zinc-900/40">
                  <div>
                    <label className="text-[10px] font-mono text-zinc-550 uppercase tracking-widest block">
                      {translations[language].visual_style_title}
                    </label>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {translations[language].visual_style_desc}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {VISUAL_STYLES.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() =>
                          handleUpdateConfig({ visualStyle: style.id as any })
                        }
                        className={`flex flex-col items-start p-2.5 rounded-xl border transition-all text-left ${
                          projectConfig.visualStyle === style.id
                            ? "bg-indigo-600/10 border-indigo-600/50 ring-1 ring-indigo-600/20"
                            : "bg-zinc-950 border-zinc-900 hover:border-zinc-800"
                        }`}
                      >
                        <span
                          className={`text-[11px] font-bold ${projectConfig.visualStyle === style.id ? "text-indigo-400" : "text-zinc-300"}`}
                        >
                          {language === "am" ? style.am : style.name}
                        </span>
                        <span className="text-[9px] text-zinc-500 mt-0.5 line-clamp-1">
                          {style.id === "realistic"
                            ? "Cinematic 4K"
                            : style.id.replace("-", " ")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Video Color Grading & Filters */}
                <div className="space-y-4 pb-5 border-b border-zinc-900/40">
                  <div>
                    <label className="text-[10px] font-mono text-zinc-550 uppercase tracking-widest block">
                      {language === "am"
                        ? "የቪዲዮ ቀለም ቅንብር እና ፊልተሮች (Color Grading & Filters)"
                        : "Video Color Grading & Filters"}
                    </label>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {language === "am"
                        ? "ለቪዲዮዎ አስደናቂ ሲኒማቲክ ገጽታ ለመስጠት የቀለም ፊልተር ይምረጡ።"
                        : "Apply high-quality color grading to make your storyboard cinematic."}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { id: "none", name: "Original", am: "ያለ ፊልተር", desc: "No color filter" },
                      { id: "teal", name: "Cinematic Teal", am: "ሲኒማቲክ ቲል", desc: "Teal & Orange tint" },
                      { id: "high-contrast", name: "High Contrast", am: "ከፍተኛ ንፅፅር", desc: "Bold punchy look" },
                      { id: "grayscale", name: "Grayscale", am: "ጥቁር እና ነጭ", desc: "Classic monochrome" },
                      { id: "sepia", name: "Warm Sepia", am: "ሞቃታማ ሴፒያ", desc: "Vintage golden tone" },
                      { id: "vintage", name: "Retro Vintage", am: "ጥንታዊ (ቪንቴጅ)", desc: "Aged film effect" },
                    ].map((filt) => (
                      <button
                        key={filt.id}
                        type="button"
                        onClick={() =>
                          handleUpdateConfig({ videoFilter: filt.id as any })
                        }
                        className={`flex flex-col items-start p-2.5 rounded-xl border transition-all text-left ${
                          (projectConfig.videoFilter || "none") === filt.id
                            ? "bg-indigo-600/10 border-indigo-600/50 ring-1 ring-indigo-600/20"
                            : "bg-zinc-950 border-zinc-900 hover:border-zinc-800"
                        }`}
                      >
                        <span
                          className={`text-[11px] font-bold ${
                            (projectConfig.videoFilter || "none") === filt.id
                              ? "text-indigo-400"
                              : "text-zinc-300"
                          }`}
                        >
                          {language === "am" ? filt.am : filt.name}
                        </span>
                        <span className="text-[9px] text-zinc-500 mt-0.5">
                          {filt.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. App Language Config */}
                <div className="space-y-2 pb-5 border-b border-zinc-900/40">
                  <label className="text-[10px] font-mono text-zinc-550 uppercase tracking-widest block">
                    {language === "am"
                      ? "የመተግበሪያ ቋንቋ / App Language"
                      : "App Language"}
                  </label>
                  <p className="text-[11px] text-zinc-400">
                    {language === "am"
                      ? "የስቱዲዮውን አጠቃላይ ገፅታ ቋንቋ ይቀይሩ።"
                      : "Toggle translation of Yotor Cinematic Studio."}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 bg-zinc-950 rounded-xl p-1.5 border border-zinc-900/60 w-fit">
                    <button
                      type="button"
                      onClick={() => handleLanguageChange("am")}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                        language === "am"
                          ? "bg-indigo-600 text-white shadow"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      አማርኛ 🇪🇹
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange("en")}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                        language === "en"
                          ? "bg-indigo-600 text-white shadow"
                          : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      English 🇬🇧
                    </button>
                  </div>
                </div>

                {/* 3.5. Watermark Overlay Configuration */}
                <div className="space-y-4 pb-5 border-b border-zinc-900/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[10px] font-mono text-zinc-550 uppercase tracking-widest block">
                        {language === "am"
                          ? "ዋተርማርክ / አርማ (Watermark & Logo)"
                          : "Watermark & Logo Overlay"}
                      </label>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {language === "am"
                          ? "በቪዲዮው ላይ የራስዎን ጽሑፍ ወይም አርማ ማከል ይችላሉ።"
                          : "Overlay a custom text or brand logo onto the video canvas."}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        handleUpdateConfig({
                          watermarkEnabled: !projectConfig.watermarkEnabled,
                        })
                      }
                      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none ${
                        projectConfig.watermarkEnabled
                          ? "bg-indigo-600"
                          : "bg-zinc-800"
                      }`}
                    >
                      <span
                        className={`pointer-events-none absolute left-0 inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
                          projectConfig.watermarkEnabled
                            ? "translate-x-[22px]"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {projectConfig.watermarkEnabled && (
                    <div className="space-y-4 pt-1 animate-fadeIn">
                      {/* Watermark Type Selection */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block">
                          {language === "am" ? "የዋተርማርክ ዓይነት" : "Watermark Type"}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateConfig({ watermarkType: "text" })}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                              projectConfig.watermarkType === "text"
                                ? "bg-indigo-600/10 border-indigo-500/50 text-indigo-400"
                                : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                            }`}
                          >
                            {language === "am" ? "ጽሑፍ (Text)" : "Text Label"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateConfig({ watermarkType: "logo" })}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all ${
                              projectConfig.watermarkType === "logo"
                                ? "bg-indigo-600/10 border-indigo-500/50 text-indigo-400"
                                : "bg-zinc-950 border-zinc-900 text-zinc-400 hover:border-zinc-800"
                            }`}
                          >
                            {language === "am" ? "አርማ ምስል" : "Logo Image"}
                          </button>
                        </div>
                      </div>

                      {/* Dynamic content depending on type */}
                      {projectConfig.watermarkType === "text" ? (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block">
                            {language === "am" ? "የዋተርማርክ ጽሑፍ" : "Watermark Text"}
                          </span>
                          <input
                            type="text"
                            value={projectConfig.watermarkText || ""}
                            onChange={(e) => handleUpdateConfig({ watermarkText: e.target.value })}
                            placeholder="e.g. @my_channel"
                            className="w-full bg-zinc-950 border border-zinc-900 text-zinc-300 text-xs rounded-xl px-3 py-2 outline-none hover:border-zinc-800 transition-all font-sans"
                          />
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block">
                            {language === "am" ? "አርማ (ምስል ፋይል) ይጫኑ" : "Upload Logo Image"}
                          </span>
                          <div className="flex items-center gap-3">
                            {projectConfig.watermarkLogoUrl ? (
                              <div className="w-12 h-12 rounded-xl border border-zinc-800 bg-zinc-950/40 p-1 flex items-center justify-center overflow-hidden shrink-0">
                                <img
                                  src={projectConfig.watermarkLogoUrl}
                                  alt="Logo Watermark"
                                  className="max-w-full max-h-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-xl border border-dashed border-zinc-800 flex items-center justify-center text-zinc-600 text-[10px] font-mono shrink-0">
                                Empty
                              </div>
                            )}
                            <label className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-950 hover:bg-zinc-900/60 transition-all rounded-xl py-3 px-4 cursor-pointer text-center">
                              <span className="text-[10px] font-bold text-indigo-400">
                                {language === "am" ? "ምስል ለመምረጥ እዚህ ይጫኑ" : "Choose / Drag Logo File"}
                              </span>
                              <span className="text-[8px] text-zinc-500 mt-0.5">PNG, JPG or SVG</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      handleUpdateConfig({
                                        watermarkLogoUrl: reader.result as string,
                                      });
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Watermark Position Selection */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider block">
                          {language === "am" ? "የአቀማመጥ ምርጫ" : "Position On Screen"}
                        </span>
                        <select
                          value={projectConfig.watermarkPosition || "bottom-right"}
                          onChange={(e) => handleUpdateConfig({ watermarkPosition: e.target.value as any })}
                          className="w-full bg-zinc-950 border border-zinc-900 text-zinc-300 text-xs rounded-xl px-3 py-2 outline-none cursor-pointer hover:border-zinc-800 transition-all font-sans"
                        >
                          <option value="top-left">{language === "am" ? "ላይኛ ግራ (Top Left)" : "Top Left"}</option>
                          <option value="top-right">{language === "am" ? "ላይኛ ቀኝ (Top Right)" : "Top Right"}</option>
                          <option value="bottom-left">{language === "am" ? "ታችኛ ግራ (Bottom Left)" : "Bottom Left"}</option>
                          <option value="bottom-right">{language === "am" ? "ታችኛ ቀኝ (Bottom Right)" : "Bottom Right"}</option>
                          <option value="center">{language === "am" ? "መሃል ላይ (Center)" : "Center"}</option>
                        </select>
                      </div>

                      {/* Sliders for Opacity and Size */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span className="text-zinc-500">{language === "am" ? "ግልፅነት (Opacity)" : "Opacity"}</span>
                            <span className="text-indigo-400 font-bold">{Math.round((projectConfig.watermarkOpacity ?? 0.6) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={projectConfig.watermarkOpacity ?? 0.6}
                            onChange={(e) => handleUpdateConfig({ watermarkOpacity: parseFloat(e.target.value) })}
                            className="w-full h-1 bg-zinc-800 rounded appearance-none accent-indigo-500 cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span className="text-zinc-500">{language === "am" ? "መጠን (Scale)" : "Scale / Size"}</span>
                            <span className="text-indigo-400 font-bold">{projectConfig.watermarkSize ?? 14}px</span>
                          </div>
                          <input
                            type="range"
                            min="8"
                            max="36"
                            step="1"
                            value={projectConfig.watermarkSize ?? 14}
                            onChange={(e) => handleUpdateConfig({ watermarkSize: parseInt(e.target.value) })}
                            className="w-full h-1 bg-zinc-800 rounded appearance-none accent-indigo-500 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. PWA Installer */}
                {deferredPrompt && (
                  <div className="pt-5 mt-2 border-t border-zinc-900/40">
                    <button
                      onClick={triggerPwaInstall}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold font-mono uppercase tracking-widest transition-colors shadow-lg shadow-emerald-900/20"
                    >
                      <Download size={16} />
                      {language === "am"
                        ? "አፑን ወደ ስልክዎ ይጫኑ (Install Android App)"
                        : "Install App to Device"}
                    </button>
                    <p className="text-[10px] text-zinc-500 text-center mt-2 font-sans leading-relaxed">
                      {language === "am" 
                         ? "ይህንን መተግበሪያ እንደ አፕሊኬሽን ስልክዎ ላይ ይጫኑት። ከጫኑት በኋላ በፍጥነት እና በሙሉ ስክሪን መጠቀም ይችላሉ።" 
                         : "Install this app on your device for the best full-screen experience."}
                    </p>
                  </div>
                )}

                {/* 5. Project Library / Archives */}
                <div className="pt-5 mt-2 border-t border-zinc-900/40">
                  <ProjectLibrary
                    currentScript={script}
                    currentScenes={scenes}
                    currentConfig={projectConfig}
                    onLoadProject={(project) => {
                      handleLoadSavedProject(project);
                      setIsSettingsOpen(false); // Close settings when a project is loaded
                    }}
                    language={language}
                  />
                </div>
              </div>

              {/* Close Button Bottom Area */}
              <div className="flex justify-end p-4 border-t border-zinc-900 bg-zinc-950/40">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all uppercase"
                >
                  {language === "am" ? "አረጋግጥ / ጨርስ" : "Done & Close"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AccessGate>
  );
}
