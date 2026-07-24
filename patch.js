import fs from 'fs';
let content = fs.readFileSync('src/components/VideoCanvas.tsx', 'utf8');

const regex = /\{\/\* Beautiful Buffering Indicator Overlay \*\/\}(.|\n)*?Buffering Video \(Slow Connection\)\.\.\.\n\s*<\/p>\n\s*<\/div>\n\s*<\/div>\n\s*\)\}/gm;

content = content.replace(regex, '');
fs.writeFileSync('src/components/VideoCanvas.tsx', content);
