import fs from 'fs';
let code = fs.readFileSync('src/components/RenderModal.tsx', 'utf-8');

const targetStr = `        payloadScenes.push({
          id: scene.id,
          videoUrl: scene.videoUrl || "",
          ttsAudioBuffer,
          duration: targetDuration,
          musicVolume: sceneMusicVolume
        });`;

const replacementStr = `        let finalVideoUrl = scene.videoUrl || "";
        if (finalVideoUrl.startsWith('blob:')) {
          try {
            const blobRes = await fetch(finalVideoUrl);
            const blobData = await blobRes.blob();
            const reader = new FileReader();
            finalVideoUrl = await new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blobData);
            });
          } catch(e) {
            console.warn("Failed to convert blob video to base64", e);
          }
        }

        payloadScenes.push({
          id: scene.id,
          videoUrl: finalVideoUrl,
          ttsAudioBuffer,
          duration: targetDuration,
          musicVolume: sceneMusicVolume
        });`;

code = code.replace(targetStr, replacementStr);
fs.writeFileSync('src/components/RenderModal.tsx', code);
