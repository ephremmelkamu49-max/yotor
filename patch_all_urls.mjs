import fs from 'fs';
let code = fs.readFileSync('src/components/RenderModal.tsx', 'utf-8');

const targetStr = `        let finalVideoUrl = scene.videoUrl || "";
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
        }`;

const replacementStr = `        let finalVideoUrl = scene.videoUrl || "";
        if (finalVideoUrl.startsWith('http') || finalVideoUrl.startsWith('blob:')) {
          try {
            const fetchUrl = finalVideoUrl.startsWith('/') ? finalVideoUrl : finalVideoUrl.replace("images.pexels.com/video-files/", "videos.pexels.com/video-files/");
            const blobRes = await fetch(fetchUrl);
            const blobData = await blobRes.blob();
            const reader = new FileReader();
            finalVideoUrl = await new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result);
              reader.readAsDataURL(blobData);
            });
          } catch(e) {
            console.warn("Failed to convert video to base64", e);
          }
        }`;

code = code.replace(targetStr, replacementStr);
fs.writeFileSync('src/components/RenderModal.tsx', code);
