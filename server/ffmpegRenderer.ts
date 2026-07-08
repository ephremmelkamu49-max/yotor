import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export interface RenderScene {
  id: string;
  videoUrl: string;
  ttsAudioBuffer?: string; // base64 encoded audio, or we can just download it if it's a full URL
  duration: number;
}

export interface RenderRequest {
  scenes: RenderScene[];
  aspectRatio: string;
  musicUrl?: string;
  musicVolume?: number;
}

async function downloadFile(url: string, dest: string) {
  if (url.startsWith("data:")) {
    // Handle base64
    const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const buffer = Buffer.from(matches[2], "base64");
      await fs.writeFile(dest, buffer);
      return;
    }
  }

  // Handle http and relative local URLs
  if (url.startsWith("http") || url.startsWith("/")) {
    const fetchUrl = url.startsWith("/") ? `http://127.0.0.1:3000${url}` : url;
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`Failed to download ${fetchUrl}`);
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

    // Process each scene
    for (let i = 0; i < req.scenes.length; i++) {
      const scene = req.scenes[i];
      const videoPath = path.join(tempDir, `vid_${i}.mp4`);
      const audioPath = path.join(tempDir, `aud_${i}.wav`);
      const outPath = path.join(tempDir, `out_${i}.mp4`);
      
      // Download video
      await downloadFile(scene.videoUrl, videoPath);
      
      // If there's TTS, write it (assuming it's passed as base64 or URL)
      let hasAudio = false;
      if (scene.ttsAudioBuffer) {
        await fs.writeFile(audioPath, Buffer.from(scene.ttsAudioBuffer, "base64"));
        hasAudio = true;
      }

      // Format video: crop/scale, set duration, add audio if exists
      // Filter graph for scaling and cropping to fit exactly
      const scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
      
      const isImage = scene.videoUrl.match(/\.(jpeg|jpg|png|gif|webp)$/i) || scene.videoUrl.includes("pollinations.ai") || scene.videoUrl.startsWith("data:image");
      
      let cmd = `ffmpeg -y `;
      if (isImage) {
        cmd += `-loop 1 `;
      }
      cmd += `-i "${videoPath}" `;
      
      if (hasAudio) {
        cmd += `-i "${audioPath}" `;
      }
      
      cmd += `-t ${scene.duration} -vf "${scaleFilter}" `;
      
      if (hasAudio) {
        // Map video from input 0, audio from input 1
        cmd += `-map 0:v:0 -map 1:a:0 -c:v libx264 -c:a aac -pix_fmt yuv420p -r 30 -shortest "${outPath}"`;
      } else {
        // Generate silent audio so concat works smoothly
        cmd += `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -map 0:v:0 -map 1:a:0 -c:v libx264 -c:a aac -pix_fmt yuv420p -r 30 -shortest "${outPath}"`;
      }
      
      console.log("Running:", cmd);
      await execAsync(cmd);
      sceneFiles.push(outPath);
    }

    // Concatenate all scenes
    const listPath = path.join(tempDir, "list.txt");
    const listContent = sceneFiles.map(f => `file '${path.basename(f)}'`).join("\n");
    await fs.writeFile(listPath, listContent);

    const concatPath = path.join(tempDir, "concat.mp4");
    const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${concatPath}"`;
    console.log("Running concat:", concatCmd);
    await execAsync(concatCmd);

    let finalPath = concatPath;

    if (req.musicUrl) {
      finalPath = path.join(tempDir, "final.mp4");
      const musicPath = path.join(tempDir, "music.mp3");
      await downloadFile(req.musicUrl, musicPath);
      
      const vol = req.musicVolume !== undefined ? req.musicVolume : 0.3;
      // Mix concatenated audio with music audio
      const mixCmd = `ffmpeg -y -i "${concatPath}" -i "${musicPath}" -filter_complex "[1:a]volume=${vol}[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac "${finalPath}"`;
      console.log("Running music mix:", mixCmd);
      await execAsync(mixCmd);
    }

    return finalPath; // Return the path to the final video
  } catch (err) {
    console.error("Render error:", err);
    throw err;
  }
}
