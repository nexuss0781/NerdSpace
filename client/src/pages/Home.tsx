import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  Check,
  ChevronRight,
  Code2,
  FilePlus2,
  Files,
  Keyboard,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Explorer from "@/components/Explorer";
import SymbolPalette from "@/components/SymbolPalette";
import { SYMBOL_BY_CODE } from "@/lib/symbols";
import {
  createProject,
  fileTypeForName,
  languageForFile,
  loadWorkspace,
  newId,
  saveWorkspace,
  type NodeKind,
  type Project,
  type WorkspaceNode,
  type WorkspaceState,
} from "@/lib/workspace";

monaco.editor.defineTheme("nerd-space", {
  base: "vs-dark",
  inherit: true,
  rules: [{ token: "comment", foreground: "7E8B7A", fontStyle: "italic" }],
  colors: {
    "editor.background": "#181A1F",
    "editorGutter.background": "#181A1F",
    "editorLineNumber.foreground": "#69717E",
    "editorLineNumber.activeForeground": "#B4BCC8",
    "editor.lineHighlightBackground": "#20242B",
    "editorCursor.foreground": "#B9E5A8",
    "editor.selectionBackground": "#46536C88",
    "editorIndentGuide.background1": "#2C3038",
    "editorIndentGuide.activeBackground1": "#465044",
  },
});
loader.config({ monaco });

const PROJECT_COLORS = ["#a6d98e", "#a9b5ff", "#f2bd79", "#e28dae", "#79c8c9", "#c4a5f2"];

type DialogState =
  | { type: "new-project" }
  | { type: "new-node"; kind: NodeKind; parentId: string | null }
  | { type: "move-node"; nodeId: string }
  | { type: "rename-node"; nodeId: string }
  | { type: "rename-project"; projectId: string }
  | { type: "delete-node"; nodeId: string }
  | { type: "delete-project"; projectId: string };

type PanelMode = "files" | "search";

function fullPath(project: Project, node: WorkspaceNode) {
  const parts = [node.name];
  let parentId = node.parentId;
  while (parentId) {
    const parent = project.nodes.find((item) => item.id === parentId);
    if (!parent) break;
    parts.push(parent.name);
    parentId = parent.parentId;
  }
  return parts.reverse().join("/");
}

function displayLanguage(language: string) {
  const names: Record<string, string> = {
    c: "C", cpp: "C++", csharp: "C#", css: "CSS", dart: "Dart", dockerfile: "Dockerfile", go: "Go", graphql: "GraphQL", html: "HTML", java: "Java", javascript: "JavaScript", json: "JSON", kotlin: "Kotlin", lua: "Lua", markdown: "Markdown", perl: "Perl", php: "PHP", plaintext: "Plain text", python: "Python", ruby: "Ruby", rust: "Rust", scss: "SCSS", shell: "Shell", sql: "SQL", swift: "Swift", typescript: "TypeScript", xml: "XML", yaml: "YAML",
  };
  return names[language] ?? language;
}

function isWithin(nodes: WorkspaceNode[], folderId: string, possibleChildId: string): boolean {
  let current = nodes.find((node) => node.id === possibleChildId);
  while (current?.parentId) {
    if (current.parentId === folderId) return true;
    current = nodes.find((node) => node.id === current?.parentId);
  }
  return false;
}

function ProjectRail({
  projects,
  activeProjectId,
  expanded,
  onToggle,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  projects: Project[];
  activeProjectId: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  return (
    <aside className={`project-rail ${expanded ? "project-rail--expanded" : "project-rail--collapsed"}`} aria-label="Projects">
      <div className="project-rail__top">
        <button className="project-rail__toggle" onClick={onToggle} aria-label={expanded ? "Collapse projects" : "Expand projects"} title={expanded ? "Show initials" : "Show project names"}>
          {expanded ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
        {expanded && <span className="project-rail__caption">PROJECTS</span>}
      </div>
      <div className="project-rail__list">
        {projects.map((project) => {
          const selected = project.id === activeProjectId;
          return (
            <div className={`project-choice ${selected ? "project-choice--active" : ""}`} key={project.id}>
              <button className="project-choice__select" onClick={() => onSelect(project.id)} title={expanded ? project.name : `${project.name} project`} aria-current={selected ? "page" : undefined}>
                <span className="project-badge" style={{ "--project-color": project.color } as CSSProperties}>{project.name.trim().slice(0, 1).toUpperCase()}</span>
                {expanded && <span className="project-choice__name">{project.name}</span>}
              </button>
              {expanded && (
                <span className="project-choice__actions">
                  <button className="icon-button project-action" aria-label={`Rename ${project.name}`} title="Rename project" onClick={() => onRename(project)}><Pencil size={12} /></button>
                  {projects.length > 1 && <button className="icon-button project-action project-action--delete" aria-label={`Delete ${project.name}`} title="Delete project" onClick={() => onDelete(project)}><Trash2 size={12} /></button>}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="project-rail__bottom">
        <button className="project-add" onClick={onCreate} aria-label="Create project" title="Create project"><Plus size={17} />{expanded && <span>New project</span>}</button>
      </div>
    </aside>
  );
}

function Home() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => loadWorkspace());
  const [projectRailExpanded, setProjectRailExpanded] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("files");
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [symbolMode, setSymbolMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dirtyFileIds, setDirtyFileIds] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [savePulse, setSavePulse] = useState(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const symbolModeRef = useRef(false);
  const saveRef = useRef<() => void>(() => undefined);
  const saveTimerRef = useRef<number | undefined>(undefined);

  const activeProject = workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? workspace.projects[0];
  const activeFile = activeProject?.nodes.find((node) => node.id === activeProject.activeFileId && node.kind === "file") ?? null;
  const openFiles = activeProject?.openFileIds
    .map((id) => activeProject.nodes.find((node) => node.id === id && node.kind === "file"))
    .filter((node): node is WorkspaceNode => Boolean(node)) ?? [];
  const language = activeFile ? languageForFile(activeFile.name) : "plaintext";
  const projectFileCount = activeProject?.nodes.filter((node) => node.kind === "file").length ?? 0;

  useEffect(() => {
    saveWorkspace(workspace);
  }, [workspace]);

  useEffect(() => {
    symbolModeRef.current = symbolMode;
  }, [symbolMode]);

  useEffect(() => () => window.clearTimeout(saveTimerRef.current), []);

  const updateProject = (projectId: string, update: (project: Project) => Project) => {
    setWorkspace((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === projectId ? update(project) : project),
    }));
  };

  const openFile = (file: WorkspaceNode) => {
    updateProject(activeProject.id, (project) => ({
      ...project,
      activeFileId: file.id,
      openFileIds: project.openFileIds.includes(file.id) ? project.openFileIds : [...project.openFileIds, file.id],
    }));
    setPanelMode("files");
    setMobileExplorerOpen(false);
  };

  const updateFileContent = (fileId: string, content: string) => {
    updateProject(activeProject.id, (project) => ({
      ...project,
      nodes: project.nodes.map((node) => node.id === fileId ? { ...node, content } : node),
    }));
    setDirtyFileIds((current) => new Set(current).add(fileId));
    setSavePulse(true);
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setSavePulse(false), 700);
  };

  const saveCurrentProject = () => {
    saveWorkspace(workspace);
    setDirtyFileIds(new Set());
    setSavePulse(false);
  };
  saveRef.current = saveCurrentProject;

  useEffect(() => {
    const handleSave = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, []);

  const onEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
    editor.onKeyDown((event) => {
      if (!symbolModeRef.current) return;
      const browserEvent = event.browserEvent;
      if (event.keyCode !== monaco.KeyCode.Space) {
        if (browserEvent.ctrlKey || browserEvent.metaKey || browserEvent.altKey) return;
        const key = browserEvent.key;
        const editingKeys = new Set(["Enter", "Tab", "Backspace", "Delete", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
        if (/^[a-z0-9]$/i.test(key) || editingKeys.has(key)) return;
        event.preventDefault();
        return;
      }
      const position = editor.getPosition();
      const model = editor.getModel();
      if (!position || !model) return;
      const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const match = linePrefix.match(/([a-z]+)$/i);
      if (!match) return;
      const code = match[1].toLowerCase();
      const symbol = SYMBOL_BY_CODE[code];
      if (!symbol) return;
      event.preventDefault();
      const startColumn = position.column - match[1].length;
      editor.executeEdits("alphabet-symbol-keys", [{
        range: new monaco.Range(position.lineNumber, startColumn, position.lineNumber, position.column),
        text: symbol,
        forceMoveMarkers: true,
      }]);
      editor.setPosition({ lineNumber: position.lineNumber, column: startColumn + symbol.length });
      editor.pushUndoStop();
    });
  };

  const openDialog = (nextDialog: DialogState, suggested = "") => {
    setDialog(nextDialog);
    setDialogValue(suggested);
    setDialogError("");
  };

  const createProjectFromName = (name: string) => {
    const color = PROJECT_COLORS[workspace.projects.length % PROJECT_COLORS.length];
    const project = createProject(name, color);
    setWorkspace((current) => ({ projects: [...current.projects, project], activeProjectId: project.id }));
    setPanelMode("files");
    setProjectRailExpanded(false);
    setDirtyFileIds(new Set());
    setDialog(null);
  };

  const makeNode = (kind: NodeKind, parentId: string | null, name: string) => {
    const node: WorkspaceNode = { id: newId(), name, kind, parentId, ...(kind === "file" ? { content: "" } : {}) };
    updateProject(activeProject.id, (project) => ({
      ...project,
      nodes: [...project.nodes, node],
      ...(kind === "file" ? { activeFileId: node.id, openFileIds: [...project.openFileIds, node.id] } : {}),
    }));
    setDialog(null);
    setDialogError("");
  };

  const removeNode = (nodeId: string) => {
    const removing = new Set([nodeId]);
    let extended = true;
    while (extended) {
      extended = false;
      activeProject.nodes.forEach((node) => {
        if (node.parentId && removing.has(node.parentId) && !removing.has(node.id)) {
          removing.add(node.id);
          extended = true;
        }
      });
    }
    updateProject(activeProject.id, (project) => {
      const nodes = project.nodes.filter((node) => !removing.has(node.id));
      const openFileIds = project.openFileIds.filter((id) => !removing.has(id));
      return {
        ...project,
        nodes,
        openFileIds,
        activeFileId: removing.has(project.activeFileId ?? "") ? openFileIds[0] ?? null : project.activeFileId,
      };
    });
    setDirtyFileIds((current) => new Set([...current].filter((id) => !removing.has(id))));
    setDialog(null);
  };

  const moveNode = (nodeId: string, parentId: string | null): boolean => {
    const moving = activeProject.nodes.find((node) => node.id === nodeId);
    if (!moving || moving.id === parentId || (parentId && isWithin(activeProject.nodes, moving.id, parentId))) return false;
    if (parentId && activeProject.nodes.find((node) => node.id === parentId)?.kind !== "folder") return false;
    if (moving.parentId === parentId) return true;
    const duplicate = activeProject.nodes.some((node) =>
      node.id !== moving.id && node.parentId === parentId && node.name.toLowerCase() === moving.name.toLowerCase(),
    );
    if (duplicate) return false;
    updateProject(activeProject.id, (project) => ({
      ...project,
      nodes: project.nodes.map((node) => node.id === nodeId ? { ...node, parentId } : node),
    }));
    return true;
  };

  const submitDialog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog) return;
    if (dialog.type === "delete-node") {
      removeNode(dialog.nodeId);
      return;
    }
    if (dialog.type === "delete-project") {
      if (workspace.projects.length <= 1) return;
      const remaining = workspace.projects.filter((project) => project.id !== dialog.projectId);
      const nextActive = dialog.projectId === workspace.activeProjectId ? remaining[0].id : workspace.activeProjectId;
      setWorkspace({ projects: remaining, activeProjectId: nextActive });
      setDirtyFileIds(new Set());
      setDialog(null);
      return;
    }

    const name = dialogValue.trim();
    if (dialog.type === "move-node") {
      const parentId = dialogValue === "__root__" ? null : dialogValue;
      if (!moveNode(dialog.nodeId, parentId)) {
        setDialogError("That name is already in this folder.");
        return;
      }
      setDialog(null);
      return;
    }
    if (!name) {
      setDialogError("Add a name first.");
      return;
    }
    if (name === "." || name === ".." || /[\\/]/.test(name)) {
      setDialogError("Use a name without slashes.");
      return;
    }

    if (dialog.type === "new-project") {
      if (workspace.projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
        setDialogError("A project with that name already exists.");
        return;
      }
      createProjectFromName(name);
      return;
    }
    if (dialog.type === "new-node") {
      const duplicate = activeProject.nodes.some((node) => node.parentId === dialog.parentId && node.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        setDialogError("That name is already here.");
        return;
      }
      makeNode(dialog.kind, dialog.parentId, name);
      return;
    }
    if (dialog.type === "rename-project") {
      const duplicate = workspace.projects.some((project) => project.id !== dialog.projectId && project.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        setDialogError("A project with that name already exists.");
        return;
      }
      setWorkspace((current) => ({
        ...current,
        projects: current.projects.map((project) => project.id === dialog.projectId ? { ...project, name } : project),
      }));
      setDialog(null);
      return;
    }
    if (dialog.type === "rename-node") {
      const node = activeProject.nodes.find((item) => item.id === dialog.nodeId);
      if (!node) return;
      const duplicate = activeProject.nodes.some((item) => item.id !== node.id && item.parentId === node.parentId && item.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        setDialogError("That name is already here.");
        return;
      }
      updateProject(activeProject.id, (project) => ({
        ...project,
        nodes: project.nodes.map((item) => item.id === node.id ? { ...item, name } : item),
      }));
      setDialog(null);
    }
  };

  const closeTab = (fileId: string) => {
    updateProject(activeProject.id, (project) => {
      const openFileIds = project.openFileIds.filter((id) => id !== fileId);
      return {
        ...project,
        openFileIds,
        activeFileId: project.activeFileId === fileId ? openFileIds[openFileIds.length - 1] ?? null : project.activeFileId,
      };
    });
  };

  const searchResults = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return [];
    return activeProject.nodes.filter((node) => node.kind === "file" && (
      node.name.toLowerCase().includes(query) || (node.content ?? "").toLowerCase().includes(query)
    ));
  }, [activeProject.nodes, searchText]);

  const dialogTitle = dialog?.type === "new-project" ? "Create a project"
    : dialog?.type === "new-node" ? `New ${dialog.kind}`
      : dialog?.type === "move-node" ? "Move this item"
      : dialog?.type === "rename-node" ? "Rename"
        : dialog?.type === "rename-project" ? "Rename project"
          : dialog?.type === "delete-node" ? "Delete this item?"
            : dialog?.type === "delete-project" ? "Delete this project?" : "";

  const nodeForDialog = dialog?.type === "rename-node" || dialog?.type === "delete-node" || dialog?.type === "move-node"
    ? activeProject.nodes.find((node) => node.id === dialog.nodeId) : undefined;
  const projectForDialog = dialog?.type === "rename-project" || dialog?.type === "delete-project"
    ? workspace.projects.find((project) => project.id === dialog.projectId) : undefined;
  const isConfirmDialog = dialog?.type === "delete-node" || dialog?.type === "delete-project";

  return (
    <main className="nerd-app">
      <header className="app-titlebar">
        <div className="brand-lockup">
          <img src="/nerd-space-mark.svg" alt="" className="brand-mark" />
          <span className="brand-wordmark">nerd<span>space</span></span>
          <span className="titlebar-divider" />
          <span className="titlebar-project">{activeProject?.name ?? "No project"}</span>
          <select
            className="mobile-project-picker"
            value={workspace.activeProjectId}
            aria-label="Choose project"
            onChange={(event) => {
              if (event.target.value === "__create_project__") {
                openDialog({ type: "new-project" });
                return;
              }
              setWorkspace((current) => ({ ...current, activeProjectId: event.target.value }));
              setDirtyFileIds(new Set());
            }}
          >
            {workspace.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
            <option value="__create_project__">+ Create project</option>
          </select>
          <ChevronRight size={13} className="titlebar-crumb" />
          <span className="titlebar-file">{activeFile ? fullPath(activeProject, activeFile) : "Your workspace"}</span>
        </div>
        <div className="titlebar-right">
          <span className="titlebar-state"><span className="titlebar-state__dot" />Local workspace</span>
          <button className="titlebar-icon mobile-files-button" title="Open files" aria-label="Open files" onClick={() => { setPanelMode("files"); setMobileExplorerOpen((open) => !open); }}><Files size={16} /></button>
          <button className="titlebar-icon" title="Alphabet symbol keys" aria-label="Toggle alphabet symbol keys" onClick={() => { setSymbolMode((enabled) => !enabled); setPaletteOpen(true); }}><Keyboard size={15} /></button>
        </div>
      </header>

      <div
        className={`workspace-shell ${mobileExplorerOpen ? "workspace-shell--mobile-files" : ""}`}
        onClick={(event) => {
          if (mobileExplorerOpen && !(event.target as HTMLElement).closest(".explorer-panel")) setMobileExplorerOpen(false);
        }}
      >
        <nav className="activity-rail" aria-label="Workspace views">
          <div className="activity-rail__top">
            <button className={`activity-button ${panelMode === "files" ? "activity-button--active" : ""}`} title="Files" aria-label="Show files" onClick={() => setPanelMode("files")}><Files size={19} strokeWidth={1.7} /></button>
            <button className={`activity-button ${panelMode === "search" ? "activity-button--active" : ""}`} title="Search" aria-label="Search project files" onClick={() => setPanelMode("search")}><Search size={19} strokeWidth={1.7} /></button>
          </div>
          <div className="activity-rail__bottom"><span className="activity-orbit"><Code2 size={16} /></span></div>
        </nav>

        <ProjectRail
          projects={workspace.projects}
          activeProjectId={activeProject.id}
          expanded={projectRailExpanded}
          onToggle={() => setProjectRailExpanded((expanded) => !expanded)}
          onSelect={(id) => {
            setWorkspace((current) => ({ ...current, activeProjectId: id }));
            setDirtyFileIds(new Set());
            setPanelMode("files");
          }}
          onCreate={() => openDialog({ type: "new-project" })}
          onRename={(project) => openDialog({ type: "rename-project", projectId: project.id }, project.name)}
          onDelete={(project) => openDialog({ type: "delete-project", projectId: project.id })}
        />

        {panelMode === "files" ? (
          <Explorer
            projectName={activeProject.name}
            nodes={activeProject.nodes}
            activeFileId={activeProject.activeFileId}
            dirtyFileIds={dirtyFileIds}
            onOpenFile={openFile}
            onCreate={(kind, parentId) => openDialog({ type: "new-node", kind, parentId }, kind === "file" ? "untitled.ts" : "new-folder")}
            onRename={(node) => openDialog({ type: "rename-node", nodeId: node.id }, node.name)}
            onDelete={(node) => openDialog({ type: "delete-node", nodeId: node.id })}
            onMoveRequest={(node) => openDialog({ type: "move-node", nodeId: node.id }, node.parentId ?? "__root__")}
            onMove={moveNode}
          />
        ) : (
          <aside className="explorer-panel search-panel" aria-label="Search project">
            <div className="explorer-heading"><span>SEARCH</span><button className="icon-button" onClick={() => { setSearchText(""); setPanelMode("files"); }} aria-label="Close search"><X size={15} /></button></div>
            <label className="search-field"><Search size={14} /><input autoFocus value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Find in this project" /></label>
            <div className="search-results">
              {searchText.trim() && searchResults.length === 0 && <div className="search-empty">No matches yet</div>}
              {searchResults.map((node) => (
                <button className="search-result" key={node.id} onClick={() => openFile(node)}>
                  <span className="search-result__file"><span className={`search-result__dot search-result__dot--${fileTypeForName(node.name)}`} />{node.name}</span>
                  <span className="search-result__path">{fullPath(activeProject, node)}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        <section className="editor-workspace" aria-label="Code editor">
          <div className="editor-tabs-bar">
            <div className="editor-tabs">
              {openFiles.map((file) => {
                const selected = file.id === activeFile?.id;
                return (
                  <button className={`editor-tab ${selected ? "editor-tab--active" : ""}`} key={file.id} onClick={() => openFile(file)} title={fullPath(activeProject, file)}>
                    <span className={`tab-file-dot tab-file-dot--${fileTypeForName(file.name)}`} />
                    <span className="editor-tab__name">{file.name}</span>
                    {dirtyFileIds.has(file.id) && <span className="editor-tab__dirty" aria-label="Edited since last save" />}
                    <span className="editor-tab__close" role="button" aria-label={`Close ${file.name}`} onClick={(event) => { event.stopPropagation(); closeTab(file.id); }}><X size={13} /></span>
                  </button>
                );
              })}
              {openFiles.length === 0 && <span className="no-tabs-label">A fresh page</span>}
            </div>
            <div className="editor-tools">
              <div className="symbol-control-wrap">
                <button className={`symbol-mode-button ${symbolMode ? "symbol-mode-button--on" : ""}`} aria-pressed={symbolMode} title="Use alphabet codes for symbols" onClick={() => { setSymbolMode((enabled) => !enabled); setPaletteOpen((open) => !open); }}>
                  <Keyboard size={14} /><span>ABC</span><span className="symbol-mode-indicator" />
                </button>
                {paletteOpen && <SymbolPalette onClose={() => setPaletteOpen(false)} />}
              </div>
              <span className="tool-divider" />
              <button className="editor-save-button" title="Save changes (Ctrl/Cmd + S)" aria-label="Save changes" onClick={saveCurrentProject}><Check size={15} /><span>Save</span></button>
            </div>
          </div>

          <div className="editor-body">
            {activeFile ? (
              <Editor
                path={`${activeProject.name}/${fullPath(activeProject, activeFile)}`}
                language={languageForFile(activeFile.name)}
                value={activeFile.content ?? ""}
                onChange={(value) => updateFileContent(activeFile.id, value ?? "")}
                onMount={onEditorMount}
                loading={<div className="editor-loading"><span className="loading-orbit" />Opening your editor</div>}
                theme="nerd-space"
                options={{
                  automaticLayout: true,
                  fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
                  fontSize: 13,
                  lineHeight: 21,
                  fontLigatures: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  renderLineHighlight: "line",
                  roundedSelection: true,
                  tabSize: 2,
                  wordWrap: "off",
                  padding: { top: 20, bottom: 18 },
                  scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9 },
                  bracketPairColorization: { enabled: true },
                }}
              />
            ) : (
              <div className="welcome-state">
                <div className="welcome-mark"><img src="/nerd-space-mark.svg" alt="" /></div>
                <p className="welcome-eyebrow">A NEW LITTLE SPACE</p>
                <h1>Make room for an idea.</h1>
                <p className="welcome-copy">Open a file, or add one to this project.</p>
                <button className="welcome-button" onClick={() => openDialog({ type: "new-node", kind: "file", parentId: null }, "untitled.ts")}><FilePlus2 size={15} /> Add a file</button>
              </div>
            )}
          </div>

          <footer className="status-bar">
            <div className="status-bar__left"><span className="status-ready"><span className="status-ready__dot" />Ready</span><span className="status-divider" /><span>{projectFileCount} {projectFileCount === 1 ? "file" : "files"}</span></div>
            <div className="status-bar__right">
              {activeFile && <><span>{savePulse ? "Saving to this device" : dirtyFileIds.has(activeFile.id) ? "Edited · saved locally" : "Saved on this device"}</span><span className="status-divider" /><span>Spaces: 2</span><span className="status-divider" /><span>UTF-8</span><span className="status-divider" /><span>{displayLanguage(language)}</span></>}
              {symbolMode && <span className="status-symbol-mode"><Keyboard size={12} /> ABC keys on</span>}
            </div>
          </footer>
        </section>
      </div>

      {dialog && (
        <div className="dialog-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section className="workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <div className="workspace-dialog__top"><div className="dialog-mark"><Code2 size={17} /></div><button className="icon-button" onClick={() => setDialog(null)} aria-label="Close dialog"><X size={17} /></button></div>
            <h2 id="dialog-title">{dialogTitle}</h2>
            {isConfirmDialog ? (
              <>
                <p className="dialog-copy">{dialog.type === "delete-node" ? <>“{nodeForDialog?.name}” and the items inside it will be removed.</> : <>“{projectForDialog?.name}” and all its files will be removed from this device.</>}</p>
                <div className="dialog-actions"><button className="dialog-secondary" onClick={() => setDialog(null)}>Keep it</button><button className="dialog-danger" onClick={(event) => submitDialog(event as unknown as FormEvent<HTMLFormElement>)}><Trash2 size={14} /> Delete</button></div>
              </>
            ) : dialog.type === "move-node" ? (
              <form onSubmit={submitDialog}>
                <label className="dialog-label" htmlFor="move-target">Move to</label>
                <select id="move-target" className="dialog-input" autoFocus value={dialogValue} onChange={(event) => { setDialogValue(event.target.value); setDialogError(""); }}>
                  <option value="__root__">Project root</option>
                  {activeProject.nodes
                    .filter((node) => node.kind === "folder" && node.id !== nodeForDialog?.id && (!nodeForDialog || !isWithin(activeProject.nodes, nodeForDialog.id, node.id)))
                    .map((folder) => <option value={folder.id} key={folder.id}>{fullPath(activeProject, folder)}</option>)}
                </select>
                {dialogError && <p className="dialog-error">{dialogError}</p>}
                <div className="dialog-actions"><button type="button" className="dialog-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="dialog-primary" type="submit"><Check size={14} /> Move</button></div>
              </form>
            ) : (
              <form onSubmit={submitDialog}>
                <label className="dialog-label" htmlFor="workspace-name">Name</label>
                <input id="workspace-name" className="dialog-input" autoFocus value={dialogValue} onChange={(event) => { setDialogValue(event.target.value); setDialogError(""); }} placeholder="Give it a name" />
                {dialogError && <p className="dialog-error">{dialogError}</p>}
                <div className="dialog-actions"><button type="button" className="dialog-secondary" onClick={() => setDialog(null)}>Cancel</button><button className="dialog-primary" type="submit"><Check size={14} /> Done</button></div>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

export default Home;
