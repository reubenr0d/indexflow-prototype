import { DollarSign } from "lucide-react";
import type { Budgets } from "@/lib/ops-types";

interface BudgetsTableProps {
  budgets: Budgets;
}

export function BudgetsTable({ budgets }: BudgetsTableProps) {
  const rows = [
    ...budgets.active.map((b) => ({ ...b, state: "active" as const })),
    ...budgets.proposedOnPromotion.map((b) => ({ ...b, state: "proposed" as const })),
  ];
  if (rows.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <header className="flex items-center gap-2 text-app-muted">
        <DollarSign className="h-4 w-4" />
        <h2 className="text-xs font-semibold uppercase tracking-wider">
          Budgets — monthly caps enforced via Paperclip
        </h2>
      </header>
      <p className="mt-2 max-w-2xl text-sm text-app-muted">
        Active total {budgets.defaultCurrency} {budgets.totalActive}/month. If
        every brainstormed agent ships:{" "}
        <span className="text-app-text">
          {budgets.defaultCurrency} {budgets.totalIfAllPromoted}/month
        </span>
        . 100% spend auto-pauses the employee; 80% surfaces a soft warning.
      </p>
      <div className="mt-5 overflow-x-auto rounded-lg border border-app-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-app-bg-subtle text-xs uppercase tracking-wider text-app-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium text-right">Monthly cap (USD)</th>
              <th className="px-3 py-2 font-medium text-right">Soft warn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.employee}-${row.state}`}
                className="border-t border-app-border odd:bg-app-surface"
              >
                <td className="px-3 py-2 font-mono text-xs text-app-text">{row.employee}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      row.state === "active"
                        ? "text-app-success"
                        : "text-app-warning"
                    }
                  >
                    {row.state}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">${row.monthlyCapUsd}</td>
                <td className="px-3 py-2 text-right tabular-nums text-app-muted">
                  {row.softWarnPct ? `${row.softWarnPct}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
