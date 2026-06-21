export interface CatalogVideo {
  id: string;
  category: string;
  title: string;
  url: string;
  thumbnail: string;
  author: string;
}

export interface AudioTrack {
  id: string;
  title: string;
  vibe: string;
  url: string;
}

// Pre-curated highly aesthetic cinematic stock clips
export const DEFAULT_CATALOG: CatalogVideo[] = [
  {
    id: "cosmic_stars",
    category: "Space & Cosmos",
    title: "Deep Space Stars Travel",
    url: "https://player.vimeo.com/external/371433846.sd.mp4?s=231265db68ec5d166723223122c366ff401ee0bd&profile_id=139&oauth2_token_id=57447761",
    thumbnail: "https://images.pexels.com/photos/956999/milky-way-starry-sky-night-sky-star-956999.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "Pexels Space"
  },
  {
    id: "cosmic_galaxy",
    category: "Space & Cosmos",
    title: "Vibrant Nebula Movement",
    url: "https://player.vimeo.com/external/510850877.sd.mp4?s=d45ca6da129f12d8a0c5cff1fc98cf0c6f1ec2f0&profile_id=164&oauth2_token_id=57447761",
    thumbnail: "https://images.pexels.com/photos/2030114/pexels-photo-2030114.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "Pexels Nebula"
  },
  {
    id: "nature_forest",
    category: "Nature & Rivers",
    title: "Slow Motion Misty Mountain Peak",
    url: "https://player.vimeo.com/external/434045526.sd.mp4?s=c1b0faa593b4a0e33f01907de3be4a1bc0cfcfbb&profile_id=165&oauth2_token_id=57447761",
    thumbnail: "https://images.pexels.com/photos/9754/mountains-clouds-forest-fog.jpg?auto=compress&cs=tinysrgb&w=300",
    author: "KoolShooters"
  },
  {
    id: "nature_waves",
    category: "Nature & Rivers",
    title: "Epic Ocean Cliff Drone Shot",
    url: "https://player.vimeo.com/external/384761655.sd.mp4?s=382e6ef3e21c32b90b8fbe2a099a5e4d2919409f&profile_id=165&oauth2_token_id=57447761",
    thumbnail: "https://images.pexels.com/photos/1001682/pexels-photo-1001682.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "Kelly Lacy"
  },
  {
    id: "tech_cyber",
    category: "Technology & Code",
    title: "Blazing Neon Cyberpunk Grid",
    url: "https://player.vimeo.com/external/538571057.sd.mp4?s=ebd9b8e97491cf3545fa05c2e35a0ceea4e840a1&profile_id=164&oauth2_token_id=57447761",
    thumbnail: "https://images.pexels.com/photos/1089438/pexels-photo-1089438.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "Gamaliel"
  },
  {
    id: "tech_coding",
    category: "Technology & Code",
    title: "Cozy Coding Dark Keyboard Glow",
    url: "https://player.vimeo.com/external/371434947.sd.mp4?s=0e2df401df498a3cbb3041cfa9767ea9aa496660&profile_id=139&oauth2_token_id=57447761",
    thumbnail: "https://images.pexels.com/photos/2047905/pexels-photo-2047905.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "Pexels Dev"
  },
  {
    id: "urban_skyline",
    category: "City & Architecture",
    title: "Drone Sunset Shanghai Hyperlapse",
    url: "https://player.vimeo.com/external/409217036.sd.mp4?s=98e59048f07cc081b95f2fc4587c6b757e2bbd87&profile_id=165&oauth2_token_id=57447761",
    thumbnail: "https://images.pexels.com/photos/169647/pexels-photo-169647.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "Pexels City"
  },
  {
    id: "urban_rain",
    category: "City & Architecture",
    title: "Moody Rain Puddle Neon Lights",
    url: "https://player.vimeo.com/external/494191090.sd.mp4?s=d9472bf6d1e44ef050ccba85669b3658532f11f4&profile_id=165&oauth2_token_id=57447761",
    thumbnail: "https://images.pexels.com/photos/1108572/pexels-photo-1108572.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "Pexels Rain"
  },
  {
    id: "abstract_mesh",
    category: "Abstract & Morphing",
    title: "Floating Golden Particle Sphere",
    url: "https://player.vimeo.com/external/482688970.sd.mp4?s=bf3276cdac9715502c3fc39f28ecb2f7223e75e9&profile_id=165&oauth2_token_id=57447761",
    thumbnail: "https://images.pexels.com/photos/220067/pexels-photo-220067.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "Abstract Art"
  },
  {
    id: "abstract_gradient",
    category: "Abstract & Morphing",
    title: "Slow Morphing Hologram Silk",
    url: "https://player.vimeo.com/external/554868770.sd.mp4?s=07e78be32e185c07ee94afb6ec7104b2b0ffb4f1&profile_id=164&oauth2_token_id=57447761",
    thumbnail: "https://images.pexels.com/photos/310452/pexels-photo-310452.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "Motion Magic"
  }
];

// Rich, high-quality audio loops for background theme music (Mixkit free loops)
export const DEFAULT_MUSIC: AudioTrack[] = [
  {
    id: "silent",
    title: "No Background Music (Voiceover Only)",
    vibe: "Silent",
    url: ""
  },
  {
    id: "ambient_mindful",
    title: "Sunset Serenade (Mindful Harp & Pad)",
    vibe: "Meditative & Warm",
    url: "https://assets.mixkit.co/music/preview/mixkit-forest-flute-and-harp-1111.mp3"
  },
  {
    id: "tech_cyberpunk",
    title: "Cyberpunk Runner (Tech House Vibes)",
    vibe: "Tech-Forward & Monotonous",
    url: "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3"
  },
  {
    id: "dreamy_cosmos",
    title: "Astral Dream (Stellar Ambient Synth)",
    vibe: "Futuristic & Deep",
    url: "https://assets.mixkit.co/music/preview/mixkit-ambient-dream-116.mp3"
  },
  {
    id: "uplifting_cinematic",
    title: "Culture Echoes (Corporate Cinematic)",
    vibe: "Inspiring & Modern",
    url: "https://assets.mixkit.co/music/preview/mixkit-corporate-culture-1510.mp3"
  },
  {
    id: "lofi_chill",
    title: "Chill Cafe (Lofi Sun & Sky)",
    vibe: "Relaxed & Vintage",
    url: "https://assets.mixkit.co/music/preview/mixkit-sun-and-sky-577.mp3"
  }
];

export const GOOGLE_TTS_LANGUAGES = [
  { code: "am-yotor-epic-male", name: "ይቶር (Yotor) - አነቃቂ የተረካ ድምፅ ወንድ (Inspiring Narrator)" },
  { code: "am-yotor-warm-female", name: "እሌኒ (Eleni) - ማራኪ የተረካ ድምፅ (Warm Female Narrator)" },
  { code: "am-yotor-bright-female", name: "ሳራ (Sara) - አጫጭር ቪዲዮዎች ደስደስ የሚል ድምፅ (Bright Shorts Female)" },
  { code: "am-yotor-rugged-male", name: "አቤል (Abel) - ለረጅም ቪዲዮዎች ጎርናና ድምፅ (Deep Rugged Male)" },
  { code: "am", name: "Amharic (Ethiopia) Female - መደበኛ (Google Standard)" },
  { code: "en", name: "English (US) - Neutral" },
  { code: "en-gb", name: "English (UK) - British Accent" },
  { code: "en-in", name: "English (India) - India Accent" },
  { code: "es", name: "Spanish - Español" },
  { code: "fr", name: "French - Français" },
  { code: "de", name: "German - Deutsch" },
  { code: "it", name: "Italian - Italiano" },
  { code: "hi", name: "Hindi - हिन्दी" },
  { code: "ja", name: "Japanese - 日本語" },
  { code: "pt", name: "Portuguese - Português" }
];
