const fs = require("fs");
const path = require("path");

const contracts = [
  "BasketVault",
  "BasketFactory",
  "BasketShareToken",
  "PerpReader",
  "VaultAccounting",
  "OracleAdapter",
  "PricingEngine",
  "FundingRateManager",
  "AssetWiring",
];

const outDir = path.join(__dirname, "..", "out");
const abiDir = path.join(__dirname, "..", "apps", "web", "src", "abi");

for (const c of contracts) {
  const filePath = path.join(outDir, c + ".sol", c + ".json");
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const dest = path.join(abiDir, c + ".ts");
  fs.writeFileSync(dest, "export const " + c + "ABI = " + JSON.stringify(data.abi) + " as const;\n");
}

const barrel = contracts.map((c) => `export { ${c}ABI } from "./${c}";`).join("\n") + "\n";
fs.writeFileSync(path.join(abiDir, "contracts.ts"), barrel);

console.log("Extracted " + contracts.length + " ABIs to " + abiDir + " (individual files + barrel)");
