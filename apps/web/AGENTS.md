<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Docs Sync Rule (Codex/Cursor Agents)

For any app-visible behavior, UX, terminology, or workflow change in `apps/web`:

- Update in-app wiki content in `apps/web/src/lib/wiki.ts`.
- Update tooltip/help copy in `apps/web/src/lib/tooltip-copy.ts` when affected.
- Update corresponding canonical markdown docs under `/docs` and `README.md` when they cover the same flow.
- Keep `/docs` route map and labels aligned with `docs/README.md`.
- Do not finish the task without either updating both surfaces (markdown + in-app) or explicitly stating why no doc sync was needed.
