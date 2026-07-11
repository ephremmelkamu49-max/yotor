import { renderVideo } from "./server/ffmpegRenderer.ts";
async function run() {
  const req = {
    scenes: [
      {
        id: "1",
        videoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        duration: 1
      }
    ],
    aspectRatio: "16:9"
  };
  try {
    const outPath = await renderVideo(req);
    console.log("Success! outPath:", outPath);
    import('fs').then(fs => {
      console.log("Size:", fs.statSync(outPath).size);
    });
  } catch(e) {
    console.error(e);
  }
}
run();
