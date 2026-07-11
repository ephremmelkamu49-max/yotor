import fs from 'fs';
let code = fs.readFileSync('src/components/RenderModal.tsx', 'utf-8');

const startStr = `  const initiateCloudRender = async () => {`;
const endStr = `  };

  if (!isOpen) return null;`;

const functionCode = `  const initiateCloudRender = async () => {
    setRenderStatus('processing');
    setProgress(0);
    setRenderLogs([]);
    addLog(\`Initiating remote compile via /api/render-ffmpeg...\`);

    let progressInterval: any;
    try {
      const payloadScenes = [];
      for (const scene of scenesToRender) {
        let ttsAudioBuffer = undefined;
        let targetDuration = scene.duration;
        if (scene.ttsAudioUrl) {
          const m = scene.ttsAudioUrl.match(/^data:([A-Za-z-+\\/]+);base64,(.+)$/);
          if (m) {
            ttsAudioBuffer = m[2];
          }
        }
        let sceneMusicVolume = undefined;
        if (typeof scene.musicVolume === 'number') {
           sceneMusicVolume = scene.musicVolume;
        }
        payloadScenes.push({
          id: scene.id,
          videoUrl: scene.videoUrl || "",
          ttsAudioBuffer,
          duration: targetDuration,
          musicVolume: sceneMusicVolume
        });
      }

      addLog("Uploading structural manifest to remote rendering farm...");
      setProgress(20);

      const payload = {
        scenes: payloadScenes,
        aspectRatio: projectConfig.aspectRatio,
        musicUrl: projectConfig.isMusicEnabled ? projectConfig.musicTrack : undefined,
        musicVolume: projectConfig.musicVolume
      };
      
      addLog("Starting backend compilation...");
      progressInterval = setInterval(() => {
        setProgress((p) => p < 90 ? p + Math.random() * 5 : p);
        addLog("Still baking...");
      }, 3000);
      
      const response = await fetch("/api/render-ffmpeg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        let errMsg = response.statusText;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg || \`Cloud render failed: status \${response.status}\`);
      }
      
      addLog("✅ [Cloud Render] Remote compilation complete! Downloading master video...");
      setProgress(95);

      const finalBlob = await response.blob();
      const finalUrl = URL.createObjectURL(finalBlob);
      setRenderedBlobUrl(finalUrl);
      
      const sizeInMb = (finalBlob.size / (1024 * 1024)).toFixed(2);
      setDownloadExtension("mp4");
      
      const totalDur = scenesToRender.reduce((s, sc) => s + sc.duration, 0);
      setStatistics({
        duration: Math.round(totalDur),
        fileSize: \`\${sizeInMb} MB\`,
        scenesProcessed: scenesToRender.length,
        fps: 30
      });
      setProgress(100);
      setRenderStatus('completed');
      if (onRenderComplete) onRenderComplete();
    } catch (err: any) {
      if (progressInterval) clearInterval(progressInterval);
      console.error(err);
      setRenderStatus('failed');
      addLog(\`❌ [Cloud Render] FAILED: \${err.message}\`);
    }
  };

  if (!isOpen) return null;`;

code = code.substring(0, code.indexOf(startStr)) + functionCode + code.substring(code.indexOf(endStr) + endStr.length);
fs.writeFileSync('src/components/RenderModal.tsx', code);
