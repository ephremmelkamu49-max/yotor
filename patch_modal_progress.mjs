import fs from 'fs';
let code = fs.readFileSync('src/components/RenderModal.tsx', 'utf-8');

const fetchStart = `const response = await fetch("/api/render-ffmpeg", {`;

const fakeProgress = `      addLog("Starting backend compilation...");
      const progressInterval = setInterval(() => {
        setProgress((p) => p < 90 ? p + Math.random() * 5 : p);
        addLog("Still baking...");
      }, 3000);
      
      let response;
      try {
        response = await fetch("/api/render-ffmpeg", {`;

code = code.replace(fetchStart, fakeProgress);

const fetchEnd = `        throw new Error(errMsg || \`Cloud render failed: status \${response.status}\`);
      }`;

const clearInt = `        throw new Error(errMsg || \`Cloud render failed: status \${response.status}\`);
      }
      clearInterval(progressInterval);`;

code = code.replace(fetchEnd, clearInt);

const catchStart = `    } catch (err: any) {`;

const catchEnd = `    } catch (err: any) {
      if (typeof progressInterval !== 'undefined') clearInterval(progressInterval);`;

code = code.replace(catchStart, catchEnd);

fs.writeFileSync('src/components/RenderModal.tsx', code);
