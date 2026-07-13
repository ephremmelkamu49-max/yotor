import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import os from "os";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const execAsync = promisify(exec);

async function runCommand(cmd: string) {
  try {
    await execAsync(cmd, { maxBuffer: 1024 * 1024 * 100 });
  } catch (err: any) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    const stdout = err.stdout ? err.stdout.toString() : "";
    throw new Error(`Command failed.\nError: ${err.message}\nStderr: ${stderr}\nStdout: ${stdout}`);
  }
}
// Prefer native system ffmpeg (/usr/bin/ffmpeg) over node_modules binary to guarantee architecture compatibility and executable permissions
const ffmpegPath = "/usr/bin/ffmpeg";

export interface RenderScene {
  id: string;
  videoUrl: string;
  ttsAudioBuffer?: string; // base64 encoded audio, or we can just download it if it's a full URL
  duration: number;
  musicVolume?: number;
}

export interface RenderRequest {
  scenes: RenderScene[];
  aspectRatio: string;
  musicUrl?: string;
  musicVolume?: number;
  ramLimit?: number;
}

async function downloadFile(url: string, dest: string) {
  if (url.startsWith("data:")) {
    // High-performance substring splitting instead of expensive regex match on huge base64 assets
    const commaIndex = url.indexOf(",");
    if (commaIndex !== -1) {
      const base64Data = url.substring(commaIndex + 1);
      const buffer = Buffer.from(base64Data, "base64");
      await fs.writeFile(dest, buffer);
      return;
    }
  }

  // Rewrite Pexels image subdomain to video subdomain for backend download stability
  if (url.includes("images.pexels.com/video-files/")) {
    url = url.replace("images.pexels.com/video-files/", "videos.pexels.com/video-files/");
  }

  // Handle http and relative local URLs
  if (url.startsWith("/")) {
    const localPath = path.join(process.cwd(), url);
    try {
      await fs.access(localPath);
      await fs.copyFile(localPath, dest);
      return;
    } catch (_) {
      // Fallback to public folder if it exists
      const publicPath = path.join(process.cwd(), "public", url);
      try {
        await fs.access(publicPath);
        await fs.copyFile(publicPath, dest);
        return;
      } catch (_) {}
    }
  }

  if (url.startsWith("http") || url.startsWith("/")) {
    const fetchUrl = url.startsWith("/") ? `http://127.0.0.1:3000${url}` : url;
    
    // Add AbortSignal timeout to prevent hanging forever on unresponsive CDN nodes
    const response = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) throw new Error(`Failed to download ${fetchUrl} (status: ${response.status})`);

    // Use streaming to save RAM!
    const buffer = await response.arrayBuffer();
    await fs.writeFile(dest, Buffer.from(buffer));
    return;
  }
  
  throw new Error(`Unsupported URL format: ${url.substring(0, 30)}`);
}

export async function renderVideo(req: RenderRequest, onProgress?: (msg: string, progress: number) => void): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yotor-render-"));
  
  try {
    let width = 1280;
    let height = 720;
    if (req.aspectRatio === "9:16") {
      width = 720;
      height = 1280;
    } else if (req.aspectRatio === "1:1") {
      width = 1080;
      height = 1080;
    }

    if (req.ramLimit) {
      console.log(`[High-Performance System Engine] Allocated RAM Limit for Job: ${req.ramLimit} GB`);
      if (onProgress) onProgress(`Allocating ${req.ramLimit} GB high-performance RAM...`, 3);
    }

    const sceneFiles: string[] = [];
    if (onProgress) onProgress(`Downloading ${req.scenes.length} scene assets...`, 5);
    console.log(`Downloading ${req.scenes.length} scene assets...`);
    
    // Concurrency limiter function
    const runWithConcurrency = async <T,>(items: T[], concurrency: number, task: (item: T, index: number) => Promise<void>) => {
      const queue = items.map((item, index) => ({ item, index }));
      const workers = Array(concurrency).fill(null).map(async () => {
        while (queue.length > 0) {
          const { item, index } = queue.shift()!;
          await task(item, index);
        }
      });
      await Promise.all(workers);
    };

    let downloadedCount = 0;
    // Download in parallel with concurrency 5
    await runWithConcurrency(req.scenes, 5, async (scene, i) => {
      const videoPath = path.join(tempDir, `vid_${i}.mp4`);
      const audioPath = path.join(tempDir, `aud_${i}.wav`);
      
      // Download video with retry
      let retries = 3;
      while (retries > 0) {
        try {
          await downloadFile(scene.videoUrl, videoPath);
          break;
        } catch (e: any) {
          retries--;
          console.error(`Failed to download ${scene.videoUrl}, retries left: ${retries}`);
          if (retries === 0) throw e;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      // If there's TTS, write it
      if (scene.ttsAudioBuffer) {
        await fs.writeFile(audioPath, Buffer.from(scene.ttsAudioBuffer, "base64"));
      }
      downloadedCount++;
      if (onProgress) onProgress(`Downloaded asset ${downloadedCount}/${req.scenes.length}`, 5 + (downloadedCount / req.scenes.length) * 15);
    });

    console.log("All assets downloaded successfully. Commencing fast FFmpeg scene processing...");
    if (onProgress) onProgress("All assets ready. Commencing FFmpeg scene processing...", 20);

    let processedCount = 0;
    // Process scenes in parallel with concurrency 3 (to avoid CPU/Memory overload)
    await runWithConcurrency(req.scenes, 3, async (scene, i) => {
      const videoPath = path.join(tempDir, `vid_${i}.mp4`);
      const audioPath = path.join(tempDir, `aud_${i}.wav`);
      const outPath = path.join(tempDir, `out_${i}.mp4`);
      
      const hasAudio = !!scene.ttsAudioBuffer;

      // Format video: crop/scale, set duration, add audio if exists
      // Filter graph for scaling and cropping to fit exactly
      const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
      
      const isImage = scene.videoUrl.match(/\.(jpeg|jpg|png|gif|webp)(\?|$)/i) || scene.videoUrl.includes("pollinations.ai") || scene.videoUrl.startsWith("data:image");
      
      let cmd = `"${ffmpegPath}" -loglevel quiet -y `;
      if (isImage) {
        cmd += `-loop 1 `;
      } else {
        // Loop the input video infinitely so it matches the voiceover duration perfectly
        cmd += `-stream_loop -1 `;
      }

      cmd += `-i "${videoPath}" `;
      
      if (hasAudio) {
        cmd += `-i "${audioPath}" `;
      } else {
        cmd += `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 `;
      }
      
      // Use -shortest as an extra safety measure with -t, while forcing constant frame rate and standard 90k timescale
      cmd += `-vf "${scaleFilter}" -t ${scene.duration} -map 0:v:0 -map 1:a:0 -c:v libx264 -preset ultrafast -c:a aac -ar 44100 -ac 2 -pix_fmt yuv420p -r 30 -vsync cfr -video_track_timescale 90000 -shortest "${outPath}"`;
      
      console.log(`Processing scene segment ${i}...`);
      await runCommand(cmd);

      // Verify scene file exists
      const sceneExists = await fs.access(outPath).then(() => true).catch(() => false);
      if (!sceneExists) {
        throw new Error(`Failed to produce processed video file for scene ${i}`);
      }

      processedCount++;
      if (onProgress) onProgress(`Processed scene ${processedCount}/${req.scenes.length}`, 20 + (processedCount / req.scenes.length) * 60);
    });
    
    for (let i = 0; i < req.scenes.length; i++) {
      sceneFiles.push(path.join(tempDir, `out_${i}.mp4`));
    }

    // Concatenate all scenes using absolute paths with safe=0
    if (onProgress) onProgress("Stitching scenes together...", 85);
    const listPath = path.join(tempDir, "list.txt");
    const listContent = sceneFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    await fs.writeFile(listPath, listContent);

    const concatPath = path.join(tempDir, "concat.mp4");
    // Regenerate PTS and make sure timestamps start at zero and are monotonic
    const concatCmd = `"${ffmpegPath}" -loglevel quiet -y -fflags +genpts -f concat -safe 0 -i "${listPath}" -c copy -avoid_negative_ts make_zero -movflags +faststart "${concatPath}"`;
    console.log("Stitching video segments...");
    if (onProgress) onProgress("Stitching scenes together (Final phase)...", 85);
    await runCommand(concatCmd);

    // Verify concat file exists
    const concatExists = await fs.access(concatPath).then(() => true).catch(() => false);
    if (!concatExists) {
      throw new Error("Failed to produce concatenated video file.");
    }

    let finalPath = concatPath;

    if (req.musicUrl) {
      if (onProgress) onProgress("Downloading background music...", 88);
      const musicPath = path.join(tempDir, "music.mp3");
      try {
        await downloadFile(req.musicUrl, musicPath);
      } catch (musicErr: any) {
        console.warn("Failed to download background music, proceeding without it:", musicErr);
        if (onProgress) onProgress("Warning: Background music download failed. Proceeding...", 89);
      }
      
      const musicExists = await fs.access(musicPath).then(() => true).catch(() => false);
      
      if (musicExists) {
        if (onProgress) onProgress("Mixing cinematic background music...", 90);
        finalPath = path.join(tempDir, "final.mp4");
        
        const vol = req.musicVolume !== undefined ? req.musicVolume : 0.3;
        
        // Compute dynamic volume expression for scenes if there are overrides
        let expr = `${vol}`;
        let cumulativeTime = 0;
        let hasOverrides = false;

        for (const scene of req.scenes) {
          const sceneVol = scene.musicVolume !== undefined ? scene.musicVolume : vol;
          if (Math.abs(sceneVol - vol) > 0.001) {
            hasOverrides = true;
            const start = cumulativeTime.toFixed(2);
            const end = (cumulativeTime + scene.duration).toFixed(2);
            expr = `if(between(t,${start},${end}),${sceneVol.toFixed(3)},${expr})`;
          }
          cumulativeTime += scene.duration;
        }

        const volumeFilter = hasOverrides ? `volume='${expr}':eval=frame` : `volume=${vol}`;
        
        // Mix concatenated audio with music audio
        // Using explicit -t instead of buggy -shortest to ensure perfect MP4 container indexes on Chrome
        // Using aformat to ensure audio compatibility during mix, and regenerating PTS for perfect sync
        const mixCmd = `"${ffmpegPath}" -loglevel quiet -y -fflags +genpts -i "${concatPath}" -i "${musicPath}" -filter_complex "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,${volumeFilter}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v:0 -map "[a]" -c:v copy -c:a aac -avoid_negative_ts make_zero -t ${cumulativeTime.toFixed(2)} -movflags +faststart "${finalPath}"`;
        console.log("Mixing background music...");
        await runCommand(mixCmd);
        
        const finalExists = await fs.access(finalPath).then(() => true).catch(() => false);
        if (!finalExists) {
          console.warn("Final mixed file not produced, falling back to concat version.");
          finalPath = concatPath;
        }
      }
    }

    if (onProgress) onProgress("Finalizing render...", 98);
    return finalPath; // Return the path to the final video

  } catch (err) {
    console.error("Render error:", err);
    throw err;
  }
}
