import fs from 'fs';
let code = fs.readFileSync('src/components/RenderModal.tsx', 'utf-8');

// remove the extra try {
code = code.replace(/let response;\n      try \{\n        response = await fetch/g, 'const response = await fetch');

// restore the closing bracket
code = code.replace(/      \}\n      clearInterval\(progressInterval\);/g, `
      clearInterval(progressInterval);`);

fs.writeFileSync('src/components/RenderModal.tsx', code);
