#!/usr/bin/env node

/**
 * Backward-compatible wrapper — runs the sample-vault-manager agent via the
 * generic agent runner. Use `npm run agent` or `npm run agent:dry`.
 */

import { runAgent } from "./agent-runner.mjs";

runAgent("sample-vault-manager").catch(() => process.exit(1));
