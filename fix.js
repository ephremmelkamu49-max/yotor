import fs from 'fs';
const lines = fs.readFileSync('src/components/RenderModal.tsx', 'utf8').split('\n');

const brokenIndex = lines.findIndex(l => l.includes('የፋይል መጠ'));
if (brokenIndex !== -1) {
    const pre = lines.slice(0, brokenIndex);
    const postIndex = lines.findIndex((l, i) => i > brokenIndex && l.includes('<div className="flex items-center gap-3">'));
    const post = lines.slice(postIndex);
    
    const replacement = `                  {language === 'am' ? 'የፋይል መጠን' : 'Estimated Size'}
                </span>
                <p className="text-zinc-200 font-mono font-bold text-sm">{statistics.fileSize}</p>
              </div>
              <div className="space-y-1">
                <span className="text-zinc-600 uppercase tracking-widest text-[8px] font-mono block">
                  {language === 'am' ? 'የተቀናበሩ ትዕይንቶች' : 'Scenes'}
                </span>
                <p className="text-zinc-200 font-mono font-bold text-sm">
                  {statistics.scenesProcessed} {language === 'am' ? 'ትዕይንቶች' : 'clips'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-zinc-600 uppercase tracking-widest text-[8px] font-mono block">
                  {language === 'am' ? 'የምስል ጥራት' : 'Resolution Target'}
                </span>
                <p className="text-zinc-250 font-mono font-bold text-xs uppercase">
                  {exportQuality === '4k' ? (
                    projectConfig.aspectRatio === '16:9' ? '3840x2160 (Cinema 4K)' : projectConfig.aspectRatio === '9:16' ? '2160x3840 (Shorts 4K)' : '2160x2160 (Square 4K)'
                  ) : exportQuality === '1080p' ? (
                    projectConfig.aspectRatio === '16:9' ? '1920x1080 (Full HD)' : projectConfig.aspectRatio === '9:16' ? '1080x1920 (Shorts)' : '1080x1080 (Square)'
                  ) : (
                    projectConfig.aspectRatio === '16:9' ? '1280x720 (Standard HD)' : projectConfig.aspectRatio === '9:16' ? '720x1280 (Shorts)' : '800x800 (Square)'
                  )}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5 font-sans">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                {language === 'am' ? 'ቀሪ የነጻ ቪዲዮ ማውረጃ ዕድል (Remaining Quota):' : 'Remaining Free Video Downloads:'}
              </span>
              <span className="font-mono font-bold text-indigo-400">
                {exportQuota} / 3 {language === 'am' ? 'ጊዜ' : 'times'}
              </span>
            </div>`.split('\n');

    fs.writeFileSync('src/components/RenderModal.tsx', [...pre, ...replacement, ...post].join('\n'));
    console.log('Fixed file.');
} else {
    console.log('Could not find broken line.');
}
