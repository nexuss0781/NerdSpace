import * as monaco from "monaco-editor";

export type NodeKind = "file" | "folder";

export interface WorkspaceNode {
  id: string;
  name: string;
  kind: NodeKind;
  parentId: string | null;
  content?: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  nodes: WorkspaceNode[];
  openFileIds: string[];
  activeFileId: string | null;
}

export interface WorkspaceState {
  projects: Project[];
  activeProjectId: string;
}

export const WORKSPACE_STORAGE_KEY = "nerd-space.workspace.v1";

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createProject(name: string, color = "#83a8ff"): Project {
  const folderId = newId();
  const indexId = newId();
  const readmeId = newId();
  return {
    id: newId(),
    name,
    color,
    nodes: [
      { id: folderId, name: "src", kind: "folder", parentId: null },
      {
        id: indexId,
        name: "index.ts",
        kind: "file",
        parentId: folderId,
        content: "// Your project starts here.\n\nexport function start() {\n  return \"Hello, world!\";\n}\n",
      },
      {
        id: readmeId,
        name: "README.md",
        kind: "file",
        parentId: null,
        content: `# ${name}\n\nA little space for your next idea.\n`,
      },
    ],
    openFileIds: [indexId],
    activeFileId: indexId,
  };
}

function createStarterWorkspace(): WorkspaceState {
  const project = createProject("Nerd Space", "#a6d98e");
  const indexFile = project.nodes.find((node) => node.name === "index.ts");
  if (indexFile) {
    indexFile.content = `type SpaceObject = {\n  name: string;\n  kind: "planet" | "star";\n  color: string;\n};\n\nconst littleUniverse: SpaceObject[] = [\n  { name: "Luna", kind: "planet", color: "#b5a5ff" },\n  { name: "Sol", kind: "star", color: "#f7c873" },\n];\n\nexport function greet(name: string) {\n  return \`Hello, \${name}. Welcome to your space.\`;\n}\n\nconsole.log(greet("coder"));\n`;
  }
  return { projects: [project], activeProjectId: project.id };
}

export function loadWorkspace(): WorkspaceState {
  if (typeof window === "undefined") return createStarterWorkspace();
  try {
    const saved = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!saved) return createStarterWorkspace();
    const parsed = JSON.parse(saved) as WorkspaceState;
    if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) return createStarterWorkspace();
    const activeProjectId = parsed.projects.some((project) => project.id === parsed.activeProjectId)
      ? parsed.activeProjectId
      : parsed.projects[0].id;
    return { projects: parsed.projects, activeProjectId };
  } catch {
    return createStarterWorkspace();
  }
}

export function saveWorkspace(state: WorkspaceState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep editing available if browser storage is disabled or full.
  }
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  asm: "plaintext",
  bash: "shell",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  csharp: "csharp",
  css: "css",
  csv: "plaintext",
  dart: "dart",
  dockerfile: "dockerfile",
  ex: "elixir",
  go: "go",
  gql: "graphql",
  graphql: "graphql",
  h: "cpp",
  hpp: "cpp",
  html: "html",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  kt: "kotlin",
  lua: "lua",
  md: "markdown",
  mjs: "javascript",
  php: "php",
  pl: "perl",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sass: "scss",
  scss: "scss",
  sh: "shell",
  sql: "sql",
  swift: "swift",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  vue: "html",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

export function languageForFile(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const commonLanguage = LANGUAGE_BY_EXTENSION[extension];
  if (commonLanguage) return commonLanguage;

  const lowerName = name.toLowerCase();
  const registeredLanguage = monaco.languages.getLanguages().find((language) =>
    language.filenames?.some((filename) => filename.toLowerCase() === lowerName)
    || language.extensions?.some((suffix) => lowerName.endsWith(suffix.toLowerCase()))
    || language.filenamePatterns?.some((pattern) => {
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
      return new RegExp(`^${escaped}$`, "i").test(name);
    }),
  );
  return registeredLanguage?.id ?? "plaintext";
}

export function fileTypeForName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "json") return "json";
  if (["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "c", "cpp"].includes(extension)) return "code";
  if (["css", "scss", "html", "xml"].includes(extension)) return "style";
  if (["md", "txt"].includes(extension)) return "text";
  return "other";
}

export function sortedChildren(nodes: WorkspaceNode[], parentId: string | null) {
  return nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
}
