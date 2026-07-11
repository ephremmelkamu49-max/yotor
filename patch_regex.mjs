import fs from 'fs';
let code = fs.readFileSync('server/ffmpegRenderer.ts', 'utf-8');
code = code.replace(/url\.match\(\/\^data:\(\[A-Za-z-\+\\\/\]\+\);base64,\(\.\+\)\$\/\)/, 'url.match(/^data:([A-Za-z0-9-+\\/.]+);(?:[\\w=]+;)*base64,(.+)$/)');
fs.writeFileSync('server/ffmpegRenderer.ts', code);
