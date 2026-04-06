import { InfoLabel } from "@/components/ui/info-tooltip";

export function AdminBasketsHeaderRow() {
  return (
    <div className="flex items-center gap-4 px-6 py-3 text-xs font-medium uppercase tracking-wider text-app-muted">
      <span className="flex-1">
        <InfoLabel label="Name" tooltipKey="tableName" />
      </span>
      <span className="w-24 text-right">
        <InfoLabel label="TVL" tooltipKey="tableTvl" />
      </span>
      <span className="w-16 text-right">
        <InfoLabel label="Assets" tooltipKey="tableAssets" />
      </span>
      <span className="w-24 text-right">
        <InfoLabel label="Perp" tooltipKey="tablePerp" />
      </span>
      <span className="w-20 text-right">
        <InfoLabel label="Blend" tooltipKey="tableBlend" />
      </span>
      <span className="w-20 text-right">
        <InfoLabel label="Address" tooltipKey="tableAddress" />
      </span>
    </div>
  );
}
