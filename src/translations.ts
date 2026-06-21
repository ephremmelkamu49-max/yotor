export type Language = 'am' | 'en';

export const translations = {
  am: {
    // Header
    logo_sub: "ዮቶር አይ",
    studio_title: "የፊልም አዘጋጅ ስቱዲዮ",
    full_web_view: "🌐 ሙሉ ስክሪን እይታ",
    ready_to_export: "🎬 ቪዲዮውን አዘጋጅና አውርድ (READY TO EXPORT)",

    // Script Input Section
    script_processor: "የፊልም ፅሁፍ ማቀነባበሪያ",
    script_desc: "የቪዲዮውን ታሪክና ተራኪ እዚህ ይፃፉ",
    diagnostics: "ሲስተም ሁኔታ",
    diagnostics_btn: "የቴክኒክ ምርመራ",
    api_key_desc: "የስቶክ ቪዲዮ ኤፒአይ ቁልፎችን ያቀናብሩ",
    script_placeholder: "እዚህ ታሪክዎን ይፃፉ... (የአማርኛ ወይም የእንግሊዝኛ ታሪኮች ይደገፋሉ)",
    estimated_duration: "የተገመተ የድምፅ ርዝማኔ",
    estimated_seconds: "ሰከንድ",
    estimated_minutes: "ደቂቃ",
    generate_scenes_btn: "🎬 ቪዲዮዎችንና ክፍሎችን ፍጠር",
    running_analysis: "የፊልሙን ጽሑፍ በGemini AI በመመርመር ላይ እባክዎ ይጠብቁ...",
    stage_api: "ከፒክሰልስ (Pexels) ተስማሚ ቪዲዮዎችን በመፈለግ ላይ...",
    stage_processing: "ሙሉ የቪዲዮ ክፍሎችን በማዘጋጀት ላይ...",

    // Settings Headers
    language_selection: "የመተግበሪያው ቋንቋ (App Language)",
    language_desc: "የመተግበሪያውን ቋንቋ መምረጫ / Toggle translation of Yotor's Interface",
    select_language: "ቋንቋ ይምረጡ",

    // Timeline / Scene sequence
    timeline_title: "የፊልም ክፍሎችና ምስሎች (Cinematic Sequence)",
    search_online: "በበይነመረብ ቪዲዮዎችን ፈልግ",
    clip_search_tag: "ምስሉን ለመፈለግ የተሰጠ መግለጫ (Keywords)",
    search_placeholder: "የ Stock ቪዲዮዎችን ለመፈለግ ቃላት ይፃፉ...",
    active_search_btn: "ቪዲዮ ፈልግ",
    add_scene: "አዲስ የቪዲዮ ክፍል አክል",
    deleting_confirm: "ይህንን የቪዲዮ ክፍል በእርግጠኝነት ማጥፋት ይፈልጋሉ?",
    no_scenes: "ምንም የፊልም ክፍሎች የሉም። እባክዎ ታሪክዎን በግራ በኩል ይፃፉና 'ክፍሎችን ፍጠር' የሚለውን ይጫኑ።",

    // Video Canvas Tabs
    tab_size: "መጠን",
    tab_subtitles: "ትርጉም",
    tab_music: "ማጀቢያ",
    tab_motion: "ተንቀሳቃሽነት",
    tab_analyzer: "ቪዲዮ መርማሪ (AI)",

    // Video Canvas Controls
    voice_narration_title: "የድምጽ አነባብ አማራጮች",
    voice_enabled_label: "የድምፅ ንባብ (TTS) ይኑር",
    voice_speaker_label: "የሰው ድምፅ ተናጋሪ (ማንበቢያ)",
    voice_lang_label: "ቋንቋና አነባብ ሥርዓት (Language Accent)",

    // Subtitle Controls
    subtitle_style_title: "የትርጉም ጽሑፍ ቅጥ (Subtitle Layout)",
    subtitle_enabled: "ለትርጉሙ ዝግጁ ይሁን (Show Subtitles)",
    font_size: "የፊደል መጠን (Font Size)",
    uppercase: "ሁሉንም ፊደሎች ትልቅ አድርግ",
    bg_opacity: "የጀርባ ግልፅነት (Box Opacity)",
    text_position: "የፅሁፉ አቀማመጥ (Position)",
    text_font: "የቅርፀ-ቁምፊ ዓይነት (Font Family)",

    // Music Controls
    music_track_title: "ማጀቢያ ሙዚቃዎችን ምረጥ",
    music_enabled_lbl: "ማጀቢያ ሙዚቃ ይኑር (Play Audio)",
    music_track_lbl: "የማጀቢያ ትራክ መምረጫ",
    music_volume: "የማጀቢያ ድምፅ መጠን",

    // Motion Controls
    motion_setup_title: "የሲኒማቲክ እንቅስቃሴ መቆጣጠሪያ",
    motion_effects_lbl: "ተንቀሳቃሽነት ይኑር (Ken Burns)",
    motion_style_lbl: "የካሜራ አቅጣጫ (Camera Movement)",

    // AI Analyzer Controls
    ai_analyzer_title: "አይ ቪዲዮ መርማሪ እና ዳይሬክተር ረዳት",
    pro_model_badge: "ፕሮ ሞዴል",
    preset_tasks: "ፈጣን ምርመራዎች (Preset Analysis Tasks)",
    fine_tune_placeholder: "ስለ ቪዲዮው ማወቅ የፈለጉትን ማንኛውንም አይነት ጥያቄ እዚህ ይጠይቁ...",
    analyze_btn: "ቪዲዮውን መርምር (Analyze)",
    analyzing_lbl: "ቪዲዮውን በ AI እያጠና ነው... (እባክዎ እስከ 20 ሰከንድ ይጠብቁ)",
    director_report: "ዳይሬክተር ሪፖርት",
    copy_report: "ኮፒ አድርግ",
    no_active_scene: "ምንም ምስል አልተጫነም። እባክዎ በግራ በኩል ታሪክ ይፃፉና ቪዲዮዎችን ይፍጠሩ።",

    // Rendering modal
    render_studio: "የቪዲዮ ማቀናበሪያ ክፍለ-ጊዜ",
    export_quality: "የመጨረሻ ቪዲዮ ጥራት እይታ (Export Resolution)",
    render_mode: "የማቀናበሪያ አይነት (Renderer Mode)",
    full_quality_opt: "ሙሉ ጥራት (የሰውነት/የድምፅ ማጀቢያ ፍጹም ውህደት - 100% High Profile)",
    fast_quality_opt: "ፈጣን እይታ (ቀላል ቪዲዮ - 60 FPS Preview Only)",
    data_saver: "የሚዲያ ዳታ ፍጆታ (Network Profile)",
    data_saving_mode: "ከፍተኛ ፍጥነት (Fast Bandwidth)",
    data_premium_mode: "ከፍተኛ ጥራት (High Bitrate Videos)",
    start_rendering_btn: "🎬 ቪዲዮውን ማቀናበር ጀምር (Bake & Render Video)",
    rendering_progress: "የቪዲዮ ክፍሎች በመሰባሰብ ላይ ናቸው",
    rendering_complete: "🎉 የቪዲዮ ማጠናቀቁ በተሳካ ሁኔታ ተጠናቋል። ወደ ስልክዎ ወይም ኮምፒውተርዎ አውርደው ማየት ይችላሉ!",
    download_btn: "🎬 ቪዲዮውን አሁን አውርድ (DOWNLOAD VIDEO)",
    close_btn: "ዝጋ (Close)"
  },
  en: {
    // Header
    logo_sub: "Yotor AI",
    studio_title: "AI Director Studio",
    full_web_view: "🌐 Full Web View",
    ready_to_export: "🎬 BAKE VIDEO & DOWNLOAD (READY TO EXPORT)",

    // Script Input Section
    script_processor: "Script Processor / Story Editor",
    script_desc: "Define your movie script and narration timeline",
    diagnostics: "Diagnostics",
    diagnostics_btn: "System Check",
    api_key_desc: "Configure Stock Video API Keys",
    script_placeholder: "Write your cinematic story here...",
    estimated_duration: "Estimated Speaking Duration",
    estimated_seconds: "sec",
    estimated_minutes: "min",
    generate_scenes_btn: "🎬 Generate Scenes & Search Clips",
    running_analysis: "Analyzing narrative text with Gemini AI, please wait...",
    stage_api: "Searching professional stock library databases...",
    stage_processing: "Preparing rich footage placeholders & narration timelines...",

    // Settings Headers
    language_selection: "Application Interface Language",
    language_desc: "Toggle translation of Yotor's Interface",
    select_language: "Select Language",

    // Timeline / Scene sequence
    timeline_title: "Cinematic Scene Sequence",
    search_online: "Search Stock Videos Database",
    clip_search_tag: "Stock clip source query tags (Keywords)",
    search_placeholder: "Enter labels or settings to search stock clips...",
    active_search_btn: "Search Videos",
    add_scene: "Add New Scene Block",
    deleting_confirm: "Are you sure you want to delete this scene block?",
    no_scenes: "No movie scenes available. Write a script on the left side and click 'Generate Scenes'.",

    // Video Canvas Tabs
    tab_size: "Ratio",
    tab_subtitles: "Subtitle",
    tab_music: "Music",
    tab_motion: "Motion",
    tab_analyzer: "AI Analyzer",

    // Video Canvas Controls
    voice_narration_title: "Voice Narration & TTS Setup",
    voice_enabled_label: "Enable Text-to-Speech",
    voice_speaker_label: "Selected Narrator Voice",
    voice_lang_label: "Dialect & Language Accent",

    // Subtitle Controls
    subtitle_style_title: "Subtitle Typography & Interface",
    subtitle_enabled: "Enable Subtitles",
    font_size: "Font Size (relative)",
    uppercase: "Force Uppercase Font",
    bg_opacity: "Backing Box Opacity",
    text_position: "Screen Position",
    text_font: "Font Typography Family",

    // Music Controls
    music_track_title: "Atmosphere Background Music",
    music_enabled_lbl: "Play Atmosphere Tracks",
    music_track_lbl: "Selected Musical Loop",
    music_volume: "Background Musics Volume",

    // Motion Controls
    motion_setup_title: "Cinematic Motion Control (Ken Burns)",
    motion_effects_lbl: "Enable Camera Animations",
    motion_style_lbl: "Focal Path Movement Style",

    // AI Analyzer Controls
    ai_analyzer_title: "AI Video Analyzer & Copilot Director",
    pro_model_badge: "PRO MODEL",
    preset_tasks: "Preset Analysis Tasks",
    fine_tune_placeholder: "Ask the AI Director anything about this video (e.g., 'What is the lighting or cinematic setting?')...",
    analyze_btn: "Analyze Video Scene",
    analyzing_lbl: "Deep Analyzing via Multimodal AI... (Please wait up to 20s)",
    director_report: "Director Report",
    copy_report: "Copy Report",
    no_active_scene: "No active clip selected. Please generate a scene list on the left side first.",

    // Rendering modal
    render_studio: "Render Studio Export Setup",
    export_quality: "Export Image Resolution",
    render_mode: "Processing Render Engine",
    full_quality_opt: "Full Quality Cinema (Flawless frames/sounds - 100% High Profile)",
    fast_quality_opt: "Fast Review Preview (60 FPS Fast Frame Synthesis)",
    data_saver: "Data Connection Profile",
    data_saving_mode: "Fast Bandwidth (Internet Optimized)",
    data_premium_mode: "Uncompressed High Bitrate Streams",
    start_rendering_btn: "🎬 Bake & Render Master Video Now",
    rendering_progress: "Assembling movie timeline blocks",
    rendering_complete: "🎉 Video rendering completed successfully! Download or watch your finalized cinematic file below.",
    download_btn: "🎬 DOWNLOAD MP4 / WEBM VIDEO FILE NOW",
    close_btn: "Close Studio"
  }
};
