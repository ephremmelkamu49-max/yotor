import fs from 'fs';
const file = 'src/components/Timeline.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<video\s*ref=\{videoRef\}\s*src=\{videoUrl\}\s*loop\s*muted\s*autoPlay\s*playsInline\s*className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 animate-fadeIn"\s*\/>/g;
const replacement = `<video
          ref={videoRef}
          src={videoUrl}
          loop
          muted
          autoPlay
          playsInline
          preload="auto"
          style={{ transform: 'translateZ(0)', willChange: 'transform, opacity', WebkitFontSmoothing: 'antialiased' }}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 animate-fadeIn"
        />`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
