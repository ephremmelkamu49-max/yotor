import { EdgeTTS } from "edge-tts-universal";

async function run() {
  try {
    const ObjectA = new EdgeTTS("ሰላም", "am-ET-AmehaNeural");
    const result = await ObjectA.synthesize();
    console.log("Success! Audio length: ", result);
  } catch(e) {
    console.error("Failed", e);
  }
}
run();
