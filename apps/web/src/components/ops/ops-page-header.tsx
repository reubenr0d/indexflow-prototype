import { ExternalLink } from "lucide-react";

interface OpsPageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  sourceRepo: string;
  sourceFile: string;
  sourceLabel?: string;
}

export function OpsPageHeader({
  eyebrow,
  title,
  description,
  sourceRepo,
  sourceFile,
  sourceLabel,
}: OpsPageHeaderProps) {
  const path = sourceFile.split("#")[0];
  return (
    <header className="mb-8">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-app-accent">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-app-text">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-app-muted">{description}</p>
      <a
        href={`${sourceRepo}/blob/main/${sourceFile}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-app-muted underline-offset-2 hover:text-app-text hover:underline"
      >
        <ExternalLink className="h-3 w-3" />
        src · {sourceLabel ?? path}
      </a>
    </header>
  );
}
