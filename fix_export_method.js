import fs from 'fs';
const file = 'src/components/RenderModal.tsx';
let content = fs.readFileSync(file, 'utf8');

// Remove the state
content = content.replace(/const \[exportMethod, setExportMethod\] = useState<'local' \| 'cloud'>\('cloud'\);\n/g, '');

// Clean up retry button classname
content = content.replace(/exportMethod === 'local' \? 'bg-emerald-600 hover:bg-emerald-550' : 'bg-indigo-600 hover:bg-indigo-555'/g, "'bg-indigo-600 hover:bg-indigo-555'");

// Let's also check the retry button onClick
content = content.replace(/if \(exportMethod === 'local'\) \{\s*initiateRenderAndStitching\(\);\s*\} else \{\s*initiateCloudRender\(\);\s*\}/g, 'initiateCloudRender();');

fs.writeFileSync(file, content);
