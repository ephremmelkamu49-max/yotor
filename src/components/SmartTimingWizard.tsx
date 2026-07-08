import React, { useState, useMemo } from 'react';
import { Scene, ProjectConfig } from '../types';
import { Language } from '../translations';
import { 
  Sparkles, Clock, Sliders, ChevronRight, Gauge, Info, HelpCircle, 
  Settings, CheckCircle2, AlertTriangle, ArrowRight, Play, Eye
} from 'lucide-react';

interface SmartTimingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: Scene[];
  onBatchUpdateScenes: (scenes: Scene[]) => void;
  projectConfig: ProjectConfig;
  language: Language;
}

type PacingPreset = 'relaxed' | 'standard' | 'fast' | 'dynamic';

export default function SmartTimingWizard({
  isOpen,
  onClose,
  scenes,
  onBatchUpdateScenes,
  projectConfig,
  language
}: SmartTimingWizardProps) {
  // Advanced Pacing Parameters
  const [preset, setPreset] = useState<PacingPreset>('dynamic');
  const [targetWpm, setTargetWpm] = useState<number>(140);
  const [periodPause, setPeriodPause] = useState<number>(0.8);
  const [commaPause, setCommaPause] = useState<number>(0.4);
  const [minDuration, setMinDuration] = useState<number>(2.5);
  const [maxDuration, setMaxDuration] = useState<number>(12.0);
  const [complexityFactor, setComplexityFactor] = useState<number>(0.2); // extra seconds for long/difficult words

  if (!isOpen) return null;

  // Language Detection & Helpers
  const isAmharicText = (text: string) => {
    // Range of Ge'ez (Amharic) letters: \u1200-\u137F
    return /[\u1200-\u137F]/.test(text);
  };

  const getWords = (text: string) => {
    if (!text) return [];
    if (isAmharicText(text)) {
      // Split Amharic words (handling spaces and traditional punctuation like '።', '፣', '፤', '፥')
      return text.trim().split(/[\s።፣፤፥፡]+/).filter(Boolean);
    }
    return text.trim().split(/\s+/).filter(Boolean);
  };

  const estimateSyllablesAndComplexity = (text: string) => {
    const words = getWords(text);
    if (words.length === 0) return { syllables: 0, longWords: 0, complexityScore: 0 };

    let totalSyllables = 0;
    let longWords = 0;

    for (const word of words) {
      if (isAmharicText(word)) {
        // In Amharic, each character (excluding punctuation) is structurally a consonant-vowel syllable.
        // Thus, the length of the string represents the number of syllables directly.
        const syllables = word.replace(/[\s።፣፤፥፡]/g, '').length;
        totalSyllables += syllables;
        if (syllables > 5) {
          longWords++;
        }
      } else {
        // English Syllables approximation heuristic
        const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
        if (cleanWord.length <= 3) {
          totalSyllables += 1;
        } else {
          let syllables = cleanWord
            .replace(/(?:es|ed|[^laeiouy]e)$/, '')
            .replace(/^y/, '')
            .match(/[aeiouy]{1,2}/g)?.length || 1;
          
          totalSyllables += syllables;
          if (cleanWord.length > 7 || syllables >= 3) {
            longWords++;
          }
        }
      }
    }

    // Complexity Score based on long words / average syllables per word
    const avgSyllables = totalSyllables / words.length;
    const longWordRatio = longWords / words.length;
    const complexityScore = (avgSyllables * 40) + (longWordRatio * 60);

    return {
      syllables: totalSyllables,
      longWords,
      complexityScore
    };
  };

  // Analyze Punctuation Breathing Pauses
  const analyzePunctuation = (text: string) => {
    if (!text) return { periods: 0, commas: 0, ellipses: 0 };
    const periods = (text.match(/[.።?!]/g) || []).length;
    const commas = (text.match(/[,፣;፤:፡]/g) || []).length;
    const ellipses = (text.match(/\.{3}/g) || []).length;
    return { periods: Math.max(0, periods - ellipses), commas, ellipses };
  };

  // Perform Script and Complexity Diagnostics
  const stats = useMemo(() => {
    let totalWords = 0;
    let totalChars = 0;
    let totalSyllables = 0;
    let totalLongWords = 0;
    let totalComplexitySum = 0;
    let totalPeriods = 0;
    let totalCommas = 0;
    let totalEllipses = 0;

    scenes.forEach(scene => {
      const txt = scene.text || '';
      const words = getWords(txt);
      totalWords += words.length;
      totalChars += txt.length;
      
      const { syllables, longWords, complexityScore } = estimateSyllablesAndComplexity(txt);
      totalSyllables += syllables;
      totalLongWords += longWords;
      totalComplexitySum += complexityScore;

      const { periods, commas, ellipses } = analyzePunctuation(txt);
      totalPeriods += periods;
      totalCommas += commas;
      totalEllipses += ellipses;
    });

    const avgComplexity = scenes.length > 0 ? totalComplexitySum / scenes.length : 0;
    
    let complexityLabel = 'Cinematic / Standard';
    let complexityColor = 'text-green-400 border-green-500/20 bg-green-500/10';
    if (avgComplexity > 65) {
      complexityLabel = 'Dense / Academic / Technical';
      complexityColor = 'text-amber-400 border-amber-500/20 bg-amber-500/10';
    } else if (avgComplexity < 45) {
      complexityLabel = 'Simple / Fluent / Direct';
      complexityColor = 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10';
    }

    return {
      totalWords,
      totalChars,
      totalSyllables,
      totalLongWords,
      avgComplexity,
      complexityLabel,
      complexityColor,
      punctuation: {
        periods: totalPeriods,
        commas: totalCommas,
        ellipses: totalEllipses,
        estimatedPauseTime: (totalPeriods * periodPause) + (totalCommas * commaPause) + (totalEllipses * 1.2)
      }
    };
  }, [scenes, periodPause, commaPause]);

  // Handle preset selection
  const handlePresetChange = (selected: PacingPreset) => {
    setPreset(selected);
    if (selected === 'relaxed') {
      setTargetWpm(110);
      setPeriodPause(1.0);
      setCommaPause(0.5);
      setMinDuration(3.0);
      setMaxDuration(14.0);
      setComplexityFactor(0.3);
    } else if (selected === 'standard') {
      setTargetWpm(145);
      setPeriodPause(0.8);
      setCommaPause(0.4);
      setMinDuration(2.5);
      setMaxDuration(12.0);
      setComplexityFactor(0.15);
    } else if (selected === 'fast') {
      setTargetWpm(180);
      setPeriodPause(0.5);
      setCommaPause(0.2);
      setMinDuration(2.0);
      setMaxDuration(9.0);
      setComplexityFactor(0.05);
    } else if (selected === 'dynamic') {
      setTargetWpm(135);
      setPeriodPause(0.8);
      setCommaPause(0.4);
      setMinDuration(2.5);
      setMaxDuration(12.0);
      setComplexityFactor(0.25);
    }
  };

  // Compute calculated values for each scene
  const calculatedScenes = useMemo(() => {
    return scenes.map(scene => {
      const txt = scene.text || '';
      const words = getWords(txt);
      if (words.length === 0) {
        return {
          ...scene,
          calculatedDuration: 3.0,
          wpm: 0,
          complexity: 'Simple',
          wordsCount: 0,
          punctuationPause: 0
        };
      }

      const { syllables, longWords, complexityScore } = estimateSyllablesAndComplexity(txt);
      const { periods, commas, ellipses } = analyzePunctuation(txt);

      // 1. Core time calculation based on reading speed preset
      let calculatedDur = 0;
      const isAmharic = isAmharicText(txt);

      if (isAmharic) {
        // Amharic standard: roughly 2.8 Ge'ez syllables per second for normal pacing.
        // Let's translate targetWpm to syllables-per-second multiplier
        const baseSyllablesPerSecond = (targetWpm / 140) * 2.8;
        calculatedDur = syllables / baseSyllablesPerSecond;
      } else {
        // English standard
        calculatedDur = words.length / (targetWpm / 60);
      }

      // 2. Extra complexity padding
      const longWordsPadding = longWords * complexityFactor;
      calculatedDur += longWordsPadding;

      // 3. Natural breathing pauses for punctuation
      const pPause = (periods * periodPause) + (commas * commaPause) + (ellipses * 1.2);
      calculatedDur += pPause;

      // 4. Dynamic algorithm specific weighting
      if (preset === 'dynamic') {
        // Adds extra padding if it has high syllable/complexity ratio to make it highly expressive
        const complexWordRatio = longWords / words.length;
        if (complexWordRatio > 0.3) {
          calculatedDur *= 1.12; // slow down by 12% for technical jargon
        }
      }

      // 5. Clamp to min/max safety limits
      const finalDur = parseFloat(Math.min(maxDuration, Math.max(minDuration, calculatedDur)).toFixed(1));

      // Calculate effective reading pace
      const effectiveWpm = Math.round(words.length / (finalDur / 60));

      return {
        ...scene,
        calculatedDuration: finalDur,
        wpm: effectiveWpm,
        complexityScore,
        wordsCount: words.length,
        punctuationPause: pPause
      };
    });
  }, [scenes, preset, targetWpm, periodPause, commaPause, minDuration, maxDuration, complexityFactor]);

  // Aggregated totals of the recalculated results
  const calcTotals = useMemo(() => {
    const totalBefore = scenes.reduce((sum, s) => sum + s.duration, 0);
    const totalAfter = calculatedScenes.reduce((sum, s) => sum + s.calculatedDuration, 0);
    const avgWpmAfter = Math.round(stats.totalWords / (totalAfter / 60)) || 0;

    return {
      totalBefore: parseFloat(totalBefore.toFixed(1)),
      totalAfter: parseFloat(totalAfter.toFixed(1)),
      diff: parseFloat((totalAfter - totalBefore).toFixed(1)),
      avgWpmAfter
    };
  }, [scenes, calculatedScenes, stats]);

  // Apply changes to timeline
  const handleApply = () => {
    const updated = scenes.map((scene, idx) => ({
      ...scene,
      duration: calculatedScenes[idx].calculatedDuration
    }));
    onBatchUpdateScenes(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-[#0b0b0d] border border-zinc-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-zoomIn relative">
        
        {/* Header section */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-2xl">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-light text-zinc-100">
                {language === 'am' ? 'የብልህ ጊዜ ማስተካከያ ዊዛርድ' : 'Smart Timing Wizard'}
              </h3>
              <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider font-mono">
                {language === 'am' 
                  ? 'የቪዲዮ ክፍሎችን ቆይታ ከንግግር ፍጥነትና አስቸጋሪነት ጋር በራስ-ሰር ማስተካከያ' 
                  : 'AI-assisted timing & pacing calibration based on syllables, word density, & pauses'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 text-xs font-semibold px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl transition-colors hover:border-zinc-700"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Container with two-column layout */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Top diagnostic alert banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between">
              <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-500 font-mono">
                {language === 'am' ? 'ጠቅላላ ቃላት' : 'Total Words'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-light text-zinc-200">{stats.totalWords}</span>
                <span className="text-[10px] text-zinc-500 font-mono">words</span>
              </div>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between">
              <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-500 font-mono">
                {language === 'am' ? 'የቃላት አስቸጋሪነት ደረጃ' : 'Script Complexity'}
              </span>
              <div className="mt-1">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${stats.complexityColor}`}>
                  {stats.complexityLabel}
                </span>
                <p className="text-[9px] text-zinc-500 mt-1 font-mono">Score: {Math.round(stats.avgComplexity)}/100</p>
              </div>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between">
              <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-500 font-mono">
                {language === 'am' ? 'የአየር አተነፋፈስ እረፍቶች' : 'Punctuation Pauses'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-light text-indigo-400">{stats.punctuation.periods + stats.punctuation.commas}</span>
                <span className="text-[10px] text-zinc-500 font-mono">pauses</span>
              </div>
            </div>

            <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-4 flex flex-col justify-between">
              <span className="text-[9px] uppercase tracking-wider font-bold text-zinc-500 font-mono">
                {language === 'am' ? 'ቀድሞ የነበረ ጠቅላላ ቆይታ' : 'Original Playback'}
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-light text-slate-500 font-mono">{calcTotals.totalBefore}s</span>
                <span className="text-[9px] text-zinc-600 font-mono">({Math.round(stats.totalWords / (calcTotals.totalBefore / 60)) || 0} WPM)</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Preset Configuration & Parameters */}
            <div className="lg:col-span-5 space-y-5">
              
              {/* Presets Cards */}
              <div className="space-y-2.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest font-mono block">
                  {language === 'am' ? 'የአነባብ ፍጥነት ቅድመ-ቅምጥ' : 'Select Pacing Profile'}
                </label>
                
                <div className="grid grid-cols-1 gap-2.5">
                  <button
                    onClick={() => handlePresetChange('dynamic')}
                    className={`text-left p-3.5 rounded-2xl border transition-all relative ${
                      preset === 'dynamic'
                        ? 'bg-indigo-950/20 border-indigo-500/60 text-indigo-200 shadow-lg shadow-indigo-500/5'
                        : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className={`w-4 h-4 ${preset === 'dynamic' ? 'text-indigo-400' : 'text-zinc-500'}`} />
                        <span className="text-xs font-bold text-zinc-200">
                          {language === 'am' ? 'የረቀቀ ራስ-ሰር አሰላለፍ' : 'AI-Weighted Dynamic'}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
                      {language === 'am'
                        ? 'ቃላትን ከመተንፈሻ እረፍቶች እና ከአስቸጋሪነት ጋር አሰናድቶ ጊዜን በዝርዝር ያሰላል።'
                        : 'Adjusts per-scene based on syllables, long jargon words, and punctuation pauses dynamically.'}
                    </p>
                  </button>

                  <button
                    onClick={() => handlePresetChange('standard')}
                    className={`text-left p-3 rounded-2xl border transition-all ${
                      preset === 'standard'
                        ? 'bg-cyan-950/20 border-cyan-500/60 text-cyan-200 shadow-lg'
                        : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-zinc-200">
                        {language === 'am' ? 'መካከለኛ ሲኒማቲክ' : 'Cinematic Narrative'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      {language === 'am' ? 'ለታሪኮች ተስማሚ የሆነ (~145 WPM) መደበኛ ፍጥነት' : 'Balanced pacing (~145 WPM) perfect for standard voice narration.'}
                    </p>
                  </button>

                  <button
                    onClick={() => handlePresetChange('relaxed')}
                    className={`text-left p-3 rounded-2xl border transition-all ${
                      preset === 'relaxed'
                        ? 'bg-teal-950/20 border-teal-500/60 text-teal-200 shadow-lg'
                        : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-teal-400" />
                      <span className="text-xs font-bold text-zinc-200">
                        {language === 'am' ? 'ረጋ ያለ / ትምህርታዊ' : 'Relaxed / Educational'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      {language === 'am' ? 'ቀስ ብሎ የሚነበብ (~110 WPM) ለትምህርት ቪዲዮዎች' : 'Deliberate & slow pacing (~110 WPM) for complex tutorials.'}
                    </p>
                  </button>

                  <button
                    onClick={() => handlePresetChange('fast')}
                    className={`text-left p-3 rounded-2xl border transition-all ${
                      preset === 'fast'
                        ? 'bg-amber-950/20 border-amber-500/60 text-amber-200 shadow-lg'
                        : 'bg-zinc-950/40 border-zinc-900 text-zinc-400 hover:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-zinc-200">
                        {language === 'am' ? 'ፈጣን መግለጫ / የማስታወቂያ' : 'Fast / Promotional'}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      {language === 'am' ? 'ፈጣን መረጃዎችን በአጭር ጊዜ (~180 WPM) ለማቅረብ' : 'Snappy social media pacing (~180 WPM) for promos.'}
                    </p>
                  </button>
                </div>
              </div>

              {/* Advanced Parameter Tuning */}
              <div className="bg-zinc-950/60 border border-zinc-900 rounded-3xl p-4.5 space-y-4">
                <div className="flex items-center gap-1.5 text-zinc-300 pb-2.5 border-b border-zinc-900">
                  <Settings className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold uppercase tracking-wider font-mono">
                    {language === 'am' ? 'እድገት ማስተካከያዎች' : 'Pacing Micro-Tuner'}
                  </span>
                </div>

                {/* Target WPM */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-zinc-400">{language === 'am' ? 'የቃላት ፍጥነት (በደቂቃ)' : 'Target Word Speed (WPM)'}</span>
                    <span className="text-indigo-400 font-bold">{targetWpm} WPM</span>
                  </div>
                  <input
                    type="range"
                    min="90"
                    max="220"
                    step="5"
                    value={targetWpm}
                    onChange={(e) => {
                      setPreset('dynamic'); // custom
                      setTargetWpm(parseInt(e.target.value));
                    }}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none accent-indigo-500 cursor-pointer"
                  />
                </div>

                {/* Period/Sentence Breathing Pause */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-zinc-400">{language === 'am' ? 'የሙሉ ዓረፍተ ነገር ማቆሚያ እረፍት' : 'Sentence Pause (., ?, !)'}</span>
                    <span className="text-cyan-400 font-bold">{periodPause}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.5"
                    step="0.1"
                    value={periodPause}
                    onChange={(e) => {
                      setPreset('dynamic');
                      setPeriodPause(parseFloat(e.target.value));
                    }}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none accent-cyan-500 cursor-pointer"
                  />
                </div>

                {/* Comma/Clause Pause */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-zinc-400">{language === 'am' ? 'የነጠላ ሰረዝ ማቆሚያ እረፍት' : 'Clause Pause (,, ;, :)'}</span>
                    <span className="text-teal-400 font-bold">{commaPause}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.8"
                    step="0.05"
                    value={commaPause}
                    onChange={(e) => {
                      setPreset('dynamic');
                      setCommaPause(parseFloat(e.target.value));
                    }}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none accent-teal-500 cursor-pointer"
                  />
                </div>

                {/* Scene Clamping Limits */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-mono uppercase text-zinc-500 block">
                      {language === 'am' ? 'አነስተኛ ቆይታ' : 'Min Scene Limit'}
                    </span>
                    <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1">
                      <input
                        type="number"
                        min="1"
                        max="5"
                        step="0.5"
                        value={minDuration}
                        onChange={(e) => setMinDuration(Math.max(1, parseFloat(e.target.value) || 2))}
                        className="w-full bg-transparent border-0 p-0 text-xs text-zinc-200 font-bold font-mono focus:ring-0 outline-none"
                      />
                      <span className="text-[10px] text-zinc-600 font-mono">s</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[9px] font-mono uppercase text-zinc-500 block">
                      {language === 'am' ? 'ከፍተኛ ቆይታ' : 'Max Scene Limit'}
                    </span>
                    <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1">
                      <input
                        type="number"
                        min="6"
                        max="30"
                        step="0.5"
                        value={maxDuration}
                        onChange={(e) => setMaxDuration(Math.max(6, parseFloat(e.target.value) || 12))}
                        className="w-full bg-transparent border-0 p-0 text-xs text-zinc-200 font-bold font-mono focus:ring-0 outline-none"
                      />
                      <span className="text-[10px] text-zinc-600 font-mono">s</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>

            {/* Right Column: Comparative Interactive Timeline Preview */}
            <div className="lg:col-span-7 flex flex-col space-y-4">
              
              <div className="flex items-center justify-between border-b border-zinc-900 pb-2 shrink-0">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest font-mono block">
                  {language === 'am' ? 'አዲሱ የጊዜ ሰሌዳ የቪዲዮ ክፍሎች እይታ' : 'Recalculated Timeline Preview'}
                </label>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {language === 'am' ? 'አዲስ ጠቅላላ ጊዜ:' : 'New Total:'}{' '}
                    <span className="text-emerald-400 font-bold font-mono text-xs">{calcTotals.totalAfter}s</span>
                  </span>
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    calcTotals.diff > 0 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : calcTotals.diff < 0 
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                        : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {calcTotals.diff > 0 ? `+${calcTotals.diff}s` : `${calcTotals.diff}s`}
                  </span>
                </div>
              </div>

              {/* Recalculated timeline progress indicator list */}
              <div className="flex-1 overflow-y-auto max-h-[420px] pr-1 space-y-2.5">
                {calculatedScenes.map((scene, idx) => {
                  const wasModified = Math.abs(scene.duration - scene.calculatedDuration) > 0.05;
                  
                  // Evaluate reading speeds warning
                  let paceBadge = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                  let paceLabel = 'Perfect';
                  if (scene.wpm > 200) {
                    paceBadge = 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse';
                    paceLabel = 'Too Fast';
                  } else if (scene.wpm > 170) {
                    paceBadge = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                    paceLabel = 'Fast Pace';
                  } else if (scene.wpm < 80 && scene.wordsCount > 0) {
                    paceBadge = 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
                    paceLabel = 'Leisurely';
                  }

                  return (
                    <div 
                      key={scene.id} 
                      className={`p-3.5 bg-zinc-950/40 border rounded-2xl transition-all ${
                        wasModified ? 'border-indigo-500/25 bg-zinc-950/70' : 'border-zinc-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 flex items-center justify-center rounded-md bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-indigo-400 font-mono">
                            {idx + 1}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400">
                            {scene.wordsCount} {language === 'am' ? 'ቃላት' : 'words'}
                          </span>
                        </div>
                        
                        {scene.wordsCount > 0 && (
                          <div className="flex gap-1.5 items-center">
                            <span className="text-[9px] font-mono text-zinc-500">
                              Pace: {scene.wpm} WPM
                            </span>
                            <span className={`text-[8px] font-bold px-1 py-0.2 rounded-md uppercase font-mono tracking-wider ${paceBadge}`}>
                              {paceLabel}
                            </span>
                          </div>
                        )}
                      </div>

                      <p className="text-[11px] text-zinc-300 font-light line-clamp-1 mt-1.5 italic">
                        "{scene.text || 'No text/narration specified for this scene'}"
                      </p>

                      {/* Before / After duration bar display */}
                      <div className="mt-3.5 space-y-1.5">
                        <div className="flex items-center gap-2 text-[9px] font-mono">
                          <span className="w-12 text-zinc-600 uppercase tracking-wider">Before:</span>
                          <div className="flex-1 bg-zinc-900/50 rounded-full h-2 overflow-hidden relative">
                            <div 
                              className="bg-zinc-800 h-full rounded-full transition-all duration-300" 
                              style={{ width: `${Math.min(100, (scene.duration / 15) * 100)}%` }}
                            />
                          </div>
                          <span className="text-zinc-500 font-bold w-10 text-right">{scene.duration}s</span>
                        </div>

                        <div className="flex items-center gap-2 text-[9px] font-mono">
                          <span className="w-12 text-indigo-400 uppercase tracking-wider font-bold">Optimal:</span>
                          <div className="flex-1 bg-zinc-900/50 rounded-full h-2 overflow-hidden relative">
                            <div 
                              className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-full rounded-full transition-all duration-300" 
                              style={{ width: `${Math.min(100, (scene.calculatedDuration / 15) * 100)}%` }}
                            />
                          </div>
                          <span className="text-cyan-400 font-bold w-10 text-right">{scene.calculatedDuration}s</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

          </div>

          {/* Quick info / help alert footer inside wizard */}
          <div className="bg-indigo-950/10 border border-indigo-900/30 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-indigo-300 shrink-0">
            <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-zinc-200">
                {language === 'am' ? 'ይህ እንዴት ይረዳል?' : 'How does this improve video pacing?'}
              </p>
              <p className="text-zinc-400 text-[11px]">
                {language === 'am' 
                  ? 'የተራኪውን ቃላት ፍጥነት በመተንተን ለእያንዳንዱ ቪዲዮ በቂ ጊዜ ይሰጣል። ንዑስ ርዕሶች በጣም ሳይፈጥኑ ወይም ሳይዘገዩ ከተመልካች ፍላጎት ጋር ፍጹም እንዲስማሙ ይረዳል።'
                  : 'Perfect text-to-speech synchronization is complex because long words, commas, and periods represent real speaking delays. The Smart Timing Wizard calibrates the video clip length to accommodate breathing pauses and reading speeds, eliminating text overflow or rushed overlays.'}
              </p>
            </div>
          </div>

        </div>

        {/* Footer Action Buttons */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
            <HelpCircle className="w-4 h-4 text-zinc-600" />
            <span>{language === 'am' ? 'የጊዜ አሰላለፍ ሙሉ ለሙሉ ይለወጣል' : 'This will overwrite current scene durations'}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors"
            >
              {language === 'am' ? 'አቋርጥ' : 'Cancel'}
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-500/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              {language === 'am' ? 'ጊዜውን በሙሉ ተግብር' : 'Apply Smart Pacing'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
