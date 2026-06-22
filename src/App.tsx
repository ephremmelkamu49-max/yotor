import React, { useState, useEffect, useRef, useCallback } from "react";
import { Scene, ProjectConfig, AspectRatio } from "./types";
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
import { Language, translations } from "./translations";
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
} from "lucide-react";

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem("app_language") as Language) || "am";
  });

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("app_language", lang);
  };

  const t = translations[language];

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [script, setScript] = useState<string>(
    "We stand on the edge of a new cosmos. Stars flicker in the endless fabric of space, calling us to explore what lies beyond. For generations, we have looked up and wondered. Now, we build the engines of discovery. We journey through deep nebulae, seeking new horizons and celestial wonders. This is the story of our infinite horizon, and the endless search for knowledge.",
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStage, setLoadingStage] = useState<string>(
    "Analyzing narration text...",
  );
  const [pexelsKey, setPexelsKey] = useState<string>(() => {
    return localStorage.getItem("pexels_api_key") || "";
  });
  const [pixabayKey, setPixabayKey] = useState<string>(() => {
    return localStorage.getItem("pixabay_api_key") || "";
  });
  const [coverrKey, setCoverrKey] = useState<string>(() => {
    return localStorage.getItem("coverr_api_key") || "";
  });
  const [isRenderOpen, setIsRenderOpen] = useState<boolean>(false);

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
    aspectRatio: "16:9",
    musicTrack: DEFAULT_MUSIC[1].url, // Meditative pad default
    musicVolume: 0.12,
    voiceLanguage: "am-yotor-epic-male",
    voiceType: "male",
    subtitleStyle: {
      enabled: true,
      fontSize: 32,
      color: "#FFFFFF",
      backgroundColor: "rgba(0, 0, 0, 0.45)",
      position: "bottom",
      fontFamily: "Space Grotesk",
      uppercase: true,
      animation: "none",
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
          voiceoverUrl: `/api/tts?text=${encodeURIComponent(s.text)}&lang=${projectConfig.voiceLanguage}&openai_key=${localStorage.getItem("openai_api_key") || ""}`,
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
    const url = `/api/tts?text=${encodeURIComponent(testText)}&lang=${projectConfig.voiceLanguage}&openai_key=${localStorage.getItem("openai_api_key") || ""}`;
    const audio = new Audio(url);
    audio.play().catch((e) => console.error("Voice test failed:", e));
  };

  const loadStartupCosmicTemplate = () => {
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
        videoThumb: fallbackVid.thumbnail,
        videoAuthor: fallbackVid.author,
        videoAuthorUrl: "#",
        voiceoverUrl: null,
        originalIndex: index,
      };
    });

    setScenes(initialScenes);
    setPlaybackIndex(0);
  };

  // Triggers Gemini parser pipeline
  const handleAnalyzeScript = async (
    scriptText: string,
    providedPexelsKey: string,
    providedPixabayKey: string,
    providedCoverrKey: string,
    providedOpenaiKey: string,
    videoMode: "stock" | "veo" = "stock",
    inputMode: "script" | "keywords" = "script",
  ) => {
    setIsLoading(true);
    setLoadingStage(
      videoMode === "veo" ? t.stage_veo_dreaming : t.stage_analyzing_director,
    );
    // Sync credentials
    setPexelsKey(providedPexelsKey);
    setPixabayKey(providedPixabayKey);
    setCoverrKey(providedCoverrKey);
    setIsPlaying(false);
    setPlaybackIndex(0);

    try {
      const response = await fetch("/api/analyze-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-openai-key": providedOpenaiKey,
        },
        body: JSON.stringify({
          script: scriptText,
          visualStyle: projectConfig.visualStyle,
          isKeywordsOnly: inputMode === "keywords",
        }),
      });

      const data = await response.json();

      if (data.openaiError) {
        console.warn("OpenAI API fallback triggered:", data.openaiError);
      }

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
            let videoThumb = "";
            let author = "";

            // Random jitter to spread out hits slightly even in parallel
            await new Promise((r) => setTimeout(r, i * 120));

            const searchQuery = `${stylePrefix}${scene.keywords}`;

            if (videoMode === "pollinations") {
              // Use Pollinations AI (Free 3D Animation Image Generator)
              const seed = Math.floor(Math.random() * 1000000);
              videoUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(searchQuery)}?width=1280&height=720&nologo=true&seed=${seed}`;
              videoThumb = videoUrl;
              author = "Pollinations Model";
            } else {
              if (providedPexelsKey) {
                try {
                  const controller = new AbortController();
                  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout for Pexels
                  const pexelsResponse = await fetch(
                    `/api/pexels/search?query=${encodeURIComponent(searchQuery)}`,
                    {
                      headers: { "x-pexels-key": providedPexelsKey },
                      signal: controller.signal,
                    },
                  );
                  clearTimeout(timeout);
                  const pexelsData = await pexelsResponse.json();
                  if (pexelsResponse.ok && pexelsData.videos?.length > 0) {
                    const bestClip = pexelsData.videos[0];
                    const files = bestClip.video_files || [];
                    const mp4Files = files.filter(
                      (f: any) =>
                        f.file_type === "video/mp4" || f.link.includes(".mp4"),
                    );
                    const hd = mp4Files.find(
                      (f: any) => f.width >= 1280 && f.width <= 1920,
                    );
                    const sd = mp4Files.find((f: any) => f.width < 1280);
                    videoUrl = hd?.link || sd?.link || mp4Files[0]?.link || "";
                    videoThumb = bestClip.video_pictures?.[0]?.picture || "";
                    author = bestClip.user?.name || "Stock Creator";
                  }
                } catch (e) {
                  console.warn("Pexels fetch error/timeout:", e);
                }
              }

              if (!videoUrl && providedPixabayKey) {
                try {
                  const controller = new AbortController();
                  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout for Pixabay
                  const pixabayResponse = await fetch(
                    `/api/pixabay/search?query=${encodeURIComponent(searchQuery)}`,
                    {
                      headers: { "x-pixabay-key": providedPixabayKey },
                      signal: controller.signal,
                    },
                  );
                  clearTimeout(timeout);
                  const pixabayData = await pixabayResponse.json();
                  if (pixabayResponse.ok && pixabayData.hits?.length > 0) {
                    const bestClip = pixabayData.hits[0];
                    const videos = bestClip.videos || {};
                    const selectedVid =
                      videos.large ||
                      videos.medium ||
                      videos.small ||
                      videos.tiny;
                    if (selectedVid) {
                      videoUrl = selectedVid.url;
                      videoThumb = bestClip.picture_id
                        ? `https://i.vimeocdn.com/video/${bestClip.picture_id}_295x166.jpg`
                        : "";
                      author = bestClip.user || "Pixabay Creator";
                    }
                  }
                } catch (e) {
                  console.warn("Pixabay fetch error/timeout:", e);
                }
              }

              if (!videoUrl) {
                const fallbackVid = DEFAULT_CATALOG[i % DEFAULT_CATALOG.length];
                videoUrl = fallbackVid.url;
                videoThumb = fallbackVid.thumbnail;
                author = fallbackVid.author;
              }

              // Ultimate safety failover if even catalog fails
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
              videoThumb,
              videoAuthor: author,
              videoAuthorUrl: "#",
              voiceoverUrl: `/api/tts?text=${encodeURIComponent(scene.text)}&lang=${projectConfig.voiceLanguage}&openai_key=${localStorage.getItem("openai_api_key") || ""}`,
              originalIndex: i,
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
                voiceoverUrl: `/api/tts?text=${encodeURIComponent(scene.text)}&lang=${projectConfig.voiceLanguage}&openai_key=${localStorage.getItem("openai_api_key") || ""}`,
                originalIndex: i,
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
                videoThumb: fallbackVid.thumbnail,
                videoAuthor: fallbackVid.author,
                videoAuthorUrl: "#",
                voiceoverUrl: `/api/tts?text=${encodeURIComponent(scene.text)}&lang=${projectConfig.voiceLanguage}&openai_key=${localStorage.getItem("openai_api_key") || ""}`,
                originalIndex: i,
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
      const sentences = scriptText
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
          videoThumb: fallbackVid.thumbnail,
          videoAuthor: fallbackVid.author,
          videoAuthorUrl: "#",
          voiceoverUrl: null,
          originalIndex: index,
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
      videoThumb: fallbackVid.thumbnail,
      videoAuthor: fallbackVid.author,
      videoAuthorUrl: "#",
      voiceoverUrl: null,
      originalIndex: scenes.length,
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
      setProjectConfig((prev) => ({ ...prev, ...updated }));
    },
    [setProjectConfig],
  );

  return (
    <AccessGate>
      <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans antialiased pb-12 selection:bg-indigo-500/30 selection:text-indigo-200">
        {/* Absolute visual space sparks */}
        <div className="fixed top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-indigo-950/10 via-zinc-900/5 to-transparent blur-[120px] pointer-events-none" />
        <div className="absolute top-4 left-6 py-1 px-3 bg-indigo-500/5 border border-indigo-500/15 text-[10px] uppercase font-mono tracking-widest text-indigo-400 rounded-full flex items-center gap-1.5 shadow">
          <Sparkles size={11} className="fill-current text-indigo-500" />
          YOTOR STUDIO PRO
        </div>

        {/* Main Container Head */}
        <header className="max-w-7xl mx-auto px-6 pt-12 pb-6 border-b border-zinc-900 flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-500/20">
                <Video size={24} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-pulse"></span>
                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-indigo-400">
                    {t.logo_sub}
                  </span>
                </div>
                <h1 className="text-3xl font-black text-white font-sans tracking-tighter uppercase">
                  {t.studio_title}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-3">
            {/* Elegant Language Selector Toggles */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 shadow-inner">
              <Languages size={14} className="text-zinc-500 ml-1 mr-1" />
              <button
                type="button"
                onClick={() => handleLanguageChange("am")}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
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
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                  language === "en"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                EN 🇬🇧
              </button>
            </div>

            {/* Elegant Settings Toggle Button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-[10px] uppercase tracking-widest font-bold rounded-xl transition-all relative"
            >
              <Settings size={14} className="text-zinc-400" />
              <span>{t.settings}</span>
              {deferredPrompt && (
                <span className="absolute -top-1 -right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </button>

            <a
              href={window.location.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 text-[10px] uppercase tracking-widest font-bold rounded-xl transition-all"
            >
              🌐 {t.full_web_view}
            </a>
            <button
              onClick={() => setIsRenderOpen(true)}
              disabled={scenes.length === 0}
              className="group relative flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-30 disabled:pointer-events-none active:scale-[0.98]"
              id="bake-video-btn"
            >
              <Download size={14} className="stroke-[2.5px]" />
              {t.ready_to_export}
            </button>
          </div>
        </header>

        {/* Primary Layout Grid */}
        <main className="max-w-7xl mx-auto px-6 pt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
          {/* Left Column: Inputs & Scenarios Sequence (Grids 7) */}
          <div className="lg:col-span-7 space-y-6 flex flex-col">
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
              pexelsKey={pexelsKey}
              language={language}
              visualStyle={projectConfig.visualStyle}
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
                canvasRef={canvasRef}
                renderTime={renderTime}
                language={language}
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

                {/* 2. PWA Mobile Installer Option */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-[9px] font-mono font-bold text-indigo-400 rounded uppercase tracking-wider">
                      ዮቶር መተግበሪያ (YOTOR APP)
                    </span>
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                  </div>

                  <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-tight">
                    📱{" "}
                    {language === "am"
                      ? "የChrome ምልክት የሌለበት እውነተኛ መተግበሪያ ማድረግ"
                      : "Install Yotor as a Badgeless App"}
                  </h4>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {language === "am" ? (
                      <>
                        ያለ ምንም የብሮውዘር/Chrome ምልክት እንደ እውነተኛ የስልክ መተግበሪያ ለመጫን
                        በቅድሚያ አፕሊኬሽኑን በስልክዎ መደበኛ የ{" "}
                        <strong className="text-zinc-200">Chrome</strong> ወይም{" "}
                        <strong className="text-zinc-200">Safari</strong> ብሮውዘር
                        ላይ በቀጥታ ይክፈቱት (ይህንን የ AI Studio iframe በማለፍ)።
                      </>
                    ) : (
                      <>
                        To install this as a pristine native-feeling app without
                        any Chrome/browser shortcut badge on your phone's home
                        screen, first open the link directly in your phone's
                        browser (outside AI Studio).
                      </>
                    )}
                  </p>

                  <div className="flex items-center gap-2 mt-2">
                    {deferredPrompt ? (
                      <button
                        type="button"
                        onClick={triggerPwaInstall}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-[0.98]"
                      >
                        🚀{" "}
                        {language === "am"
                          ? "አሁንኑ ስልክ ላይ ጫን"
                          : "Install Yotor App"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const copyUrl =
                            "https://ais-pre-oh5hl4vhkopsdnvzowkkjm-458221665777.europe-west2.run.app";
                          navigator.clipboard.writeText(copyUrl);
                          alert(
                            language === "am"
                              ? "የመተግበሪያው ሊንክ ተገልብጧል! በስልክዎ Chrome ወይም Safari ላይ ይክፈቱት።"
                              : "URL copied! Open it on Chrome or Safari.",
                          );
                        }}
                        className="w-full py-3 bg-zinc-900 hover:bg-zinc-850 text-zinc-350 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-zinc-800"
                      >
                        🔗{" "}
                        {language === "am"
                          ? "የመተግበሪያ ሊንክ ገልብጥ (Copy Link)"
                          : "Copy App Link"}
                      </button>
                    )}
                  </div>

                  {/* Manual Walkthrough Instructions Accordion-Style */}
                  <div className="space-y-2 mt-4 pt-4 border-t border-zinc-900/60">
                    {/* Android Instruction */}
                    <div className="p-3 bg-zinc-950/60 border border-zinc-900 rounded-xl text-[10.5px]">
                      <span className="font-mono text-zinc-400 font-bold tracking-wider block uppercase mb-1">
                        🤖{" "}
                        {language === "am" ? "የአንድሮይድ ተጠቃሚዎች" : "Android Guide"}
                      </span>
                      <ul className="list-decimal list-inside space-y-1 text-zinc-400 font-sans leading-relaxed">
                        <li>
                          {language === "am"
                            ? "ሊንኩን በ Chrome ብሮውዘር ላይ ይክፈቱት።"
                            : "Open in standard Chrome browser."}
                        </li>
                        <li>
                          {language === "am"
                            ? "ባለ ሦስት ነጥብ (...) የሜኑ ምልክት ይጫኑ።"
                            : "Tap on the 3-dot menu."}
                        </li>
                        <li>
                          {language === "am" ? (
                            <>
                              <strong className="text-zinc-300">
                                "መተግበሪያውን ጫን" (Install app)
                              </strong>{" "}
                              ወይም{" "}
                              <strong className="text-zinc-300">
                                "Add to Home"
                              </strong>{" "}
                              ይጫኑ።
                            </>
                          ) : (
                            <>
                              Select{" "}
                              <strong className="text-zinc-300">
                                "Install app"
                              </strong>{" "}
                              or{" "}
                              <strong className="text-zinc-305">
                                "Add to Home"
                              </strong>
                              .
                            </>
                          )}
                        </li>
                        <li className="text-emerald-400">
                          {language === "am"
                            ? "✨ የChrome ምልክት የሌለበት እውነተኛ መተግበሪያ ይፈጠራል!"
                            : "✨ Disappears browser bars & installs as a real app!"}
                        </li>
                      </ul>
                    </div>

                    {/* iOS Instruction */}
                    <div className="p-3 bg-zinc-950/60 border border-zinc-900 rounded-xl text-[10.5px]">
                      <span className="font-mono text-zinc-400 font-bold tracking-wider block uppercase mb-1">
                        🍏{" "}
                        {language === "am"
                          ? "የአይፎን ተጠቃሚዎች"
                          : "iPhone Safari Guide"}
                      </span>
                      <ul className="list-decimal list-inside space-y-1 text-zinc-400 font-sans leading-relaxed">
                        <li>
                          {language === "am"
                            ? "መተግበሪያውን በ Safari ብሮውዘር ላይ ይክፈቱት።"
                            : "Open in Safari browser."}
                        </li>
                        <li>
                          {language === "am"
                            ? 'ከታች የ "Share" (ማጋሪያ) ሳጥን ምልክቱን ይጫኑ።'
                            : 'Tap the "Share" button.'}
                        </li>
                        <li>
                          {language === "am" ? (
                            <>
                              <strong className="text-zinc-300">
                                "Add to Home Screen"
                              </strong>{" "}
                              (ወደ ማሳያ ገጽ አክል) የሚለውን ይምረጡ።
                            </>
                          ) : (
                            <>
                              Scroll down and tap{" "}
                              <strong className="text-zinc-303">
                                "Add to Home Screen"
                              </strong>
                              .
                            </>
                          )}
                        </li>
                        <li className="text-emerald-400">
                          {language === "am"
                            ? "✨ በሙሉ ስክሪን ያለ ብሮውዘር አድራሻ እንደ እውነተኛ መተግበሪያ ይከፈታል!"
                            : "✨ Opens completely full-screen as a badgeless stand-alone app!"}
                        </li>
                      </ul>
                    </div>
                  </div>
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
