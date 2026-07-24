import fs from 'fs';

const filePath = 'src/components/VideoCanvas.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /const url = URL\.createObjectURL\(file\);\s*onUpdateConfig\(\{ musicTrack: url \}\);/g;
const replacement = `if (projectConfig.musicTrack && projectConfig.musicTrack.startsWith('blob:')) {
                             URL.revokeObjectURL(projectConfig.musicTrack);
                           }
                           const url = URL.createObjectURL(file);
                           onUpdateConfig({ musicTrack: url });`;

content = content.replace(regex, replacement);
fs.writeFileSync(filePath, content);
