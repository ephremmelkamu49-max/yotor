import fs from 'fs';
const file = 'src/components/Timeline.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /style=\{\{ transform: 'translateZ\(0\)', willChange: 'transform, opacity', WebkitFontSmoothing: 'antialiased' \}\}/g;
content = content.replace(regex, '');
fs.writeFileSync(file, content);
