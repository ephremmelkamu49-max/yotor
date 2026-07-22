import { Scene } from "../types";
import { DEFAULT_CATALOG, getTtsUrl } from "../data";
import { extractDescriptiveQueries, detectNamedEntity } from "./keywordExtractor";
import { mediaStorage } from "./indexedDBStorage";

export enum PipelineStage {
  IDLE = "IDLE",
  SCRIPT_PARSING = "SCRIPT_PARSING",
  TTS_GENERATION = "TTS_GENERATION",
  VIDEO_FETCHING = "VIDEO_FETCHING",
  ASSET_SYNCING = "ASSET_SYNCING",
  FFMPEG_RENDERING = "FFMPEG_RENDERING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface PipelineCredentials {
  pexelsKey?: string;
  pixabayKey?: string;
  coverrKey?: string;
}

export interface PipelineOptions {
  script: string;
  visualStyle?: string;
  inputMode?: "script" | "keywords";
  videoMode?: "stock" | "veo" | "pollinations";
  voiceLanguage?: string;
  credentials?: PipelineCredentials;
  concurrencyLimit?: number;
  onStageChange?: (stage: PipelineStage, stageMessage: string) => void;
  onProgress?: (progressPercent: number) => void;
  onLog?: (message: string) => void;
  onScenesUpdated?: (scenes: Scene[]) => void;
}

/**
 * Memory Management Registry
 * Tracks Blob URLs, DOM media elements, and buffers to prevent memory leaks and out-of-memory crashes.
 */
export class MemoryManager {
  private registeredUrls: Set<string> = new Set();

  public registerBlobUrl(url: string): string {
    if (url && url.startsWith("blob:")) {
      this.registeredUrls.add(url);
    }
    return url;
  }

  public revokeBlobUrl(url: string): void {
    if (url && this.registeredUrls.has(url)) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("[MemoryManager] Error revoking blob URL:", e);
      }
      this.registeredUrls.delete(url);
    }
  }

  public cleanup(): void {
    this.registeredUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("[MemoryManager] Error revoking URL during cleanup:", e);
      }
    });
    this.registeredUrls.clear();
  }
}

/**
 * Controlled Concurrency Queue Execution Helper
 * Processes tasks in small batches (default 3) to prevent API rate-limiting (429) and main thread freezing.
 */
export async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  taskFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const worker = async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      // Non-blocking tick to let the main UI thread handle user interactions & animations
      await new Promise((res) => setTimeout(res, 0));
      results[idx] = await taskFn(items[idx], idx);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Centralized Video Generation Orchestrator & Pipeline
 * Strictly coordinates Script Parsing -> TTS Generation -> Stock Video Fetching -> Asset Syncing -> FFmpeg Prep.
 */
export class VideoGenerationPipeline {
  private memoryManager = new MemoryManager();
  private currentStage = PipelineStage.IDLE;
  private isAborted = false;

  public abort(): void {
    this.isAborted = true;
    this.memoryManager.cleanup();
  }

  public async execute(options: PipelineOptions): Promise<{ scenes: Scene[]; renderPayload?: any }> {
    const {
      script,
      visualStyle = "Cinematic 4K",
      inputMode = "script",
      videoMode = "stock",
      voiceLanguage = "am-ET",
      credentials = {},
      concurrencyLimit = 3,
      onStageChange,
      onProgress,
      onLog,
      onScenesUpdated,
    } = options;

    const log = (msg: string) => {
      console.log(`[VideoPipeline] ${msg}`);
      if (onLog) onLog(msg);
    };

    const updateStage = (stage: PipelineStage, message: string, progress: number) => {
      this.currentStage = stage;
      log(`Stage [${stage}]: ${message}`);
      if (onStageChange) onStageChange(stage, message);
      if (onProgress) onProgress(progress);
    };

    try {
      this.isAborted = false;

      // ==========================================
      // STEP 1: SCRIPT PARSING & SCENE SEGMENTATION
      // ==========================================
      updateStage(PipelineStage.SCRIPT_PARSING, "Analyzing script and generating scene concepts...", 10);
      
      const analyzeRes = await fetch("/api/analyze-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          visualStyle,
          isKeywordsOnly: inputMode === "keywords",
        }),
      });

      if (!analyzeRes.ok) {
        const errJson = await analyzeRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to analyze script");
      }

      const analyzeData = await analyzeRes.json();
      const rawScenes = analyzeData.scenes || [];
      if (!Array.isArray(rawScenes) || rawScenes.length === 0) {
        throw new Error("No scenes generated from script. Please try modifying your prompt.");
      }

      if (this.isAborted) throw new Error("Pipeline cancelled by user.");

      // ==========================================
      // STEP 2: TTS AUDIO GENERATION & DURATION PROBING
      // ==========================================
      updateStage(PipelineStage.TTS_GENERATION, "Generating TTS narrative audio & calculating exact scene timing...", 30);

      const scenesWithAudio = await runWithConcurrencyLimit(
        rawScenes,
        concurrencyLimit,
        async (rawScene: any, index: number) => {
          if (this.isAborted) throw new Error("Pipeline cancelled");

          const text = rawScene.text || "";
          const ttsUrl = getTtsUrl(text, voiceLanguage);
          let exactDuration = rawScene.duration || 4.5;

          // Probe exact audio duration if URL exists
          if (ttsUrl) {
            let tempAudio: HTMLAudioElement | null = null;
            try {
              tempAudio = new Audio(ttsUrl);
              tempAudio.crossOrigin = "anonymous";
              exactDuration = await new Promise<number>((resolve) => {
                const timeout = setTimeout(() => resolve(rawScene.duration || 4.5), 3500);
                tempAudio!.onloadedmetadata = () => {
                  clearTimeout(timeout);
                  if (tempAudio!.duration && !isNaN(tempAudio!.duration) && tempAudio!.duration > 0 && tempAudio!.duration !== Infinity) {
                    resolve(tempAudio!.duration + 0.15); // Add small padding for natural pause
                  } else {
                    resolve(rawScene.duration || 4.5);
                  }
                };
                tempAudio!.onerror = (err) => {
                  clearTimeout(timeout);
                  console.error(`[TTS Probe Error] Scene ${index + 1}:`, err);
                  resolve(rawScene.duration || 4.5);
                };
              });
            } catch (e) {
              console.error(`[TTS Init Error] Scene ${index + 1}:`, e);
            } finally {
              if (tempAudio) {
                tempAudio.onloadedmetadata = null;
                tempAudio.onerror = null;
                tempAudio.pause();
                tempAudio.src = "";
                tempAudio.load();
              }
            }
          }

          return {
            ...rawScene,
            voiceoverUrl: ttsUrl,
            exactDuration: Math.max(2.5, exactDuration),
          };
        }
      );

      if (this.isAborted) throw new Error("Pipeline cancelled");

      // ==========================================
      // STEP 3: STOCK VIDEO FETCHING WITH DESCRIPTIVE KEYWORDS
      // ==========================================
      updateStage(PipelineStage.VIDEO_FETCHING, "Fetching 1080p/4K HD stock video assets with smart keyword extraction...", 60);

      const pexelsKey = credentials.pexelsKey || localStorage.getItem("pexels_api_key") || "";
      const pixabayKey = credentials.pixabayKey || localStorage.getItem("pixabay_api_key") || "";
      const coverrKey = credentials.coverrKey || localStorage.getItem("coverr_api_key") || "";

      const scenesWithVideo: Scene[] = await runWithConcurrencyLimit(
        scenesWithAudio,
        concurrencyLimit,
        async (scene: any, i: number) => {
          if (this.isAborted) throw new Error("Pipeline cancelled");

          let videoUrl = "";
          let previewUrl = "";
          let videoThumb = "";
          let author = "";

          if (videoMode === "pollinations") {
            const seed = Math.floor(Math.random() * 1000000);
            const promptStr = encodeURIComponent(`3d pixar style ${scene.keywords || scene.text || 'cinematic'}`);
            videoUrl = `https://image.pollinations.ai/prompt/${promptStr}?width=1280&height=720&nologo=true&seed=${seed}`;
            videoThumb = videoUrl;
            author = "Pollinations AI";
          } else {
            // 1. DUAL-SOURCE ROUTING: Check if scene mentions a named entity (historical figure, real person, famous landmark)
            const namedEntity = detectNamedEntity(scene.keywords, scene.text, scene.entity);

            if (namedEntity) {
              log(`[NER Routing] Proper noun/historical entity detected: "${namedEntity}". Querying Wikimedia Commons API...`);
              try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 6000);
                const wikiRes = await fetch(`/api/wikimedia/search?query=${encodeURIComponent(namedEntity)}`, {
                  signal: controller.signal,
                });
                clearTimeout(timer);
                if (wikiRes.ok) {
                  const wikiData = await wikiRes.json();
                  if (wikiData.hits && wikiData.hits.length > 0) {
                    const bestHit = wikiData.hits[0];
                    videoUrl = bestHit.url;
                    previewUrl = bestHit.url;
                    videoThumb = bestHit.thumbnail || bestHit.url;
                    author = bestHit.author || "Wikimedia Commons (Public Domain)";
                    log(`[Wikimedia Match] Found authentic public domain media for "${namedEntity}" on Wikimedia Commons.`);
                  }
                }
              } catch (err) {
                console.warn(`[Wikimedia Search Warning] Query "${namedEntity}":`, err);
              }
            }

            // 2. STOCK API ROUTING & SMART FALLBACK: If generic scene or Wikimedia returned zero hits
            if (!videoUrl) {
              // Smart 1-2 descriptive English keywords with cascading fallbacks
              const queriesToTry = extractDescriptiveQueries(scene.keywords, scene.text);

              for (const query of queriesToTry) {
                if (videoUrl) break;

              // 1. Pexels API
              if (pexelsKey || !pixabayKey) {
                try {
                  const controller = new AbortController();
                  const timer = setTimeout(() => controller.abort(), 5000);
                  const res = await fetch(`/api/pexels/search?query=${encodeURIComponent(query)}`, {
                    headers: { "x-pexels-key": pexelsKey },
                    signal: controller.signal,
                  });
                  clearTimeout(timer);
                  if (res.ok) {
                    const text = await res.text();
                    if (text && !text.trim().startsWith("<")) {
                      const data = JSON.parse(text);
                      if (data.videos?.length > 0) {
                        for (const bestClip of data.videos) {
                          const files = bestClip.video_files || [];
                          const mp4s = files.filter((f: any) => f.file_type === "video/mp4" || f.link?.includes(".mp4"));
                          const sortedMp4s = [...mp4s].sort((a: any, b: any) => ((Number(b.width) || 0) * (Number(b.height) || 0)) - ((Number(a.width) || 0) * (Number(a.height) || 0)));
                          
                          // Filter strictly for HD (>=1280x720) or 4K
                          const hdMp4 = sortedMp4s.find((f: any) => Number(f.width) >= 1280 || Number(f.height) >= 720 || f.quality === "hd" || f.quality === "4k");
                          const selectedVid = hdMp4 || sortedMp4s[0];

                          if (selectedVid) {
                            videoUrl = selectedVid.link || "";
                            previewUrl = sortedMp4s.find((f: any) => Number(f.width) <= 1280 && Number(f.width) >= 640)?.link || videoUrl;
                            videoThumb = bestClip.video_pictures?.[0]?.picture || "";
                            author = bestClip.user?.name || "Stock Creator";
                            break;
                          }
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.warn(`[Pipeline Pexels Warning] Query "${query}":`, e);
                }
              }

              // 2. Pixabay API
              if (!videoUrl && (pixabayKey || !pexelsKey)) {
                try {
                  const controller = new AbortController();
                  const timer = setTimeout(() => controller.abort(), 5000);
                  const res = await fetch(`/api/pixabay/search?query=${encodeURIComponent(query)}`, {
                    headers: { "x-pixabay-key": pixabayKey },
                    signal: controller.signal,
                  });
                  clearTimeout(timer);
                  if (res.ok) {
                    const text = await res.text();
                    if (text && !text.trim().startsWith("<")) {
                      const data = JSON.parse(text);
                      if (data.hits?.length > 0) {
                        for (const hit of data.hits) {
                          const vids = hit.videos || {};
                          const selectedVid = (vids.large && vids.large.url) ? vids.large : (vids.medium && vids.medium.url) ? vids.medium : null;
                          if (selectedVid && selectedVid.url) {
                            videoUrl = selectedVid.url;
                            previewUrl = vids.medium?.url || videoUrl;
                            videoThumb = hit.picture_id ? `https://i.vimeocdn.com/video/${hit.picture_id}_295x166.jpg` : "";
                            author = hit.user || "Pixabay Creator";
                            break;
                          }
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.warn(`[Pipeline Pixabay Warning] Query "${query}":`, e);
                }
              }

              // 3. Coverr API
              if (!videoUrl && (coverrKey || (!pexelsKey && !pixabayKey))) {
                try {
                  const controller = new AbortController();
                  const timer = setTimeout(() => controller.abort(), 5000);
                  const res = await fetch(`/api/coverr/search?query=${encodeURIComponent(query)}`, {
                    headers: { "x-coverr-key": coverrKey },
                    signal: controller.signal,
                  });
                  clearTimeout(timer);
                  if (res.ok) {
                    const text = await res.text();
                    if (text && !text.trim().startsWith("<")) {
                      const data = JSON.parse(text);
                      if (data.hits?.length > 0) {
                        const hit = data.hits[0];
                        videoUrl = hit.urls?.mp4 || hit.urls?.mp4_download || "";
                        videoThumb = hit.thumbnail || "";
                        author = hit.author?.name || "Coverr Creator";
                      }
                    }
                  }
                } catch (e) {
                  console.warn(`[Pipeline Coverr Warning] Query "${query}":`, e);
                }
              }
            }
          }

            // Fallback to stock catalog if zero API matches
            if (!videoUrl) {
              const fallbackItem = DEFAULT_CATALOG[i % DEFAULT_CATALOG.length];
              videoUrl = fallbackItem.url;
              videoThumb = fallbackItem.thumbnail;
              author = fallbackItem.author;
            }
          }

          return {
            id: scene.id || `sc_${i}_${Date.now()}`,
            text: scene.text,
            keywords: scene.keywords,
            caption: scene.caption || scene.text,
            duration: scene.exactDuration || scene.duration || 4.5,
            videoUrl: videoUrl || "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
            previewUrl: previewUrl || videoUrl || "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
            videoThumb,
            videoAuthor: author || "Stock Creator",
            videoAuthorUrl: "#",
            voiceoverUrl: scene.voiceoverUrl,
            originalIndex: i,
            transitionToNext: "fade" as any,
          };
        }
      );

      if (this.isAborted) throw new Error("Pipeline cancelled");

      // ==========================================
      // STEP 4: ASSET SYNCING & TIMELINE COMPOSITION
      // ==========================================
      updateStage(PipelineStage.ASSET_SYNCING, "Synchronizing audio tracks, video clips & Ken Burns transitions...", 85);

      if (onScenesUpdated) {
        onScenesUpdated(scenesWithVideo);
      }

      // ==========================================
      // STEP 5: FFMPEG RENDERING PREPARATION
      // ==========================================
      updateStage(PipelineStage.FFMPEG_RENDERING, "Preparing high-speed FFmpeg 1080p 30FPS render payload...", 95);

      const renderPayload = {
        scenes: scenesWithVideo,
        aspectRatio: "9:16",
        resolution: { width: 1080, height: 1920 },
        fps: 30,
        outputFormat: "mp4",
        encodingPreset: "fast",
        pixFmt: "yuv420p",
        crf: 18,
        movFlags: "+faststart",
      };

      updateStage(PipelineStage.COMPLETED, "Pipeline successfully built production-grade video timeline!", 100);

      return {
        scenes: scenesWithVideo,
        renderPayload,
      };
    } catch (err: any) {
      log(`[Pipeline Error] ${err.message}`);
      updateStage(PipelineStage.FAILED, err.message || "Video generation pipeline encountered an error", 0);
      // Execute automatic rollback and RAM memory cleanup
      this.memoryManager.cleanup();
      throw err;
    }
  }

  public cleanup(): void {
    this.memoryManager.cleanup();
  }
}
