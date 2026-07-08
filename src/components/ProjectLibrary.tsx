import React, { useState, useEffect } from "react";
import {
  FolderHeart,
  Save,
  Trash2,
  FolderOpen,
  Download,
  FileText,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  History,
  Copy,
  Check,
} from "lucide-react";
import { Scene, ProjectConfig, SavedProject } from "../types";
import { Language, translations } from "../translations";

interface ProjectLibraryProps {
  currentScript: string;
  currentScenes: Scene[];
  currentConfig: ProjectConfig;
  onLoadProject: (project: SavedProject) => void;
  language: Language;
}

export default function ProjectLibrary({
  currentScript,
  currentScenes,
  currentConfig,
  onLoadProject,
  language,
}: ProjectLibraryProps) {
  const t = translations[language];
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [saveName, setSaveName] = useState<string>("");
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load projects from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("yotor_video_projects_library");
    if (stored) {
      try {
        setProjects(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse projects library:", e);
      }
    }
  }, []);

  const saveToLocalStorage = (list: SavedProject[]) => {
    localStorage.setItem("yotor_video_projects_library", JSON.stringify(list));
    setProjects(list);
  };

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();

    // Fallback if name is empty
    const finalName =
      saveName.trim() ||
      `${currentScript.substring(0, 30)}...` ||
      t.unnamed_project;

    const newProject: SavedProject = {
      id: `proj_${Date.now()}`,
      name: finalName,
      script: currentScript,
      scenes: JSON.parse(JSON.stringify(currentScenes, (k, v) => (v instanceof Element || (v && typeof v === 'object' && v.toString && v.toString() === '[object HTMLAudioElement]')) ? undefined : v)),
      projectConfig: JSON.parse(JSON.stringify(currentConfig, (k, v) => (v instanceof Element || (v && typeof v === 'object' && v.toString && v.toString() === '[object HTMLAudioElement]')) ? undefined : v)),
      createdAt: new Date().toISOString(),
    };

    const updated = [newProject, ...projects];
    saveToLocalStorage(updated);
    setSaveName("");
    setShowSaveModal(false);

    // Quick custom notifications/alerts styled beautifully instead of window.alert
    const toast = document.createElement("div");
    toast.className =
      "fixed bottom-5 right-5 z-50 bg-[#090d16] border border-cyan-500/40 text-cyan-400 px-6 py-4.5 rounded-2xl shadow-xl shadow-cyan-500/10 text-xs font-semibold flex items-center gap-3 backdrop-blur-xl animate-fadeIn";
    toast.innerHTML = `<span>✨ ${t.project_saved_success}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("opacity-0", "transition-opacity", "duration-300");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  const handleDeleteProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    if (window.confirm(t.confirm_delete_project)) {
      const updated = projects.filter((p) => p.id !== id);
      saveToLocalStorage(updated);

      const toast = document.createElement("div");
      toast.className =
        "fixed bottom-5 right-5 z-50 bg-[#090d16] border border-red-500/40 text-red-400 px-6 py-4.5 rounded-2xl shadow-xl shadow-red-500/10 text-xs font-semibold flex items-center gap-3 backdrop-blur-xl animate-fadeIn";
      toast.innerHTML = `<span>🗑️ ${t.project_deleted_success}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.classList.add("opacity-0", "transition-opacity", "duration-300");
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  };

  const handleLoadProject = (project: SavedProject) => {
    if (window.confirm(t.confirm_load_project)) {
      onLoadProject(project);

      const toast = document.createElement("div");
      toast.className =
        "fixed bottom-5 right-5 z-50 bg-[#090d16] border border-indigo-500/40 text-indigo-400 px-6 py-4.5 rounded-2xl shadow-xl shadow-indigo-500/10 text-xs font-semibold flex items-center gap-3 backdrop-blur-xl animate-fadeIn";
      toast.innerHTML = `<span>📂 ${t.project_loaded_success}</span>`;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.classList.add("opacity-0", "transition-opacity", "duration-300");
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  };

  const handleCopyScript = (e: React.MouseEvent, project: SavedProject) => {
    e.stopPropagation();
    navigator.clipboard.writeText(project.script);
    setCopiedId(project.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      className="bg-[#0c0c0e]/95 backdrop-blur-xl border border-zinc-900 rounded-3xl p-6 shadow-2xl space-y-4"
      id="project-library-root"
    >
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 text-left focus:outline-none group flex-1"
        >
          <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl group-hover:bg-cyan-500/20 transition-all">
            <FolderHeart size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              {t.project_library}
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 font-mono px-2 py-0.5 rounded-full lowercase font-normal">
                {projects.length} Saved
              </span>
            </h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {t.project_library_desc}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {/* Action icon for expansion */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800/40 rounded-xl transition-all"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {isExpandableAndExpanded(isExpanded) && (
        <div className="space-y-4 animate-fadeIn">
          {/* Quick save panel trigger */}
          <div className="flex items-center gap-3 bg-[#070709] border border-zinc-900 rounded-2xl p-4.5">
            <div className="text-zinc-400 space-y-1 flex-1">
              <span className="text-[11px] font-bold text-zinc-200 block uppercase tracking-wider font-sans">
                {language === "am"
                  ? "የአሁኑን የፊልም ስራ ማቆያ"
                  : "Save current progress"}
              </span>
              <p className="text-[10px] text-zinc-500">
                {language === "am"
                  ? "የታሪኩን ጽሁፍ፣ ውህደቶች እና የቪዲዮ ትሮችን በማቆያ ያስቀምጡት።"
                  : "Saves your current text script, chosen timeline footage clips, and custom configs."}
              </p>
            </div>

            <button
              onClick={() => {
                // Pre-fill save dialog with script preview
                setSaveName(
                  currentScript ? `${currentScript.substring(0, 32)}...` : "",
                );
                setShowSaveModal(true);
              }}
              disabled={!currentScript}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-[10px] uppercase font-black tracking-widest rounded-xl shadow-lg shadow-cyan-505/10 transition-all disabled:opacity-20 disabled:pointer-events-none active:scale-[0.98]"
            >
              <Save size={13} />
              <span>{t.save_current_project}</span>
            </button>
          </div>

          {/* List of projects */}
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-zinc-900 rounded-2xl">
              <History
                size={36}
                className="text-zinc-700 mb-2.5 animate-pulse"
              />
              <p className="text-[11px] text-zinc-400 leading-relaxed max-w-sm">
                {t.no_saved_projects}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
              {projects.map((project) => {
                const totalDuration = project.scenes.reduce(
                  (acc, s) => acc + (s.duration || 4.5),
                  0,
                );
                const firstSceneThumb =
                  project.scenes[0]?.videoThumb ||
                  project.scenes[0]?.videoUrl ||
                  "";
                const isFirstThumbImage =
                  firstSceneThumb &&
                  (firstSceneThumb.match(/\.(jpeg|jpg|png|gif|webp)/i) ||
                    firstSceneThumb.includes("pollinations.ai"));

                return (
                  <div
                    key={project.id}
                    onClick={() => handleLoadProject(project)}
                    className="group flex gap-3.5 bg-[#050505] hover:bg-zinc-950 border border-zinc-900 hover:border-zinc-800 rounded-2xl p-3.5 transition-all cursor-pointer relative overflow-hidden"
                  >
                    {/* Tiny video cover thumb */}
                    <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden relative shrink-0 flex-start mt-0.5 shadow-md">
                      {firstSceneThumb ? (
                        isFirstThumbImage ? (
                          <img
                            src={firstSceneThumb || undefined}
                            alt={project.name}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                          />
                        ) : (
                          <video
                            src={firstSceneThumb || undefined}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-[10px] text-zinc-650 font-bold uppercase">
                          No Pic
                        </div>
                      )}

                      {/* Floating duration count badge */}
                      <div className="absolute bottom-0.5 right-0.5 bg-black/75 px-1 py-0.5 text-[7px] font-mono font-bold rounded text-zinc-300">
                        {totalDuration.toFixed(1)}s
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="flex-1 min-w-0 pr-6">
                      <h4 className="text-xs font-black text-white hover:text-indigo-400 transition-colors uppercase truncate tracking-tight">
                        {project.name}
                      </h4>
                      <p className="text-[10px] text-zinc-500 line-clamp-2 mt-1 leading-relaxed">
                        {project.script}
                      </p>

                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[8px] font-mono text-zinc-600 bg-zinc-900 border border-zinc-850 px-1.5 py-0.5 rounded">
                          {project.scenes.length}{" "}
                          {language === "am" ? "ምዕራፍ" : "scenes"}
                        </span>
                        <span className="text-[8px] font-mono text-zinc-650 bg-zinc-900/50 px-1.5 py-0.5 rounded">
                          {new Date(project.createdAt).toLocaleDateString(
                            language === "am" ? "am-ET" : "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Hover buttons bar right corner absolute */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      <button
                        onClick={(e) => handleCopyScript(e, project)}
                        title="Copy entire script text"
                        className="p-1 px-1.5 bg-[#090d16] border border-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-all flex items-center gap-1 hover:border-zinc-700"
                      >
                        {copiedId === project.id ? (
                          <Check size={11} className="text-emerald-400" />
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                      <button
                        onClick={(e) => handleDeleteProject(e, project.id)}
                        className="p-1 px-1.5 bg-[#090d16] border border-red-500/20 text-red-400 hover:text-white hover:bg-red-500 hover:border-red-500 rounded-lg transition-all"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Manual named Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md bg-[#0a0a0c] border border-zinc-800 rounded-3xl p-6.5 shadow-2xl relative overflow-hidden transition-all">
            {/* Visual gradient light effects inside the modal */}
            <div className="absolute -top-10 -right-10 w-28 h-28 bg-cyan-500/10 blur-xl rounded-full pointer-events-none" />

            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-2">
              <Save size={18} className="text-cyan-400" />
              {t.save_dialog_title}
            </h3>

            <p className="text-[11px] text-zinc-400 mb-5 leading-relaxed">
              {language === "am"
                ? "በማህደር የሚያስቀምጡትን ስራ ለመለየት እንዲጠቅምዎ አጭር ርዕስ ስም ይስጡት።"
                : "Provide a title for this video storyboard project to easily retrieve it later."}
            </p>

            <form onSubmit={handleSaveProject} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-mono text-zinc-550 uppercase tracking-widest block">
                  {language === "am"
                    ? "የቪዲዮው ርዕስ (Project Title)"
                    : "Project Title"}
                </label>
                <input
                  type="text"
                  required
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={t.project_name_placeholder}
                  className="w-full bg-[#050505] border border-zinc-800 text-zinc-200 text-xs rounded-xl px-3.5 py-3 focus:outline-none focus:border-cyan-500/50"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-zinc-900/80">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2.5 bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-900 hover:border-zinc-800 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all"
                >
                  {language === "am" ? "ተመለስ" : "Cancel"}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all hover:shadow-lg hover:shadow-cyan-500/10"
                >
                  {language === "am" ? "አስቀምጥ (SAVE)" : "Save project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function isExpandableAndExpanded(exp: boolean) {
  return exp;
}
