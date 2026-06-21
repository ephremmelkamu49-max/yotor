import React, { useState } from 'react';
import { Bot, Sparkles, AlertCircle } from 'lucide-react';

interface NarrativeAnalyzerProps {
  script: string;
}

export default function NarrativeAnalyzer({ script }: NarrativeAnalyzerProps) {
  const [analysis, setAnalysis] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runAnalysis = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/analyze-narrative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script })
      });
      const data = await response.json();
      setAnalysis(data);
    } catch (error) {
      console.error('Analysis failed', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#0c0c0e]/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden" id="narrative-analyzer-panel">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4 mb-5">
        <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
          <Bot size={20} />
        </div>
        <h2 className="text-sm uppercase tracking-widest font-semibold text-zinc-300">Narrative Analysis</h2>
      </div>

      <button
        onClick={runAnalysis}
        disabled={isLoading || !script.trim()}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all uppercase flex items-center justify-center gap-2"
      >
        {isLoading ? 'Analyzing...' : <> <Sparkles size={14}/> Analyze Script</>}
      </button>

      {analysis && (
        <div className="mt-4 space-y-3 text-sm text-zinc-300 animate-fadeIn">
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase">Analysis</h3>
            <p className="mt-1">{analysis.analysis}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase">Pacing</h3>
            <p className="mt-1 font-mono text-indigo-300">{analysis.pacing}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase">Key Themes</h3>
            <div className="flex flex-wrap gap-2 mt-1">
              {analysis.keywords.map((k: string) => (
                <span key={k} className="px-2 py-0.5 bg-zinc-800 rounded-full text-xs text-indigo-200">{k}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
