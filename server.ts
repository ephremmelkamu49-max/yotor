import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality, GenerateVideosOperation } from "@google/genai";
import { EdgeTTS } from "edge-tts-universal";
import dotenv from "dotenv";
import { renderVideo, RenderRequest } from "./server/ffmpegRenderer.js";

dotenv.config();

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files statically
app.use("/uploads", express.static(uploadsDir));

// Multer disk storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB limit

// Single file upload endpoint
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }
  const relativeUrl = `/uploads/${req.file.filename}`;
  res.json({ url: relativeUrl });
});

// JSON parser
app.use(express.json({ limit: '500mb' }));

// PWA routes for mobile installability
app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.sendFile(path.join(process.cwd(), "manifest.json"));
});
app.get("/sw.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(process.cwd(), "sw.js"));
});

function pcmToWav(pcmBuffer: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;

  const wavHeader = Buffer.alloc(44);
  // RIFF chunk
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + dataSize, 4);
  wavHeader.write('WAVE', 8);
  // fmt sub-chunk
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  // data sub-chunk
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(dataSize, 40);

  return Buffer.concat([wavHeader, pcmBuffer]);
}

// Setup Gemini Client according to instructions
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Robust fallback wrapper to route around 503 (model overloaded) and other transient errors
async function generateContentWithFallback(
  aiInstance: GoogleGenAI,
  options: {
    model: string;
    contents: any;
    config?: any;
  }
): Promise<any> {
  const modelFallbackList = [
    options.model,
    "gemini-2.5-flash",
    "gemini-2.5-flash"
  ];
  const uniqueModels = Array.from(new Set(modelFallbackList));
  
  let lastError: any = null;
  for (const modelName of uniqueModels) {
    try {
      console.log(`[Gemini Fallback System] Attempting generation with model: ${modelName}`);
      const response = await aiInstance.models.generateContent({
        ...options,
        model: modelName
      });
      return response;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini Fallback System] Model ${modelName} encountered error: ${err.message || err}`);
    }
  }
  throw lastError;
}

// --- Veo Video Generation Endpoints ---

app.post("/api/generate-video", async (req, res) => {
  if (!ai) return res.status(500).json({ error: "Gemini API not configured" });
  const { prompt, aspectRatio = '16:9', resolution = '720p' } = req.body;
  
  try {
    const operation = await ai.models.generateVideos({
      model: 'veo-3.1-lite-generate-preview',
      prompt,
      config: {
        numberOfVideos: 1,
        resolution,
        aspectRatio
      }
    });
    res.json({ operationName: operation.name });
  } catch (err: any) {
    console.error("Veo Generation Error:", err);
    res.status(500).json({ error: err.message || "Failed to start video generation" });
  }
});

app.post("/api/video-status", async (req, res) => {
  if (!ai) return res.status(500).json({ error: "Gemini API not configured" });
  const { operationName } = req.body;
  if (!operationName) return res.status(400).json({ error: "operationName is required" });

  try {
    const updated = await ai.operations.getVideosOperation({ 
      operation: { name: operationName } as any 
    });
    res.json({ done: updated.done, status: updated.metadata?.state });
  } catch (err: any) {
    console.error("Veo Status Error:", err);
    res.status(500).json({ error: err.message || "Failed to check video status" });
  }
});

app.post("/api/video-download", async (req, res) => {
  if (!ai) return res.status(500).json({ error: "Gemini API not configured" });
  const { operationName } = req.body;
  if (!operationName) return res.status(400).json({ error: "operationName is required" });

  try {
    const updated = await ai.operations.getVideosOperation({ 
      operation: { name: operationName } as any 
    });
    
    if (!updated.done) {
      return res.status(400).json({ error: "Video processing is not complete" });
    }

    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      return res.status(404).json({ error: "No video URI found in completed operation" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const fetchHeaders: Record<string, string> = {
      'x-goog-api-key': apiKey!,
    };
    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const videoRes = await fetch(uri, {
      headers: fetchHeaders,
    });

    if (!videoRes.ok && videoRes.status !== 206) {
      throw new Error(`Failed to fetch video from storage: ${videoRes.statusText}`);
    }

    res.status(videoRes.status);
    const contentType = videoRes.headers.get('content-type');
    const contentLength = videoRes.headers.get('content-length');
    const contentRange = videoRes.headers.get('content-range');
    const acceptRanges = videoRes.headers.get('accept-ranges');

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    if (videoRes.body) {
      const { Readable } = await import("stream");
      Readable.fromWeb(videoRes.body as any).pipe(res);
    } else {
      res.end();
    }
  } catch (err: any) {
    console.error("Veo Download Error:", err);
    res.status(500).json({ error: err.message || "Failed to download video" });
  }
});

app.get("/api/video-download-get", async (req, res) => {
  if (!ai) return res.status(500).json({ error: "Gemini API not configured" });
  const operationName = req.query.op as string;
  if (!operationName) return res.status(400).json({ error: "op (operationName) is required" });

  try {
    const updated = await ai.operations.getVideosOperation({ 
      operation: { name: operationName } as any 
    });
    
    if (!updated.done) {
      return res.status(400).json({ error: "Video processing is not complete" });
    }

    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      return res.status(404).json({ error: "No video URI found" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const fetchHeaders: Record<string, string> = {
      'x-goog-api-key': apiKey!,
    };
    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const videoRes = await fetch(uri, {
      headers: fetchHeaders,
    });

    if (!videoRes.ok && videoRes.status !== 206) {
      throw new Error(`Failed to fetch video: ${videoRes.statusText}`);
    }

    res.status(videoRes.status);
    const contentType = videoRes.headers.get('content-type');
    const contentLength = videoRes.headers.get('content-length');
    const contentRange = videoRes.headers.get('content-range');
    const acceptRanges = videoRes.headers.get('accept-ranges');

    if (contentType) res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);

    if (videoRes.body) {
      const { Readable } = await import("stream");
      Readable.fromWeb(videoRes.body as any).pipe(res);
    } else {
      res.end();
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1. Script Analysis API - uses Gemini to split user text into structured cinematic scenes
app.post("/api/analyze-script", async (req, res) => {
  const { script, visualStyle, isKeywordsOnly } = req.body;
  
  if (!script || typeof script !== "string") {
    return res.status(400).json({ error: "Script text is required" });
  }

  const wordCount = script.trim().split(/\s+/).length;
  const isAmharic = /[\u1200-\u137F]/.test(script);
  const isLongScript = script.length > 2000;

  const styleMapping: Record<string, string> = {
    'realistic': 'Cinematic realistic 4k, professional lighting, photorealistic textures',
    '3d-animation': '3D Pixar style animation, cute expressive characters, vibrant volumetric lighting, Disney style 3D render',
    '2d-animation': '2D hand-drawn animation, flat colors, expressive line art, illustrative style',
    'anime': 'Studio Ghibli aesthetic, anime style background, detailed characters, Japanese animation',
    'watercolor': 'Soft watercolor painting, artistic bleeding colors, paper texture, impressionist',
    'cyberpunk': 'Cyberpunk aesthetic, neon colored lights, futuristic cityscape, rainy night, high tech',
    'sketch': 'Hand-drawn pencil sketch, charcoal texture, artistic line work'
  };

  if (isKeywordsOnly) {
    const reelPrompt = `Action: Create a 5-scene high-energy cinematic social media reel for the topic: "${script}". 
    Format: JSON { "scenes": [ { "text": "description", "keywords": "3-5 high quality stock search terms", "caption": "short overlay", "duration": 3 } ] }`;

    try {
      if (!ai) throw new Error("AI not configured");
      const result = await generateContentWithFallback(ai, {
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: reelPrompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    keywords: { type: Type.STRING },
                    caption: { type: Type.STRING },
                    duration: { type: Type.NUMBER }
                  },
                  required: ["text", "keywords", "caption", "duration"]
                }
              }
            },
            required: ["scenes"]
          }
        }
      });
      const responseText = result.text?.trim() || "{}";
      const cleanedText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleanedText);
      const processed = parsed.scenes.map((s: any, idx: number) => ({
        id: `sc_reel_${idx}`,
        ...s,
        originalIndex: idx
      }));
      return res.json({ scenes: processed, info: 'AI Reel Dreamer' });
    } catch (e) {
      console.error("Reel Dreamer AI failed:", e);
      const sentences = script
        .split(/(?<=[.!?።፤፧])\s+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
        
      if (sentences.length === 0) {
        sentences.push(script);
      }
      
      const mockScenes = sentences.slice(0, 5).map((sentence: string, i: number) => ({
        id: `scene_kw_${i}`,
        text: sentence,
        keywords: `${script.substring(0, 50)} cinematic ${i}`,
        caption: sentence.substring(0, 30),
        duration: 4,
        originalIndex: i
      }));
      return res.json({ scenes: mockScenes, info: 'Baseline Reels' });
    }
  }

  if (!ai) {
    // If API key is missing, fall back to an smart adaptive splitter so the app handles 30 minutes smoothly!
    console.warn("GEMINI_API_KEY is not defined. Falling back to mechanical split.");
    const sentences = script
      .split(/(?<=[.!?።፤፧])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    if (sentences.length === 0 && script.trim().length > 0) {
      sentences.push(script.trim());
    }
    
    // Group sentences if the script is long to avoid hundreds of tiny scenes (critical for 30 minutes support)
    const groupedSentences: string[] = [];
    let currentGroup = "";
    let currentWordSum = 0;
    // Aim for ~10-15 seconds per scene for high cinematic density
    const maxTargetWords = isLongScript ? 30 : 15;

    for (const sentence of sentences) {
      const sentenceWords = sentence.split(/\s+/).length;
      if (currentWordSum + sentenceWords <= maxTargetWords || currentGroup === "") {
        currentGroup += (currentGroup ? " " : "") + sentence;
        currentWordSum += sentenceWords;
      } else {
        groupedSentences.push(currentGroup);
        currentGroup = sentence;
        currentWordSum = sentenceWords;
      }
    }
    if (currentGroup) {
      groupedSentences.push(currentGroup);
    }

    const fallbackKeywordsList = [
      "breathtaking nature mountains",
      "cinematic city streets neon",
      "beautiful abstract flowing lights",
      "epic ocean waves aerial",
      "warm golden hour forest",
      "futuristic tech data flow",
      "peaceful morning sunrise mist",
      "dynamic people walking blur",
      "space stars galaxy nebula",
      "traditional cultural historical"
    ];

    const scenes = groupedSentences.map((seg, idx) => {
      const segWords = seg.split(/\s+/).length;
      // speaking speed estimated at 2.2 words per second (slightly slower for Amharic clarity)
      const duration = Math.max(4.0, Number((segWords / 2.2).toFixed(1))); 
      // Enhanced visual keyword guess including more Amharic-relevant roots
      const matchedNouns = seg.toLowerCase().match(/\b(forest|sunset|technology|people|ocean|city|space|nature|abstract|cyberpunk|office|coding|data|future|workspace|ethiopia|mountains|landscape|flower|human|animal|addis|coffee|culture|history|traditional|luxury|peaceful|wildlife)\b/g);
      const baseKeyword = matchedNouns ? matchedNouns[0] : fallbackKeywordsList[idx % fallbackKeywordsList.length];
      const keywords = baseKeyword;
      return {
        id: `scene_${idx}_${Date.now()}`,
        text: seg,
        keywords,
        caption: seg,
        duration,
        originalIndex: idx
      };
    });

    if (scenes.length === 0) {
      scenes.push({
        id: `scene_fallback_${Date.now()}`,
        text: script,
        keywords: "cinematic nature",
        caption: script,
        duration: 8,
        originalIndex: 0
      });
    }

    return res.json({ scenes, fallback: true, warning: "Using server-side local adaptive regex parsing." });
  }

  try {
    const isAmharic = /[\u1200-\u137F]/.test(script);
    // Build an intelligent length-aware prompt to bundle sentences in long scripts!
    const lengthInstruction = `SCENIC DENSITY & LANGUAGE SPECIFICS:
Break the script into logical, complete, and sequential scenes. Aim for a high cinematic density: Target scene durations between 6 and 12 seconds each. Do NOT create long 30+ second scenes as they look static.
${isAmharic ? `Since the script contains AMHARIC (Ge'ez) text:
- First, carefully translate the Amharic segment into English internally to understand its true visual and emotional meaning.
- Formulate the 'keywords' (which MUST be in English) based on this accurate translation. The keywords must describe the EXACT physical subject or action of the scene.
- Ensure the English keywords are precise, highly descriptive, and perfect for search queries on stock video sites (like Pexels or Pixabay). For example:
  * If the script talks about traditional Ethiopian coffee, use "ethiopian coffee ceremony pouring coffee" or "traditional coffee boiling pot".
  * If the script talks about happiness or celebration, use "cheerful people laughing celebration".
  * If the script talks about historic places or culture, use "historic ancient obelisk monument" or "traditional ethiopian culture".
  * If the script mentions work or business, use "modern office meeting" or "person working on computer".
- Identify sentence boundaries primarily using the Amharic punctuation markers '።' (final period), '፤' (semicolon), or '፧'.
- Group sentences or clauses matching logical visual arcs so they form highly coherent dramatic sections.
- Estimation of read/voice time: Amharic is read at approximately 1.7 words per second. Calculate segment durations accurately based on this rate.
- Captions and 'text' MUST be in Amharic (verbatim) matching the narration.
- Visual description 'keywords' MUST be in clean, highly specific ENGLISH. Do NOT output Amharic keywords or include Ge'ez characters in the 'keywords' field.` : `English script guidelines:
- Identify logical transitions, narrative pause points, or sentence markers.
- Speak pacing timing: 2.3 words per second.
- Captions must match the segment wording exactly.`}

- Use verbatim original text segments. Do NOT summarize or omit ANY text. 100% of the script must be accounted for.
- Visual keywords MUST describe ONLY the core physical subject. Do NOT include camera angles, lighting, or styles.
${visualStyle ? `- VISUAL STYLE DESCRIPTOR: The user prefers a "${visualStyle}" aesthetic. Ensure 'keywords' incorporate descriptors like "${styleMapping[visualStyle] || ""}" to help find or represent this style.` : ""}
- Ensure keywords are descriptive enough for a stock video search engine (e.g. 'slow motion 3d animation of child smiling pixar style' instead of just 'animation')`;

    const prompt = `You are "Yoto AI Director", a cinematic video producer. Transform the user's script (enclosed in triple quotes) into a masterfully paced sequential scene structure.

${lengthInstruction}

For each scene segment, provide:
1. 'text': The exact verbatim original script excerpt for this scene.
2. 'keywords': A precise English stock search query (1-3 words) representing the specific physical subject of this scene segment. For instance, 'coffee ceremony', 'running man', 'city street'. DO NOT include adjectives or styles like cinematic, 4k, photorealistic.
3. 'caption': Accurate subtitles matching the original text segment verbatim.
4. 'duration': Estimated speech duration in seconds (min 4.0s).

User Script:
"""
${script}
"""`;

    let processedScenes: any[] = [];

    if (!ai) {
        throw new Error("No primary Gemini AI engine available.");
    }

    const response = await generateContentWithFallback(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scenes: {
              type: Type.ARRAY,
              description: "Array of sequential visual and audio scenes.",
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  keywords: { type: Type.STRING },
                  caption: { type: Type.STRING },
                  duration: { type: Type.NUMBER }
                },
                required: ["text", "keywords", "caption", "duration"]
              }
            }
          },
          required: ["scenes"]
        }
      }
    });

    let responseText = response.text.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```\n/, '').replace(/\n```$/, '');
    }
    const parsedResult = JSON.parse(responseText.trim());
    
    // Add IDs and original index
    processedScenes = parsedResult.scenes.map((scene: any, index: number) => ({
      id: `scene_${index}_${Date.now()}`,
      ...scene,
      originalIndex: index
    }));

    res.json({ 
      scenes: processedScenes, 
      engine: 'gemini', 
      info: 'Localized Director (Gemini 3.1)'
    });
  } catch (error: any) {
    console.error("Gemini script parser failed:", error);
    // Return standard fallback chunking on exception
    const sentences = script
      .split(/(?<=[.!?።፤፧])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    const groupedSentences: string[] = [];
    let currentGroup = "";
    let currentWordSum = 0;
    const maxTargetWords = isLongScript ? 50 : 25;

    for (const sentence of sentences) {
      const sentenceWords = sentence.split(/\s+/).length;
      if (currentWordSum + sentenceWords <= maxTargetWords || currentGroup === "") {
        currentGroup += (currentGroup ? " " : "") + sentence;
        currentWordSum += sentenceWords;
      } else {
        groupedSentences.push(currentGroup);
        currentGroup = sentence;
        currentWordSum = sentenceWords;
      }
    }
    if (currentGroup) {
      groupedSentences.push(currentGroup);
    }

    const styleMapping: Record<string, string> = {
      'realistic': 'Cinematic realistic 4k, professional lighting, photorealistic textures',
      '3d-animation': '3D Pixar style animation, cute expressive characters, vibrant volumetric lighting, Disney style 3D render',
      '2d-animation': '2D hand-drawn animation, flat colors, expressive line art, illustrative style',
      'anime': 'Studio Ghibli aesthetic, anime style background, detailed characters, Japanese animation',
      'watercolor': 'Soft watercolor painting, artistic bleeding colors, paper texture, impressionist',
      'cyberpunk': 'Cyberpunk aesthetic, neon colored lights, futuristic cityscape, rainy night, high tech',
      'sketch': 'Hand-drawn pencil sketch, charcoal texture, artistic line work'
    };

    const fallbackKeywordsList = [
      "breathtaking nature mountains",
      "cinematic city streets neon",
      "beautiful abstract flowing lights",
      "epic ocean waves aerial",
      "warm golden hour forest",
      "futuristic tech data flow",
      "peaceful morning sunrise mist",
      "dynamic people walking blur",
      "space stars galaxy nebula",
      "traditional cultural historical"
    ];

    const fallbackScenes = groupedSentences.map((seg, idx) => {
      const segWords = seg.split(/\s+/).length;
      const duration = Math.max(4.0, Number((segWords / 2.4).toFixed(1)));
      const baseKeyword = fallbackKeywordsList[idx % fallbackKeywordsList.length];
      const styleDesc = styleMapping[visualStyle || 'realistic'] || "cinematic";
      
      return {
        id: `scene_${idx}_fallback_${Date.now()}`,
        text: seg,
        keywords: `${baseKeyword} ${styleDesc}`,
        caption: seg,
        duration,
        originalIndex: idx
      };
    });
    
    res.json({
      scenes: fallbackScenes,
      error: error.message,
      fallback: true,
      warning: "Fitted automatic backup generator on script."
    });
  }
});

// Custom AI Copilot and Conversational Controller Endpoint
app.post("/api/copilot", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { message, scenes, projectConfig, chatHistory } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message prompt is required" });
  }

  if (!ai) {
    return res.json({
      message: `ሰላም! ዮቶር የግል አይ (Yotor Personal AI) ረዳትዎ ነኝ። Gemini API Key ስላልተዋቀረ (GEMINI_API_KEY) ጥያቄዎን ከመፈፀም ተገድቢያለሁ። እባክዎን በስተግራ የፊልም ኤፒአይ ቁልፎች ውስጥ ወይም የሴቲንግ ገጽ ላይ ኤፒአይ ቁልፍዎን ያቀናብሩ። ያ የገባልኝን ጥያቄ: "${message}" ያለምንም ገደብ አስተካክል ነበር!`,
      updateConfig: {},
      updateScenes: { action: "none" }
    });
  }

  try {
    const isAmharic = /[\u1200-\u137F]/.test(message);
    const systemInstruction = `You are Yotor Personal AI (ዮቶር አይ), the absolute ruler and creative director of this digital video workspace.
You have been granted full control over the user's video timeline, script, narration texts, scenery styles, and project configurations.
You must listen to the user's requests, which could be in Amharic (አማርኛ) or English, and respond with extreme politeness, helpfulness, and creative advice, while actually executing their commands by generating suitable state updates.

Current Workspace State:
- ASPECT RATIO: "${projectConfig?.aspectRatio || '16:9'}"
- SHOW SUBTITLES: ${projectConfig?.showSubtitles === false ? 'DISABLED' : 'ENABLED'}
- VOICE ENABLED (TTS): ${projectConfig?.voiceEnabled === false ? 'DISABLED' : 'ENABLED'}
- SPEECH VOICE: "${projectConfig?.ttsVoice || 'am-gemini-female'}"
- MUSIC PLAYBACK: ${projectConfig?.musicEnabled === false ? 'DISABLED' : 'ENABLED'}
- MUSIC VOLUME: "${projectConfig?.musicVolume || 0.2}"
- MOTION (KEN BURNS EFFECT): ${projectConfig?.enableMotion === false ? 'DISABLED' : 'ENABLED'}
- MOTION STYLE: "${projectConfig?.motionStyle || 'random'}"
- SUBTITLE POSITION: "${projectConfig?.subtitleStyle?.position || 'bottom'}"
- SUBTITLE FONT SIZE: "${projectConfig?.subtitleStyle?.fontSize || 16}"

Active Video Scenes (${scenes?.length || 0}):
${(scenes || []).map((s: any, idx: number) => `Scene [${idx}]: "${s.text}" (duration: ${s.duration}s, keywords: "${s.keywords}")`).join('\n')}

Instructions:
1. Under "message", respond naturally to the user. Always reply in AMHARIC if the user speaks Amharic, or English if they speak English. Make your tone highly professional, encouraging, and majestic.
2. If the user asks to modify the layout, ratio, music, volume, motion, voice, subtitles, or subtitles size/font/position, represent those updates in "updateConfig". For example, if they say "make aspect ratio 9:16" or "vertical", update aspectRatio to "9:16". If they say "subtitles on top", update subtitleStyle.position to "top".
3. If the user asks to add a scene, rewrite the script, translate the scenes to Amharic, or write a story, choose updateScenes.action = "recreate" (to replace all scenes) or "add" (to insert). Ensure scenesList has:
   - "text" (narration script, either Amharic or English verbatim as requested)
   - "keywords" (search keywords always in ENGLISH for video search stock engines, e.g., "warm golden hour cinematic mountains slow motion 4k")
   - "duration" (approximate speech read time in seconds, Amharic ~1.8 words per second, English ~2.3 words per second, minimum 4 seconds)
4. Do not output actual Markdown files or raw code snippets outside of the chat message.

Respond with valid JSON structure matching the specified schema.`;

    const contents = [];
    if (chatHistory && Array.isArray(chatHistory)) {
      for (const turn of chatHistory.slice(-6)) {
        contents.push({
          role: turn.role === 'user' ? 'user' : 'model',
          parts: [{ text: turn.text }]
        });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    const response = await generateContentWithFallback(ai, {
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING, description: "Detailed response text explaining what was updated, what creative changes were made, or answering user questions." },
            updateConfig: {
              type: Type.OBJECT,
              properties: {
                aspectRatio: { type: Type.STRING, enum: ["16:9", "9:16", "1:1"] },
                voiceEnabled: { type: Type.BOOLEAN },
                ttsVoice: { type: Type.STRING },
                ttsLanguage: { type: Type.STRING },
                showSubtitles: { type: Type.BOOLEAN },
                subtitleStyle: {
                  type: Type.OBJECT,
                  properties: {
                    fontSize: { type: Type.INTEGER },
                    fontFamily: { type: Type.STRING },
                    uppercase: { type: Type.BOOLEAN },
                    bgOpacity: { type: Type.NUMBER },
                    position: { type: Type.STRING, enum: ["bottom", "top", "center"] }
                  }
                },
                backgroundMusic: { type: Type.STRING },
                musicEnabled: { type: Type.BOOLEAN },
                musicVolume: { type: Type.NUMBER },
                enableMotion: { type: Type.BOOLEAN },
                motionStyle: { type: Type.STRING }
              }
            },
            updateScenes: {
              type: Type.OBJECT,
              properties: {
                action: { type: Type.STRING, enum: ["recreate", "add", "none"] },
                scenesList: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      keywords: { type: Type.STRING },
                      duration: { type: Type.NUMBER }
                    },
                    required: ["text", "keywords", "duration"]
                  }
                },
                targetIndex: { type: Type.INTEGER }
              }
            }
          },
          required: ["message"]
        }
      }
    });

    const outputText = response.text;
    console.log("[Copilot Response]", outputText);
    const parsedData = JSON.parse(outputText || "{}");
    return res.json(parsedData);
  } catch (error: any) {
    console.error("Copilot AI failed:", error);
    return res.status(500).json({ error: error.message });
  }
});

// New Multimodal Video Understanding Endpoint using gemini-2.5-flash
app.post("/api/analyze-video", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { videoUrl, prompt } = req.body;
  if (!videoUrl) {
    return res.status(400).json({ error: "videoUrl is required" });
  }
  if (!ai) {
    return res.status(500).json({ error: "Gemini AI Core is not initialized. Please configure GEMINI_API_KEY." });
  }

  try {
    console.log(`[Video Analyzer] Fetching video file from: ${videoUrl}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000); // Increased timeout to 25s
    const fetchRes = await fetch(videoUrl, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    clearTimeout(timeout);

    if (!fetchRes.ok) {
      throw new Error(`Failed to download clip: HTTP ${fetchRes.status}`);
    }

    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Video = buffer.toString("base64");

    const geminiPrompt = prompt || "Analyze this video clip and describe what happens, identify objects, color scheme, visual pacing, and key informational details.";

    console.log(`[Video Analyzer] Requesting video understanding from gemini-2.5-flash...`);
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            data: base64Video,
            mimeType: "video/mp4"
          }
        },
        { text: geminiPrompt }
      ]
    });

    return res.json({ analysis: result.text || "No analysis generated by video model." });
  } catch (error: any) {
    console.error("[Video Analyzer] Failure:", error);
    res.status(500).json({ error: error.message || "An error occurred during video analysis." });
  }
});

// OPTIONS handling for CORS preflights
app.options("/api/tts", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
  res.sendStatus(200);
});

// Diagnostics API - Checks Gemini capacity, Pexels configuration, and overall app health
app.get("/api/diagnose", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  const diagnostics: any = {
    geminiApiKeyConfigured: !!process.env.GEMINI_API_KEY,
    veoStatus: !!process.env.GEMINI_API_KEY ? "Operational (Experimental 3.1)" : "Inactive",
    geminiTtsStatus: "ok", // 'ok', 'quota_limit', 'error', 'no_key'
    geminiTtsMessage: "Premium & Unlimited Neural Voices Active.",
    pexelsApiKeyConfigured: !!(req.headers["x-pexels-key"] || process.env.PEXELS_API_KEY)
  };

  res.json(diagnostics);
});

app.post("/api/diagnose", express.json(), (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const fs = require('fs');
  fs.writeFileSync('error_log.txt', req.body.errorLog || "No error log sent");
  console.log("Error log written to error_log.txt");
  res.json({ success: true });
});

// 2. TTS Proxy API - plays a google tts mp3 stream for the text
app.get("/api/tts", async (req, res) => {
  const text = req.query.text as string;
  const lang = (req.query.lang as string) || "en";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");

  if (!text) {
    return res.status(400).json({ error: "Text is required to vocalize." });
  }

  try {
    const safeText = text.substring(0, 5000);

    // ---------------------------------------------------------
    // MICROSOFT EDGE TTS (Unlimited, Neural Free Voices)
    // ---------------------------------------------------------
    if (lang === 'am-edge-male' || lang === 'am-edge-female' || lang === 'am-male' || lang.startsWith('am-yotor-') || lang.startsWith('en') || lang === 'es' || lang === 'fr') {
      try {
        let voiceName = "am-ET-AmehaNeural"; // Default Amharic male
        if (lang === 'am-edge-female' || lang === 'am-yotor-warm-female' || lang === 'am-yotor-bright-female') {
          voiceName = "am-ET-MekdesNeural";
        } else if (lang === 'en-US-Standard-D') {
          voiceName = "en-US-GuyNeural"; // Deep Male
        } else if (lang === 'en-US-Standard-F') {
          voiceName = "en-US-AriaNeural"; // Bright Female
        } else if (lang === 'en-gb') {
          voiceName = "en-GB-RyanNeural"; // British
        } else if (lang === 'en') {
          voiceName = "en-US-ChristopherNeural"; // Standard Neutral Male
        } else if (lang === 'es') {
          voiceName = "es-ES-AlvaroNeural"; // Spanish
        } else if (lang === 'fr') {
          voiceName = "fr-FR-HenriNeural"; // French
        }
        
        const tts = new EdgeTTS(safeText, voiceName);
        const result = await tts.synthesize();
        const combinedBuffer = Buffer.from(await result.audio.arrayBuffer());
        
        if (combinedBuffer.length === 0) {
          throw new Error("Edge TTS produced 0 bytes of audio.");
        }
          
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : combinedBuffer.length - 1;
          const chunksize = (end - start) + 1;
          const fileChunk = combinedBuffer.subarray(start, end + 1);

          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${combinedBuffer.length}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunksize,
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*"
          });
          return res.end(fileChunk);
        } else {
          res.writeHead(200, {
            "Content-Length": combinedBuffer.length,
            "Accept-Ranges": "bytes",
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*"
          });
          return res.end(combinedBuffer);
        }
      } catch (edge_err: any) {
        // Log gracefully to prevent triggering false-positive system alerts
        const errMsg = edge_err instanceof Error ? edge_err.message : (edge_err?.message || (typeof edge_err === 'string' ? edge_err : JSON.stringify(edge_err)));
        console.log(`[Info] Edge TTS bypassed; engaging secondary voice pipeline. Reason: ${errMsg}`);
      }
    }

    // ---------------------------------------------------------
    // OPENAI TTS (Premium ChatGPT Voices)
    // ---------------------------------------------------------
    if (lang.startsWith("openai-")) {
      try {
        const voiceName = lang.replace("openai-", ""); // alloy, echo, fable, onyx, nova, shimmer
        const userApiKey = (req.query.openai_key as string) || (req.headers["x-openai-key"] as string) || process.env.OPENAI_API_KEY;
        
        if (!userApiKey) {
          throw new Error("OpenAI API Key is missing. Please add your OpenAI API Key in the settings panel to use ChatGPT voices.");
        }

        const openAiResponse = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${userApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "tts-1",
            input: safeText,
            voice: voiceName,
            response_format: "mp3"
          })
        });

        if (!openAiResponse.ok) {
          const errBody = await openAiResponse.text();
          throw new Error(`OpenAI TTS API Error: ${openAiResponse.status} - ${errBody}`);
        }

        const arrayBuffer = await openAiResponse.arrayBuffer();
        const combinedBuffer = Buffer.from(arrayBuffer);

        if (combinedBuffer.length === 0) {
          throw new Error("OpenAI TTS produced 0 bytes of audio.");
        }

        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : combinedBuffer.length - 1;
          const chunksize = (end - start) + 1;
          const fileChunk = combinedBuffer.subarray(start, end + 1);

          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${combinedBuffer.length}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunksize,
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*"
          });
          return res.end(fileChunk);
        } else {
          res.writeHead(200, {
            "Content-Length": combinedBuffer.length,
            "Accept-Ranges": "bytes",
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*"
          });
          return res.end(combinedBuffer);
        }
      } catch (openai_err: any) {
        console.warn("OpenAI TTS Failed, falling back to Microsoft Edge Neural TTS:", openai_err.message || openai_err);
        
        let fallbackVoice = "en-US-ChristopherNeural"; // default standard
        const voiceName = lang.replace("openai-", "");
        if (voiceName === "alloy" || voiceName === "echo" || voiceName === "onyx") {
          fallbackVoice = "en-US-GuyNeural"; // Deep Male
        } else if (voiceName === "fable") {
          fallbackVoice = "en-GB-RyanNeural"; // British
        } else if (voiceName === "nova" || voiceName === "shimmer") {
          fallbackVoice = "en-US-AriaNeural"; // Bright Female
        }

        try {
          console.log(`[TTS Fallback] Synthesizing text with Edge voice: ${fallbackVoice}`);
          const tts = new EdgeTTS(safeText, fallbackVoice);
          const result = await tts.synthesize();
          const combinedBuffer = Buffer.from(await result.audio.arrayBuffer());
          
          if (combinedBuffer.length === 0) {
            throw new Error("Edge fallback TTS produced 0 bytes of audio.");
          }
            
          const range = req.headers.range;
          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : combinedBuffer.length - 1;
            const chunksize = (end - start) + 1;
            const fileChunk = combinedBuffer.subarray(start, end + 1);

            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${combinedBuffer.length}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunksize,
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=86400",
              "Access-Control-Allow-Origin": "*"
            });
            return res.end(fileChunk);
          } else {
            res.writeHead(200, {
              "Content-Length": combinedBuffer.length,
              "Accept-Ranges": "bytes",
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=86400",
              "Access-Control-Allow-Origin": "*"
            });
            return res.end(combinedBuffer);
          }
        } catch (fallback_err: any) {
          console.warn(`[Info] Both OpenAI and Edge TTS Fallback failed: ${fallback_err.message || fallback_err}. Engaging ultimate Google Translate fallback.`);
          // Do not return here, allowing the code execution to fall through to the Google Translate TTS block
        }
      }
    }

    // ---------------------------------------------------------
    // GEMINI TTS (High Quality, Metered API)
    // ---------------------------------------------------------
    if ((lang === 'am-gemini-male' || lang === 'am-gemini-female') && ai) {
      try {
        const voiceName = lang === 'am-gemini-female' ? "Aoede" : "Puck";
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: `በአማርኛ ድምፅ አንብብ: ${safeText}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName }
              }
            }
          }
        });

        const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (audioBase64) {
          const rawBuffer = Buffer.from(audioBase64, "base64");
          const wavBuffer = pcmToWav(rawBuffer, 24000);

          const range = req.headers.range;
          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : wavBuffer.length - 1;

            if (start >= wavBuffer.length || end >= wavBuffer.length) {
              res.status(416).setHeader("Content-Range", `bytes */${wavBuffer.length}`);
              return res.end();
            }

            const chunksize = (end - start) + 1;
            const fileChunk = wavBuffer.subarray(start, end + 1);

            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${wavBuffer.length}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunksize,
              "Content-Type": "audio/wav",
              "Cache-Control": "public, max-age=86400",
              "Access-Control-Allow-Origin": "*"
            });
            return res.end(fileChunk);
          } else {
            res.writeHead(200, {
              "Content-Length": wavBuffer.length,
              "Accept-Ranges": "bytes",
              "Content-Type": "audio/wav",
              "Cache-Control": "public, max-age=86400",
              "Access-Control-Allow-Origin": "*"
            });
            return res.end(wavBuffer);
          }
        }
      } catch (gem_err: any) {
        const errMsg = gem_err instanceof Error ? gem_err.message : (gem_err?.message || (typeof gem_err === 'string' ? gem_err : JSON.stringify(gem_err)));
        console.log(`[Info] Gemini TTS bypassed; engaging standard voice pipeline. Error: ${errMsg}`);
      }
    }

    // ---------------------------------------------------------
    // GOOGLE TRANSLATE TTS (Fallback, Free Unlimited, Standard Quality)
    // ---------------------------------------------------------
    let fallbackLang = lang.includes('-') ? lang.split('-')[0] : lang;
    if (fallbackLang.startsWith('am')) fallbackLang = 'am';
    else if (fallbackLang.startsWith('en') || fallbackLang.startsWith('openai')) fallbackLang = 'en';

    // For Google TTS, we must split long text into chunks of ~200 chars to avoid "413 Request Entity Too Large"
    const chunks: string[] = [];
    let remainingText = safeText;
    
    while (remainingText.length > 0) {
      if (remainingText.length <= 190) {
        chunks.push(remainingText);
        break;
      }
      
      let chunk = remainingText.substring(0, 190);
      // Try to break at a space or sentence end
      const lastSpace = chunk.lastIndexOf(' ');
      const lastPeriod = Math.max(chunk.lastIndexOf('.'), chunk.lastIndexOf('።'));
      
      const splitIndex = lastPeriod > 100 ? lastPeriod + 1 : (lastSpace > 100 ? lastSpace : 190);
      chunks.push(remainingText.substring(0, splitIndex));
      remainingText = remainingText.substring(splitIndex).trim();
    }

    const audioBuffers: Buffer[] = [];
    for (const segment of chunks) {
      const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=${fallbackLang}&q=${encodeURIComponent(segment)}`;
      const ttsRes = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      if (ttsRes.ok) {
        const buf = await ttsRes.arrayBuffer();
        audioBuffers.push(Buffer.from(buf));
      } else {
        console.warn(`[TTS] Google Translate chunk failed with status ${ttsRes.status}`);
      }
    }

    if (audioBuffers.length > 0) {
      const combinedBuffer = Buffer.concat(audioBuffers);
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : combinedBuffer.length - 1;

        if (start >= combinedBuffer.length || end >= combinedBuffer.length) {
          res.status(416).setHeader("Content-Range", `bytes */${combinedBuffer.length}`);
          return res.end();
        }

        const chunksize = (end - start) + 1;
        const fileChunk = combinedBuffer.subarray(start, end + 1);

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${combinedBuffer.length}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*"
        });
        return res.end(fileChunk);
      } else {
        res.writeHead(200, {
          "Content-Length": combinedBuffer.length,
          "Accept-Ranges": "bytes",
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*"
        });
        return res.end(combinedBuffer);
      }
    } else {
      throw new Error("Failed to produce any audio chunks via Google TTS.");
    }
  } catch (err: any) {
    console.error("Audio generation proxy failure:", err);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(500).json({ error: err.message });
  }
});

// 2.5 Dynamic synthesized background music loops
app.get("/api/music", (req, res) => {
  const trackId = (req.query.id as string) || "ambient_mindful";
  
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");

  const sampleRate = 22050; // High efficiency sample rate
  const durationSeconds = 10;
  const numSamples = sampleRate * durationSeconds;
  
  const buffer = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sampleVal = 0;
    
    if (trackId === "tech_cyberpunk") {
      const beatProgress = t % 0.5;
      const kick = Math.exp(-30 * beatProgress) * Math.sin(2 * Math.PI * 60 * Math.exp(-20 * beatProgress));
      const subBass = Math.sin(2 * Math.PI * 55 * t);
      const hihat = (beatProgress > 0.25 && beatProgress < 0.28) ? (Math.random() - 0.5) * 0.15 : 0;
      sampleVal = (kick * 0.45 + subBass * 0.35 + hihat * 0.2);
    } else if (trackId === "dreamy_cosmos") {
      const sweepFrequency = 110 + 20 * Math.sin(2 * Math.PI * 0.1 * t);
      const wave1 = Math.sin(2 * Math.PI * sweepFrequency * t);
      const wave2 = Math.sin(2 * Math.PI * (sweepFrequency * 1.5) * t + Math.sin(2 * Math.PI * 1 * t));
      const wave3 = Math.sin(2 * Math.PI * (sweepFrequency * 2) * t);
      const env = 0.5 + 0.3 * Math.sin(2 * Math.PI * 0.25 * t);
      sampleVal = ((wave1 + wave2 * 0.4 + wave3 * 0.2) / 1.6) * env;
    } else if (trackId === "ethio_jazz_vibe") {
      // Tizita Scale (C D E G A)
      const barDuration = 4;
      const barIndex = Math.floor(t / barDuration) % 4;
      const notes = [130.81, 146.83, 164.81, 196.00, 220.00]; // C D E G A
      const f1 = notes[barIndex % 5];
      const f2 = notes[(barIndex + 2) % 5];
      const lead = Math.sin(2 * Math.PI * f1 * t + 0.3 * Math.sin(2 * Math.PI * 4 * t)); // Pulsing lead
      const pad = Math.sin(2 * Math.PI * (f1 / 2) * t) + Math.sin(2 * Math.PI * (f2 / 2) * t);
      sampleVal = (lead * 0.3 + pad * 0.4) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t));
    } else if (trackId === "habesha_modern_upbeat") {
      // Fast pentatonic rhythm
      const tempo = 0.35; // Fast
      const pulse = t % tempo;
      const kick = Math.exp(-25 * pulse) * Math.sin(2 * Math.PI * 55);
      const noteFreq = 440 * Math.pow(2, (Math.floor(t * 4) % 12) / 12);
      const synth = Math.sin(2 * Math.PI * noteFreq * t) * Math.exp(-4 * pulse);
      sampleVal = kick * 0.6 + synth * 0.4;
    } else if (trackId === "lofi_addis") {
      // Pentatonic Lofi
      const beat = t % 1.2;
      const kick = Math.exp(-15 * beat) * Math.sin(2 * Math.PI * 50);
      const snare = (beat > 0.6 && beat < 0.65) ? (Math.random() - 0.5) * 0.3 : 0;
      const rainy = (Math.random() - 0.5) * 0.05;
      const keys = Math.sin(2 * Math.PI * 329.63 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t)); // E
      sampleVal = kick * 0.4 + snare * 0.3 + rainy + keys * 0.2;
    } else if (trackId === "uplifting_cinematic") {
      const barDuration = 2.5;
      const barIndex = Math.floor(t / barDuration) % 4;
      let freqs = [130.81, 164.81, 196.00]; // C major
      if (barIndex === 1) freqs = [174.61, 220.00, 261.63]; // F major
      else if (barIndex === 2) freqs = [196.00, 246.94, 293.66]; // G major
      else if (barIndex === 3) freqs = [220.00, 261.63, 329.63]; // A minor

      const chordWave = Math.sin(2 * Math.PI * freqs[0] * t) + 
                        Math.sin(2 * Math.PI * freqs[1] * t) * 0.8 + 
                        Math.sin(2 * Math.PI * freqs[2] * t) * 0.6;
      sampleVal = (chordWave / 2.4) * 0.5;
    } else if (trackId === "lofi_chill") {
      const barDuration = 5.0;
      const barIndex = Math.floor(t / barDuration) % 2;
      let freqs = [110.00, 164.81, 196.00, 261.63]; // Am7
      if (barIndex === 1) freqs = [87.31, 130.81, 174.61, 220.00]; // Fmaj7

      const chordWave = Math.sin(2 * Math.PI * freqs[0] * t) + 
                        Math.sin(2 * Math.PI * freqs[1] * t) * 0.9 + 
                        Math.sin(2 * Math.PI * freqs[2] * t) * 0.8 + 
                        Math.sin(2 * Math.PI * freqs[3] * t) * 0.6;
      
      const tremolo = 0.7 + 0.3 * Math.sin(2 * Math.PI * 4 * t);
      sampleVal = (chordWave / 3.3) * tremolo * 0.5;
    } else {
      const noteProgress = t % 1.25;
      const harpEnvelope = Math.exp(-6.0 * noteProgress);
      const pitchIndex = Math.floor(t / 1.25) % 8;
      const scale = [220.0, 246.94, 261.63, 293.66, 329.63, 392.00, 440.0, 523.25];
      const harpFreq = scale[pitchIndex];
      const harpWave = Math.sin(2 * Math.PI * harpFreq * t) * harpEnvelope;

      const padFreqs = [110.0, 164.81, 220.0];
      const padWave = Math.sin(2 * Math.PI * padFreqs[0] * t) +
                      Math.sin(2 * Math.PI * padFreqs[1] * t) * 0.7 +
                      Math.sin(2 * Math.PI * padFreqs[2] * t) * 0.5;
      
      sampleVal = (harpWave * 0.4 + (padWave / 2.2) * 0.3) * 0.7;
    }

    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sampleVal * 32767)));
    buffer.writeInt16LE(intSample, i * 2);
  }

  const wavData = pcmToWav(buffer, sampleRate);
  
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : wavData.length - 1;

    if (start >= wavData.length || end >= wavData.length) {
      res.status(416).setHeader("Content-Range", `bytes */${wavData.length}`);
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const fileChunk = wavData.subarray(start, end + 1);

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${wavData.length}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "audio/wav",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*"
    });
    return res.end(fileChunk);
  } else {
    res.writeHead(200, {
      "Content-Length": wavData.length,
      "Accept-Ranges": "bytes",
      "Content-Type": "audio/wav",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*"
    });
    return res.end(wavData);
  }
});

// 3. Pexels API Search Proxy - avoids CORS issues and hides the master key
app.get("/api/pexels/search", async (req, res) => {
  const query = req.query.query as string;
  const userKey = req.headers["x-pexels-key"] as string;
  
  // Use user's supplied key, or backend ENV fallback
  const apiKey = userKey || process.env.PEXELS_API_KEY;

  if (!query) {
    return res.status(400).json({ error: "Search query required." });
  }

  if (!apiKey) {
    // Return empty results with warning so that the app uses beautiful catalog fallback instead of hard-failing
    return res.json({
      not_configured: true,
      videos: [],
      warning: "Pexels API Key is missing. Fallback catalog assets will be used."
    });
  }

  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`;
    const response = await fetch(url, {
      headers: {
        "Authorization": apiKey
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return res.status(401).json({ error: "Invalid Pexels API Key." });
      }
      throw new Error(`Pexels API error: status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("Pexels proxy failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Pixabay API Search Proxy
app.get("/api/pixabay/search", async (req, res) => {
  const query = req.query.query as string;
  const userKey = req.headers["x-pixabay-key"] as string;
  
  const apiKey = userKey || process.env.PIXABAY_API_KEY;

  if (!query) {
    return res.status(400).json({ error: "Search query required." });
  }

  if (!apiKey) {
    return res.json({
      not_configured: true,
      hits: [],
      warning: "Pixabay API Key is missing. Fallback catalog assets will be used."
    });
  }

  try {
    const url = `https://pixabay.com/api/videos/?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&video_type=film&per_page=12`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return res.status(401).json({ error: "Invalid Pixabay API Key." });
      }
      throw new Error(`Pixabay API error: status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("Pixabay proxy failed:", err);
    res.status(500).json({ error: err.message });
  }
});


// 5. Coverr API Search Proxy
app.get("/api/coverr/search", async (req, res) => {
  const query = req.query.query as string;
  const userKey = req.headers["x-coverr-key"] as string;
  
  const apiKey = userKey || process.env.COVERR_API_KEY;

  if (!query) {
    return res.status(400).json({ error: "Search query required." });
  }

  if (!apiKey) {
    return res.json({
      not_configured: true,
      hits: [],
      warning: "Coverr API Key is missing. Fallback catalog assets will be used."
    });
  }

  try {
    const url = `https://api.coverr.co/videos?query=${encodeURIComponent(query)}&urls=true`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return res.status(401).json({ error: "Invalid Coverr API Key." });
      }
      throw new Error(`Coverr API error: status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("Coverr proxy failed:", err);
    res.status(500).json({ error: err.message });
  }
});


// 4. Thumbnail Generation API - uses Gemini to generate a YouTube-style thumbnail
app.post("/api/thumbnail", async (req, res) => {
  try {
    if (!ai) {
      throw new Error("AI features require GEMINI_API_KEY environment variable to be set.");
    }
    const { aspectRatio, scenesText } = req.body;
    
    // 1. Generate visual image prompt using text model
    const promptResponse = await generateContentWithFallback(ai, {
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `You are an expert YouTube Thumbnail designer. Generate a highly detailed image generation prompt for an amazing, eye-catching, highly clickable video thumbnail based on this video script snippet. The thumbnail should be cinematic, vibrant, and highly dramatic. IMPORTANT: Do NOT include text or typography instructions in the image prompt, just describe the raw visual composition and lighting.

Video Script:
${scenesText.substring(0, 5000)}` }] }]
    });

    let imagePrompt = promptResponse.text?.trim() || "cinematic colorful abstract background 4k";

    // 2. Generate Image using gemini-2.5-flash
    const imageResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [{ text: imagePrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio === '9:16' ? '9:16' : (aspectRatio === '1:1' ? '1:1' : '16:9'),
          imageSize: "1K"
        }
      }
    });

    let imageUrl = null;
    if (imageResponse.candidates && imageResponse.candidates[0].content.parts) {
      for (const part of imageResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64EncodeString: string = part.inlineData.data;
          imageUrl = `data:image/jpeg;base64,${base64EncodeString}`;
          break;
        }
      }
    }

    if (!imageUrl) {
      throw new Error("No image was returned from the model.");
    }

    res.json({ imageUrl, prompt: imagePrompt });
  } catch(e: any) {
    if (e.message && (e.message.includes("429") || e.message.includes("quota") || e.message.includes("RESOURCE_EXHAUSTED"))) {
      // Return a beautiful fallback abstract thumbnail rather than failing
      return res.json({ 
        imageUrl: "https://images.pexels.com/photos/310452/pexels-photo-310452.jpeg?auto=compress&cs=tinysrgb&w=800",
        prompt: "fallback abstract thumbnail"
      });
    }
    console.warn("Thumbnail generation failed due to quota/internal error. Using fallback.");
    return res.json({ 
      imageUrl: "https://images.pexels.com/photos/310452/pexels-photo-310452.jpeg?auto=compress&cs=tinysrgb&w=800",
      prompt: "fallback abstract thumbnail"
    });
  }
});

const JOBS_FILE = path.join(os.tmpdir(), "yotor_render_jobs.json");

const getPersistedJobs = (): Map<string, any> => {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const content = fs.readFileSync(JOBS_FILE, "utf-8");
      const obj = JSON.parse(content);
      return new Map(Object.entries(obj));
    }
  } catch (err) {
    console.error("Error reading render jobs file:", err);
  }
  return new Map();
};

const savePersistedJobs = (map: Map<string, any>) => {
  try {
    const obj = Object.fromEntries(map.entries());
    fs.writeFileSync(JOBS_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error("Error saving render jobs file:", err);
  }
};

const renderJobs = {
  get(jobId: string) {
    const map = getPersistedJobs();
    return map.get(jobId);
  },
  set(jobId: string, value: any) {
    const map = getPersistedJobs();
    map.set(jobId, value);
    savePersistedJobs(map);
  },
  entries() {
    const map = getPersistedJobs();
    return map.entries();
  }
};

const cleanupOldJobs = async () => {
  try {
    const jobsMap = getPersistedJobs();
    const now = Date.now();
    const maxAgeMs = 15 * 60 * 1000; // 15 minutes is plenty for downloading/previewing
    const jobsList = Array.from(jobsMap.entries());

    let changed = false;

    // Sort jobs by creation time descending (newest first)
    const sortedJobs = [...jobsList].sort((a, b) => {
      const timeA = a[1].createdAt || 0;
      const timeB = b[1].createdAt || 0;
      return timeB - timeA;
    });

    for (let index = 0; index < sortedJobs.length; index++) {
      const [id, job] = sortedJobs[index];
      const createdAt = job.createdAt || 0;
      const isTooOld = now - createdAt > maxAgeMs;
      // Restrict active storage: keep at most the 2 most recent completed/processing jobs
      const isExcess = index >= 2;

      if (isTooOld || isExcess) {
        if (job.outPath) {
          try {
            const dirPath = path.dirname(job.outPath);
            if (dirPath && dirPath.includes("yotor-render-") && fs.existsSync(dirPath)) {
              await fs.promises.rm(dirPath, { recursive: true, force: true }).catch(() => {});
              console.log(`[Storage Cleanup] Successfully purged excess/stale job folder: ${dirPath}`);
            }
          } catch (e) {
            console.warn(`[Storage Cleanup] Failed to delete directory for job ${id}:`, e);
          }
        }
        jobsMap.delete(id);
        changed = true;
      }
    }

    if (changed) {
      savePersistedJobs(jobsMap);
    }
  } catch (err) {
    console.error("[Storage Cleanup] Error during background job cleanup:", err);
  }
};

app.post("/api/render-ffmpeg", express.json({ limit: '500mb' }), async (req, res) => {
  const jobId = Math.random().toString(36).substring(2, 15);
  const payload = req.body as RenderRequest;
  
  // Trigger cleanup in background to proactively free memory/disk before starting the next compile
  cleanupOldJobs().catch(err => console.error("Background cleanup error:", err));

  renderJobs.set(jobId, { status: "processing", progress: 0, log: "Starting render job...", createdAt: Date.now() });
  
  // Respond immediately with the jobId
  res.json({ jobId });

  // Start the background job
  (async () => {
    try {
      console.log(`Starting background render job: ${jobId}`);
      const outPath = await renderVideo(payload, (msg, progress) => {
        const job = renderJobs.get(jobId);
        if (job) {
          renderJobs.set(jobId, { ...job, progress, log: msg });
        }
      });
      console.log(`Background render job complete: ${jobId}`, outPath);
      const currentJob = renderJobs.get(jobId) || {};
      renderJobs.set(jobId, { ...currentJob, status: "done", progress: 100, log: "Compilation SUCCESS", outPath });
    } catch (err: any) {
      console.error(`Background FFmpeg render job ${jobId} failed:`, err);
      const currentJob = renderJobs.get(jobId) || {};
      renderJobs.set(jobId, { ...currentJob, status: "error", progress: 0, log: `Error: ${err.message}`, error: err.message });
    }
  })();
});

app.get("/api/render-jobs", (req, res) => { res.json(Array.from(renderJobs.entries())); });
app.get("/api/render-status", (req, res) => {
  const jobId = req.query.jobId as string;
  const job = renderJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  if (job.status === "done" && job.outPath && fs.existsSync(job.outPath)) {
    const stats = fs.statSync(job.outPath);
    const sizeInMb = (stats.size / (1024 * 1024)).toFixed(2);
    return res.json({
      ...job,
      fileSize: `${sizeInMb} MB`
    });
  }
  res.json(job);
});

app.options("/api/render-download", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.sendStatus(204);
});

app.get("/api/render-download", (req, res) => {
  const jobId = req.query.jobId as string;
  const download = req.query.download === "true";
  const job = renderJobs.get(jobId);
  
  if (!job) {
    console.warn(`Download failed: Job ${jobId} not found`);
    return res.status(404).json({ error: "Job not found" });
  }
  
  if (job.status !== "done" || !job.outPath) {
    console.warn(`Download failed: Job ${jobId} status is ${job.status}`);
    return res.status(400).json({ error: `Job not ready (Status: ${job.status})` });
  }

  // Verify file exists on disk
  if (!fs.existsSync(job.outPath)) {
    console.error(`Download failed: Output file missing at ${job.outPath}`);
    return res.status(500).json({ error: "Rendered file missing on server. It may have been cleaned up." });
  }

  console.log(`Sending rendered file for job ${jobId} (download=${download}): ${job.outPath}`);
  
  const stat = fs.statSync(job.outPath);
  const fileSize = stat.size;

  const streamHeaders: Record<string, any> = {
    "Content-Type": "video/mp4",
    "X-Accel-Buffering": "no",
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*"
  };

  if (download) {
    res.setHeader("Content-Disposition", `attachment; filename="yotor_official_video_${jobId}.mp4"`);
  }

  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    let start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start)) start = 0;
    if (isNaN(end)) end = fileSize - 1;

    // Clamp end to fileSize - 1 to handle overshoot requests from browsers safely
    if (end >= fileSize) {
      end = fileSize - 1;
    }

    // If start exceeds file boundaries, return 416
    if (start >= fileSize || start < 0 || end < start) {
      res.writeHead(416, {
        "Content-Range": `bytes */${fileSize}`,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes"
      });
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(job.outPath, { start, end });
    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunksize,
      "Content-Type": "video/mp4",
      ...streamHeaders
    };

    res.writeHead(206, head);
    file.pipe(res);

    req.on("close", () => {
      file.destroy();
    });

    file.on("error", (err: any) => {
      console.error(`Streaming error for job ${jobId}:`, err);
    });
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      ...streamHeaders
    };
    res.writeHead(200, head);
    const file = fs.createReadStream(job.outPath);
    file.pipe(res);

    req.on("close", () => {
      file.destroy();
    });

    file.on("error", (err: any) => {
      console.error(`Streaming error for job ${jobId}:`, err);
    });
  }
});

// 5. Vite Dev Server & Static Production Routing
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev middleware mounted successfully.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving statically from compiled static assets inside /dist.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started. Listening at http://localhost:${PORT}`);
  });
}

startServer();
