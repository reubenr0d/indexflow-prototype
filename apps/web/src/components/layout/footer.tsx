import Link from "next/link";
import { Code, Send, BookOpen, FileText, BarChart3, Scale, Shield } from "lucide-react";

const TELEGRAM_URL = "https://t.me/+gNSBM_gBQ1NkNTY1";
const GITHUB_URL = "https://github.com/reubenr0d/indexflow-prototype";

const productLinks = [
  { href: "/baskets", label: "Baskets", Icon: BarChart3 },
  { href: "/docs", label: "Docs", Icon: BookOpen },
  { href: "/", label: "Home", Icon: FileText },
  { href: "/terms", label: "Terms", Icon: Scale },
  { href: "/privacy", label: "Privacy", Icon: Shield },
];

const developerLinks = [
  { href: GITHUB_URL, label: "GitHub", Icon: Code, external: true },
  { href: TELEGRAM_URL, label: "Whitepaper", Icon: FileText, external: true },
];

const communityLinks = [
  { href: TELEGRAM_URL, label: "Telegram", Icon: Send, external: true },
];

function ExtOrIntLink({
  href,
  external,
  className,
  children,
}: {
  href: string;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-app-border bg-app-bg-subtle">
      {/* Telegram CTA banner */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-between gap-4 rounded-xl border border-app-accent/30 bg-app-accent/5 px-6 py-4 transition-colors hover:border-app-accent/50 hover:bg-app-accent/10"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-app-accent text-app-accent-fg">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-app-text">
                Join the community
              </p>
              <p className="text-sm text-app-muted">
                Chat with the team and other builders on Telegram.
              </p>
            </div>
          </div>
          <span className="hidden shrink-0 rounded-md bg-app-accent px-4 py-2 text-sm font-semibold text-app-accent-fg transition-opacity group-hover:opacity-90 sm:inline-flex">
            Open Telegram
          </span>
        </a>
      </div>

      {/* Link columns */}
      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-10 sm:grid-cols-3 sm:px-6">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-app-muted">
            Product
          </h4>
          <ul className="mt-3 space-y-2">
            {productLinks.map((l) => (
              <li key={l.href}>
                <ExtOrIntLink
                  href={l.href}
                  className="inline-flex items-center gap-2 text-sm text-app-text transition-colors hover:text-app-accent"
                >
                  <l.Icon className="h-3.5 w-3.5 text-app-muted" />
                  {l.label}
                </ExtOrIntLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-app-muted">
            Developers
          </h4>
          <ul className="mt-3 space-y-2">
            {developerLinks.map((l) => (
              <li key={l.href}>
                <ExtOrIntLink
                  href={l.href}
                  external={l.external}
                  className="inline-flex items-center gap-2 text-sm text-app-text transition-colors hover:text-app-accent"
                >
                  <l.Icon className="h-3.5 w-3.5 text-app-muted" />
                  {l.label}
                </ExtOrIntLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-app-muted">
            Community
          </h4>
          <ul className="mt-3 space-y-2">
            {communityLinks.map((l) => (
              <li key={l.href}>
                <ExtOrIntLink
                  href={l.href}
                  external={l.external}
                  className="inline-flex items-center gap-2 text-sm text-app-text transition-colors hover:text-app-accent"
                >
                  <l.Icon className="h-3.5 w-3.5 text-app-muted" />
                  {l.label}
                </ExtOrIntLink>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="border-t border-app-border py-6 text-center text-xs text-app-muted">
        IndexFlow — prototype interface. Not financial advice. Smart contracts
        carry risk.
      </div>
    </footer>
  );
}
