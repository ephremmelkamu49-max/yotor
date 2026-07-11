import fs from 'fs';
let code = fs.readFileSync('server/ffmpegRenderer.ts', 'utf-8');
code = code.replace(/if \(response\.body\) \{[\s\S]*?\} else \{[\s\S]*?\}/, `const buffer = await response.arrayBuffer();\n    await fs.writeFile(dest, Buffer.from(buffer));`);
fs.writeFileSync('server/ffmpegRenderer.ts', code);
