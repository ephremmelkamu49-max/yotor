import { execSync } from "child_process";
import fs from "fs";
try {
  execSync('/app/applet/node_modules/@ffmpeg-installer/linux-x64/ffmpeg -loglevel error -y -f lavfi -i color=c=black:s=1280x720:r=30 -t 0 -c:v libx264 out0.mp4');
  console.log("Size:", fs.statSync("out0.mp4").size);
} catch (e) {
  console.error("Error", e.message);
}
