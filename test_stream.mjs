import fs from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

async function run() {
  const res = await fetch("https://www.google.com");
  console.log("Body exists:", !!res.body);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream("test_google.html"));
  console.log("Size:", fs.statSync("test_google.html").size);
}
run();
