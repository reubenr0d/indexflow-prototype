"use client";

interface ContractCallData {
  fn: string;
  caller: string;
  inputs: string[];
  effects: string[];
  reverts: string[];
}

function parseContractCallBlock(raw: string): ContractCallData {
  const lines = raw.split(/\r?\n/);
  const data: ContractCallData = { fn: "", caller: "", inputs: [], effects: [], reverts: [] };
  let currentSection: "inputs" | "effects" | "reverts" | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("function:")) {
      data.fn = trimmed.slice("function:".length).trim();
      currentSection = null;
    } else if (trimmed.startsWith("caller:")) {
      data.caller = trimmed.slice("caller:".length).trim();
      currentSection = null;
    } else if (trimmed === "inputs:") {
      currentSection = "inputs";
    } else if (trimmed === "effects:") {
      currentSection = "effects";
    } else if (trimmed === "reverts:") {
      currentSection = "reverts";
    } else if (trimmed.startsWith("- ") && currentSection) {
      data[currentSection].push(trimmed.slice(2).trim());
    }
  }

  return data;
}

function splitFunctionName(fn: string): { contract: string; method: string } {
  const dotIdx = fn.indexOf(".");
  if (dotIdx === -1) return { contract: "", method: fn };
  return { contract: fn.slice(0, dotIdx), method: fn.slice(dotIdx + 1) };
}

export function ContractCallCard({ raw }: { raw: string }) {
  const data = parseContractCallBlock(raw);
  const { contract, method } = splitFunctionName(data.fn);

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-app-accent/30 bg-app-surface">
      <div className="flex items-center gap-3 border-b border-app-accent/20 bg-app-accent/5 px-4 py-3">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-app-accent/20 text-xs font-bold text-app-accent">
          Tx
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold text-app-text">
            {contract && <span className="text-app-muted">{contract}.</span>}
            {method}
          </p>
        </div>
        {data.caller && (
          <span className="shrink-0 rounded-full border border-app-border bg-app-bg px-2.5 py-0.5 text-[11px] font-medium text-app-muted">
            {data.caller}
          </span>
        )}
      </div>

      <div className="space-y-3 px-4 py-3">
        {data.inputs.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-app-muted/60">
              Inputs
            </p>
            <div className="space-y-1">
              {data.inputs.map((input, i) => {
                const colonIdx = input.indexOf(":");
                const param = colonIdx > -1 ? input.slice(0, colonIdx).trim() : input;
                const desc = colonIdx > -1 ? input.slice(colonIdx + 1).trim() : "";
                return (
                  <div key={i} className="flex gap-2 text-sm">
                    <code className="shrink-0 rounded bg-app-bg-subtle px-1.5 py-0.5 font-mono text-xs text-app-text">
                      {param}
                    </code>
                    {desc && <span className="text-app-muted">{desc}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {data.effects.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-app-muted/60">
              Effects
            </p>
            <ul className="space-y-1">
              {data.effects.map((effect, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-app-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-app-success" />
                  {effect}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.reverts.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-app-muted/60">
              Reverts when
            </p>
            <ul className="space-y-1">
              {data.reverts.map((revert, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-app-muted">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-app-warning" />
                  {revert}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
