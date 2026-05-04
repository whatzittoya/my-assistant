"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Post } from "@/types";

type Node = Post & { children: Node[] };

function buildTree(posts: Post[]): Node[] {
  const byId = new Map<string, Node>();
  for (const p of posts) byId.set(p.postId, { ...p, children: [] });

  const roots: Node[] = [];
  for (const n of byId.values()) {
    if (n.parentPostId && byId.has(n.parentPostId)) {
      byId.get(n.parentPostId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }

  function sortRec(nodes: Node[]) {
    nodes.sort((a, b) => (a.datetimeIso ?? "").localeCompare(b.datetimeIso ?? ""));
    for (const n of nodes) sortRec(n.children);
  }
  sortRec(roots);

  return roots;
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const CLAMP_PX = 120;

function CollapsibleContent({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (ref.current) setOverflow(ref.current.scrollHeight > CLAMP_PX + 4);
  }, [html]);

  return (
    <div>
      <div
        ref={ref}
        className="prose prose-sm dark:prose-invert max-w-none overflow-hidden transition-all"
        style={{ maxHeight: expanded ? undefined : CLAMP_PX }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-primary hover:underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}

type RenderActions = (post: Post) => React.ReactNode;

function PostNode({
  node,
  isRoot,
  renderActions,
  highlightPostId,
}: {
  node: Node;
  isRoot: boolean;
  renderActions?: RenderActions;
  highlightPostId?: string;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const isHighlighted = highlightPostId === node.postId;

  const tone = isHighlighted
    ? "border-yellow-400 bg-yellow-50 dark:border-yellow-500 dark:bg-yellow-950/30 ring-2 ring-yellow-300 dark:ring-yellow-600"
    : node.isMyPost
      ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
      : node.iRepliedToThis
        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
        : "bg-card";

  const actions = renderActions?.(node);

  return (
    <div id={`post-${node.postId}`} className="space-y-2">
      <div className={`rounded-lg border p-4 transition-colors duration-300 ${tone}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center rounded p-0.5 hover:bg-muted"
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          <span className="font-semibold">{node.author || "Prompt"}</span>
          {node.isMyPost && (
            <Badge variant="default" className="text-xs">
              Me
            </Badge>
          )}
          {!node.isMyPost && node.iRepliedToThis && (
            <Badge
              variant="outline"
              className="border-emerald-400 text-xs text-emerald-700 dark:text-emerald-300"
            >
              You replied
            </Badge>
          )}
          {isRoot && (
            <Badge variant="outline" className="text-xs">
              Prompt
            </Badge>
          )}
          {node.rating !== null && (
            <Badge variant="secondary" className="text-xs">
              Score {node.rating}
              {node.ratingCount ? ` (${node.ratingCount})` : ""}
            </Badge>
          )}
          {node.datetimeIso && (
            <span className="text-muted-foreground">{fmtDate(node.datetimeIso)}</span>
          )}
          {!open && hasChildren && (
            <span className="text-xs text-muted-foreground">
              {node.children.length} repl{node.children.length === 1 ? "y" : "ies"} hidden
            </span>
          )}
          {node.subject && !isRoot && open && (
            <span className="text-muted-foreground">· {node.subject}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {open && hasChildren && (
              <span className="text-xs text-muted-foreground">
                {node.children.length} repl{node.children.length === 1 ? "y" : "ies"}
              </span>
            )}
            {actions}
          </div>
        </div>
        {open && <CollapsibleContent html={node.contentHtml} />}
      </div>

      {hasChildren && open && (
        <div className="ml-4 space-y-2 border-l pl-4 md:ml-6 md:pl-6">
          {node.children.map((c) => (
            <PostNode key={c.postId} node={c} isRoot={false} renderActions={renderActions} highlightPostId={highlightPostId} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PostThread({
  posts,
  renderActions,
  highlightPostId,
}: {
  posts: Post[];
  renderActions?: RenderActions;
  highlightPostId?: string;
}) {
  const roots = useMemo(() => buildTree(posts), [posts]);

  if (roots.length === 0) {
    return <p className="text-sm text-muted-foreground">No posts collected yet.</p>;
  }

  return (
    <div className="space-y-3">
      {roots.map((r) => (
        <PostNode key={r.postId} node={r} isRoot renderActions={renderActions} highlightPostId={highlightPostId} />
      ))}
    </div>
  );
}
