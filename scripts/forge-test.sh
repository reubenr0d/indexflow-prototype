#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/reuben/Desktop/minestarters/code/snx-prototype"
PATH="/Users/reuben/.foundry/bin:$PATH"

if ! command -v forge >/dev/null 2>&1; then
  echo "forge not found. Install Foundry or ensure /Users/reuben/.foundry/bin is available." >&2
  exit 127
fi

if command -v jq >/dev/null 2>&1; then
  tmp_output="$(mktemp)"
  trap 'rm -f "$tmp_output"' EXIT

  set +e
  forge test --root "$ROOT" --json "$@" >"$tmp_output"
  status=$?
  set -e

  jq -r '
    def alltests:
      [to_entries[]
       | .key as $suite
       | .value.test_results
       | to_entries[]
       | {
           suite: $suite,
           name: .key,
           status: .value.status,
           reason: (.value.reason // "")
         }];
    alltests as $tests
    | ($tests | map(select(.status != "Success"))) as $fails
    | "Ran \($tests | length) tests across \((to_entries | length)) suites.",
      "Failures: \($fails | length)",
      ($fails[]? | "- \(.suite)::\(.name) => \(.status)" + (if .reason != "" then " (\(.reason))" else "" end))
  ' "$tmp_output"

  exit "$status"
fi

forge test --root "$ROOT" --json "$@"
