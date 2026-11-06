import { useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileJson,
  FilePlus2,
  FileText,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { fileTypeForName, sortedChildren, type NodeKind, type WorkspaceNode } from "@/lib/workspace";

interface ExplorerProps {
  projectName: string;
  nodes: WorkspaceNode[];
  activeFileId: string | null;
  dirtyFileIds: Set<string>;
  onOpenFile: (node: WorkspaceNode) => void;
  onCreate: (kind: NodeKind, parentId: string | null) => void;
  onRename: (node: WorkspaceNode) => void;
  onDelete: (node: WorkspaceNode) => void;
  onMoveRequest: (node: WorkspaceNode) => void;
  onMove: (nodeId: string, parentId: string | null) => boolean;
}

function FileGlyph({ name }: { name: string }) {
  const type = fileTypeForName(name);
  if (type === "json") return <FileJson className="file-glyph file-glyph--json" size={15} strokeWidth={1.8} />;
  if (type === "code") return <FileCode2 className="file-glyph file-glyph--code" size={15} strokeWidth={1.8} />;
  if (type === "text") return <FileText className="file-glyph file-glyph--text" size={15} strokeWidth={1.8} />;
  if (type === "style") return <FileCode2 className="file-glyph file-glyph--style" size={15} strokeWidth={1.8} />;
  return <File className="file-glyph" size={15} strokeWidth={1.8} />;
}

export default function Explorer({
  projectName,
  nodes,
  activeFileId,
  dirtyFileIds,
  onOpenFile,
  onCreate,
  onRename,
  onDelete,
  onMoveRequest,
  onMove,
}: ExplorerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(nodes.filter((node) => node.kind === "folder").map((node) => node.id)));
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const startDrag = (event: DragEvent, node: WorkspaceNode) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.id);
    setDragging(node.id);
  };

  const handleDrop = (event: DragEvent, parentId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = event.dataTransfer.getData("text/plain");
    if (nodeId) onMove(nodeId, parentId);
    if (parentId) setExpanded((current) => new Set(current).add(parentId));
    setDragTarget(null);
    setDragging(null);
  };

  const beginCreate = (kind: NodeKind, parentId: string | null) => {
    if (parentId) setExpanded((current) => new Set(current).add(parentId));
    onCreate(kind, parentId);
  };

  const renderNodes = (parentId: string | null, depth: number): ReactNode =>
    sortedChildren(nodes, parentId).map((node) => {
      const isFolder = node.kind === "folder";
      const isExpanded = expanded.has(node.id);
      const isActive = node.id === activeFileId;
      const isDirty = dirtyFileIds.has(node.id);
      return (
        <div className="tree-node" key={node.id}>
          <div
            className={`tree-row ${isActive ? "tree-row--active" : ""} ${dragging === node.id ? "tree-row--dragging" : ""} ${dragTarget === node.id ? "tree-row--drop" : ""}`}
            draggable
            onDragStart={(event) => startDrag(event, node)}
            onDragEnd={() => {
              setDragging(null);
              setDragTarget(null);
            }}
            onDragOver={(event) => {
              if (isFolder) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragTarget(node.id);
              }
            }}
            onDragLeave={() => setDragTarget((current) => current === node.id ? null : current)}
            onDrop={(event) => isFolder && handleDrop(event, node.id)}
          >
            <button
              className="tree-row__main"
              style={{ paddingLeft: `${10 + depth * 15}px` }}
              onClick={() => {
                if (isFolder) {
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  });
                } else {
                  onOpenFile(node);
                }
              }}
              title={node.name}
            >
              {isFolder ? (
                isExpanded ? <ChevronDown size={14} className="tree-chevron" /> : <ChevronRight size={14} className="tree-chevron" />
              ) : <span className="tree-chevron-spacer" />}
              {isFolder ? (
                isExpanded ? <FolderOpen size={15} className="folder-glyph" strokeWidth={1.8} /> : <FolderClosed size={15} className="folder-glyph" strokeWidth={1.8} />
              ) : <FileGlyph name={node.name} />}
              <span className="tree-row__label">{node.name}</span>
              {isDirty && <span className="tree-dirty-dot" aria-label="Unsaved changes" />}
            </button>
            <span className="tree-row__actions">
              {isFolder && (
                <>
                  <button className="icon-button tree-action" aria-label={`Add file to ${node.name}`} title="New file" onClick={() => beginCreate("file", node.id)}><FilePlus2 size={14} /></button>
                  <button className="icon-button tree-action" aria-label={`Add folder to ${node.name}`} title="New folder" onClick={() => beginCreate("folder", node.id)}><FolderPlus size={14} /></button>
                </>
              )}
              <button className="icon-button tree-action" aria-label={`Move ${node.name}`} title="Move" onClick={() => onMoveRequest(node)}><ArrowRightLeft size={13} /></button>
              <button className="icon-button tree-action" aria-label={`Rename ${node.name}`} title="Rename" onClick={() => onRename(node)}><Pencil size={13} /></button>
              <button className="icon-button tree-action tree-action--delete" aria-label={`Delete ${node.name}`} title="Delete" onClick={() => onDelete(node)}><Trash2 size={13} /></button>
            </span>
          </div>
          {isFolder && isExpanded && <div className="tree-children">{renderNodes(node.id, depth + 1)}</div>}
        </div>
      );
    });

  return (
    <aside className="explorer-panel" aria-label="File explorer">
      <div className="explorer-heading">
        <span>EXPLORER</span>
        <div className="explorer-tools">
          <button className="icon-button" title="New file" aria-label="New file" onClick={() => onCreate("file", null)}><FilePlus2 size={15} /></button>
          <button className="icon-button" title="New folder" aria-label="New folder" onClick={() => onCreate("folder", null)}><FolderPlus size={15} /></button>
        </div>
      </div>
      <div className="explorer-project-title">
        <ChevronDown size={14} />
        <span>{projectName.toUpperCase()}</span>
      </div>
      <div
        className={`tree-scroll ${dragTarget === "root" ? "tree-scroll--drop" : ""}`}
        onDragOver={(event) => {
          if ((event.target as HTMLElement).closest(".tree-row")) return;
          event.preventDefault();
          setDragTarget("root");
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragTarget(null);
        }}
        onDrop={(event) => {
          if ((event.target as HTMLElement).closest(".tree-row")) return;
          handleDrop(event, null);
        }}
      >
        {nodes.length === 0 ? (
          <div className="tree-empty">
            <span>Your space is ready</span>
            <button onClick={() => onCreate("file", null)}>Add a file</button>
          </div>
        ) : renderNodes(null, 0)}
      </div>
      <div className="explorer-footnote"><span className="status-pip" /> Saved on this device</div>
    </aside>
  );
}
