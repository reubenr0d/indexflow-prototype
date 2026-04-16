import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { Components } from "react-markdown";
import { MermaidBlock } from "@/components/docs/mermaid-block";
import { ContractCallCard } from "@/components/docs/contract-call-card";
import { CopyButton } from "@/components/docs/copy-button";
import { Hash } from "lucide-react";

function codeToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(codeToString).join("");
  return "";
}

function childrenToText(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return childrenToText((children as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return "";
}

const FILENAME_TO_SLUG: Record<string, string> = {
  "README.md": "readme",
  "TECHNICAL_ARCHITECTURE_AND_ROADMAP.md": "technical-architecture-roadmap",
  "INVESTOR_FLOW.md": "investor-flow",
  "ASSET_MANAGER_FLOW.md": "asset-manager-flow",
  "PERP_RISK_MATH.md": "perp-risk-math",
  "OPERATOR_INTERACTIONS.md": "operator-interactions",
  "PRICE_FEED_FLOW.md": "price-feed-flow",
  "ORACLE_SUPPORTED_ASSETS.md": "oracle-supported-assets",
  "GLOBAL_POOL_MANAGEMENT_FLOW.md": "global-pool-management-flow",
  "DEPLOYMENTS.md": "deployments",
  "E2E_TESTING.md": "e2e-testing",
  "SHARE_PRICE_AND_OPERATIONS.md": "share-price-and-operations",
  "PWA_PUSH_NOTIFICATIONS.md": "pwa-push-notifications",
  "UTILITY_TOKEN_TOKENOMICS.md": "utility-token-tokenomics",
  "REGULATORY_ROADMAP_DRAFT.md": "regulatory-roadmap-draft",
  "AGENTS_FRAMEWORK.md": "agents-framework",
  "WHITEPAPER_DRAFT.md": "whitepaper-draft",
};

function rewriteDocsHref(href: string): string {
  const mdMatch = href.match(/(?:\.\/|\.\.\/)?(?:docs\/)?([A-Z_]+\.md)(?:#.*)?$/);
  if (!mdMatch) return href;
  const filename = mdMatch[1];
  const slug = FILENAME_TO_SLUG[filename];
  if (!slug) return href;
  const hash = href.includes("#") ? href.slice(href.indexOf("#")) : "";
  return `/docs/${slug}${hash}`;
}

type CalloutKind = "note" | "warning" | "tip" | "important";
const CALLOUT_STYLES: Record<CalloutKind, { border: string; bg: string; icon: string }> = {
  note: { border: "border-app-accent/50", bg: "bg-app-accent/5", icon: "i" },
  tip: { border: "border-app-success/50", bg: "bg-app-success/5", icon: "lightbulb" },
  warning: { border: "border-app-warning/50", bg: "bg-app-warning/5", icon: "warning" },
  important: { border: "border-app-danger/50", bg: "bg-app-danger/5", icon: "!" },
};

function detectCallout(children: React.ReactNode): { kind: CalloutKind; rest: React.ReactNode } | null {
  const text = childrenToText(children);
  const match = text.match(/^\s*\*?\*?(Note|Warning|Tip|Important):?\*?\*?\s*/i);
  if (!match) return null;
  const kind = match[1].toLowerCase() as CalloutKind;
  return { kind, rest: children };
}

function HeadingAnchor({ id, depth, children, ...props }: { id?: string; depth: number; children: React.ReactNode; [k: string]: unknown }) {
  const sizeClass =
    depth === 1 ? "text-3xl" :
    depth === 2 ? "text-2xl" :
    depth === 3 ? "text-xl" :
    depth === 4 ? "text-lg" :
    "text-base";
  const mtClass = depth <= 2 ? "mt-10" : depth === 3 ? "mt-8" : "mt-6";
  const Tag = `h${depth}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  const showBorder = depth === 2;

  return (
    <Tag
      id={id}
      className={`group relative ${mtClass} ${sizeClass} font-semibold tracking-tight text-app-text ${showBorder ? "border-t border-app-border pt-8" : ""}`}
      {...props}
    >
      {id && (
        <a
          href={`#${id}`}
          className="absolute -left-5 top-1/2 hidden -translate-y-1/2 text-app-muted opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 md:inline-block"
          aria-label={`Link to ${childrenToText(children)}`}
        >
          <Hash className="h-4 w-4" />
        </a>
      )}
      {children}
    </Tag>
  );
}

const components: Components = {
  h1: ({ children, node: _node, ...props }) => <HeadingAnchor depth={1} {...props}>{children}</HeadingAnchor>,
  h2: ({ children, node: _node, ...props }) => <HeadingAnchor depth={2} {...props}>{children}</HeadingAnchor>,
  h3: ({ children, node: _node, ...props }) => <HeadingAnchor depth={3} {...props}>{children}</HeadingAnchor>,
  h4: ({ children, node: _node, ...props }) => <HeadingAnchor depth={4} {...props}>{children}</HeadingAnchor>,
  h5: ({ children, node: _node, ...props }) => <HeadingAnchor depth={5} {...props}>{children}</HeadingAnchor>,
  h6: ({ children, node: _node, ...props }) => <HeadingAnchor depth={6} {...props}>{children}</HeadingAnchor>,
  p: ({ children, node: _node, ...props }) => {
    const kids = React.Children.toArray(children);
    if (kids.length === 1 && React.isValidElement(kids[0]) && (kids[0] as React.ReactElement<{ src?: string }>).props.src) {
      return <>{children}</>;
    }
    return (
      <p className="mt-3 leading-7 text-app-muted" {...props}>
        {children}
      </p>
    );
  },
  ul: ({ children, node: _node, ...props }) => (
    <ul className="mt-3 list-disc space-y-2 pl-6 text-app-muted" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, node: _node, ...props }) => (
    <ol className="mt-3 list-decimal space-y-2 pl-6 text-app-muted" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, node: _node, ...props }) => (
    <li className="leading-7" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, node: _node, ...props }) => {
    const resolved = href ? rewriteDocsHref(href) : href;
    const isExternal = resolved?.startsWith("http");
    return (
      <a
        href={resolved}
        className="text-app-accent underline decoration-app-accent/50 underline-offset-2 transition-colors hover:decoration-app-accent"
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
        {...props}
      >
        {children}
      </a>
    );
  },
  strong: ({ children, node: _node, ...props }) => (
    <strong className="font-semibold text-app-text" {...props}>{children}</strong>
  ),
  em: ({ children, node: _node, ...props }) => (
    <em className="text-app-muted/90" {...props}>{children}</em>
  ),
  hr: () => (
    <hr className="my-8 border-t border-app-border" />
  ),
  img: ({ src, alt, node: _node, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ""} className="mt-6 block w-full rounded-lg border border-app-border" {...props} />
  ),
  blockquote: ({ children, node: _node, ...props }) => {
    const callout = detectCallout(children);
    if (callout) {
      const style = CALLOUT_STYLES[callout.kind];
      return (
        <aside className={`mt-4 rounded-lg border-l-4 ${style.border} ${style.bg} px-4 py-3`} {...props}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-app-text">{callout.kind}</p>
          <div className="text-sm leading-relaxed text-app-muted [&>p]:mt-1">{callout.rest}</div>
        </aside>
      );
    }
    return (
      <blockquote className="mt-4 border-l-4 border-app-border-strong bg-app-bg-subtle/60 px-4 py-3 text-app-muted [&>p]:mt-1" {...props}>
        {children}
      </blockquote>
    );
  },
  table: ({ children, node: _node, ...props }) => (
    <div className="mt-4 overflow-x-auto rounded-lg border border-app-border">
      <table className="w-full border-collapse text-sm text-app-muted" {...props}>
        {children}
      </table>
    </div>
  ),
  pre: ({ children }) => <>{children}</>,
  th: ({ children, node: _node, ...props }) => (
    <th className="border-b border-app-border bg-app-surface px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-app-text" {...props}>
      {children}
    </th>
  ),
  td: ({ children, node: _node, ...props }) => (
    <td className="border-b border-app-border/50 px-3 py-2.5 align-top" {...props}>
      {children}
    </td>
  ),
  code: ({ className, children, node: _node, ...props }) => {
    const raw = codeToString(children).replace(/\n$/, "");
    const match = /language-([\w-]+)/.exec(className ?? "");
    const language = match?.[1]?.toLowerCase();

    if (language === "mermaid") {
      return <MermaidBlock chart={raw} />;
    }

    if (language === "contract-call") {
      return <ContractCallCard raw={raw} />;
    }

    if (!className) {
      return (
        <code className="rounded bg-app-bg-subtle px-1.5 py-0.5 font-mono text-[0.8125rem] text-app-text" {...props}>
          {children}
        </code>
      );
    }

    return (
      <div className="group/code relative mt-4">
        <div className="absolute right-2 top-2 z-10">
          <CopyButton text={raw} />
        </div>
        {language && (
          <div className="absolute left-3 top-2 select-none font-mono text-[10px] uppercase tracking-wider text-app-muted/50">
            {language}
          </div>
        )}
        <pre className="overflow-x-auto rounded-lg border border-app-border bg-app-bg p-4 pt-8 text-[0.8125rem] leading-relaxed text-app-muted">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  },
};

export function DocsMarkdownContent({ markdown }: { markdown: string }) {
  return (
    <div className="docs-prose max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
