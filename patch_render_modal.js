import fs from 'fs';

const filePath = 'src/components/RenderModal.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const videoRegex = /<video\s+key=\{renderedBlobUrl \|\| 'empty'\}\s+src=\{renderedBlobUrl \|\| undefined\}\s+controls\s+playsInline\s+preload="metadata"\s+className="w-full h-auto max-h-\[190px\] rounded-xl object-contain mx-auto shadow-xl"\s+\/>/gm;

const videoReplacement = `<video
                key={renderedBlobUrl || 'empty'}
                src={renderedBlobUrl || undefined}
                controls
                playsInline
                preload="auto"
                style={{ transform: 'translateZ(0)', willChange: 'transform, opacity', WebkitFontSmoothing: 'antialiased' }}
                className="w-full h-auto max-h-[190px] rounded-xl object-contain mx-auto shadow-xl"
              />`;

if(content.match(videoRegex)) {
  content = content.replace(videoRegex, videoReplacement);
  console.log("Matched videoRegex in RenderModal");
} else {
  console.log("Failed to match videoRegex in RenderModal");
}

fs.writeFileSync(filePath, content);
