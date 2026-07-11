import fs from 'fs';
let code = fs.readFileSync('src/components/RenderModal.tsx', 'utf-8');

// Inside initiateCloudRender, we used scenesToRender. We should use `scenes` (which is a prop).
code = code.replace(/for \(const scene of scenesToRender\) \{/g, 'for (const scene of scenes) {');
code = code.replace(/const totalDur = scenesToRender\.reduce/g, 'const totalDur = scenes.reduce');
code = code.replace(/scenesProcessed: scenesToRender\.length/g, 'scenesProcessed: scenes.length');

fs.writeFileSync('src/components/RenderModal.tsx', code);
