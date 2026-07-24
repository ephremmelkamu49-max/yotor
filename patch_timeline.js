import fs from 'fs';

const filePath = 'src/components/Timeline.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Patch 1: Audio upload
const audioRegex = /const url = URL\.createObjectURL\(file\);\s*onUpdateScene\(scene\.id, \{ voiceoverUrl: url \}\);/g;
const audioReplacement = `if (scene.voiceoverUrl && scene.voiceoverUrl.startsWith('blob:')) {
                                URL.revokeObjectURL(scene.voiceoverUrl);
                              }
                              const url = URL.createObjectURL(file);
                              onUpdateScene(scene.id, { voiceoverUrl: url });`;

content = content.replace(audioRegex, audioReplacement);

// Patch 2: Video upload
const videoRegex = /const url = URL\.createObjectURL\(file\);\s*onUpdateScene\(searchSceneId, \{\s*videoUrl: url,\s*videoThumb: url, \/\/ Not a perfect thumb, but works as placeholder\s*videoAuthor: "Local Upload"\s*\}\);/g;
const videoReplacement = `const targetScene = scenes.find(s => s.id === searchSceneId);
                      if (targetScene && targetScene.videoUrl && targetScene.videoUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(targetScene.videoUrl);
                      }
                      const url = URL.createObjectURL(file);
                      onUpdateScene(searchSceneId, {
                        videoUrl: url,
                        videoThumb: url, // Not a perfect thumb, but works as placeholder
                        videoAuthor: "Local Upload"
                      });`;

content = content.replace(videoRegex, videoReplacement);

fs.writeFileSync(filePath, content);
