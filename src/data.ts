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
    vibe: "No Music",
    url: "",
    am: "ሙዚቃ አያስፈልግም"
  },
  {
    id: "lofi_chill",
    title: "Lofi Chill Beats (Facts/Stories)",
    vibe: "Relaxed & Lo-Fi",
    url: "/api/music?id=lofi_addis",
    category: "Short",
    am: "አዲስ ሎፋይ"
  },
  {
    id: "epic_motivation",
    title: "Epic Motivation (Trending)",
    vibe: "Energetic & Modern",
    url: "/api/music?id=habesha_modern_upbeat",
    category: "Short",
    am: "ዘመናዊ የሀበሻ ዜማ"
  },
  {
    id: "suspense_dark",
    title: "Dark Suspense (Creepy/Mystery)",
    vibe: "Epic & Uplifting",
    url: "/api/music?id=uplifting_cinematic",
    category: "Long",
    am: "ጀግንነት (ሲኒማቲክ)"
  }
];

export const VIDEO_TEMPLATES = [
  { 
    id: 'trending-shorts', 
    name: 'Top 3 Mind-Blowing Facts', 
    am: 'Top 3 Mind-Blowing Facts', 
    prompt: 'Here are 3 mind-blowing facts that will leave you speechless! Number one, honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old! Number two, water can boil and freeze at the same time. And number three, bananas are berries, but strawberries aren\'t. Follow for more crazy facts!'
  },
  { 
    id: 'motivational-tiktok', 
    name: 'Morning Motivation', 
    am: 'Morning Motivation', 
    prompt: 'Strength doesn\'t come from winning. Your struggles develop your strengths. When you go through hardships and decide not to surrender, that is strength. Wake up every day and choose to be unstoppable.'
  },
  { 
    id: 'scary-story', 
    name: 'Creepy Story', 
    am: 'Creepy Story', 
    prompt: 'I was home alone when I heard a knock at the door. I looked through the peephole, but no one was there. Then, my phone buzzed with a text message from an unknown number: "I can see you through the peephole." My blood ran cold.'
  }
];

export const GOOGLE_TTS_LANGUAGES = [
  { code: "en", name: "English (US) - Neutral" },
  { code: "en-gb", name: "English (UK) - British Accent" },
  { code: "en-US-Standard-D", name: "English (US) - Deep Male" },
  { code: "en-US-Standard-F", name: "English (US) - Bright Female" },
  { code: "am-yotor-epic-male", name: "Amharic - Epic Male" },
  { code: "es", name: "Spanish - Español" },
  { code: "fr", name: "French - Français" }
];

export const VISUAL_STYLES = [
  { id: 'realistic', name: 'Realistic / Cinematic', am: 'እውነተኛ / ሲኒማቲክ' },
  { id: '3d-animation', name: '3D Pixar Animation', am: '3D አኒሜሽን (Pixar)' },
  { id: '2d-animation', name: '2D Hand Drawn', am: '2D በእጅ የተሳለ' },
  { id: 'anime', name: 'Anime Style', am: 'አኒሜ (Anime)' },
  { id: 'cyberpunk', name: 'Cyberpunk / Tech', am: 'ሳይበርፐንክ / ቴክኖሎጂ' },
  { id: 'watercolor', name: 'Watercolor Art', am: 'የውሃ ቀለም ስዕል' }
];


