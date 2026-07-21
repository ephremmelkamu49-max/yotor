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
  exportQuality?: '720p' | '1080p' | '4k';
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
    
    // Add AbortSignal timeout to prevent hanging forever on unresponsive CDN nodes (increased to 180 seconds for long video downloads)
    const response = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(180000)
    });

    if (!response.ok) throw new Error(`Failed to download ${fetchUrl} (status: ${response.status})`);

    if (!response.body) {
      throw new Error(`Response body is null for ${fetchUrl}`);
    }

    // Pipe the response body stream directly to disk file stream to completely bypass RAM buffering
    const fileStream = createWriteStream(dest);
    const nodeReadable = Readable.fromWeb(response.body as any);
    await pipeline(nodeReadable, fileStream);
    return;
  }
  
  throw new Error(`Unsupported URL format: ${url.substring(0, 30)}`);
}

export async function renderVideo(req: RenderRequest, onProgress?: (msg: string, progress: number) => void): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yotor-render-"));
  
  try {
    let width = 1280;
    let height = 720;
    
    if (req.exportQuality === '1080p') {
      width = 1920;
      height = 1080;
    } else if (req.exportQuality === '4k') {
      width = 3840;
      height = 2160;
    }

    if (req.aspectRatio === "9:16") {
      const temp = width;
      width = height;
      height = temp;
    } else if (req.aspectRatio === "1:1") {
      width = Math.min(width, height);
      height = width;
    }

    if (req.ramLimit) {
      console.log(`[High-Performance System Engine] Allocated RAM Limit for Job: ${req.ramLimit} GB`);
      if (onProgress) onProgress(`Allocating ${req.ramLimit} GB high-performance RAM...`, 3);
    }
    
    let crf = 18;
    let preset = 'ultrafast';
    
    if (req.exportQuality === '1080p') {
      crf = 16;
      preset = 'ultrafast';
    } else if (req.exportQuality === '4k') {
      crf = 14;
      preset = 'superfast';
    }

    if (onProgress) {
      onProgress(`Downloading all ${req.scenes.length} video assets in parallel...`, 5);
    }
    console.log(`Starting parallel download of ${req.scenes.length} video assets...`);
    
    await Promise.all(req.scenes.map(async (scene, i) => {
      const videoPath = path.join(tempDir, `vid_${i}.mp4`);
      let retries = 3;
      while (retries > 0) {
        try {
          await downloadFile(scene.videoUrl, videoPath);
          break;
        } catch (e: any) {
          retries--;
          console.error(`Failed to download ${scene.videoUrl}, retries left: ${retries}`);
          if (retries === 0) throw new Error(`Failed to download video for scene ${i + 1}: ${e.message}`);
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }));

    const sceneFiles: string[] = [];
    let processedCount = 0;

    // Process scenes sequentially with cached parallel downloads
    for (let i = 0; i < req.scenes.length; i++) {
      const scene = req.scenes[i];
      if (onProgress) {
        onProgress(`Processing scene ${i + 1}/${req.scenes.length} (Rendering segment...)`, 20 + (i / req.scenes.length) * 60);
      }
      console.log(`Processing scene ${i + 1}/${req.scenes.length}...`);

      const videoPath = path.join(tempDir, `vid_${i}.mp4`);
      const audioPath = path.join(tempDir, `aud_${i}.wav`);
      const outPath = path.join(tempDir, `out_${i}.mp4`);

      // 2. If there's TTS, write it
      if (scene.ttsAudioBuffer) {
        await fs.writeFile(audioPath, Buffer.from(scene.ttsAudioBuffer, "base64"));
      }

      // 3. Format video: crop/scale, set duration, add audio if exists
      const hasAudio = !!scene.ttsAudioBuffer;
      const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
      const isImage = scene.videoUrl.match(/\.(jpeg|jpg|png|gif|webp)(\?|$)/i) || scene.videoUrl.includes("pollinations.ai") || scene.videoUrl.startsWith("data:image");

      let cmd = `"${ffmpegPath}" -loglevel quiet -y `;
      if (isImage) {
        cmd += `-loop 1 `;
      } else {
        cmd += `-stream_loop -1 `;
      }

      cmd += `-i "${videoPath}" `;

      if (hasAudio) {
        cmd += `-i "${audioPath}" `;
      } else {
        cmd += `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 `;
      }

      // Precise duration constraint via -t while forcing constant frame rate and standard 90k timescale with crisp CRF quality
      cmd += `-vf "${scaleFilter}" -t ${scene.duration} -map 0:v:0 -map 1:a:0 -c:v libx264 -preset ${preset} -crf ${crf} -c:a aac -ar 44100 -ac 2 -pix_fmt yuv420p -r 30 -vsync cfr -video_track_timescale 90000 "${outPath}"`;

      console.log(`Running FFmpeg for scene segment ${i}...`);
      await runCommand(cmd);

      // Verify scene file exists
      const sceneExists = await fs.access(outPath).then(() => true).catch(() => false);
      if (!sceneExists) {
        throw new Error(`Failed to produce processed video file for scene ${i}`);
      }

      // 4. IMMEDIATELY clean up raw downloaded asset and TTS WAV audio for this segment
      try {
        await fs.unlink(videoPath).catch(() => {});
        if (hasAudio) {
          await fs.unlink(audioPath).catch(() => {});
        }
      } catch (cleanupErr) {
        console.warn(`Eager scene ${i} asset cleanup failed:`, cleanupErr);
      }

      sceneFiles.push(outPath);
      processedCount++;
      if (onProgress) {
        onProgress(`Processed scene ${processedCount}/${req.scenes.length}`, 5 + (processedCount / req.scenes.length) * 75);
      }
    }

    // Concatenate all scenes using absolute paths with safe=0
    if (onProgress) onProgress("Stitching scenes together...", 85);
    const listPath = path.join(tempDir, "list.txt");
    const listContent = sceneFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    await fs.writeFile(listPath, listContent);

    const concatPath = path.join(tempDir, "concat.mp4");
    // Re-encode during concat to ensure unified PTS timestamps and smooth seeking in all web browsers.
    const concatCmd = `"${ffmpegPath}" -loglevel quiet -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset ${preset} -crf ${crf} -pix_fmt yuv420p -c:a aac -ar 44100 -ac 2 -movflags +faststart "${concatPath}"`;
    console.log("Stitching video segments...");
    if (onProgress) onProgress("Stitching scenes together (Final phase)...", 85);
    await runCommand(concatCmd);

    // Verify concat file exists
    const concatExists = await fs.access(concatPath).then(() => true).catch(() => false);
    if (!concatExists) {
      throw new Error("Failed to produce concatenated video file.");
    }

    // Eagerly delete all individual scene MP4 files as the concatenated master is successfully ready
    console.log("Eagerly cleaning up intermediate scene files...");
    for (const f of sceneFiles) {
      try {
        await fs.unlink(f).catch(() => {});
      } catch (e) {}
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
        // amix with duration=first ensures the mixed audio stream terminates exactly when the video terminates
        // Using -c:v copy allows lightning-fast rendering while preserving the perfect CFR and PTS structure of the input video
        const mixCmd = `"${ffmpegPath}" -loglevel quiet -y -i "${concatPath}" -i "${musicPath}" -filter_complex "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,${volumeFilter}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v:0 -map "[a]" -c:v copy -c:a aac -movflags +faststart "${finalPath}"`;
        console.log("Mixing background music...");
        await runCommand(mixCmd);
        
        const finalExists = await fs.access(finalPath).then(() => true).catch(() => false);
        if (!finalExists) {
          console.warn("Final mixed file not produced, falling back to concat version.");
          finalPath = concatPath;
        } else {
          // Eagerly delete the unmixed concatPath and background musicPath to save critical memory/disk space
          try {
            await fs.unlink(concatPath).catch(() => {});
            await fs.unlink(musicPath).catch(() => {});
          } catch (e) {}
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
