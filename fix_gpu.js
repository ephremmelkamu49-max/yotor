import fs from 'fs';
const file = 'src/components/VideoCanvas.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Remove style from hidden videos
const videoRegex = /style=\{\{ transform: 'translateZ\(0\)', willChange: 'transform, opacity', WebkitFontSmoothing: 'antialiased', objectFit: 'cover' \}\}/g;
content = content.replace(videoRegex, 'style={{ objectFit: "cover" }}');

// 2. Add GPU acceleration to the canvas
const canvasRegex = /id="rendering-canvas"\s*\/>/g;
const canvasReplacement = `id="rendering-canvas"
            style={{ transform: 'translateZ(0)', willChange: 'transform', WebkitFontSmoothing: 'antialiased' }}
          />`;
content = content.replace(canvasRegex, canvasReplacement);

fs.writeFileSync(file, content);
