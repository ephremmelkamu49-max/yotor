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

export async function renderVideo(req: RenderRequest): Promise<string> {
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

    const sceneFiles: string[] = [];
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
    });

    console.log("All assets downloaded successfully. Commencing fast FFmpeg scene processing...");

    // Process scenes in parallel with concurrency 3 (to avoid CPU/Memory overload)
    await runWithConcurrency(req.scenes, 3, async (scene, i) => {
      const videoPath = path.join(tempDir, `vid_${i}.mp4`);
      const audioPath = path.join(tempDir, `aud_${i}.wav`);
      const outPath = path.join(tempDir, `out_${i}.mp4`);
      
      const hasAudio = !!scene.ttsAudioBuffer;

      // Format video: crop/scale, set duration, add audio if exists
      // Filter graph for scaling and cropping to fit exactly
      const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
      
      const isImage = scene.videoUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i) || scene.videoUrl.includes("pollinations.ai") || scene.videoUrl.startsWith("data:image");
      
      let cmd = `"${ffmpegPath}" -loglevel error -y `;
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
      
      cmd += `-vf "${scaleFilter}" -t ${scene.duration} -map 0:v:0 -map 1:a:0 -c:v libx264 -preset ultrafast -c:a aac -pix_fmt yuv420p -r 30 "${outPath}"`;
      
      console.log("Running scene", i);
      await execAsync(cmd);
    });
    
    for (let i = 0; i < req.scenes.length; i++) {
      sceneFiles.push(path.join(tempDir, `out_${i}.mp4`));
    }

    // Concatenate all scenes
    const listPath = path.join(tempDir, "list.txt");
    const listContent = sceneFiles.map(f => `file '${path.basename(f)}'`).join("\n");
    await fs.writeFile(listPath, listContent);

    const concatPath = path.join(tempDir, "concat.mp4");
    const concatCmd = `"${ffmpegPath}" -loglevel error -y -f concat -safe 0 -i "${listPath}" -c copy "${concatPath}"`;
    console.log("Running concat:", concatCmd);
    await execAsync(concatCmd);

    let finalPath = concatPath;

    if (req.musicUrl) {
      finalPath = path.join(tempDir, "final.mp4");
      const musicPath = path.join(tempDir, "music.mp3");
      await downloadFile(req.musicUrl, musicPath);
      
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
      const mixCmd = `"${ffmpegPath}" -loglevel error -y -i "${concatPath}" -i "${musicPath}" -filter_complex "[1:a]${volumeFilter}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac "${finalPath}"`;
      console.log("Running music mix:", mixCmd);
      await execAsync(mixCmd);
    }

    return finalPath; // Return the path to the final video

  } catch (err) {
    console.error("Render error:", err);
    throw err;
  }
}
