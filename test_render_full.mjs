import fetch from "node-fetch";
const req = {
  scenes: [
    {
      id: "1",
      videoUrl: "https://videos.pexels.com/video-files/856356/856356-sd_640_360_30fps.mp4",
      duration: 3
    }
  ],
  aspectRatio: "16:9"
};
async function run() {
  console.log("Starting render...");
  const res = await fetch("http://127.0.0.1:3000/api/render-ffmpeg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req)
  });
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Text:", text);
}
run();
