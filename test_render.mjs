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
  const data = await res.json();
  const jobId = data.jobId;
  console.log("Job ID:", jobId);
  
  while (true) {
    const s = await fetch("http://127.0.0.1:3000/api/render-status?jobId=" + jobId).then(r => r.json());
    console.log("Status:", s.status);
    if (s.status === "done") {
      const head = await fetch("http://127.0.0.1:3000/api/render-download?jobId=" + jobId, { method: "HEAD" });
      console.log("Content-Length:", head.headers.get("content-length"));
      break;
    }
    if (s.status === "error") {
      console.log("Error:", s.error);
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}
run();
