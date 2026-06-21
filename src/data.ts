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
    url: "/api/music?id=ambient_mindful"
  },
  {
    id: "tech_cyberpunk",
    title: "Cyberpunk Runner (Tech House Vibes)",
    vibe: "Tech-Forward & Monotonous",
    url: "/api/music?id=tech_cyberpunk"
  },
  {
    id: "dreamy_cosmos",
    title: "Astral Dream (Stellar Ambient Synth)",
    vibe: "Futuristic & Deep",
    url: "/api/music?id=dreamy_cosmos"
  },
  {
    id: "uplifting_cinematic",
    title: "Culture Echoes (Corporate Cinematic)",
    vibe: "Inspiring & Modern",
    url: "/api/music?id=uplifting_cinematic"
  },
  {
    id: "lofi_chill",
    title: "Chill Cafe (Lofi Sun & Sky)",
    vibe: "Relaxed & Vintage",
    url: "/api/music?id=lofi_chill"
  }
];


