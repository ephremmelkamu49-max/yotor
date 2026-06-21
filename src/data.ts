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
  category?: 'Short' | 'Long' | 'All';
  am?: string;
}

// Pre-curated highly aesthetic cinematic stock clips
export const DEFAULT_CATALOG: CatalogVideo[] = [
  {
    id: "cosmic_stars",
    category: "Space & Cosmos",
    title: "Deep Space Stars Travel",
    url: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4?id=cosmic_stars",
    thumbnail: "https://images.pexels.com/photos/956999/milky-way-starry-sky-night-sky-star-956999.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "SampleLib Space"
  },
  {
    id: "cosmic_galaxy",
    category: "Space & Cosmos",
    title: "Vibrant Nebula Movement",
    url: "https://samplelib.com/lib/preview/mp4/sample-10s.mp4?id=cosmic_galaxy",
    thumbnail: "https://images.pexels.com/photos/2030114/pexels-photo-2030114.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "SampleLib Nebula"
  },
  {
    id: "nature_forest",
    category: "Nature & Rivers",
    title: "Slow Motion Misty Mountain Peak",
    url: "https://www.w3schools.com/html/movie.mp4?id=nature_forest",
    thumbnail: "https://images.pexels.com/photos/9754/mountains-clouds-forest-fog.jpg?auto=compress&cs=tinysrgb&w=300",
    author: "W3Schools Mountain"
  },
  {
    id: "nature_waves",
    category: "Nature & Rivers",
    title: "Epic Ocean Cliff Drone Shot",
    url: "https://www.w3schools.com/html/mov_bbb.mp4?id=nature_waves",
    thumbnail: "https://images.pexels.com/photos/1001682/pexels-photo-1001682.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "W3Schools Ocean"
  },
  {
    id: "tech_cyber",
    category: "Technology & Code",
    title: "Blazing Neon Cyberpunk Grid",
    url: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4?id=tech_cyber",
    thumbnail: "https://images.pexels.com/photos/1089438/pexels-photo-1089438.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "SampleLib Cyber"
  },
  {
    id: "tech_coding",
    category: "Technology & Code",
    title: "Cozy Coding Dark Keyboard Glow",
    url: "https://samplelib.com/lib/preview/mp4/sample-10s.mp4?id=tech_coding",
    thumbnail: "https://images.pexels.com/photos/2047905/pexels-photo-2047905.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "SampleLib Coding"
  },
  {
    id: "urban_skyline",
    category: "City & Architecture",
    title: "Drone Sunset Shanghai Hyperlapse",
    url: "https://www.w3schools.com/html/movie.mp4?id=urban_skyline",
    thumbnail: "https://images.pexels.com/photos/169647/pexels-photo-169647.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "W3Schools Skyline"
  },
  {
    id: "urban_rain",
    category: "City & Architecture",
    title: "Moody Rain Puddle Neon Lights",
    url: "https://www.w3schools.com/html/mov_bbb.mp4?id=urban_rain",
    thumbnail: "https://images.pexels.com/photos/1108572/pexels-photo-1108572.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "W3Schools Rain"
  },
  {
    id: "abstract_mesh",
    category: "Abstract & Morphing",
    title: "Floating Golden Particle Sphere",
    url: "https://samplelib.com/lib/preview/mp4/sample-5s.mp4?id=abstract_mesh",
    thumbnail: "https://images.pexels.com/photos/220067/pexels-photo-220067.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "SampleLib Abstract"
  },
  {
    id: "abstract_gradient",
    category: "Abstract & Morphing",
    title: "Slow Morphing Hologram Silk",
    url: "https://samplelib.com/lib/preview/mp4/sample-10s.mp4?id=abstract_gradient",
    thumbnail: "https://images.pexels.com/photos/310452/pexels-photo-310452.jpeg?auto=compress&cs=tinysrgb&w=300",
    author: "SampleLib Hologram"
  }
];

// Rich, high-quality audio loops for background theme music
export const DEFAULT_MUSIC: AudioTrack[] = [
  {
    id: "silent",
    title: "No Background Music (Voiceover Only)",
    vibe: "Silent",
    url: "",
    am: "ሙዚቃ አያስፈልግም"
  },
  {
    id: "ethio_jazz_vibe",
    title: "Ethio-Jazz Night (Ambient)",
    vibe: "Smooth & Cultural",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    category: "Long",
    am: "የኢትዮ-ጃዝ ድባብ"
  },
  {
    id: "habesha_modern_upbeat",
    title: "Modern Habesha Pop (Trending)",
    vibe: "Energetic & Modern",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    category: "Short",
    am: "ዘመናዊ የሀበሻ ዜማ"
  },
  {
    id: "traditional_masinko",
    title: "Masinko Soul (Ancient Strings)",
    vibe: "Traditional & Emotional",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    category: "Long",
    am: "የማሲንቆ ቃና"
  },
  {
    id: "lofi_chill_amharic",
    title: "Lofi Addis (Study & Relax)",
    vibe: "Relaxed & Lo-Fi",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    category: "Short",
    am: "አዲስ ሎፋይ"
  },
  {
    id: "cinematic_heroic",
    title: "Heroic Destiny (Cinematic)",
    vibe: "Epic & Uplifting",
    url: "/api/music?id=uplifting_cinematic",
    category: "Long",
    am: "ጀግንነት (ሲኒማቲክ)"
  },
  {
    id: "tech_cyberpunk_v2",
    title: "Digital Addis (Cyberpunk)",
    vibe: "Futuristic & Tech",
    url: "/api/music?id=tech_cyberpunk",
    category: "Short",
    am: "ዲጂታል አዲስ (ሳይበርፐንክ)"
  }
];

export const VIDEO_TEMPLATES = [
  { 
    id: 'trending-shorts', 
    name: 'Trending Daily News (Shorts)', 
    am: 'ወቅታዊ ዜና (አጭር)', 
    prompt: 'In todays top story, the city is buzzing with excitement over the new technology expo. Experts are calling it a game changer for the region. Watch until the end to see the most impressive innovation.'
  },
  { 
    id: 'documentary-long', 
    name: 'Historical Documentary (Long)', 
    am: 'ታሪካዊ ዘጋቢ ፊልም (ረጅም)', 
    prompt: 'The Aksumite Empire was one of the most powerful states of the ancient world. Known for its towering stelae and sophisticated trade routes, it remains a testament to early African civilization. Join us as we explore the hidden secrets of Aksum.'
  },
  { 
    id: 'motivational-tiktok', 
    name: 'Motivational Life Wisdom', 
    am: 'አነቃቂ የህይወት ምክር', 
    prompt: 'Strength does not come from winning. Your struggles develop your strengths. When you go through hardships and decide not to surrender, that is strength.'
  }
];

export const GOOGLE_TTS_LANGUAGES = [
  { code: "am-yotor-epic-male", name: "ይቶር (Yotor) - አነቃቂ የተረካ ድምፅ ወንድ (Inspiring Narrator)" },
  { code: "am-yotor-warm-female", name: "እሌኒ (Eleni) - ማራኪ የተረካ ድምፅ (Warm Female Narrator)" },
  { code: "am-yotor-bright-female", name: "ሳራ (Sara) - አጫጭር ቪዲዮዎች ደስደስ የሚል ድምፅ (Bright Shorts Female)" },
  { code: "am-yotor-rugged-male", name: "አቤል (Abel) - ለረጅም ቪዲዮዎች ጎርናና ድምፅ (Deep Rugged Male)" },
  { code: "am-male", name: "Amharic (Ethiopia) male - መደበኛ (Google Standard)" },
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

export const VISUAL_STYLES = [
  { id: 'realistic', name: 'Realistic / Cinematic', am: 'እውነተኛ / ሲኒማቲክ' },
  { id: '3d-animation', name: '3D Pixar Animation', am: '3D አኒሜሽን (Pixar)' },
  { id: '2d-animation', name: '2D Hand Drawn', am: '2D በእጅ የተሳለ' },
  { id: 'anime', name: 'Anime Style', am: 'አኒሜ (Anime)' },
  { id: 'cyberpunk', name: 'Cyberpunk / Tech', am: 'ሳይበርፐንክ / ቴክኖሎጂ' },
  { id: 'watercolor', name: 'Watercolor Art', am: 'የውሃ ቀለም ስዕል' }
];


