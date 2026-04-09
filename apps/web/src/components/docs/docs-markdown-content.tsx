import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { Components } from "react-markdown";
import { MermaidBlock } from "@/components/docs/mermaid-block";

function codeToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(codeToString).join("");
  return "";
}

const components: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="text-3xl font-semibold tracking-tight text-app-text" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mt-8 text-2xl font-semibold text-app-text" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mt-6 text-xl font-semibold text-app-text" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="mt-3 leading-7 text-app-muted" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="mt-3 list-disc space-y-2 pl-6 text-app-muted" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="mt-3 list-decimal space-y-2 pl-6 text-app-muted" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="leading-7" {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-app-accent underline decoration-app-accent/50 underline-offset-2 hover:decoration-app-accent"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noreferrer" : undefined}
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="mt-4 border-l-4 border-app-border-strong bg-app-bg-subtle px-4 py-2 text-app-muted" {...props}>
      {children}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm text-app-muted" {...props}>
        {children}
      </table>
    </div>
  ),
  pre: ({ children }) => <>{children}</>,
  th: ({ children, ...props }) => (
    <th className="border border-app-border bg-app-surface px-3 py-2 text-left font-semibold text-app-text" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-app-border px-3 py-2 align-top" {...props}>
      {children}
    </td>
  ),
  code: ({ className, children, ...props }) => {
    const raw = codeToString(children).replace(/\n$/, "");
    const match = /language-(\w+)/.exec(className ?? "");
    const language = match?.[1]?.toLowerCase();

    if (language === "mermaid") {
      return <MermaidBlock chart={raw} />;
    }

    if (!className) {
      return (
        <code className="rounded bg-app-bg px-1 py-0.5 font-mono text-xs text-app-text" {...props}>
          {children}
        </code>
      );
    }

    return (
      <pre className="mt-4 overflow-x-auto rounded-lg border border-app-border bg-app-bg p-4 text-xs text-app-muted">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    );
  },
};

export function DocsMarkdownContent({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
