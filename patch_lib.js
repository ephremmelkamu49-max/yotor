import fs from 'fs';
const file = 'src/components/ProjectLibrary.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<video\s*src=\{firstSceneThumb \|\| undefined\}\s*className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"\s*\/>/g;
const replacement = `<video
                            src={firstSceneThumb || undefined}
                            muted
                            playsInline
                            preload="metadata"
                            style={{ transform: 'translateZ(0)', willChange: 'transform' }}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                          />`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
