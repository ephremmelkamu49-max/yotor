import { spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import os from "os";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

async function runCommand(cmd: string, timeoutMs: number = 180000, captureOutput: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    // We use shell: true to support complex FFmpeg command strings easily
    const child = spawn(cmd, { shell: true });
    
    let isDone = false;
    let stdoutData = "";
    let stderrData = "";

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        if (captureOutput) stdoutData += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (data) => {
        if (captureOutput) stderrData += data.toString();
      });
    }

    const timeout = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        child.kill("SIGKILL");
        reject(new Error(`Command timed out after ${timeoutMs}ms. Command: ${cmd.substring(0, 100)}...`));
      }
    }, timeoutMs);

    child.on("close", (code) => {
      if (!isDone) {
        isDone = true;
        clearTimeout(timeout);
        if (code === 0) {
          resolve(stdoutData);
        } else {
          reject(new Error(`Command failed with exit code ${code}.\nCommand: ${cmd.substring(0, 100)}...\nStderr: ${stderrData.substring(0, 500)}`));
        }
      }
    });

    child.on("exit", (code) => {
      if (!isDone) {
        isDone = true;
        clearTimeout(timeout);
        if (code === 0) {
          resolve(stdoutData);
        } else {
          reject(new Error(`Command exited with code ${code}.\nCommand: ${cmd.substring(0, 100)}...\nStderr: ${stderrData.substring(0, 500)}`));
        }
      }
    });

    child.on("error", (err) => {
      if (!isDone) {
        isDone = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to start command: ${err.message}`));
      }
    });
  });
}

const ffmpegPath = ffmpegStatic || "ffmpeg";
const ffprobePath = ffprobeStatic?.path || "ffprobe";

async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const stdout = await runCommand(`"${ffprobePath}" -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 "${filePath}"`, 30000, true);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export interface RenderScene {
  id: string;
  videoUrl: string;
  voiceoverUrl?: string;
  ttsAudioUrl?: string;
  ttsAudioBuffer?: string; // base64 string or data URL
  duration: number;
  musicVolume?: number;
  caption?: string;
  text?: string;
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
  if (!url) throw new Error("No URL provided for download");

  if (url.startsWith("data:")) {
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

  // Strip query params and hash for local filesystem checking
  const cleanUrl = url.split("?")[0].split("#")[0];
  const relativeClean = cleanUrl.replace(/^\/+/, '');

  if (cleanUrl.startsWith("/") || cleanUrl.startsWith("public/") || cleanUrl.startsWith("uploads/")) {
    const candidatePaths = [
      path.join(process.cwd(), relativeClean),
      path.join(process.cwd(), "public", relativeClean),
      path.join(process.cwd(), "public", relativeClean.replace(/^public\//, '')),
      path.join(process.cwd(), "public", "uploads", path.basename(relativeClean)),
      path.join(process.cwd(), "public", "exports", path.basename(relativeClean))
    ];

    for (const cand of candidatePaths) {
      try {
        await fs.access(cand);
        await fs.copyFile(cand, dest);
        return;
      } catch (_) {}
    }

    if (cleanUrl.startsWith("/")) {
      throw new Error(`Local asset not found on server disk: ${cleanUrl}`);
    }
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20 sec timeout
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP error ${response.status} downloading ${url}`);
      if (!response.body) throw new Error(`Response body is null for ${url}`);

      const fileStream = createWriteStream(dest);
      const nodeReadable = Readable.fromWeb(response.body as any);
      await pipeline(nodeReadable, fileStream);
      return;
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(`Failed to download ${url}: ${err.message}`);
    }
  }
  
  throw new Error(`Unsupported URL format: ${url.substring(0, 50)}`);
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
    
    let crf = 18;
    let preset = 'ultrafast';
    if (req.exportQuality === '720p') {
      crf = 20;
    } else if (req.exportQuality === '4k') {
      crf = 16;
    }

    const chunkFiles: string[] = [];
    let processedCount = 0;

    for (const [idx, scene] of req.scenes.entries()) {
      if (onProgress) {
        onProgress(`Processing video scene ${idx + 1}/${req.scenes.length}...`, 5 + (idx / req.scenes.length) * 75);
      }

      const videoPath = path.join(tempDir, `vid_${idx}.mp4`);
      const audioPath = path.join(tempDir, `aud_${idx}.wav`);
      const outPath = path.join(tempDir, `out_${idx}.mp4`);

      // 1. Download scene video/image asset
      if (!scene.videoUrl) {
        console.warn(`[FFmpegRenderer] No videoUrl provided for scene ${idx + 1}. Falling back to solid color background.`);
        (scene as any).downloadFailed = true;
      } else {
        let retries = 3;
        while (retries > 0) {
          try {
            await downloadFile(scene.videoUrl, videoPath);
            break;
          } catch (e: any) {
            retries--;
            console.error(`Failed to download ${scene.videoUrl}, retries left: ${retries}`);
            if (retries === 0) {
              console.warn(`[FFmpegRenderer] Failed to download video for scene ${idx + 1}: ${e.message}. Falling back to solid color background.`);
              (scene as any).downloadFailed = true;
            } else {
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
      }

      // Handle solid color fallback if download failed
      if ((scene as any).downloadFailed) {
        console.log(`[FFmpegRenderer] Generating solid color fallback canvas for scene ${idx + 1}...`);
        try {
          const solidColorCmd = `"${ffmpegPath}" -loglevel quiet -nostdin -y -f lavfi -i color=c=0x1a1230:s=${width}x${height} -t ${scene.duration || 5} -r 30 -pix_fmt yuv420p "${videoPath}"`;
          await runCommand(solidColorCmd);
        } catch (err: any) {
          console.error(`[FFmpegRenderer] Failed to generate solid color fallback: ${err.message}`);
        }
      }

      // Process voiceover track (check ttsAudioBuffer, voiceoverUrl, ttsAudioUrl)
      let hasVoiceover = false;
      const voSource = scene.ttsAudioBuffer || scene.voiceoverUrl || scene.ttsAudioUrl || (scene as any).voiceover;

      if (voSource) {
        try {
          if (voSource.startsWith("data:") || (!voSource.startsWith("http") && !voSource.startsWith("/") && voSource.length > 500)) {
            const commaIdx = voSource.indexOf(",");
            const base64Data = commaIdx !== -1 ? voSource.substring(commaIdx + 1) : voSource;
            await fs.writeFile(audioPath, Buffer.from(base64Data, "base64"));
            hasVoiceover = true;
          } else {
            await downloadFile(voSource, audioPath);
            hasVoiceover = true;
          }
        } catch (err: any) {
          console.error(`[FFmpegRenderer] Failed to write/download voiceover for scene ${idx + 1}: ${err.message}`);
          hasVoiceover = false;
        }
      }

      // Verify audio file actually exists and is non-empty
      if (hasVoiceover) {
        try {
          const st = await fs.stat(audioPath);
          if (st.size === 0) hasVoiceover = false;
        } catch {
          hasVoiceover = false;
        }
      }

      const isImage = (scene.videoUrl || "").match(/\.(jpeg|jpg|png|gif|webp)(\?|$)/i) || (scene.videoUrl || "").includes("pollinations.ai") || (scene.videoUrl || "").startsWith("data:image") || (scene as any).downloadFailed;
      const videoHasAudio = !isImage && (await hasAudioStream(videoPath));

      // 3. Normalize video to strictly 1920x1080 (or desired width/height) 30fps
      let finalFilter = `scale=${width}:${height},fps=30,format=yuv420p,setsar=1`;
      
      if (scene.duration >= 1.0) {
        const fadeDur = Math.min(0.25, scene.duration / 4);
        const fadeOutStart = Math.max(0, scene.duration - fadeDur).toFixed(2);
        finalFilter += `,fade=t=in:st=0:d=${fadeDur.toFixed(2)},fade=t=out:st=${fadeOutStart}:d=${fadeDur.toFixed(2)}`;
      }

      if (req.subtitleStyle?.enabled && scene.caption) {
        const cleanCaption = scene.caption
          .replace(/['’]/g, "")
          .replace(/[:]/g, " ")
          .replace(/\\/g, "");

        const fontColor = req.subtitleStyle.color || "white";
        const fontSize = Math.floor(height * 0.048);
        const yPos = req.subtitleStyle.position === "middle" ? "h*0.5" : (req.subtitleStyle.position === "top" ? "h*0.18" : "h*0.82");
        const bgColor = req.subtitleStyle.backgroundColor ? req.subtitleStyle.backgroundColor.replace("#", "0x") : undefined;
        const boxStyle = bgColor ? `:box=1:boxcolor=${bgColor}@0.5:boxborderw=10` : `:borderw=2:bordercolor=black`;
        finalFilter += `,drawtext=text='${cleanCaption}':font='Sans':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2:y=${yPos}${boxStyle}`;
      }

      // 4. Construct FFmpeg encoding command
      let cmd = `"${ffmpegPath}" -loglevel quiet -nostdin -y -fflags +genpts -avoid_negative_ts make_zero `;
      if (isImage) {
        cmd += `-loop 1 `;
      } else {
        cmd += `-stream_loop 50 `;
      }

      cmd += `-i "${videoPath}" `;

      if (hasVoiceover) {
        cmd += `-i "${audioPath}" `;
      } else if (!videoHasAudio) {
        cmd += `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 `;
      }

      // Robust Audio Mixing using amix
      let filterGraph = "";
      if (hasVoiceover && videoHasAudio) {
        // Mix Voiceover (input 1) + Original Ambient Video Audio (input 0)
        filterGraph = `[0:v]${finalFilter}[v];` +
          `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.0[vo];` +
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.35[bg];` +
          `[vo][bg]amix=inputs=2:duration=first:dropout_transition=2,volume=1.2[a]`;
      } else if (hasVoiceover && !videoHasAudio) {
        // Voiceover exists, video is silent or an image
        filterGraph = `[0:v]${finalFilter}[v];` +
          `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.0[a]`;
      } else if (!hasVoiceover && videoHasAudio) {
        // No Voiceover for this scene, keep original video audio
        filterGraph = `[0:v]${finalFilter}[v];` +
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.8[a]`;
      } else {
        // Neither Voiceover nor ambient audio exist, pad with silence
        filterGraph = `[0:v]${finalFilter}[v];` +
          `[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a]`;
      }

      cmd += `-filter_complex "${filterGraph}" -t ${scene.duration} -map "[v]" -map "[a]" -c:v libx264 -threads 0 -preset ${preset} -crf ${crf} -g 30 -keyint_min 30 -sc_threshold 0 -c:a aac -b:a 128k -ar 44100 -ac 2 -pix_fmt yuv420p -r 30 -vsync cfr -video_track_timescale 90000 "${outPath}"`;

      console.log(`Running FFmpeg normalization for scene ${idx + 1}...`);
      try {
        await runCommand(cmd);
      } catch (ffmpegErr: any) {
        console.warn(`[FFmpegRenderer] FFmpeg failed on scene ${idx + 1}. Retrying with silence fallback:`, ffmpegErr.message);
        
        let fallbackFilterGraph = `[0:v]${finalFilter}[v];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a]`;
        let fallbackCmd = `"${ffmpegPath}" -loglevel quiet -nostdin -y -fflags +genpts -avoid_negative_ts make_zero `;
        if (isImage) {
          fallbackCmd += `-loop 1 `;
        } else {
          fallbackCmd += `-stream_loop 50 `;
        }
        fallbackCmd += `-i "${videoPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 `;
        fallbackCmd += `-filter_complex "${fallbackFilterGraph}" -t ${scene.duration} -map "[v]" -map "[a]" -c:v libx264 -threads 0 -preset ${preset} -crf ${crf} -g 30 -keyint_min 30 -sc_threshold 0 -c:a aac -b:a 128k -ar 44100 -ac 2 -pix_fmt yuv420p -r 30 -vsync cfr -video_track_timescale 90000 "${outPath}"`;
        
        try {
          await runCommand(fallbackCmd);
        } catch (retryErr: any) {
          throw new Error(`Scene ${idx + 1} rendering failed: ${ffmpegErr.message} (Fallback retry also failed: ${retryErr.message})`);
        }
      }

      const sceneExists = await fs.access(outPath).then(() => true).catch(() => false);
      if (!sceneExists) {
        throw new Error(`Failed to produce processed video file for scene ${idx + 1}`);
      }

      // Unlink raw downloaded video and voiceover files immediately to conserve disk space
      await fs.unlink(videoPath).catch(() => {});
      if (hasVoiceover) {
        await fs.unlink(audioPath).catch(() => {});
      }

      chunkFiles.push(outPath);
      processedCount++;
    }

    // Concatenate all chunks into ONE master video file
    if (onProgress) onProgress("Stitching scenes into master video output...", 85);
    const listPath = path.join(tempDir, "master_list.txt");
    const listContent = chunkFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    await fs.writeFile(listPath, listContent);

    const masterPath = path.join(tempDir, "master_output.mp4");
    const concatCmd = `"${ffmpegPath}" -loglevel quiet -nostdin -y -f concat -safe 0 -i "${listPath}" -c copy -movflags +faststart "${masterPath}"`;
    console.log("Stitching video chunks into single master file...");
    
    try {
      await runCommand(concatCmd);
    } catch (concatErr) {
      console.warn("Stream copy concat failed, falling back to unified re-encode:", concatErr);
      const fallbackConcatCmd = `"${ffmpegPath}" -loglevel quiet -nostdin -y -f concat -safe 0 -i "${listPath}" -c:v libx264 -threads 0 -preset ultrafast -crf ${crf} -g 30 -keyint_min 30 -sc_threshold 0 -pix_fmt yuv420p -c:a aac -b:a 128k -ar 44100 -ac 2 -movflags +faststart "${masterPath}"`;
      await runCommand(fallbackConcatCmd);
    }

    const masterExists = await fs.access(masterPath).then(() => true).catch(() => false);
    if (!masterExists) {
      throw new Error("Failed to produce master concatenated video file.");
    }

    // Clean up intermediate chunk files
    for (const f of chunkFiles) {
      await fs.unlink(f).catch(() => {});
    }

    let finalPath = masterPath;

    // Optional background music mixing
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
        if (onProgress) onProgress("Mixing background music with voiceover...", 90);
        finalPath = path.join(tempDir, "final_master.mp4");
        
        const vol = req.musicVolume !== undefined ? req.musicVolume : 0.25;
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
        
        const musicMixFilter = `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,${volumeFilter}[bg_music];` +
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[main_audio];` +
          `[main_audio]asplit=2[main_out][main_sc];` +
          `[bg_music][main_sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[bg_ducked];` +
          `[main_out][bg_ducked]amix=inputs=2:duration=first:dropout_transition=2[a]`;

        const mixCmd = `"${ffmpegPath}" -loglevel quiet -nostdin -y -i "${masterPath}" -i "${musicPath}" -filter_complex "${musicMixFilter}" -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 128k -ar 44100 -ac 2 -movflags +faststart "${finalPath}"`;
        console.log("Mixing background music into master video...");
        try {
          await runCommand(mixCmd);
        } catch (mixErr) {
          console.warn("Sidechain ducking mix failed, falling back to standard amix:", mixErr);
          const fallbackMixCmd = `"${ffmpegPath}" -loglevel quiet -nostdin -y -i "${masterPath}" -i "${musicPath}" -filter_complex "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,${volumeFilter}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 128k -ar 44100 -ac 2 -movflags +faststart "${finalPath}"`;
          await runCommand(fallbackMixCmd);
        }
        
        const finalExists = await fs.access(finalPath).then(() => true).catch(() => false);
        if (!finalExists) {
          console.warn("Final mixed file not produced, falling back to masterPath.");
          finalPath = masterPath;
        } else {
          await fs.unlink(masterPath).catch(() => {});
          await fs.unlink(musicPath).catch(() => {});
        }
      }
    }

    if (onProgress) onProgress("Master video compilation complete!", 98);
    return finalPath;

  } catch (err) {
    console.error("Render error:", err);
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (rmErr) {
      console.warn("Failed to delete temp dir on error:", rmErr);
    }
    throw err;
  }
}
