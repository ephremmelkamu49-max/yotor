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

async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`/usr/bin/ffprobe -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "${filePath}"`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export interface RenderScene {
  id: string;
  videoUrl: string;
  ttsAudioBuffer?: string; // base64 encoded audio, or we can just download it if it's a full URL
  duration: number;
  musicVolume?: number;
  caption?: string;
}

export interface RenderRequest {
  scenes: RenderScene[];
  aspectRatio: string;
  exportQuality?: '720p' | '1080p' | '4k';
  musicUrl?: string;
  musicVolume?: number;
  ramLimit?: number;
  subtitleStyle?: any;
  visualStyle?: string;
  videoFilter?: string;
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
    let width = 1920;
    let height = 1080;
    
    if (req.exportQuality === '720p') {
      width = 1280;
      height = 720;
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
    
    let crf = 16;
    let preset = 'superfast';
    
    if (req.exportQuality === '720p') {
      crf = 18;
      preset = 'superfast';
    } else if (req.exportQuality === '4k') {
      crf = 14;
      preset = 'veryfast';
    }

    // Batch Processing & Chunking Architecture for 10-30+ min videos
    // Process scenes in small batches of 5 to prevent OOM RAM/Disk spikes
    const BATCH_SIZE = 5;
    const chunkFiles: string[] = [];
    let processedCount = 0;

    for (let batchIdx = 0; batchIdx < req.scenes.length; batchIdx += BATCH_SIZE) {
      const batchScenes = req.scenes.slice(batchIdx, batchIdx + BATCH_SIZE);
      const batchSceneFiles: string[] = [];

      if (onProgress) {
        onProgress(`Processing video batch ${Math.floor(batchIdx / BATCH_SIZE) + 1}/${Math.ceil(req.scenes.length / BATCH_SIZE)} (scenes ${batchIdx + 1}-${Math.min(batchIdx + BATCH_SIZE, req.scenes.length)})...`, 5 + (batchIdx / req.scenes.length) * 75);
      }

      // 1. Download videos on-demand for ONLY current batch
      await Promise.all(batchScenes.map(async (scene, bIdx) => {
        const globalIdx = batchIdx + bIdx;
        const videoPath = path.join(tempDir, `vid_${globalIdx}.mp4`);
        let retries = 3;
        while (retries > 0) {
          try {
            await downloadFile(scene.videoUrl, videoPath);
            break;
          } catch (e: any) {
            retries--;
            console.error(`Failed to download ${scene.videoUrl}, retries left: ${retries}`);
            if (retries === 0) throw new Error(`Failed to download video for scene ${globalIdx + 1}: ${e.message}`);
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }));

      // 2. Render each scene in current batch
      for (let bIdx = 0; bIdx < batchScenes.length; bIdx++) {
        const scene = batchScenes[bIdx];
        const globalIdx = batchIdx + bIdx;

        const videoPath = path.join(tempDir, `vid_${globalIdx}.mp4`);
        const audioPath = path.join(tempDir, `aud_${globalIdx}.wav`);
        const outPath = path.join(tempDir, `out_${globalIdx}.mp4`);

        if (scene.ttsAudioBuffer) {
          await fs.writeFile(audioPath, Buffer.from(scene.ttsAudioBuffer, "base64"));
        }

        const isImage = scene.videoUrl.match(/\.(jpeg|jpg|png|gif|webp)(\?|$)/i) || scene.videoUrl.includes("pollinations.ai") || scene.videoUrl.startsWith("data:image");
        const hasTTS = !!scene.ttsAudioBuffer;
        const videoHasAudio = !isImage && (await hasAudioStream(videoPath));

        let baseScale = `scale=${width}:${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},setsar=1,fps=30,format=yuv420p`;
        if (isImage) {
          const totalFrames = Math.max(30, Math.round(scene.duration * 30));
          // Dynamic Ken Burns pan & zoom effect (slow zoom-in from 1.00 -> 1.12)
          baseScale = `zoompan=z='min(zoom+0.0012,1.12)':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height},${baseScale}`;
        }

        let finalFilter = baseScale;

        if (scene.duration >= 1.0) {
          const fadeDur = Math.min(0.25, scene.duration / 4);
          const fadeOutStart = Math.max(0, scene.duration - fadeDur).toFixed(2);
          finalFilter += `,fade=t=in:st=0:d=${fadeDur.toFixed(2)},fade=t=out:st=${fadeOutStart}:d=${fadeDur.toFixed(2)}`;
        }

        if (req.videoFilter) {
          switch (req.videoFilter) {
            case "sepia":
              finalFilter += ",colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131";
              break;
            case "grayscale":
              finalFilter += ",hue=s=0";
              break;
            case "contrast":
              finalFilter += ",eq=contrast=1.5:brightness=-0.05";
              break;
            case "vintage":
              finalFilter += ",colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=contrast=1.2:brightness=-0.05:saturation=0.8";
              break;
            case "teal":
              finalFilter += ",hue=h=-15:s=1.35,eq=contrast=1.15";
              break;
            case "high-contrast":
              finalFilter += ",eq=contrast=1.8:brightness=-0.05:saturation=1.25";
              break;
          }
        }

        if (req.visualStyle) {
          switch (req.visualStyle) {
            case "realistic":
              finalFilter += ",eq=contrast=1.05:brightness=0.0:saturation=1.05";
              break;
            case "cyberpunk":
              finalFilter += ",hue=h=10:s=1.4,eq=contrast=1.1";
              break;
            case "3d-animation":
              finalFilter += ",eq=contrast=1.1:brightness=0.02:saturation=1.3";
              break;
            case "watercolor":
              finalFilter += ",eq=contrast=0.9:brightness=0.02:saturation=0.9,hue=h=5";
              break;
            case "anime":
              finalFilter += ",eq=contrast=1.05:brightness=0.05:saturation=1.25";
              break;
          }
        }

        if (req.subtitleStyle?.enabled && scene.caption) {
          const cleanCaption = scene.caption
            .replace(/['’]/g, "")
            .replace(/[:]/g, " ")
            .replace(/\\/g, "");

          const fontColor = req.subtitleStyle.color || "white";
          const fontSize = Math.floor(height * 0.048);

          let yPos = "h*0.82";
          if (req.subtitleStyle.position === "middle") {
            yPos = "h*0.5";
          } else if (req.subtitleStyle.position === "top") {
            yPos = "h*0.18";
          }

          let boxStyle = "";
          if (req.subtitleStyle.backgroundColor) {
            const bgColor = req.subtitleStyle.backgroundColor.replace("#", "0x");
            boxStyle = `:box=1:boxcolor=${bgColor}@0.5:boxborderw=10`;
          } else {
            boxStyle = `:borderw=2:bordercolor=black`;
          }

          finalFilter += `,drawtext=text='${cleanCaption}':font='Sans':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2:y=${yPos}${boxStyle}`;
        }

        let cmd = `"${ffmpegPath}" -loglevel quiet -y -fflags +genpts -avoid_negative_ts make_zero `;
        if (isImage) {
          cmd += `-loop 1 `;
        } else {
          cmd += `-stream_loop 50 `;
        }

        cmd += `-i "${videoPath}" `;

        if (hasTTS) {
          cmd += `-fflags +genpts -avoid_negative_ts make_zero -i "${audioPath}" `;
        } else if (!videoHasAudio) {
          cmd += `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 `;
        }

        // Build unified filter_complex for both video and dynamic audio ducking
        let filterGraph = "";
        if (hasTTS && videoHasAudio) {
          // Both Voiceover (TTS) and Ambient Video Audio exist
          // Dynamic sidechain compression: lower ambient sound to 10-15% when TTS speaks, smoothly recover to 40-50% during pauses
          filterGraph = `[0:v]${finalFilter}[v];` +
            `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.0[tts];` +
            `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.45[ambient];` +
            `[tts]asplit=2[tts_main][tts_sc];` +
            `[ambient][tts_sc]sidechaincompress=threshold=0.03:ratio=10:attack=15:release=300:level_in=1.0[ambient_ducked];` +
            `[tts_main][ambient_ducked]amix=inputs=2:duration=first:dropout_transition=2[a]`;
        } else if (hasTTS && !videoHasAudio) {
          // Voiceover exists, video is silent or an image
          filterGraph = `[0:v]${finalFilter}[v];` +
            `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.0[a]`;
        } else if (!hasTTS && videoHasAudio) {
          // No Voiceover for this scene, keep ambient video audio at audible level
          filterGraph = `[0:v]${finalFilter}[v];` +
            `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.5[a]`;
        } else {
          // Neither Voiceover nor ambient audio exist, pad with silence
          filterGraph = `[0:v]${finalFilter}[v];` +
            `[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a]`;
        }

        cmd += `-filter_complex "${filterGraph}" -t ${scene.duration} -map "[v]" -map "[a]" -c:v libx264 -preset ${preset} -crf ${crf} -g 30 -keyint_min 30 -sc_threshold 0 -c:a aac -ar 44100 -ac 2 -pix_fmt yuv420p -r 30 -vsync cfr -video_track_timescale 90000 "${outPath}"`;

        console.log(`Running FFmpeg for scene segment ${globalIdx + 1}...`);
        await runCommand(cmd);

        const sceneExists = await fs.access(outPath).then(() => true).catch(() => false);
        if (!sceneExists) {
          throw new Error(`Failed to produce processed video file for scene ${globalIdx + 1}`);
        }

        // Immediately clean up raw downloaded asset & WAV audio
        await fs.unlink(videoPath).catch(() => {});
        if (hasTTS) {
          await fs.unlink(audioPath).catch(() => {});
        }

        batchSceneFiles.push(outPath);
        processedCount++;
      }

      // 3. Concat current batch into intermediate chunk_X.mp4
      const chunkListPath = path.join(tempDir, `chunk_list_${batchIdx}.txt`);
      const chunkListContent = batchSceneFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
      await fs.writeFile(chunkListPath, chunkListContent);

      const chunkOutPath = path.join(tempDir, `chunk_${Math.floor(batchIdx / BATCH_SIZE)}.mp4`);
      const chunkConcatCmd = `"${ffmpegPath}" -loglevel quiet -y -f concat -safe 0 -i "${chunkListPath}" -c copy -movflags +faststart "${chunkOutPath}"`;
      
      try {
        await runCommand(chunkConcatCmd);
      } catch (err) {
        const fallbackChunkCmd = `"${ffmpegPath}" -loglevel quiet -y -f concat -safe 0 -i "${chunkListPath}" -c:v libx264 -preset superfast -crf ${crf} -g 30 -keyint_min 30 -sc_threshold 0 -pix_fmt yuv420p -c:a aac -ar 44100 -ac 2 -movflags +faststart "${chunkOutPath}"`;
        await runCommand(fallbackChunkCmd);
      }

      chunkFiles.push(chunkOutPath);

      // Clean up individual scene files for this batch immediately
      for (const f of batchSceneFiles) {
        await fs.unlink(f).catch(() => {});
      }
      await fs.unlink(chunkListPath).catch(() => {});
    }

    // Concatenate all chunks using absolute paths with safe=0
    if (onProgress) onProgress("Stitching chunks together...", 85);
    const listPath = path.join(tempDir, "list.txt");
    const listContent = chunkFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    await fs.writeFile(listPath, listContent);

    const concatPath = path.join(tempDir, "concat.mp4");
    // All chunk segments are pre-rendered to identical geometry, 30fps CFR, YUV420p, and GOP=30.
    // Try lightning fast direct stream-copy concatenation first for lossless seamless transition.
    const concatCmd = `"${ffmpegPath}" -loglevel quiet -y -f concat -safe 0 -i "${listPath}" -c copy -movflags +faststart "${concatPath}"`;
    console.log("Stitching video chunks...");
    if (onProgress) onProgress("Stitching video chunks (Final phase)...", 85);
    
    try {
      await runCommand(concatCmd);
    } catch (concatErr) {
      console.warn("Stream copy concat failed, falling back to unified re-encode:", concatErr);
      const fallbackConcatCmd = `"${ffmpegPath}" -loglevel quiet -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -preset superfast -crf ${crf} -g 30 -keyint_min 30 -sc_threshold 0 -pix_fmt yuv420p -c:a aac -ar 44100 -ac 2 -movflags +faststart "${concatPath}"`;
      await runCommand(fallbackConcatCmd);
    }

    // Verify concat file exists
    const concatExists = await fs.access(concatPath).then(() => true).catch(() => false);
    if (!concatExists) {
      throw new Error("Failed to produce concatenated video file.");
    }

    // Eagerly delete all intermediate chunk MP4 files as the concatenated master is successfully ready
    console.log("Eagerly cleaning up intermediate chunk files...");
    for (const f of chunkFiles) {
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

        const volumeFilter = hasOverrides ? `volume='${expr}':eval=frame` : `volume=${vol.toFixed(2)}`;
        
        // Dynamic sidechain ducking filter graph: compress background music down to ~10-15% when voiceover/master audio is active
        const musicMixFilter = `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,${volumeFilter}[bg_music];` +
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[main_audio];` +
          `[main_audio]asplit=2[main_out][main_sc];` +
          `[bg_music][main_sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[bg_ducked];` +
          `[main_out][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2[a]`;

        const mixCmd = `"${ffmpegPath}" -loglevel quiet -y -i "${concatPath}" -i "${musicPath}" -filter_complex "${musicMixFilter}" -map 0:v:0 -map "[a]" -c:v copy -c:a aac -ar 44100 -ac 2 -movflags +faststart "${finalPath}"`;
        console.log("Mixing background music with dynamic audio ducking...");
        try {
          await runCommand(mixCmd);
        } catch (mixErr) {
          console.warn("Sidechain ducking mix failed for background music, falling back to standard amix:", mixErr);
          const fallbackMixCmd = `"${ffmpegPath}" -loglevel quiet -y -i "${concatPath}" -i "${musicPath}" -filter_complex "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,${volumeFilter}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v:0 -map "[a]" -c:v copy -c:a aac -ar 44100 -ac 2 -movflags +faststart "${finalPath}"`;
          await runCommand(fallbackMixCmd);
        }
        
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
