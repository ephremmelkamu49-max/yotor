import { renderVideo } from "./server/ffmpegRenderer.ts";
async function run() {
  const req = {
    scenes: [],
    aspectRatio: "16:9"
  };
  try {
    const outPath = await renderVideo(req);
    console.log("Success! outPath:", outPath);
    import('fs').then(fs => {
      console.log("Size:", fs.statSync(outPath).size);
    });
  } catch(e) {
    console.error("Error:", e.message);
  }
}
run();
