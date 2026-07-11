import fs from 'fs';
let code = fs.readFileSync('src/components/RenderModal.tsx', 'utf-8');

const oldCode = `      const { jobId } = await response.json();
      
      addLog(\`Job \${jobId} registered. Polling for completion...\`);
      setProgress(40);
      
      let pollStatus = "processing";
      while (pollStatus === "processing") {
        await new Promise(r => setTimeout(r, 3000));
        const statusRes = await fetch(\`/api/render-status?jobId=\${jobId}\`);
        if (!statusRes.ok) {
           let errTxt = statusRes.statusText;
           try { const j = await statusRes.json(); if (j.error) errTxt = j.error; } catch(e){}
           throw new Error(\`Failed to check status: HTTP \${statusRes.status} \${errTxt}\`);
        }
        const statusData = await statusRes.json();
        if (statusData.status === "error") {
          throw new Error(statusData.error || "Unknown render error");
        }
        pollStatus = statusData.status;
        setProgress((p) => p < 90 ? p + Math.random() * 5 : p);
        addLog(\`Still baking...\`);
      }

      addLog("✅ [Cloud Render] Remote compilation complete! Fetching master metadata...");
      setProgress(95);
      let sizeInMb = "Unknown";
      try {
        const headRes = await fetch(\`/api/render-download?jobId=\${jobId}\`, { method: 'HEAD' });
        const contentLength = headRes.headers.get('content-length');
        if (contentLength) {
           sizeInMb = (parseInt(contentLength, 10) / (1024 * 1024)).toFixed(2);
        }
      } catch (e) {
        console.warn("Failed to get file size", e);
      }
      setRenderedBlobUrl(\`/api/render-download?jobId=\${jobId}\`);`;

const newCode = `      addLog("✅ [Cloud Render] Remote compilation complete! Downloading master video...");
      setProgress(95);

      const finalBlob = await response.blob();
      const finalUrl = URL.createObjectURL(finalBlob);
      setRenderedBlobUrl(finalUrl);
      
      const sizeInMb = (finalBlob.size / (1024 * 1024)).toFixed(2);`;

code = code.replace(oldCode, newCode);
fs.writeFileSync('src/components/RenderModal.tsx', code);
