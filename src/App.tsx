import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Scene, ProjectConfig, AspectRatio } from './types';
import { DEFAULT_CATALOG, DEFAULT_MUSIC } from './data';
import ScriptInput from './components/ScriptInput';
import Timeline from './components/Timeline';
import VideoCanvas from './components/VideoCanvas';
import RenderModal from './components/RenderModal';
import AccessGate from './components/AccessGate';
import { Language, translations } from './translations';
import { 
  Sparkles, Download, Video, Palette, Library, Info, HelpCircle,
  Terminal, Send, X, Bot, Sliders, Eye, EyeOff, MessageSquare, Volume2, Zap, SlidersHorizontal, Command, Image as ImageIcon, Languages, Settings
} from 'lucide-react';

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('app_language') as Language) || 'am';
  });

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('app_language', lang);
  };

  const t = translations[language];

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStage, setLoadingStage] = useState<string>('Analyzing narration text...');
  const [pexelsKey, setPexelsKey] = useState<string>(() => {
    return localStorage.getItem('pexels_api_key') || '';
  });
  const [pixabayKey, setPixabayKey] = useState<string>(() => {
    return localStorage.getItem('pixabay_api_key') || '';
  });
  const [coverrKey, setCoverrKey] = useState<string>(() => {
    return localStorage.getItem('coverr_api_key') || '';
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
    aspectRatio: '16:9',
    musicTrack: DEFAULT_MUSIC[1].url, // Meditative pad default
    musicVolume: 0.12,
    voiceLanguage: 'am-edge-male',
    voiceType: 'male',
    subtitleStyle: {
      enabled: true,
      fontSize: 32,
      color: '#FFFFFF',
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
      position: 'bottom',
      fontFamily: 'Space Grotesk',
      uppercase: true
    },
    transitionType: 'crossfade',
    transitionDuration: 0.5,
    isVoiceEnabled: true,
    syncToMusicBeats: true,
    isAnimationEnabled: true,
    isTransitionsEnabled: true,
    isSubtitlesEnabled: true,
    isMusicEnabled: true
  });

  // Load spectacular cosmic startup template
  useEffect(() => {
    loadStartupCosmicTemplate();

    // Check custom standalone app states
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    const handleInstalled = () => {
      setIsStandaloneApp(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsStandaloneApp(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const triggerPwaInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const loadStartupCosmicTemplate = () => {
    const defaultSentences = [
      { text: "We stand on the edge of a new cosmos.", query: "starry galaxy slow motion space" },
      { text: "Stars flicker in the endless fabric of space, calling us to explore.", query: "cosmic universe nebulas" },
      { text: "For generations, we have looked up and wondered.", query: "happy man looking up sky starry night" },
      { text: "And now, we build the engines of discovery.", query: "futuristic machinery space cockpit" }
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
        videoAuthorUrl: '#',
        voiceoverUrl: null,
        originalIndex: index
      };
    });

    setScenes(initialScenes);
    setPlaybackIndex(0);
  };

  // Triggers Gemini parser pipeline
  const handleAnalyzeScript = async (scriptText: string, providedPexelsKey: string, providedPixabayKey: string, providedCoverrKey: string) => {
    setIsLoading(true);
    setLoadingStage('Analyzing story script with Gemini AI...');
    // Sync credentials
    setPexelsKey(providedPexelsKey);
    setPixabayKey(providedPixabayKey);
    setCoverrKey(providedCoverrKey);
    setIsPlaying(false);
    setPlaybackIndex(0);

    try {
      const response = await fetch('/api/analyze-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ script: scriptText })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze script');
      }

      const rawScenes = data.scenes || [];
      if (rawScenes.length === 0) {
        throw new Error('No scenes could be auto-segmented from your text');
      }

      setLoadingStage(`Found ${rawScenes.length} scenes. Matching stunning cinematic footage...`);

      // To prevent rate limits and support long videos up to 30 minutes, process searches sequentially,
      // and update the loading stages dynamically!
      const populatedScenes: Scene[] = [];
      
      for (let i = 0; i < rawScenes.length; i++) {
        const scene = rawScenes[i];
        setLoadingStage(`Securing footage for scene ${i + 1} of ${rawScenes.length}...`);
        
        let voiceoverUrl: string | null = null;
        
        let videoUrl = '';
        let videoThumb = '';
        let author = '';

        if (providedPexelsKey) {
          try {
            const pexelsResponse = await fetch(`/api/pexels/search?query=${encodeURIComponent(scene.keywords)}`, {
              headers: {
                'x-pexels-key': providedPexelsKey
              }
            });
            const pexelsData = await pexelsResponse.json();
            
            if (pexelsResponse.ok && pexelsData.videos && pexelsData.videos.length > 0) {
              const bestClip = pexelsData.videos[0];
              const files = bestClip.video_files || [];
              const mp4Files = files.filter((f: any) => f.file_type === 'video/mp4' || f.link.includes('.mp4'));
              const hd = mp4Files.find((f: any) => f.width >= 1280 && f.width <= 1920);
              const sd = mp4Files.find((f: any) => f.width < 1280);
              const anyMp4 = mp4Files[0];

              videoUrl = hd?.link || sd?.link || anyMp4?.link || '';
              videoThumb = bestClip.video_pictures?.[0]?.picture || '';
              author = bestClip.user?.name || 'Stock Creator';
            }
          } catch (e) {
            console.warn(`Could not fetch Pexels video for scene ${i}:`, e);
          }
        }

        if (!videoUrl && providedPixabayKey) {
          try {
            const pixabayResponse = await fetch(`/api/pixabay/search?query=${encodeURIComponent(scene.keywords)}`, {
              headers: {
                'x-pixabay-key': providedPixabayKey
              }
            });
            const pixabayData = await pixabayResponse.json();
            
            if (pixabayResponse.ok && pixabayData.hits && pixabayData.hits.length > 0) {
              const bestClip = pixabayData.hits[0];
              const videos = bestClip.videos || {};
              const selectedVid = videos.large || videos.medium || videos.small || videos.tiny;
              
              if (selectedVid) {
                videoUrl = selectedVid.url;
                // Pixabay videos response doesn't always include a picture field at root, but sometimes id is used
                // Fallback to picture_id if available to construct thumbnail if possible or use a default
                videoThumb = bestClip.picture_id
                  ? `https://i.vimeocdn.com/video/${bestClip.picture_id}_295x166.jpg`
                  : bestClip.placeholderUrl || '';
                author = bestClip.user || 'Pixabay Creator';
              }
            }
          } catch (e) {
            console.warn(`Could not fetch Pixabay video for scene ${i}:`, e);
          }
        }

        if (!videoUrl && providedCoverrKey) {
          try {
            const coverrResponse = await fetch(`/api/coverr/search?query=${encodeURIComponent(scene.keywords)}`, {
              headers: {
                'x-coverr-key': providedCoverrKey
              }
            });
            const coverrData = await coverrResponse.json();
            
            if (coverrResponse.ok && coverrData.hits && coverrData.hits.length > 0) {
              const bestClip = coverrData.hits[0];
              const videos = bestClip.urls || {};
              const selectedVid = videos.mp4 || videos.mp4_download;
              
              if (selectedVid) {
                videoUrl = selectedVid;
                videoThumb = bestClip.thumbnail || '';
                author = bestClip.author?.name || 'Coverr Creator';
              }
            }
          } catch (e) {
            console.warn(`Could not fetch Coverr video for scene ${i}:`, e);
          }
        }

        // Fallback to beautiful pre-curated catalog files if search returned nothing
        if (!videoUrl) {
          const fallbackVid = DEFAULT_CATALOG[i % DEFAULT_CATALOG.length];
          videoUrl = fallbackVid.url;
          videoThumb = fallbackVid.thumbnail;
          author = fallbackVid.author;
        }

        populatedScenes.push({
          id: scene.id || `sc_${i}_${Date.now()}`,
          text: scene.text,
          keywords: scene.keywords,
          caption: scene.caption || scene.text,
          duration: scene.duration || 4.5,
          videoUrl,
          videoThumb,
          videoAuthor: author,
          videoAuthorUrl: '#',
          voiceoverUrl,
          originalIndex: i
        });

        // Small cooling delay between API fetches to protect Pexels rate limits on wide scripts!
        if (providedPexelsKey && i < rawScenes.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, i % 5 === 0 ? 400 : 150));
        }
      }

      setScenes(populatedScenes);
      setPlaybackIndex(0);

    } catch (err: any) {
      console.warn("Gemini generation failed, using local smart parser fallback:", err);
      // Better local fallback: use the actual script text instead of cosmic template
      const sentences = scriptText.replace(/([.?!])\s*(?=[A-Z])/g, "$1|").split("|").filter(s => s.trim().length > 0);
      const manualScenes: Scene[] = sentences.map((s, index) => {
        const fallbackVid = DEFAULT_CATALOG[index % DEFAULT_CATALOG.length];
        return {
          id: `manual_sc_${index}_${Date.now()}`,
          text: s.trim(),
          keywords: "cinematic landscape",
          caption: s.trim(),
          duration: Math.max(4.0, (s.split(/\s+/).length / 2.2)),
          videoUrl: fallbackVid.url,
          videoThumb: fallbackVid.thumbnail,
          videoAuthor: fallbackVid.author,
          videoAuthorUrl: '#',
          voiceoverUrl: null,
          originalIndex: index
        };
      });
      
      setScenes(manualScenes);
      setPlaybackIndex(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Modify individual scene keys
  const handleUpdateScene = (sceneId: string, updatedData: Partial<Scene>) => {
    setScenes(prev => prev.map(scene => {
      if (scene.id === sceneId) {
        return { ...scene, ...updatedData };
      }
      return scene;
    }));
  };

  // Dynamic Scene addition
  const handleAddScene = () => {
    const fallbackCatalogIdx = scenes.length;
    const fallbackVid = DEFAULT_CATALOG[fallbackCatalogIdx % DEFAULT_CATALOG.length];
    
    const newScene: Scene = {
      id: `sc_new_${Date.now()}`,
      text: "Add some beautiful narrative phrase here.",
      keywords: "cinematic corporate visual",
      caption: "Add some beautiful narrative phrase here.",
      duration: 5.0,
      videoUrl: fallbackVid.url,
      videoThumb: fallbackVid.thumbnail,
      videoAuthor: fallbackVid.author,
      videoAuthorUrl: '#',
      voiceoverUrl: null,
      originalIndex: scenes.length
    };

    setScenes([...scenes, newScene]);
    setPlaybackIndex(scenes.length);
  };

  const handleDeleteScene = (sceneId: string) => {
    if (scenes.length <= 1) return;
    
    const targetIdx = scenes.findIndex(s => s.id === sceneId);
    const filtered = scenes.filter(s => s.id !== sceneId);
    setScenes(filtered);
    
    if (playbackIndex === targetIdx) {
      setPlaybackIndex(Math.max(0, targetIdx - 1));
    } else if (playbackIndex > targetIdx) {
      setPlaybackIndex(prev => prev - 1);
    }
  };

  // Segment order sorting
  const handleMoveScene = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= scenes.length) return;

    const copy = [...scenes];
    const target = copy[index];
    copy[index] = copy[nextIndex];
    copy[nextIndex] = target;

    setScenes(copy);
    setPlaybackIndex(nextIndex);
  };

  const handleSelectScene = useCallback((sceneId: string) => {
    const idx = scenes.findIndex(s => s.id === sceneId);
    if (idx !== -1) {
      setPlaybackIndex(idx);
    }
  }, [scenes]);

  const handleUpdateConfig = useCallback((updated: Partial<ProjectConfig>) => {
    setProjectConfig(prev => ({ ...prev, ...updated }));
  }, [setProjectConfig]);

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
                  <span className="text-[10px] uppercase tracking-[0.2em] font-black text-indigo-400">{t.logo_sub}</span>
                </div>
                <h1 className="text-3xl font-black text-white font-sans tracking-tighter uppercase">{t.studio_title}</h1>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-3">
            {/* Elegant Language Selector Toggles */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 shadow-inner">
              <Languages size={14} className="text-zinc-500 ml-1 mr-1" />
              <button
                type="button"
                onClick={() => handleLanguageChange('am')}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                  language === 'am'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                አማርኛ 🇪🇹
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                  language === 'en'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-zinc-400 hover:text-white'
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
              <span>{language === 'am' ? 'ቅንብሮች' : 'Settings'}</span>
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
              className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-white hover:bg-zinc-100 text-black font-black text-sm uppercase tracking-[0.2em] rounded-2xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.25)] hover:shadow-[0_0_35px_rgba(255,255,255,0.4)] disabled:opacity-30 disabled:pointer-events-none active:scale-[0.98] animate-shimmer"
              id="bake-video-btn"
            >
              <div className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500"></span>
              </div>
              <Download size={18} className="stroke-[3px] group-hover:translate-y-0.5 transition-transform" />
              {t.ready_to_export}
            </button>
          </div>
        </header>

        {/* Primary Layout Grid */}
        <main className="max-w-7xl mx-auto px-6 pt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
          
          {/* Left Column: Inputs & Scenarios Sequence (Grids 7) */}
          <div className="lg:col-span-7 space-y-6 flex flex-col">
            <ScriptInput
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
                    {language === 'am' ? 'የመተግበሪያ ቅንብሮች & መጫኛ' : 'Settings & App Installer'}
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
                {/* 1. App Language Config */}
                <div className="space-y-2 pb-5 border-b border-zinc-900/40">
                  <label className="text-[10px] font-mono text-zinc-550 uppercase tracking-widest block">
                    {language === 'am' ? 'የመተግበሪያ ቋንቋ / App Language' : 'App Language'}
                  </label>
                  <p className="text-[11px] text-zinc-400">
                    {language === 'am' ? 'የስቱዲዮውን አጠቃላይ ገፅታ ቋንቋ ይቀይሩ።' : 'Toggle translation of Yotor Cinematic Studio.'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 bg-zinc-950 rounded-xl p-1.5 border border-zinc-900/60 w-fit">
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('am')}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                        language === 'am'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      አማርኛ 🇪🇹
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('en')}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                        language === 'en'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-zinc-400 hover:text-white'
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
                    📱 {language === 'am' ? 'የChrome ምልክት የሌለበት እውነተኛ መተግበሪያ ማድረግ' : 'Install Yotor as a Badgeless App'}
                  </h4>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {language === 'am' ? (
                      <>
                        ያለ ምንም የብሮውዘር/Chrome ምልክት እንደ እውነተኛ የስልክ መተግበሪያ ለመጫን በቅድሚያ አፕሊኬሽኑን በስልክዎ መደበኛ የ <strong className="text-zinc-200">Chrome</strong> ወይም <strong className="text-zinc-200">Safari</strong> ብሮውዘር ላይ በቀጥታ ይክፈቱት (ይህንን የ AI Studio iframe በማለፍ)።
                      </>
                    ) : (
                      <>
                        To install this as a pristine native-feeling app without any Chrome/browser shortcut badge on your phone's home screen, first open the link directly in your phone's browser (outside AI Studio).
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
                        🚀 {language === 'am' ? 'አሁንኑ ስልክ ላይ ጫን' : 'Install Yotor App'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const copyUrl = "https://ais-pre-oh5hl4vhkopsdnvzowkkjm-458221665777.europe-west2.run.app";
                          navigator.clipboard.writeText(copyUrl);
                          alert(language === 'am' ? "የመተግበሪያው ሊንክ ተገልብጧል! በስልክዎ Chrome ወይም Safari ላይ ይክፈቱት።" : "URL copied! Open it on Chrome or Safari.");
                        }}
                        className="w-full py-3 bg-zinc-900 hover:bg-zinc-850 text-zinc-350 font-bold text-xs uppercase tracking-wider rounded-xl transition-all border border-zinc-800"
                      >
                        🔗 {language === 'am' ? 'የመተግበሪያ ሊንክ ገልብጥ (Copy Link)' : 'Copy App Link'}
                      </button>
                    )}
                  </div>

                  {/* Manual Walkthrough Instructions Accordion-Style */}
                  <div className="space-y-2 mt-4 pt-4 border-t border-zinc-900/60">
                    {/* Android Instruction */}
                    <div className="p-3 bg-zinc-950/60 border border-zinc-900 rounded-xl text-[10.5px]">
                      <span className="font-mono text-zinc-400 font-bold tracking-wider block uppercase mb-1">🤖 {language === 'am' ? 'የአንድሮይድ ተጠቃሚዎች' : 'Android Guide'}</span>
                      <ul className="list-decimal list-inside space-y-1 text-zinc-400 font-sans leading-relaxed">
                        <li>{language === 'am' ? 'ሊንኩን በ Chrome ብሮውዘር ላይ ይክፈቱት።' : 'Open in standard Chrome browser.'}</li>
                        <li>{language === 'am' ? 'ባለ ሦስት ነጥብ (...) የሜኑ ምልክት ይጫኑ።' : 'Tap on the 3-dot menu.'}</li>
                        <li>
                          {language === 'am' ? (
                            <>
                              <strong className="text-zinc-300">"መተግበሪያውን ጫን" (Install app)</strong> ወይም <strong className="text-zinc-300">"Add to Home"</strong> ይጫኑ።
                            </>
                          ) : (
                            <>
                              Select <strong className="text-zinc-300">"Install app"</strong> or <strong className="text-zinc-305">"Add to Home"</strong>.
                            </>
                          )}
                        </li>
                        <li className="text-emerald-400">{language === 'am' ? '✨ የChrome ምልክት የሌለበት እውነተኛ መተግበሪያ ይፈጠራል!' : '✨ Disappears browser bars & installs as a real app!'}</li>
                      </ul>
                    </div>

                    {/* iOS Instruction */}
                    <div className="p-3 bg-zinc-950/60 border border-zinc-900 rounded-xl text-[10.5px]">
                      <span className="font-mono text-zinc-400 font-bold tracking-wider block uppercase mb-1">🍏 {language === 'am' ? 'የአይፎን ተጠቃሚዎች' : 'iPhone Safari Guide'}</span>
                      <ul className="list-decimal list-inside space-y-1 text-zinc-400 font-sans leading-relaxed">
                        <li>{language === 'am' ? 'መተግበሪያውን በ Safari ብሮውዘር ላይ ይክፈቱት።' : 'Open in Safari browser.'}</li>
                        <li>{language === 'am' ? 'ከታች የ "Share" (ማጋሪያ) ሳጥን ምልክቱን ይጫኑ።' : 'Tap the "Share" button.'}</li>
                        <li>
                          {language === 'am' ? (
                            <>
                              <strong className="text-zinc-300">"Add to Home Screen"</strong> (ወደ ማሳያ ገጽ አክል) የሚለውን ይምረጡ።
                            </>
                          ) : (
                            <>
                              Scroll down and tap <strong className="text-zinc-303">"Add to Home Screen"</strong>.
                            </>
                          )}
                        </li>
                        <li className="text-emerald-400">{language === 'am' ? '✨ በሙሉ ስክሪን ያለ ብሮውዘር አድራሻ እንደ እውነተኛ መተግበሪያ ይከፈታል!' : '✨ Opens completely full-screen as a badgeless stand-alone app!'}</li>
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
                  {language === 'am' ? 'አረጋግጥ / ጨርስ' : 'Done & Close'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AccessGate>
  );
}
