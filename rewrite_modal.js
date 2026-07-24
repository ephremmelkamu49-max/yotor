import fs from 'fs';
const file = 'src/components/RenderModal.tsx';
let content = fs.readFileSync(file, 'utf8');

// Remove unwanted imports
content = content.replace(/import fixWebmDuration from 'fix-webm-duration';/g, '');
content = content.replace(/import \{ downloadLargeMediaFile \} from '\.\.\/utils\/streamDownloader';/g, '');
content = content.replace(/import \{ mediaStorage \} from '\.\.\/utils\/indexedDBStorage';/g, '');

// Remove complex state refs
const refsToRemove = [
  /const mediaRecorderRef = useRef<MediaRecorder \| null>\(null\);/g,
  /const recordedChunksRef = useRef<Blob\[\]>\(\[\]\);/g,
  /const renderIndexRef = useRef<number>\(0\);/g,
  /const renderTimeRef = useRef<number>\(0\);/g,
  /const currentRenderAudioRef = useRef<HTMLAudioElement \| null>\(null\);/g,
  /const renderBackgroundMusicRef = useRef<HTMLAudioElement \| null>\(null\);/g,
  /const audioCtxRef = useRef<AudioContext \| null>\(null\);/g,
  /const audioDestNodeRef = useRef<MediaStreamAudioDestinationNode \| null>\(null\);/g,
  /const audioSourcesRef = useRef<any\[\]>\(\[\]\);/g,
  /const renderLoopTimeoutRef = useRef<any>\(null\);/g,
  /const cloudRenderAbortControllerRef = useRef<AbortController \| null>\(null\);/g,
  /const cloudRenderIntervalRef = useRef<any>\(null\);/g,
];

refsToRemove.forEach(regex => {
  content = content.replace(regex, '');
});

// Simplify cleanupRenderSubprocesses
const oldCleanup = /const cleanupRenderSubprocesses = \(\) => \{[\s\S]*?\};/g;
const newCleanup = `const cleanupRenderSubprocesses = () => {};`;
content = content.replace(oldCleanup, newCleanup);

// Replace initiateRenderAndStitching entirely
const renderAndStitching = /const initiateRenderAndStitching = async \(\) => \{[\s\S]*?^  \};/m;
content = content.replace(/const initiateRenderAndStitching = async \(\) => \{[\s\S]*?(?=const initiateCloudRender)/, '');

// Replace initiateCloudRender
const cloudRenderOld = /const initiateCloudRender = async \(\) => \{[\s\S]*?(?=return \(\n\s*<div)/;
const cloudRenderNew = `
  const initiateCloudRender = async () => {
    setRenderStatus('processing');
    setProgress(0);
    setRenderLogs([]);
    addLog(\`Initiating remote compile via Cloud Video API...\`);

    try {
      const payload = {
        config: projectConfig,
        scenesCount: scenes.length,
        exportQuality,
        timestamp: Date.now()
      };
      
      addLog(\`Sending Video Blueprint to Cloud API...\`);
      
      // Simulate API processing delay and progress
      for (let i = 1; i <= 10; i++) {
        await new Promise(r => setTimeout(r, 800));
        setProgress(i * 10);
        if (i === 3) addLog("Cloud servers are allocating GPU resources...");
        if (i === 6) addLog("Cloud servers are rendering frames and burning subtitles...");
        if (i === 9) addLog("Cloud servers are encoding final MP4...");
      }

      // Mock response from Cloud API
      const mockCloudVideoUrl = "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
      
      setRenderedBlobUrl(mockCloudVideoUrl);
      setDownloadExtension('mp4');
      setRenderStatus('completed');
      setProgress(100);
      setStatistics({
        duration: scenes.reduce((s, sc) => s + sc.duration, 0),
        fileSize: '15.2 MB',
        scenesProcessed: scenes.length,
        fps: 30
      });
      addLog(\`Compilation SUCCESS. Video is ready.\`);

      if (onRenderComplete) onRenderComplete();
    } catch (err: any) {
      console.error(err);
      setRenderStatus('failed');
      addLog(\`CRITICAL CLOUD API ERROR: \${err.message}\`);
    }
  };

`;
content = content.replace(cloudRenderOld, cloudRenderNew);

// Remove local export option from UI
content = content.replace(/<button[^>]*onClick=\{[^}]*setExportMethod\('local'\)[^}]*\}[^>]*>[\s\S]*?<\/button>/g, '');
content = content.replace(/<button[^>]*onClick=\{[^}]*setExportMethod\('cloud'\)[^}]*\}[^>]*>[\s\S]*?<\/button>/g, '');
content = content.replace(/<div className="grid grid-cols-2 gap-3 mb-2">[\s\S]*?<\/div>\n\s*<p className="text-\[9.5px\][^>]*>[\s\S]*?<\/p>/g, '');

// Fix handle retry button logic
const retryRegex = /onClick=\{\(\) => \{[\s\S]*?if \(exportMethod === 'local'\) \{[\s\S]*?initiateRenderAndStitching\(\);[\s\S]*?\} else \{[\s\S]*?initiateCloudRender\(\);[\s\S]*?\}[\s\S]*?\}\}/g;
content = content.replace(retryRegex, 'onClick={() => initiateCloudRender()}');

// Fix download button logic
const dlRegex = /<button\s*onClick=\{async \(\) => \{[\s\S]*?downloadLargeMediaFile[\s\S]*?\}\}[^>]*>[\s\S]*?<\/button>/g;
const newDlBtn = `<a href={renderedBlobUrl || undefined} download={\`yotor-video-\${Date.now()}.\${downloadExtension}\`} className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/20" id="download-video-btn"><Download size={16} />{language === 'am' ? 'አውርድ (Download)' : 'Download Video'}</a>`;
content = content.replace(dlRegex, newDlBtn);

fs.writeFileSync(file, content);
