const { execSync } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
try {
  execSync(`"${ffmpegStatic}" -f lavfi -i color=c=red:s=1280x720 -t 1 -vf "scale=1280:720,drawtext=text='hello':fontsize=50:fontcolor=white" -y test.mp4`, {stdio: 'pipe'});
  console.log("Success");
} catch (e) {
  console.error(e.stderr.toString());
}
