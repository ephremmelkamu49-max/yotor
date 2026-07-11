import fs from 'fs';
let code = fs.readFileSync('src/components/RenderModal.tsx', 'utf-8');

const targetStr = `      const payload = {
        scenes: payloadScenes,
        aspectRatio: projectConfig.aspectRatio,
        musicUrl: projectConfig.isMusicEnabled ? projectConfig.musicTrack : undefined,
        musicVolume: projectConfig.musicVolume
      };`;

const replacementStr = `      let finalMusicUrl = projectConfig.isMusicEnabled ? projectConfig.musicTrack : undefined;
      if (finalMusicUrl && (finalMusicUrl.startsWith('http') || finalMusicUrl.startsWith('blob:'))) {
        try {
          const blobRes = await fetch(finalMusicUrl);
          const blobData = await blobRes.blob();
          const reader = new FileReader();
          finalMusicUrl = await new Promise((resolve) => {
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blobData);
          });
        } catch(e) {
          console.warn("Failed to convert music to base64", e);
        }
      }

      const payload = {
        scenes: payloadScenes,
        aspectRatio: projectConfig.aspectRatio,
        musicUrl: finalMusicUrl,
        musicVolume: projectConfig.musicVolume
      };`;

code = code.replace(targetStr, replacementStr);
fs.writeFileSync('src/components/RenderModal.tsx', code);
