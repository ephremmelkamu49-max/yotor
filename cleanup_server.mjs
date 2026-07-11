import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf-8');
code = code.replace(/const renderJobs = new Map<string[\s\S]*?\/\/ 2\. TTS Proxy API/g, '// 2. TTS Proxy API');
fs.writeFileSync('server.ts', code);
