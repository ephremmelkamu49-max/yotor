import express from "express";
import fetch from "node-fetch";
const app = express();
app.get("/api/download", (req, res) => {
  res.sendFile(process.cwd() + "/package.json");
});
app.listen(3002, async () => {
  const res = await fetch("http://127.0.0.1:3002/api/download");
  const blob = await res.blob();
  console.log("Blob size:", blob.size);
  process.exit(0);
});
