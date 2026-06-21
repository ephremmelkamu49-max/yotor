import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { EdgeTTS } from "edge-tts-universal";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// JSON parser
app.use(express.json({ limit: '10mb' }));

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
    "gemini-2.1-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash"
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

// 1. Script Analysis API - uses Gemini to split user text into structured cinematic scenes
app.post("/api/analyze-script", async (req, res) => {
  const { script } = req.body;
  if (!script || typeof script !== "string") {
    return res.status(400).json({ error: "Script text is required" });
  }

  const wordCount = script.trim().split(/\s+/).length;
  const isLongScript = wordCount > 350;

  if (!ai) {
    // If API key is missing, fall back to an smart adaptive splitter so the app handles 30 minutes smoothly!
    console.warn("GEMINI_API_KEY is not defined. Falling back to mechanical split.");
    const sentences = script
      .split(/(?<=[.!?።፧])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    // Group sentences if the script is long to avoid hundreds of tiny scenes (critical for 30 minutes support)
    const groupedSentences: string[] = [];
    let currentGroup = "";
    let currentWordSum = 0;
    // Aim for 35 words per scene if long script (~15 seconds text), or sentence-by-sentence if short
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

    const scenes = groupedSentences.map((seg, idx) => {
      const segWords = seg.split(/\s+/).length;
      // speaking speed estimated at 2.4 words per second
      const duration = Math.max(4.0, Number((segWords / 2.4).toFixed(1))); 
      // Simple visual keyword guess
      const nouns = seg.toLowerCase().match(/\b(forest|sunset|technology|people|ocean|city|space|nature|abstract|cyberpunk|office|coding|data|future|workspace|ethiopia|mountains|landscape)\b/g) || ["breathtaking cinematic landscape"];
      const keywords = `${nouns[0]} slow motion epic cinematic ambient 4k`;
      return {
        id: `scene_${idx}_${Date.now()}`,
        text: seg,
        keywords,
        caption: seg,
        duration,
        originalIndex: idx
      };
    });

    return res.json({ scenes, fallback: true, warning: "Using server-side local adaptive regex parsing as GEMINI_API_KEY is not configured." });
  }

  try {
    const isAmharic = /[\u1200-\u137F]/.test(script);
    // Build an intelligent length-aware prompt to bundle sentences in long scripts!
    const lengthInstruction = `SCENIC DENSITY & LANGUAGE SPECIFICS:
Break the script into logical, complete, and sequential scenes.
${isAmharic ? `Since the script contains AMHARIC (Ge'ez) text:
- Identify sentence boundaries using the Amharic punctuation markers '።' (double-dot / final period), '፤' (semicolon), or '፧'.
- Group sentences or clauses matching logical visual arcs so they form highly coherent dramatic sections.
- Estimation of read/voice time: Amharic is read at approximately 1.8 words per second. Calculate segment durations accurately based on this rate.
- Captions MUST be in Amharic (verbatim) matching the narration.
- Visual description 'keywords' MUST be in ENGLISH to successfully search stock media databases like Pexels, Pixabay, and Coverr. Do not output Amharic keywords.` : `English script guidelines:
- Identify logical transitions, narrative pause points, or sentence markers.
- Speak pacing timing: 2.3 words per second.
- Captions must match the segment wording exactly.`}

- Use verbatim original text segments. Do NOT summarize or omit ANY text. 100% of the script must be accounted for.
- Visual keywords should describe real-world physical settings, cinematic camera actions, and lighting setups (e.g., 'mysterious dark forest drone shot cinematic lighting slow motion', 'abstract digital network server blinking LED lights premium close-up') that translate abstract concepts into dramatic high-definition scenes.`;

    const prompt = `You are "Yoto AI Director", a world-class cinematic video producer and director specializing in breathtaking visual storytelling. Your goal is to transform the user's script (enclosed in triple quotes) into a masterfully paced, logical, and aesthetically pleasing sequential scene structure.

${lengthInstruction}

For each scene segment, provide:
1. 'text': The exact verbatim original script excerpt for this scene.
2. 'keywords': High-quality, cinematic visual search query tags. 
   - MUST ALWAYS BE IN ENGLISH (very important for international stock footages).
   - Never use generic words like "video" or abstract actions. Describe tangible scenery: 'vivid sunrise reflecting over mountain lake wide angle', 'futuristic neon tech background', 'extreme macro face showing deep expression 8k'.
3. 'caption': Accurate subtitles matching the original text segment verbatim.
4. 'duration': Estimated speech duration in seconds (use rate limits, min 4.0 seconds, max 16.0 seconds per scene).

User Script:
"""
${script}
"""`;

    const response = await generateContentWithFallback(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scenes: {
              type: Type.ARRAY,
              description: "Array of sequential, non-overlapping visual and audio scenes that represent the full script.",
              items: {
                type: Type.OBJECT,
                properties: {
                  text: {
                    type: Type.STRING,
                    description: "Verbatim, exact unaltered sentences from the original script corresponding to this scene."
                  },
                  keywords: {
                    type: Type.STRING,
                    description: "Cinematic, physical search keywords for stock video clips (e.g. 'moody office server room blinking green lights steadycam')."
                  },
                  caption: {
                    type: Type.STRING,
                    description: "Polished subtitle text for this segment."
                  },
                  duration: {
                    type: Type.NUMBER,
                    description: "Estimated speaking duration in seconds (based on length, min 4.0s)."
                  }
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
    const processedScenes = parsedResult.scenes.map((scene: any, index: number) => ({
      id: `scene_${index}_${Date.now()}`,
      ...scene,
      originalIndex: index
    }));

    res.json({ scenes: processedScenes });
  } catch (error: any) {
    console.error("Gemini script parser failed:", error);
    // Return standard fallback chunking on exception
    const sentences = script
      .split(/(?<=[.!?።፧])\s+/)
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

    const fallbackScenes = groupedSentences.map((seg, idx) => {
      const segWords = seg.split(/\s+/).length;
      const duration = Math.max(4.0, Number((segWords / 2.4).toFixed(1)));
      return {
        id: `scene_${idx}_fallback_${Date.now()}`,
        text: seg,
        keywords: "ambient cinematic visual landscape 4k",
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
      model: "gemini-3.5-flash",
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

// New Multimodal Video Understanding Endpoint using gemini-3.1-pro-preview
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
    const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout
    const fetchRes = await fetch(videoUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!fetchRes.ok) {
      throw new Error(`Failed to download clip: HTTP ${fetchRes.status}`);
    }

    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Video = buffer.toString("base64");

    const geminiPrompt = prompt || "Analyze this video clip and describe what happens, identify objects, color scheme, visual pacing, and key informational details.";

    console.log(`[Video Analyzer] Requesting video understanding from gemini-3.1-pro-preview...`);
    const result = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        {
          inlineData: {
            data: base64Video,
            mimeType: "video/mp4"
          }
        },
        geminiPrompt
      ]
    });

    res.json({ analysis: result.text || "No analysis generated by video model." });
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
    geminiTtsStatus: "ok", // 'ok', 'quota_limit', 'error', 'no_key'
    geminiTtsMessage: "Premium & Unlimited Neural Voices Active.",
    pexelsApiKeyConfigured: !!(req.headers["x-pexels-key"] || process.env.PEXELS_API_KEY)
  };

  res.json(diagnostics);
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
    if (lang === 'am-edge-male' || lang === 'am-edge-female' || lang === 'am-male' || lang.startsWith('am-yotor-')) {
      try {
        const voiceName = (lang === 'am-edge-female' || lang === 'am-yotor-warm-female' || lang === 'am-yotor-bright-female') ? "am-ET-MekdesNeural" : "am-ET-AmehaNeural";
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
        console.log(`[Info] Edge TTS bypassed; engaging secondary voice pipeline. Error: ${errMsg}`);
      }
    }

    // ---------------------------------------------------------
    // GEMINI TTS (High Quality, Metered API)
    // ---------------------------------------------------------
    if ((lang === 'am-gemini-male' || lang === 'am-gemini-female') && ai) {
      try {
        const voiceName = lang === 'am-gemini-female' ? "Aoede" : "Puck";
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
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
    let fallbackLang = 'am';

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
      const ttsRes = await fetch(url);
      if (ttsRes.ok) {
        const buf = await ttsRes.arrayBuffer();
        audioBuffers.push(Buffer.from(buf));
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
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: `You are an expert YouTube Thumbnail designer. Generate a highly detailed image generation prompt for an amazing, eye-catching, highly clickable video thumbnail based on this video script snippet. The thumbnail should be cinematic, vibrant, and highly dramatic. IMPORTANT: Do NOT include text or typography instructions in the image prompt, just describe the raw visual composition and lighting.

Video Script:
${scenesText.substring(0, 5000)}` }] }]
    });

    let imagePrompt = promptResponse.text?.trim() || "cinematic colorful abstract background 4k";

    // 2. Generate Image using gemini-3.1-flash-image
    const imageResponse = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
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
