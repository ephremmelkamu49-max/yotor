import React, { useState, useRef } from 'react';
import { Scene, AspectRatio } from '../types';
import { DEFAULT_CATALOG } from '../data';
import { 
  Play, Plus, Trash2, Search, Film, Clock, ChevronUp, ChevronDown, Check, AlertTriangle, RefreshCw
} from 'lucide-react';

import { Language, translations } from '../translations';

interface StockClipCardProps {
  clip: any;
  index: number;
  onSelect: (clip: any) => void;
  key?: any;
}

function StockClipCard({ clip, index, onSelect }: StockClipCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Find the video source link
  const files = clip.video_files || [];
  const mp4Files = files.filter((f: any) => f.file_type === 'video/mp4' || f?.link?.includes('.mp4'));
  
  // Prefer standard SD/Mobile resolution for fast, lag-free previews, fall back to HD/original
  const sdLink = mp4Files.find((f: any) => f.width && f.width < 1280)?.link;
  const anyLink = mp4Files[0]?.link || clip.url || '';
  const videoUrl = sdLink || anyLink;
  const thumb = clip.video_pictures?.[0]?.picture || clip.thumbnail;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPlaying(false);
      }}
      className="group relative aspect-video bg-zinc-950 border border-zinc-800/85 rounded-xl overflow-hidden cursor-pointer hover:border-indigo-500/65 transition-all shadow hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-0.5"
    >
      {/* Thumbnail Image */}
      <img
        src={thumb}
        alt="Pexels Frame"
        className={`w-full h-full object-cover transition-transform duration-500 pointer-events-none ${
          isHovered || isPlaying ? 'opacity-0 scale-105' : 'opacity-100'
        }`}
      />

      {/* Video Preview Element (Lazy loaded on hover/play) */}
      {(isHovered || isPlaying) && videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          loop
          muted
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 animate-fadeIn"
        />
      )}

      {/* Control Overlays */}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-between p-3 z-10">
        {/* Top bar with play/preview indicators */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-emerald-500/15 px-2 py-0.5 rounded text-[8px] font-mono font-bold text-emerald-400 border border-emerald-500/25">
            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            <span>PLAYING</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(clip);
            }}
            className="bg-indigo-650 hover:bg-indigo-500 text-white font-bold text-[9px] uppercase px-2 py-0.5 rounded tracking-wider border border-indigo-400/20 shadow transition-colors"
          >
            Choose / ምረጥ
          </button>
        </div>

        {/* Center Select Indicator */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onSelect(clip);
          }}
          className="self-center flex items-center justify-center bg-zinc-950/80 backdrop-blur-md hover:bg-indigo-600 h-10 w-10 rounded-full border border-zinc-850 transition-all transform hover:scale-110 active:scale-95"
          title="Select this stock clip"
        >
          <Check size={18} className="text-zinc-300 group-hover:text-white" />
        </div>

        {/* Bottom bar with author details */}
        <div className="flex items-end justify-between">
          <span className="text-[9px] text-zinc-350 truncate max-w-[80%] font-semibold italic drop-shadow">
            By: {clip.user?.name || 'Stock Creator'}
          </span>
          <span className="text-[8px] font-mono px-1 bg-black/60 rounded text-indigo-400 font-bold">
            PREVIEW
          </span>
        </div>
      </div>

      {clip.isCatalogFallback && (
        <span className="absolute right-1.5 top-1.5 bg-[#050505]/95 px-1.5 py-0.5 rounded text-[8px] font-mono border border-zinc-805 text-indigo-400 z-10">
          Local
        </span>
      )}
    </div>
  );
}

interface TimelineProps {
  scenes: Scene[];
  activeSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
  onUpdateScene: (sceneId: string, updated: Partial<Scene>) => void;
  onAddScene: () => void;
  onDeleteScene: (sceneId: string) => void;
  onMoveScene: (index: number, direction: 'up' | 'down') => void;
  pexelsKey: string;
  language: Language;
}

export default function Timeline({
  scenes,
  activeSceneId,
  onSelectScene,
  onUpdateScene,
  onAddScene,
  onDeleteScene,
  onMoveScene,
  pexelsKey,
  language
}: TimelineProps) {
  const t = translations[language];
  const [searchSceneId, setSearchSceneId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string>('');

  // Total calculated video duration
  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0).toFixed(1);

  const handleOpenSearch = (scene: Scene) => {
    setSearchSceneId(scene.id);
    setSearchQuery(scene.keywords);
    setSearchResults([]);
    setSearchError('');
    // Trigger initial search automatically
    triggerSearch(scene.keywords, scene.id);
  };

  const triggerSearch = async (queryText: string, sceneId: string) => {
    if (!queryText.trim()) return;
    setIsSearching(true);
    setSearchError('');
    
    try {
      const pKey = localStorage.getItem('pexels_api_key') || '';
      const pixKey = localStorage.getItem('pixabay_api_key') || '';
      let remoteVideos: any[] = [];
      let foundRemote = false;

      // Try Pexels first
      if (pKey) {
        try {
          const response = await fetch(`/api/pexels/search?query=${encodeURIComponent(queryText)}`, {
            headers: { 'x-pexels-key': pKey }
          });
          const data = await response.json();
          if (response.ok && data.videos && data.videos.length > 0) {
            remoteVideos = data.videos;
            foundRemote = true;
          }
        } catch (e) {
          console.error('Pexels search failed', e);
        }
      }

      // Try Pixabay if Pexels finds nothing
      if (!foundRemote && pixKey) {
        try {
          const response = await fetch(`/api/pixabay/search?query=${encodeURIComponent(queryText)}`, {
            headers: { 'x-pixabay-key': pixKey }
          });
          const data = await response.json();
          if (response.ok && data.hits && data.hits.length > 0) {
            // Map Pixabay format to dummy Pexels format for compatibility with UI
            remoteVideos = data.hits.map((hit: any) => {
              const selectedVid = hit.videos?.large || hit.videos?.medium || hit.videos?.small || hit.videos?.tiny;
              const link = selectedVid ? selectedVid.url : '';
              const pic = hit.picture_id 
                ? `https://i.vimeocdn.com/video/${hit.picture_id}_295x166.jpg`
                : hit.placeholderUrl || '';

              return {
                id: hit.id,
                video_files: [{ type: 'video/mp4', link }],
                video_pictures: [{ picture: pic }],
                user: { name: hit.user || 'Pixabay Creator', url: '#' },
              };
            }).filter((v: any) => v.video_files[0].link);
            foundRemote = true;
          }
        } catch (e) {
          console.error('Pixabay search failed', e);
        }
      }

      // Try Coverr if Pixabay & Pexels find nothing
      const coverrKey = localStorage.getItem('coverr_api_key') || '';
      if (!foundRemote && coverrKey) {
        try {
          const response = await fetch(`/api/coverr/search?query=${encodeURIComponent(queryText)}`, {
            headers: { 'x-coverr-key': coverrKey }
          });
          const data = await response.json();
          if (response.ok && data.hits && data.hits.length > 0) {
            // Map Coverr format to dummy Pexels format for compatibility with UI
            remoteVideos = data.hits.map((hit: any) => {
              const selectedVid = hit.urls?.mp4 || hit.urls?.mp4_download || '';
              const pic = hit.thumbnail || '';
              return {
                id: hit.id,
                video_files: [{ type: 'video/mp4', link: selectedVid }],
                video_pictures: [{ picture: pic }],
                user: { name: hit.author?.name || 'Coverr Creator', url: '#' },
              };
            }).filter((v: any) => v.video_files[0].link);
            foundRemote = true;
          }
        } catch (e) {
          console.error('Coverr search failed', e);
        }
      }

      if (foundRemote && remoteVideos.length > 0) {
        setSearchResults(remoteVideos);
      } else {
        // Fall back to matching default catalog elements
        const lowerQuery = queryText.toLowerCase();
        const matched = DEFAULT_CATALOG.filter(v => 
          v.category.toLowerCase().includes(lowerQuery) || 
          v.title.toLowerCase().includes(lowerQuery) ||
          lowerQuery.split(' ').some(word => word.length > 2 && v.category.toLowerCase().includes(word) || v.title.toLowerCase().includes(word))
        );
        
        // Ensure we always return some fallback catalog files if none match
        const results = matched.length > 0 ? matched : DEFAULT_CATALOG.slice(0, 5);
        
        setSearchResults(results.map(v => ({
          id: v.id,
          width: 1920,
          height: 1080,
          url: v.url,
          video_files: [{ type: 'video/mp4', link: v.url }],
          video_pictures: [{ picture: v.thumbnail }],
          user: { name: v.author, url: '#' },
          isCatalogFallback: true
        })));
        
        if (!pKey && !pixKey) {
          setSearchError('Note: Using local offline cinematic catalog. Paste an API Key in credentials for millions of live clips.');
        } else {
          setSearchError('No matching video clips found online. Fallback stock videos suggested instead.');
        }
      }
    } catch (err: any) {
      console.error(err);
      // Fallback on search critical failure
      setSearchResults(DEFAULT_CATALOG.slice(0, 6).map(v => ({
        id: v.id,
        width: 1920,
        height: 1080,
        url: v.url,
        video_files: [{ type: 'video/mp4', link: v.url }],
        video_pictures: [{ picture: v.thumbnail }],
        user: { name: v.author, url: '#' },
        isCatalogFallback: true
      })));
      setSearchError(`Search error: ${err.message}. Showing backup catalog options.`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectClip = (clip: any) => {
    if (!searchSceneId) return;
    
    // Find the highest resolution mp4 under 1080p for faster loading or standard sd links
    let bestLink = '';
    // Pexels returns files in various sizes. We lookup for hd or sd links
    const files = clip.video_files || [];
    const mp4Files = files.filter((f: any) => f.file_type === 'video/mp4' || f.link.includes('.mp4'));
    
    // Prefer HD (high quality but loadable)
    const hd = mp4Files.find((f: any) => f.width >= 1280 && f.width <= 1920);
    const sd = mp4Files.find((f: any) => f.width < 1280 && f.width >= 640);
    const anyMp4 = mp4Files[0];

    bestLink = hd?.link || sd?.link || anyMp4?.link || clip.url;

    const updatedData: Partial<Scene> = {
      videoUrl: bestLink,
      videoThumb: clip.video_pictures?.[0]?.picture || DEFAULT_CATALOG[0].thumbnail,
      videoAuthor: clip.user?.name || 'Stock Producer',
      videoAuthorUrl: clip.user?.url || '#'
    };

    onUpdateScene(searchSceneId, updatedData);
    setSearchSceneId(null);
  };

  return (
    <div className="bg-[#0c0c0e]/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5" id="timeline-orchestra">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
            <Film size={20} />
          </div>
          <div>
            <h2 className="text-sm uppercase tracking-widest font-semibold text-zinc-300">{t.timeline_title}</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {language === 'am' ? 'ጠቅላላ የቪዲዮ ክፍሎች ርዝመት:' : 'Total Playback Duration:'}{" "}
              <span className="text-indigo-400 font-mono font-bold">
                {parseFloat(totalDuration) >= 60 
                  ? `${Math.floor(parseFloat(totalDuration) / 60)}m ${Math.round(parseFloat(totalDuration) % 60)}s` 
                  : `${totalDuration}s`}
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={onAddScene}
          className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors"
          id="add-scene-timeline-btn"
        >
          <Plus size={14} />
          {t.add_scene}
        </button>
      </div>

      {/* Scenarios lists timeline */}
      <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1" id="scenarios-list">
        {scenes.map((scene, idx) => {
          const isActive = scene.id === activeSceneId;
          return (
            <div
              key={scene.id}
              onClick={() => onSelectScene(scene.id)}
              className={`group border rounded-xl p-4 transition-all duration-300 relative cursor-pointer ${
                isActive
                  ? 'bg-indigo-500/5 border-indigo-500/50 shadow-lg shadow-indigo-500/5'
                  : 'bg-zinc-950/40 border-zinc-900/60 hover:border-zinc-800'
              }`}
            >
              {/* Controls floating top right */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveScene(idx, 'up');
                  }}
                  disabled={idx === 0}
                  className="p-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
                  title="Move Up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveScene(idx, 'down');
                  }}
                  disabled={idx === scenes.length - 1}
                  className="p-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:pointer-events-none"
                  title="Move Down"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteScene(scene.id);
                  }}
                  disabled={scenes.length <= 1}
                  className="p-1 bg-red-950/40 hover:bg-red-900/60 border border-red-900/30 rounded text-red-400 hover:text-red-200 disabled:opacity-30 disabled:pointer-events-none ml-1"
                  title="Delete Scene"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="flex gap-4">
                {/* Visual Video Thumbnail box */}
                <div className="relative shrink-0 w-28 h-20 bg-[#050505] border border-zinc-800 rounded-lg overflow-hidden group">
                  {scene.videoThumb ? (
                    <img 
                      src={scene.videoThumb} 
                      alt="Thumbnail" 
                      className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-650">
                      <Film size={20} />
                      <span className="text-[9px] mt-1">No Visual</span>
                    </div>
                  )}
                  <div className="absolute left-1.5 bottom-1.5 bg-[#050505]/90 backdrop-blur-sm text-[9px] font-mono text-indigo-400 px-1.5 py-0.5 rounded border border-zinc-800">
                    S-{idx + 1}
                  </div>
                  
                  {/* Visual selection hover button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenSearch(scene);
                    }}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
                  >
                    <div className="bg-indigo-600 text-white p-1.5 rounded-full transition-transform hover:scale-110">
                      <Search size={14} />
                    </div>
                  </button>
                </div>

                {/* Content details inputs */}
                <div className="flex-1 space-y-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Caption Editing */}
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[9px] font-semibold text-zinc-550 uppercase tracking-widest block font-mono">
                        {language === 'am' ? 'የትርጉም ጽሑፍ የግርጌ መግቢያ (Caption)' : 'Subtitles Caption'}
                      </label>
                      <input
                        type="text"
                        value={scene.text}
                        onChange={(e) => onUpdateScene(scene.id, { text: e.target.value, caption: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-[#050505] border border-zinc-800 text-zinc-200 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500/50 font-sans"
                      />
                    </div>

                    {/* Duration and Animation inputs */}
                    <div className="flex gap-2">
                       <div className="flex-1 space-y-1">
                        <label className="text-[9px] font-semibold text-zinc-550 uppercase tracking-widest block font-mono">
                          {language === 'am' ? 'ቆይታ በሰከንድ' : 'Duration (sec)'}
                        </label>
                        <div className="flex items-center gap-1.5">
                          <Clock size={12} className="text-zinc-500" />
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            max="120"
                            value={scene.duration}
                            onChange={(e) => onUpdateScene(scene.id, { duration: Math.max(1, parseFloat(e.target.value) || 3) })}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-[#050505] border border-zinc-800 text-zinc-200 text-xs font-mono rounded px-2.5 py-1.5 focus:outline-none focus:border-indigo-500/50"
                          />
                        </div>
                      </div>

                      <div className="flex-1 space-y-1">
                        <label className="text-[9px] font-semibold text-zinc-550 uppercase tracking-widest block font-mono">
                          {language === 'am' ? 'እንቅስቃሴ' : 'Animation'}
                        </label>
                        <select
                          value={scene.animationStyle || 'default'}
                          onChange={(e) => onUpdateScene(scene.id, { animationStyle: e.target.value === 'default' ? undefined : (e.target.value as any) })}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full bg-[#050505] border border-zinc-800 text-zinc-200 text-[10px] rounded px-2.5 py-2.5 focus:outline-none focus:border-indigo-500/50 appearance-none uppercase tracking-tighter"
                        >
                          <option value="default">{language === 'am' ? '— ራስ-ሰር —' : '— Auto —'}</option>
                          <option value="zoom-in">{language === 'am' ? 'Zoom In (ማቅረቢያ)' : 'Zoom In'}</option>
                          <option value="zoom-out">{language === 'am' ? 'Zoom Out (ማራቂያ)' : 'Zoom Out'}</option>
                          <option value="pan-lr">{language === 'am' ? 'Pan Right (ወደ ቀኝ)' : 'Pan Right'}</option>
                          <option value="pan-rl">{language === 'am' ? 'Pan Left (ወደ ግራ)' : 'Pan Left'}</option>
                          <option value="tilt-up">{language === 'am' ? 'Tilt Up (ወደ ላይ)' : 'Tilt Up'}</option>
                          <option value="tilt-down">{language === 'am' ? 'Tilt Down (ወደ ታች)' : 'Tilt Down'}</option>
                          <option value="diagonal-br">Diagonal ↘</option>
                          <option value="diagonal-bl">Diagonal ↙</option>
                          <option value="static">{language === 'am' ? 'Static (የማይንቀሳቀስ)' : 'Static'}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1.5 text-xs text-zinc-300">
                      <span className="font-semibold text-indigo-400 font-mono text-[10px] uppercase">Keywords / ፍለጋ:</span> {scene.keywords}
                    </span>
                    {scene.videoAuthor && (
                      <span className="text-[10px] italic text-zinc-500 font-sans">
                        Clip by: {scene.videoAuthor}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pexels Visual Stock Finder Modal */}
      {searchSceneId && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#0c0c0e] border border-zinc-800 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-zoomIn relative">
                         <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/20 z-10">
              <div>
                <h3 className="text-base font-light text-zinc-100">{t.search_online}</h3>
                <p className="text-xs text-zinc-500">{language === 'am' ? 'ለቪዲዮ ክፍልዎ ተስማሚ ምስሎችን ይፈልጉና በጥራት መተኪያ ያድርጉ' : 'Query and update matching scenic visuals and high-definition clips'}</p>
              </div>
              <button
                onClick={() => setSearchSceneId(null)}
                className="text-zinc-400 hover:text-zinc-200 text-xs font-semibold p-2 bg-zinc-900 border border-zinc-800 rounded-lg transition-colors"
              >
                ✕ {language === 'am' ? 'ዝጋ (Close)' : 'Close'}
              </button>
            </div>

            <div className="p-4 bg-zinc-950/50 border-b border-zinc-800 flex gap-2 z-10">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.search_placeholder}
                className="flex-1 bg-[#050505] border border-zinc-800 text-sm rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') triggerSearch(searchQuery, searchSceneId);
                }}
              />
              <button
                onClick={() => triggerSearch(searchQuery, searchSceneId)}
                disabled={isSearching}
                className="px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest rounded-lg flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-500/20"
              >
                {isSearching ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
                {t.active_search_btn}
              </button>
            </div>

            {searchError && (
              <div className="px-5 py-2.5 bg-indigo-500/5 border-b border-indigo-500/10 text-[10.5px] text-zinc-400 leading-relaxed flex items-start gap-2 z-10">
                <AlertTriangle size={13} className="shrink-0 text-indigo-400 mt-0.5" />
                <span>{searchError}</span>
              </div>
            )}

            <div className="p-5 overflow-y-auto flex-1 bg-[#050505]/40 z-10">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-3">
                  <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  <p className="text-xs text-zinc-500 font-mono">{language === 'am' ? 'ቪዲዮዎችን ከበይነመረብ ላይ በመፈለግ ላይ ነው...' : 'Syncing clip vectors...'}</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                  {language === 'am' ? 'የሚፈልጉትን የቪዲዮ መግለጫ ከላይ በመጻፍ ይፈልጉ (ለምሳሌ፡ "nature fire")' : 'TYPE CINEMATIC SEARCH AND TRIGGER THE MATCH ENGINE.'}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5" id="stock-results-grid">
                  {searchResults.map((clip, index) => (
                    <StockClipCard
                      key={clip.id || index}
                      clip={clip}
                      index={index}
                      onSelect={handleSelectClip}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
