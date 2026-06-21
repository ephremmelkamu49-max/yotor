export interface Scene {
  id: string;
  text: string;           // Spoken text
  keywords: string;       // Pexels video search query
  duration: number;       // Calculated speaking duration in seconds
  caption: string;        // Subtitle text to overlay
  videoUrl: string | null;// High-quality .mp4 url from Pexels/built-in Library
  videoThumb: string | null;
  videoAuthor: string | null;
  videoAuthorUrl: string | null;
  voiceoverUrl: string | null; // Google Translate TTS url
  originalIndex: number;  // Keep track of chronological order
  animationStyle?: AnimationStyle;
  transitionToNext?: 'none' | 'crossfade' | 'slide' | 'wipe' | 'flicker';
}

export type AnimationStyle = 'zoom-in' | 'zoom-out' | 'pan-lr' | 'pan-rl' | 'tilt-up' | 'tilt-down' | 'diagonal-br' | 'diagonal-bl' | 'static' | 'dynamic';

export type AspectRatio = '16:9' | '9:16' | '1:1';

export interface SubtitleStyle {
  enabled: boolean;
  fontSize: number;       // in pixels relative to viewport
  color: string;          // hex/rgba
  backgroundColor: string;// background box color (e.g. rgba(0,0,0,0.5))
  position: 'bottom' | 'middle' | 'top';
  fontFamily: 'Inter' | 'Space Grotesk' | 'JetBrains Mono' | 'Playfair Display' | 'Anton' | 'Archivo Black' | 'Outfit';
  uppercase: boolean;
}

export type VisualStyle = 'realistic' | '3d-animation' | '2d-animation' | 'anime' | 'watercolor' | 'cyberpunk' | 'sketch';

export interface ProjectConfig {
  aspectRatio: AspectRatio;
  musicTrack: string;     // URL or key of selected background music
  musicVolume: number;    // 0 to 1
  voiceLanguage: string;  // gTTS accent / localization
  voiceType?: 'male' | 'female';
  subtitleStyle: SubtitleStyle;
  transitionType: 'none' | 'crossfade' | 'slide' | 'wipe' | 'flicker';
  transitionDuration: number;
  isVoiceEnabled: boolean;
  syncToMusicBeats?: boolean;
  animationStyle?: AnimationStyle;
  isAnimationEnabled?: boolean;
  isTransitionsEnabled?: boolean;
  isSubtitlesEnabled?: boolean;
  isMusicEnabled?: boolean;
  visualStyle?: VisualStyle;
}

export interface VideoClip {
  id: number;
  width: number;
  height: number;
  url: string;
  video_files: {
    id: number;
    quality: 'hd' | 'sd' | 'uhd';
    file_type: string;
    width: number;
    height: number;
    link: string;
  }[];
  video_pictures: {
    id: number;
    picture: string;
  }[];
  user: {
    id: number;
    name: string;
    url: string;
  };
}
