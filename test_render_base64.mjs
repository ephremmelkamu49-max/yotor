import fetch from "node-fetch";
const req = {
  scenes: [
    {
      id: "1",
      videoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
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
  const blob = await res.blob();
  console.log("Blob size:", blob.size);
  if (!res.ok) console.log(await blob.text());
}
run();
