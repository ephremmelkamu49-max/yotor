import { EdgeTTS } from "edge-tts-universal";
async function test() {
  try {
    const tts = new EdgeTTS("ሰላም ይሄ ሙከራ ነው።", "am-ET-AmehaNeural");
    await tts.synthesize();
    console.log("Edge TTS Success");
  } catch(e) {
    console.error("Edge TTS Failed:", e);
  }
}
test();
