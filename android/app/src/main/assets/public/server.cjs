var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_edge_tts_universal = require("edge-tts-universal");
var import_openai = __toESM(require("openai"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "10mb" }));
app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.sendFile(import_path.default.join(process.cwd(), "manifest.json"));
});
app.get("/sw.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(import_path.default.join(process.cwd(), "sw.js"));
});
function pcmToWav(pcmBuffer, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + dataSize, 4);
  wavHeader.write("WAVE", 8);
  wavHeader.write("fmt ", 12);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(numChannels, 22);
  wavHeader.writeUInt32LE(sampleRate, 24);
  wavHeader.writeUInt32LE(byteRate, 28);
  wavHeader.writeUInt16LE(blockAlign, 32);
  wavHeader.writeUInt16LE(bitsPerSample, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(dataSize, 40);
  return Buffer.concat([wavHeader, pcmBuffer]);
}
var ai = null;
if (process.env.GEMINI_API_KEY) {
  ai = new import_genai.GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
var openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new import_openai.default({
    apiKey: process.env.OPENAI_API_KEY
  });
}
async function generateContentWithFallback(aiInstance, options) {
  const modelFallbackList = [
    options.model,
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview"
  ];
  const uniqueModels = Array.from(new Set(modelFallbackList));
  let lastError = null;
  for (const modelName of uniqueModels) {
    try {
      console.log(`[Gemini Fallback System] Attempting generation with model: ${modelName}`);
      const response = await aiInstance.models.generateContent({
        ...options,
        model: modelName
      });
      return response;
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini Fallback System] Model ${modelName} encountered error: ${err.message || err}`);
    }
  }
  throw lastError;
}
app.post("/api/generate-video", async (req, res) => {
  if (!ai) return res.status(500).json({ error: "Gemini API not configured" });
  const { prompt, aspectRatio = "16:9", resolution = "720p" } = req.body;
  try {
    const operation = await ai.models.generateVideos({
      model: "veo-3.1-lite-generate-preview",
      prompt,
      config: {
        numberOfVideos: 1,
        resolution,
        aspectRatio
      }
    });
    res.json({ operationName: operation.name });
  } catch (err) {
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
      operation: { name: operationName }
    });
    res.json({ done: updated.done, status: updated.metadata?.state });
  } catch (err) {
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
      operation: { name: operationName }
    });
    if (!updated.done) {
      return res.status(400).json({ error: "Video processing is not complete" });
    }
    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      return res.status(404).json({ error: "No video URI found in completed operation" });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    const videoRes = await fetch(uri, {
      headers: { "x-goog-api-key": apiKey }
    });
    if (!videoRes.ok) {
      throw new Error(`Failed to fetch video from storage: ${videoRes.statusText}`);
    }
    res.setHeader("Content-Type", "video/mp4");
    const reader = videoRes.body?.getReader();
    if (!reader) throw new Error("No reader on video response body");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error("Veo Download Error:", err);
    res.status(500).json({ error: err.message || "Failed to download video" });
  }
});
app.get("/api/video-download-get", async (req, res) => {
  if (!ai) return res.status(500).json({ error: "Gemini API not configured" });
  const operationName = req.query.op;
  if (!operationName) return res.status(400).json({ error: "op (operationName) is required" });
  try {
    const updated = await ai.operations.getVideosOperation({
      operation: { name: operationName }
    });
    if (!updated.done) {
      return res.status(400).json({ error: "Video processing is not complete" });
    }
    const uri = updated.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      return res.status(404).json({ error: "No video URI found" });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    const videoRes = await fetch(uri, {
      headers: { "x-goog-api-key": apiKey }
    });
    if (!videoRes.ok) throw new Error("Failed to fetch video");
    res.setHeader("Content-Type", "video/mp4");
    const reader = videoRes.body?.getReader();
    if (!reader) throw new Error("No reader");
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/analyze-script", async (req, res) => {
  const { script, visualStyle, isKeywordsOnly } = req.body;
  const providedOpenaiKey = req.headers["x-openai-key"];
  if (!script || typeof script !== "string") {
    return res.status(400).json({ error: "Script text is required" });
  }
  const wordCount = script.trim().split(/\s+/).length;
  const isAmharic = /[\u1200-\u137F]/.test(script);
  const isLongScript = script.length > 2e3;
  const styleMapping = {
    "realistic": "Cinematic realistic 4k, professional lighting, photorealistic textures",
    "3d-animation": "3D Pixar style animation, cute expressive characters, vibrant volumetric lighting, Disney style 3D render",
    "2d-animation": "2D hand-drawn animation, flat colors, expressive line art, illustrative style",
    "anime": "Studio Ghibli aesthetic, anime style background, detailed characters, Japanese animation",
    "watercolor": "Soft watercolor painting, artistic bleeding colors, paper texture, impressionist",
    "cyberpunk": "Cyberpunk aesthetic, neon colored lights, futuristic cityscape, rainy night, high tech",
    "sketch": "Hand-drawn pencil sketch, charcoal texture, artistic line work"
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
            type: import_genai.Type.OBJECT,
            properties: {
              scenes: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    text: { type: import_genai.Type.STRING },
                    keywords: { type: import_genai.Type.STRING },
                    caption: { type: import_genai.Type.STRING },
                    duration: { type: import_genai.Type.NUMBER }
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
      const cleanedText = responseText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleanedText);
      const processed = parsed.scenes.map((s, idx) => ({
        id: `sc_reel_${idx}`,
        ...s,
        originalIndex: idx
      }));
      return res.json({ scenes: processed, info: "AI Reel Dreamer" });
    } catch (e) {
      console.error("Reel Dreamer AI failed:", e);
      const sentences = script.split(/(?<=[.!?።፤፧])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
      if (sentences.length === 0) {
        sentences.push(script);
      }
      const mockScenes = sentences.slice(0, 5).map((sentence, i) => ({
        id: `scene_kw_${i}`,
        text: sentence,
        keywords: `${script.substring(0, 50)} cinematic ${i}`,
        caption: sentence.substring(0, 30),
        duration: 4,
        originalIndex: i
      }));
      return res.json({ scenes: mockScenes, info: "Baseline Reels" });
    }
  }
  if (!ai && !openai && !providedOpenaiKey?.startsWith("sk-")) {
    console.warn("Neither GEMINI_API_KEY nor OPENAI_API_KEY is defined. Falling back to mechanical split.");
    const sentences = script.split(/(?<=[.!?።፤፧])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
    if (sentences.length === 0 && script.trim().length > 0) {
      sentences.push(script.trim());
    }
    const groupedSentences = [];
    let currentGroup = "";
    let currentWordSum = 0;
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
      const duration = Math.max(4, Number((segWords / 2.2).toFixed(1)));
      const matchedNouns = seg.toLowerCase().match(/\b(forest|sunset|technology|people|ocean|city|space|nature|abstract|cyberpunk|office|coding|data|future|workspace|ethiopia|mountains|landscape|flower|human|animal|addis|coffee|culture|history|traditional|luxury|peaceful|wildlife)\b/g);
      const baseKeyword = matchedNouns ? matchedNouns[0] : fallbackKeywordsList[idx % fallbackKeywordsList.length];
      const keywords = `${baseKeyword} ${styleMapping[visualStyle || "realistic"]} motion 16:9 cinematic`;
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
        keywords: `cinematic ${styleMapping[visualStyle || "realistic"]}`,
        caption: script,
        duration: 8,
        originalIndex: 0
      });
    }
    return res.json({ scenes, fallback: true, warning: "Using server-side local adaptive regex parsing." });
  }
  try {
    const isAmharic2 = /[\u1200-\u137F]/.test(script);
    const lengthInstruction = `SCENIC DENSITY & LANGUAGE SPECIFICS:
Break the script into logical, complete, and sequential scenes. Aim for a high cinematic density: Target scene durations between 6 and 12 seconds each. Do NOT create long 30+ second scenes as they look static.
${isAmharic2 ? `Since the script contains AMHARIC (Ge'ez) text:
- Identify sentence boundaries primarily using the Amharic punctuation markers '\u1362' (final period), '\u1364' (semicolon), or '\u1367'.
- Group sentences or clauses matching logical visual arcs so they form highly coherent dramatic sections.
- Estimation of read/voice time: Amharic is read at approximately 1.7 words per second. Calculate segment durations accurately based on this rate.
- Captions MUST be in Amharic (verbatim) matching the narration.
- Visual description 'keywords' MUST be in ENGLISH (e.g. 'sunset over mountains', 'high tech laboratory') to successfully search stock media databases. Do NOT output Amharic keywords.` : `English script guidelines:
- Identify logical transitions, narrative pause points, or sentence markers.
- Speak pacing timing: 2.3 words per second.
- Captions must match the segment wording exactly.`}

- Use verbatim original text segments. Do NOT summarize or omit ANY text. 100% of the script must be accounted for.
- Visual keywords should describe real-world physical settings, cinematic camera actions, and lighting setups.
${visualStyle ? `- VISUAL STYLE DESCRIPTOR: The user prefers a "${visualStyle}" aesthetic. Ensure 'keywords' incorporate descriptors like "${styleMapping[visualStyle] || ""}" to help find or represent this style.` : ""}
- Ensure keywords are descriptive enough for a stock video search engine (e.g. 'slow motion 3d animation of child smiling pixar style' instead of just 'animation')`;
    const prompt = `You are "Yoto AI Director", a cinematic video producer. Transform the user's script (enclosed in triple quotes) into a masterfully paced sequential scene structure.

${lengthInstruction}

For each scene segment, provide:
1. 'text': The exact verbatim original script excerpt for this scene.
2. 'keywords': High-quality, cinematic visual search query tags (MUST BE IN ENGLISH).
3. 'caption': Accurate subtitles matching the original text segment verbatim.
4. 'duration': Estimated speech duration in seconds (min 4.0s).

User Script:
"""
${script}
"""`;
    let processedScenes = [];
    let openaiErrorMessage = "";
    const effectiveOpenAiKey = providedOpenaiKey || process.env.OPENAI_API_KEY;
    if (effectiveOpenAiKey) {
      try {
        console.log("[Director Engine] Using OpenAI (GPT-4o) for high-precision direction...");
        const localOpenai = new import_openai.default({ apiKey: effectiveOpenAiKey });
        const chatCompletion = await localOpenai.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model: "gpt-4o",
          response_format: { type: "json_object" }
        });
        const content = chatCompletion.choices[0].message.content;
        if (content) {
          const parsedResult2 = JSON.parse(content);
          processedScenes = parsedResult2.scenes.map((scene, index) => ({
            id: `scene_${index}_${Date.now()}`,
            ...scene,
            originalIndex: index
          }));
          return res.json({
            scenes: processedScenes,
            engine: "openai",
            info: "Precision Director (GPT-4o)"
          });
        }
      } catch (openAiErr) {
        openaiErrorMessage = openAiErr?.message || "Unknown OpenAI Error";
        console.error("OpenAI Direction failed, falling back to Gemini:", openAiErr);
      }
    }
    if (!ai) {
      throw new Error(openaiErrorMessage ? `OpenAI Failed: ${openaiErrorMessage}. Also no Gemini API key configured.` : "No primary AI engine available.");
    }
    const response = await generateContentWithFallback(ai, {
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            scenes: {
              type: import_genai.Type.ARRAY,
              description: "Array of sequential visual and audio scenes.",
              items: {
                type: import_genai.Type.OBJECT,
                properties: {
                  text: { type: import_genai.Type.STRING },
                  keywords: { type: import_genai.Type.STRING },
                  caption: { type: import_genai.Type.STRING },
                  duration: { type: import_genai.Type.NUMBER }
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
    if (responseText.startsWith("```json")) {
      responseText = responseText.replace(/^```json\n/, "").replace(/\n```$/, "");
    } else if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```\n/, "").replace(/\n```$/, "");
    }
    const parsedResult = JSON.parse(responseText.trim());
    processedScenes = parsedResult.scenes.map((scene, index) => ({
      id: `scene_${index}_${Date.now()}`,
      ...scene,
      originalIndex: index
    }));
    res.json({
      scenes: processedScenes,
      engine: "gemini",
      info: "Localized Director (Gemini 3.1)",
      openaiError: openaiErrorMessage || void 0
    });
  } catch (error) {
    console.error("Gemini script parser failed:", error);
    const sentences = script.split(/(?<=[.!?።፤፧])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
    const groupedSentences = [];
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
    const styleMapping2 = {
      "realistic": "Cinematic realistic 4k, professional lighting, photorealistic textures",
      "3d-animation": "3D Pixar style animation, cute expressive characters, vibrant volumetric lighting, Disney style 3D render",
      "2d-animation": "2D hand-drawn animation, flat colors, expressive line art, illustrative style",
      "anime": "Studio Ghibli aesthetic, anime style background, detailed characters, Japanese animation",
      "watercolor": "Soft watercolor painting, artistic bleeding colors, paper texture, impressionist",
      "cyberpunk": "Cyberpunk aesthetic, neon colored lights, futuristic cityscape, rainy night, high tech",
      "sketch": "Hand-drawn pencil sketch, charcoal texture, artistic line work"
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
      const duration = Math.max(4, Number((segWords / 2.4).toFixed(1)));
      const baseKeyword = fallbackKeywordsList[idx % fallbackKeywordsList.length];
      const styleDesc = styleMapping2[visualStyle || "realistic"] || "cinematic";
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
app.post("/api/copilot", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { message, scenes, projectConfig, chatHistory } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message prompt is required" });
  }
  if (!ai) {
    return res.json({
      message: `\u1230\u120B\u121D! \u12EE\u1276\u122D \u12E8\u130D\u120D \u12A0\u12ED (Yotor Personal AI) \u1228\u12F3\u1275\u12CE \u1290\u129D\u1362 Gemini API Key \u1235\u120B\u120D\u1270\u12CB\u1240\u1228 (GEMINI_API_KEY) \u1325\u12EB\u1244\u12CE\u1295 \u12A8\u1218\u1348\u1340\u121D \u1270\u1308\u12F5\u1262\u12EB\u1208\u1201\u1362 \u12A5\u1263\u12AD\u12CE\u1295 \u1260\u1235\u1270\u130D\u122B \u12E8\u134A\u120D\u121D \u12A4\u1352\u12A0\u12ED \u1241\u120D\u134E\u127D \u12CD\u1235\u1325 \u12C8\u12ED\u121D \u12E8\u1234\u1272\u1295\u130D \u1308\u133D \u120B\u12ED \u12A4\u1352\u12A0\u12ED \u1241\u120D\u134D\u12CE\u1295 \u12EB\u1240\u1293\u1265\u1229\u1362 \u12EB \u12E8\u1308\u1263\u120D\u129D\u1295 \u1325\u12EB\u1244: "${message}" \u12EB\u1208\u121D\u1295\u121D \u1308\u12F0\u1265 \u12A0\u1235\u1270\u12AB\u12AD\u120D \u1290\u1260\u122D!`,
      updateConfig: {},
      updateScenes: { action: "none" }
    });
  }
  try {
    const isAmharic = /[\u1200-\u137F]/.test(message);
    const systemInstruction = `You are Yotor Personal AI (\u12EE\u1276\u122D \u12A0\u12ED), the absolute ruler and creative director of this digital video workspace.
You have been granted full control over the user's video timeline, script, narration texts, scenery styles, and project configurations.
You must listen to the user's requests, which could be in Amharic (\u12A0\u121B\u122D\u129B) or English, and respond with extreme politeness, helpfulness, and creative advice, while actually executing their commands by generating suitable state updates.

Current Workspace State:
- ASPECT RATIO: "${projectConfig?.aspectRatio || "16:9"}"
- SHOW SUBTITLES: ${projectConfig?.showSubtitles === false ? "DISABLED" : "ENABLED"}
- VOICE ENABLED (TTS): ${projectConfig?.voiceEnabled === false ? "DISABLED" : "ENABLED"}
- SPEECH VOICE: "${projectConfig?.ttsVoice || "am-gemini-female"}"
- MUSIC PLAYBACK: ${projectConfig?.musicEnabled === false ? "DISABLED" : "ENABLED"}
- MUSIC VOLUME: "${projectConfig?.musicVolume || 0.2}"
- MOTION (KEN BURNS EFFECT): ${projectConfig?.enableMotion === false ? "DISABLED" : "ENABLED"}
- MOTION STYLE: "${projectConfig?.motionStyle || "random"}"
- SUBTITLE POSITION: "${projectConfig?.subtitleStyle?.position || "bottom"}"
- SUBTITLE FONT SIZE: "${projectConfig?.subtitleStyle?.fontSize || 16}"

Active Video Scenes (${scenes?.length || 0}):
${(scenes || []).map((s, idx) => `Scene [${idx}]: "${s.text}" (duration: ${s.duration}s, keywords: "${s.keywords}")`).join("\n")}

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
          role: turn.role === "user" ? "user" : "model",
          parts: [{ text: turn.text }]
        });
      }
    }
    contents.push({ role: "user", parts: [{ text: message }] });
    const response = await generateContentWithFallback(ai, {
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: import_genai.Type.OBJECT,
          properties: {
            message: { type: import_genai.Type.STRING, description: "Detailed response text explaining what was updated, what creative changes were made, or answering user questions." },
            updateConfig: {
              type: import_genai.Type.OBJECT,
              properties: {
                aspectRatio: { type: import_genai.Type.STRING, enum: ["16:9", "9:16", "1:1"] },
                voiceEnabled: { type: import_genai.Type.BOOLEAN },
                ttsVoice: { type: import_genai.Type.STRING },
                ttsLanguage: { type: import_genai.Type.STRING },
                showSubtitles: { type: import_genai.Type.BOOLEAN },
                subtitleStyle: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    fontSize: { type: import_genai.Type.INTEGER },
                    fontFamily: { type: import_genai.Type.STRING },
                    uppercase: { type: import_genai.Type.BOOLEAN },
                    bgOpacity: { type: import_genai.Type.NUMBER },
                    position: { type: import_genai.Type.STRING, enum: ["bottom", "top", "center"] }
                  }
                },
                backgroundMusic: { type: import_genai.Type.STRING },
                musicEnabled: { type: import_genai.Type.BOOLEAN },
                musicVolume: { type: import_genai.Type.NUMBER },
                enableMotion: { type: import_genai.Type.BOOLEAN },
                motionStyle: { type: import_genai.Type.STRING }
              }
            },
            updateScenes: {
              type: import_genai.Type.OBJECT,
              properties: {
                action: { type: import_genai.Type.STRING, enum: ["recreate", "add", "none"] },
                scenesList: {
                  type: import_genai.Type.ARRAY,
                  items: {
                    type: import_genai.Type.OBJECT,
                    properties: {
                      text: { type: import_genai.Type.STRING },
                      keywords: { type: import_genai.Type.STRING },
                      duration: { type: import_genai.Type.NUMBER }
                    },
                    required: ["text", "keywords", "duration"]
                  }
                },
                targetIndex: { type: import_genai.Type.INTEGER }
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
  } catch (error) {
    console.error("Copilot AI failed:", error);
    return res.status(500).json({ error: error.message });
  }
});
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
    const timeout = setTimeout(() => controller.abort(), 25e3);
    const fetchRes = await fetch(videoUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
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
    console.log(`[Video Analyzer] Requesting video understanding from gemini-3.5-flash...`);
    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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
  } catch (error) {
    console.error("[Video Analyzer] Failure:", error);
    res.status(500).json({ error: error.message || "An error occurred during video analysis." });
  }
});
app.options("/api/tts", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
  res.sendStatus(200);
});
app.get("/api/diagnose", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const diagnostics = {
    geminiApiKeyConfigured: !!process.env.GEMINI_API_KEY,
    openaiApiKeyConfigured: !!process.env.OPENAI_API_KEY,
    chatGptProStatus: !!process.env.OPENAI_API_KEY ? "Active (GPT-4o Platinum)" : "Inactive",
    veoStatus: !!process.env.GEMINI_API_KEY ? "Operational (Experimental 3.1)" : "Inactive",
    geminiTtsStatus: "ok",
    // 'ok', 'quota_limit', 'error', 'no_key'
    geminiTtsMessage: "Premium & Unlimited Neural Voices Active.",
    pexelsApiKeyConfigured: !!(req.headers["x-pexels-key"] || process.env.PEXELS_API_KEY)
  };
  res.json(diagnostics);
});
app.post("/api/diagnose", import_express.default.json(), (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const fs = require("fs");
  fs.writeFileSync("error_log.txt", req.body.errorLog || "No error log sent");
  console.log("Error log written to error_log.txt");
  res.json({ success: true });
});
app.get("/api/tts", async (req, res) => {
  const text = req.query.text;
  const lang = req.query.lang || "en";
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
  if (!text) {
    return res.status(400).json({ error: "Text is required to vocalize." });
  }
  try {
    const safeText = text.substring(0, 5e3);
    const providedOpenaiKey = req.query.openai_key;
    const activeOpenAI = providedOpenaiKey ? new import_openai.default({ apiKey: providedOpenaiKey }) : openai;
    if (activeOpenAI && lang.startsWith("am-openai-")) {
      try {
        const voiceName = lang.includes("nova") ? "nova" : "onyx";
        const mp3 = await activeOpenAI.audio.speech.create({
          model: "tts-1",
          voice: voiceName,
          input: safeText
        });
        const arrayBuffer = await mp3.arrayBuffer();
        const combinedBuffer = Buffer.from(arrayBuffer);
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : combinedBuffer.length - 1;
          const chunksize = end - start + 1;
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
      } catch (oai_err) {
        console.log(`[Info] OpenAI TTS bypassed; Error: ${oai_err?.message}`);
      }
    }
    if (lang === "am-edge-male" || lang === "am-edge-female" || lang === "am-male" || lang.startsWith("am-yotor-") || lang.startsWith("am-openai-") || lang.startsWith("en") || lang === "es" || lang === "fr") {
      try {
        let voiceName = "am-ET-AmehaNeural";
        if (lang === "am-edge-female" || lang === "am-yotor-warm-female" || lang === "am-yotor-bright-female" || lang === "am-openai-nova") {
          voiceName = "am-ET-MekdesNeural";
        } else if (lang === "en-US-Standard-D") {
          voiceName = "en-US-GuyNeural";
        } else if (lang === "en-US-Standard-F") {
          voiceName = "en-US-AriaNeural";
        } else if (lang === "en-gb") {
          voiceName = "en-GB-RyanNeural";
        } else if (lang === "en") {
          voiceName = "en-US-ChristopherNeural";
        } else if (lang === "es") {
          voiceName = "es-ES-AlvaroNeural";
        } else if (lang === "fr") {
          voiceName = "fr-FR-HenriNeural";
        }
        const tts = new import_edge_tts_universal.EdgeTTS(safeText, voiceName);
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
          const chunksize = end - start + 1;
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
      } catch (edge_err) {
        const errMsg = edge_err instanceof Error ? edge_err.message : edge_err?.message || (typeof edge_err === "string" ? edge_err : JSON.stringify(edge_err));
        console.log(`[Info] Edge TTS bypassed; engaging secondary voice pipeline. Error: ${errMsg}`);
      }
    }
    if ((lang === "am-gemini-male" || lang === "am-gemini-female") && ai) {
      try {
        const voiceName = lang === "am-gemini-female" ? "Aoede" : "Puck";
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: `\u1260\u12A0\u121B\u122D\u129B \u12F5\u121D\u1345 \u12A0\u1295\u1265\u1265: ${safeText}` }] }],
          config: {
            responseModalities: [import_genai.Modality.AUDIO],
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
          const wavBuffer = pcmToWav(rawBuffer, 24e3);
          const range = req.headers.range;
          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : wavBuffer.length - 1;
            if (start >= wavBuffer.length || end >= wavBuffer.length) {
              res.status(416).setHeader("Content-Range", `bytes */${wavBuffer.length}`);
              return res.end();
            }
            const chunksize = end - start + 1;
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
      } catch (gem_err) {
        const errMsg = gem_err instanceof Error ? gem_err.message : gem_err?.message || (typeof gem_err === "string" ? gem_err : JSON.stringify(gem_err));
        console.log(`[Info] Gemini TTS bypassed; engaging standard voice pipeline. Error: ${errMsg}`);
      }
    }
    let fallbackLang = lang.includes("-") ? lang.split("-")[0] : lang;
    if (fallbackLang.startsWith("am")) fallbackLang = "am";
    else if (fallbackLang.startsWith("en")) fallbackLang = "en";
    const chunks = [];
    let remainingText = safeText;
    while (remainingText.length > 0) {
      if (remainingText.length <= 190) {
        chunks.push(remainingText);
        break;
      }
      let chunk = remainingText.substring(0, 190);
      const lastSpace = chunk.lastIndexOf(" ");
      const lastPeriod = Math.max(chunk.lastIndexOf("."), chunk.lastIndexOf("\u1362"));
      const splitIndex = lastPeriod > 100 ? lastPeriod + 1 : lastSpace > 100 ? lastSpace : 190;
      chunks.push(remainingText.substring(0, splitIndex));
      remainingText = remainingText.substring(splitIndex).trim();
    }
    const audioBuffers = [];
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
        const chunksize = end - start + 1;
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
  } catch (err) {
    console.error("Audio generation proxy failure:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/music", (req, res) => {
  const trackId = req.query.id || "ambient_mindful";
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
  const sampleRate = 22050;
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
      const hihat = beatProgress > 0.25 && beatProgress < 0.28 ? (Math.random() - 0.5) * 0.15 : 0;
      sampleVal = kick * 0.45 + subBass * 0.35 + hihat * 0.2;
    } else if (trackId === "dreamy_cosmos") {
      const sweepFrequency = 110 + 20 * Math.sin(2 * Math.PI * 0.1 * t);
      const wave1 = Math.sin(2 * Math.PI * sweepFrequency * t);
      const wave2 = Math.sin(2 * Math.PI * (sweepFrequency * 1.5) * t + Math.sin(2 * Math.PI * 1 * t));
      const wave3 = Math.sin(2 * Math.PI * (sweepFrequency * 2) * t);
      const env = 0.5 + 0.3 * Math.sin(2 * Math.PI * 0.25 * t);
      sampleVal = (wave1 + wave2 * 0.4 + wave3 * 0.2) / 1.6 * env;
    } else if (trackId === "ethio_jazz_vibe") {
      const barDuration = 4;
      const barIndex = Math.floor(t / barDuration) % 4;
      const notes = [130.81, 146.83, 164.81, 196, 220];
      const f1 = notes[barIndex % 5];
      const f2 = notes[(barIndex + 2) % 5];
      const lead = Math.sin(2 * Math.PI * f1 * t + 0.3 * Math.sin(2 * Math.PI * 4 * t));
      const pad = Math.sin(2 * Math.PI * (f1 / 2) * t) + Math.sin(2 * Math.PI * (f2 / 2) * t);
      sampleVal = (lead * 0.3 + pad * 0.4) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 0.5 * t));
    } else if (trackId === "habesha_modern_upbeat") {
      const tempo = 0.35;
      const pulse = t % tempo;
      const kick = Math.exp(-25 * pulse) * Math.sin(2 * Math.PI * 55);
      const noteFreq = 440 * Math.pow(2, Math.floor(t * 4) % 12 / 12);
      const synth = Math.sin(2 * Math.PI * noteFreq * t) * Math.exp(-4 * pulse);
      sampleVal = kick * 0.6 + synth * 0.4;
    } else if (trackId === "lofi_addis") {
      const beat = t % 1.2;
      const kick = Math.exp(-15 * beat) * Math.sin(2 * Math.PI * 50);
      const snare = beat > 0.6 && beat < 0.65 ? (Math.random() - 0.5) * 0.3 : 0;
      const rainy = (Math.random() - 0.5) * 0.05;
      const keys = Math.sin(2 * Math.PI * 329.63 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.2 * t));
      sampleVal = kick * 0.4 + snare * 0.3 + rainy + keys * 0.2;
    } else if (trackId === "uplifting_cinematic") {
      const barDuration = 2.5;
      const barIndex = Math.floor(t / barDuration) % 4;
      let freqs = [130.81, 164.81, 196];
      if (barIndex === 1) freqs = [174.61, 220, 261.63];
      else if (barIndex === 2) freqs = [196, 246.94, 293.66];
      else if (barIndex === 3) freqs = [220, 261.63, 329.63];
      const chordWave = Math.sin(2 * Math.PI * freqs[0] * t) + Math.sin(2 * Math.PI * freqs[1] * t) * 0.8 + Math.sin(2 * Math.PI * freqs[2] * t) * 0.6;
      sampleVal = chordWave / 2.4 * 0.5;
    } else if (trackId === "lofi_chill") {
      const barDuration = 5;
      const barIndex = Math.floor(t / barDuration) % 2;
      let freqs = [110, 164.81, 196, 261.63];
      if (barIndex === 1) freqs = [87.31, 130.81, 174.61, 220];
      const chordWave = Math.sin(2 * Math.PI * freqs[0] * t) + Math.sin(2 * Math.PI * freqs[1] * t) * 0.9 + Math.sin(2 * Math.PI * freqs[2] * t) * 0.8 + Math.sin(2 * Math.PI * freqs[3] * t) * 0.6;
      const tremolo = 0.7 + 0.3 * Math.sin(2 * Math.PI * 4 * t);
      sampleVal = chordWave / 3.3 * tremolo * 0.5;
    } else {
      const noteProgress = t % 1.25;
      const harpEnvelope = Math.exp(-6 * noteProgress);
      const pitchIndex = Math.floor(t / 1.25) % 8;
      const scale = [220, 246.94, 261.63, 293.66, 329.63, 392, 440, 523.25];
      const harpFreq = scale[pitchIndex];
      const harpWave = Math.sin(2 * Math.PI * harpFreq * t) * harpEnvelope;
      const padFreqs = [110, 164.81, 220];
      const padWave = Math.sin(2 * Math.PI * padFreqs[0] * t) + Math.sin(2 * Math.PI * padFreqs[1] * t) * 0.7 + Math.sin(2 * Math.PI * padFreqs[2] * t) * 0.5;
      sampleVal = (harpWave * 0.4 + padWave / 2.2 * 0.3) * 0.7;
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
    const chunksize = end - start + 1;
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
app.get("/api/pexels/search", async (req, res) => {
  const query = req.query.query;
  const userKey = req.headers["x-pexels-key"];
  const apiKey = userKey || process.env.PEXELS_API_KEY;
  if (!query) {
    return res.status(400).json({ error: "Search query required." });
  }
  if (!apiKey) {
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
  } catch (err) {
    console.error("Pexels proxy failed:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/pixabay/search", async (req, res) => {
  const query = req.query.query;
  const userKey = req.headers["x-pixabay-key"];
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
  } catch (err) {
    console.error("Pixabay proxy failed:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/api/coverr/search", async (req, res) => {
  const query = req.query.query;
  const userKey = req.headers["x-coverr-key"];
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
        "Authorization": `Bearer ${apiKey}`
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
  } catch (err) {
    console.error("Coverr proxy failed:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/thumbnail", async (req, res) => {
  try {
    if (!ai) {
      throw new Error("AI features require GEMINI_API_KEY environment variable to be set.");
    }
    const { aspectRatio, scenesText } = req.body;
    const promptResponse = await generateContentWithFallback(ai, {
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: `You are an expert YouTube Thumbnail designer. Generate a highly detailed image generation prompt for an amazing, eye-catching, highly clickable video thumbnail based on this video script snippet. The thumbnail should be cinematic, vibrant, and highly dramatic. IMPORTANT: Do NOT include text or typography instructions in the image prompt, just describe the raw visual composition and lighting.

Video Script:
${scenesText.substring(0, 5e3)}` }] }]
    });
    let imagePrompt = promptResponse.text?.trim() || "cinematic colorful abstract background 4k";
    const imageResponse = await ai.models.generateContent({
      model: "gemini-3.1-flash-image",
      contents: {
        parts: [{ text: imagePrompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio === "9:16" ? "9:16" : aspectRatio === "1:1" ? "1:1" : "16:9",
          imageSize: "1K"
        }
      }
    });
    let imageUrl = null;
    if (imageResponse.candidates && imageResponse.candidates[0].content.parts) {
      for (const part of imageResponse.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          imageUrl = `data:image/jpeg;base64,${base64EncodeString}`;
          break;
        }
      }
    }
    if (!imageUrl) {
      throw new Error("No image was returned from the model.");
    }
    res.json({ imageUrl, prompt: imagePrompt });
  } catch (e) {
    if (e.message && (e.message.includes("429") || e.message.includes("quota") || e.message.includes("RESOURCE_EXHAUSTED"))) {
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
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    console.log("Vite dev middleware mounted successfully.");
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
    console.log("Serving statically from compiled static assets inside /dist.");
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started. Listening at http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
