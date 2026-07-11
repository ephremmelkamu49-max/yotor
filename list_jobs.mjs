import fs from 'fs';
const serverStr = fs.readFileSync('server.ts', 'utf-8');
const mod = serverStr.replace('app.get("/api/render-status"', 'app.get("/api/render-jobs", (req, res) => { res.json(Array.from(renderJobs.entries())); });\napp.get("/api/render-status"');
fs.writeFileSync('server.ts', mod);
