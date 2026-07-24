import fs from 'fs';

const filePath = 'src/components/VideoCanvas.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add canplaythrough to the video element in VideoCanvas
const videoRegex = /<video\s+id={`video-scene-\$\{s\.id\}`}\s+ref=\{\(el\) => \{\s+videoRefs\.current\[s\.id\] = el;\s+\}\}\s+\{\.\.\.srcProps\}\s+loop\s+muted=\{isMuted \|\| !projectConfig\.isVideoSoundEnabled\}\s+playsInline\s+crossOrigin="anonymous"\s+className="pointer-events-none absolute -z-50 w-64 h-36 object-cover opacity-\[0\.002\]"\s+preload="auto"/gm;

const videoReplacement = `<video
                id={\`video-scene-\${s.id}\`}
                ref={(el) => {
                  videoRefs.current[s.id] = el;
                }}
                {...srcProps}
                loop
                muted={isMuted || !projectConfig.isVideoSoundEnabled}
                playsInline
                crossOrigin="anonymous"
                className="pointer-events-none absolute -z-50 w-64 h-36 object-cover opacity-[0.002]"
                style={{ transform: 'translateZ(0)', willChange: 'transform, opacity', WebkitFontSmoothing: 'antialiased', objectFit: 'cover' }}
                preload="auto"
                onCanPlayThrough={() => {
                  if (idx === playbackIndex) {
                    setIsBuffering(false);
                  }
                }}`;

if(content.match(videoRegex)) {
  content = content.replace(videoRegex, videoReplacement);
  console.log("Matched videoRegex");
} else {
  console.log("Failed to match videoRegex");
}

fs.writeFileSync(filePath, content);
