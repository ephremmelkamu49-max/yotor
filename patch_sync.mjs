import fs from 'fs';
let serverStr = fs.readFileSync('server.ts', 'utf-8');

const oldPost = `app.post("/api/render-ffmpeg", express.json({ limit: '500mb' }), async (req, res) => {
  const jobId = Date.now().toString() + Math.random().toString(36).substring(7);
  renderJobs.set(jobId, { status: "processing" });
  
  // Start job in background
  (async () => {
    try {
      const payload = req.body as RenderRequest;
      console.log(\`Starting backend render job \${jobId}...\`);
      const outPath = await renderVideo(payload);
      console.log(\`Backend render job \${jobId} complete:\`, outPath);
      renderJobs.set(jobId, { status: "done", outPath });
    } catch (err: any) {
      console.error(\`FFmpeg render job \${jobId} failed:\`, err);
      renderJobs.set(jobId, { status: "error", error: err.message });
    }
  })();

  res.json({ jobId });
});`;

const newPost = `app.post("/api/render-ffmpeg", express.json({ limit: '500mb' }), async (req, res) => {
  try {
    const payload = req.body as RenderRequest;
    console.log(\`Starting synchronous backend render job...\`);
    const outPath = await renderVideo(payload);
    console.log(\`Backend render job complete:\`, outPath);
    
    // Instead of sending a JSON response, we stream the file directly
    res.sendFile(outPath, (err: any) => {
      if (err) {
        if (err.code === 'ECONNABORTED' || err.message?.includes('Request aborted')) {
          return;
        }
        console.error("Error sending rendered file:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "File not found or unreadable" });
        }
      }
    });
  } catch (err: any) {
    console.error(\`FFmpeg render job failed:\`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});`;

serverStr = serverStr.replace(oldPost, newPost);
fs.writeFileSync('server.ts', serverStr);
