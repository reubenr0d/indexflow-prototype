// Unit tests for the Responses API dispatch layer in scripts/agent-runner.mjs.
//
// Three concerns:
//   1. `modelRequiresResponsesApi` — only codex-family GPT-5 names should
//      route to /v1/responses. Trading models (gpt-4o, gpt-5, gpt-5-mini)
//      must keep using chat-completions or trading vaults regress to a
//      transparent translation layer they don't need.
//   2. `translateToResponsesRequest` — schema-pinning for the request
//      body the runner sends to OpenAI. Round-trip every role/message
//      shape the runner actually emits (system → instructions, user,
//      assistant text + tool_calls, tool result), plus the tools array
//      flattening with `strict: false`.
//   3. `translateFromResponsesResponse` — schema-pinning for the
//      synthesised chat-completions-shape choice the runner's call sites
//      expect. Tool-call round-trip uses `call_id` as the chat-completions
//      `id` so `pushRejectedToolResponses` keeps working unchanged.
//
// All helpers are pure (no fetch, no module state, no env reads).

import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  modelRequiresResponsesApi,
  translateToResponsesRequest,
  translateFromResponsesResponse,
} from "./agent-runner.mjs";

// ---------------------------------------------------------------------------
// modelRequiresResponsesApi
// ---------------------------------------------------------------------------

test("modelRequiresResponsesApi: gpt-5-codex routes to /v1/responses", () => {
  assert.equal(modelRequiresResponsesApi("gpt-5-codex"), true);
});

test("modelRequiresResponsesApi: gpt-5.1-codex routes to /v1/responses", () => {
  assert.equal(modelRequiresResponsesApi("gpt-5.1-codex"), true);
});

test("modelRequiresResponsesApi: dated codex snapshots route to /v1/responses", () => {
  assert.equal(modelRequiresResponsesApi("gpt-5-codex-2025-09-15"), true);
  assert.equal(modelRequiresResponsesApi("gpt-5.1-codex-preview-2026-01-10"), true);
});

test("modelRequiresResponsesApi: trading models stay on chat-completions", () => {
  for (const m of ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-5", "gpt-5-mini"]) {
    assert.equal(modelRequiresResponsesApi(m), false, `${m} should NOT route to /v1/responses`);
  }
});

test("modelRequiresResponsesApi: surrounding whitespace + case insensitivity", () => {
  assert.equal(modelRequiresResponsesApi("  GPT-5-CODEX  "), true);
  assert.equal(modelRequiresResponsesApi("Gpt-5-Codex"), true);
});

test("modelRequiresResponsesApi: missing/empty/non-string is false", () => {
  assert.equal(modelRequiresResponsesApi(""), false);
  assert.equal(modelRequiresResponsesApi("   "), false);
  assert.equal(modelRequiresResponsesApi(undefined), false);
  assert.equal(modelRequiresResponsesApi(null), false);
  assert.equal(modelRequiresResponsesApi(42), false);
});

// ---------------------------------------------------------------------------
// translateToResponsesRequest
// ---------------------------------------------------------------------------

test("translateToResponsesRequest: first system message becomes top-level instructions", () => {
  const body = translateToResponsesRequest({
    messages: [
      { role: "system", content: "You are SELF-IMPROVER." },
      { role: "user", content: "Do the thing." },
    ],
    model: "gpt-5-codex",
  });
  assert.equal(body.model, "gpt-5-codex");
  assert.equal(body.instructions, "You are SELF-IMPROVER.");
  assert.equal(body.store, false);
  assert.deepEqual(body.input, [
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Do the thing." }],
    },
  ]);
});

test("translateToResponsesRequest: subsequent system messages fall through as developer items", () => {
  const body = translateToResponsesRequest({
    messages: [
      { role: "system", content: "primary" },
      { role: "user", content: "hi" },
      { role: "system", content: "addendum" },
    ],
    model: "gpt-5-codex",
  });
  assert.equal(body.instructions, "primary");
  assert.deepEqual(body.input[1], {
    type: "message",
    role: "developer",
    content: [{ type: "input_text", text: "addendum" }],
  });
});

test("translateToResponsesRequest: assistant tool_calls → function_call items, keeping call_id stable", () => {
  const body = translateToResponsesRequest({
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "go" },
      {
        role: "assistant",
        content: "I'll fetch the signals first.",
        tool_calls: [
          {
            id: "call_abc123",
            type: "function",
            function: {
              name: "get_self_improvement_signals",
              arguments: JSON.stringify({ limit: 5 }),
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_abc123",
        content: JSON.stringify({ signals: [] }),
      },
    ],
    model: "gpt-5-codex",
  });

  // user, assistant message (text), assistant function_call, tool output
  assert.equal(body.input.length, 4);
  assert.deepEqual(body.input[1], {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "I'll fetch the signals first." }],
  });
  assert.deepEqual(body.input[2], {
    type: "function_call",
    call_id: "call_abc123",
    name: "get_self_improvement_signals",
    arguments: JSON.stringify({ limit: 5 }),
  });
  assert.deepEqual(body.input[3], {
    type: "function_call_output",
    call_id: "call_abc123",
    output: JSON.stringify({ signals: [] }),
  });
});

test("translateToResponsesRequest: empty-content assistant with tool_calls emits only function_call items", () => {
  const body = translateToResponsesRequest({
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "go" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_x",
            type: "function",
            function: { name: "noop", arguments: "{}" },
          },
        ],
      },
    ],
    model: "gpt-5-codex",
  });
  assert.equal(body.input.length, 2);
  assert.equal(body.input[1].type, "function_call");
  assert.equal(body.input[1].call_id, "call_x");
});

test("translateToResponsesRequest: tools flattened with strict:false to preserve optional MCP fields", () => {
  const body = translateToResponsesRequest({
    messages: [{ role: "system", content: "sys" }],
    tools: [
      {
        type: "function",
        function: {
          name: "wire_asset",
          description: "Register an asset",
          parameters: {
            type: "object",
            properties: {
              symbol: { type: "string" },
              seedPriceUsd: { type: "number" },
            },
            required: ["symbol"],
          },
        },
      },
    ],
    model: "gpt-5-codex",
  });
  assert.deepEqual(body.tools, [
    {
      type: "function",
      name: "wire_asset",
      description: "Register an asset",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          seedPriceUsd: { type: "number" },
        },
        required: ["symbol"],
      },
      strict: false,
    },
  ]);
});

test("translateToResponsesRequest: omits tools field entirely when none provided (risk-officer path)", () => {
  const body = translateToResponsesRequest({
    messages: [
      { role: "system", content: "RO" },
      { role: "user", content: "Vet this batch." },
    ],
    tools: undefined,
    temperature: 0,
    model: "gpt-5-codex",
  });
  assert.equal("tools" in body, false);
  assert.equal("temperature" in body, false);
});

test("translateToResponsesRequest: temperature dropped for codex-family models, passed through for non-codex models forced via LLM_USE_RESPONSES_API", () => {
  const codexWithTemp = translateToResponsesRequest({
    messages: [{ role: "system", content: "x" }],
    temperature: 0.1,
    model: "gpt-5-codex",
  });
  assert.equal("temperature" in codexWithTemp, false);

  const codexWithoutTemp = translateToResponsesRequest({
    messages: [{ role: "system", content: "x" }],
    model: "gpt-5-codex",
  });
  assert.equal("temperature" in codexWithoutTemp, false);

  const nonCodexWithTemp = translateToResponsesRequest({
    messages: [{ role: "system", content: "x" }],
    temperature: 0.1,
    model: "gpt-4o",
  });
  assert.equal(nonCodexWithTemp.temperature, 0.1);
});

test("translateToResponsesRequest: assistant tool_call with object arguments is JSON-stringified", () => {
  const body = translateToResponsesRequest({
    messages: [
      { role: "system", content: "sys" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_obj",
            type: "function",
            function: { name: "foo", arguments: { a: 1, b: "two" } },
          },
        ],
      },
    ],
    model: "gpt-5-codex",
  });
  assert.equal(body.input[0].arguments, JSON.stringify({ a: 1, b: "two" }));
});

// ---------------------------------------------------------------------------
// translateFromResponsesResponse
// ---------------------------------------------------------------------------

test("translateFromResponsesResponse: text-only response → finish_reason 'stop', no tool_calls field", () => {
  const out = translateFromResponsesResponse({
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "All clear." }],
      },
    ],
  });
  assert.equal(out.choices.length, 1);
  const choice = out.choices[0];
  assert.equal(choice.finish_reason, "stop");
  assert.equal(choice.message.role, "assistant");
  assert.equal(choice.message.content, "All clear.");
  assert.equal("tool_calls" in choice.message, false);
});

test("translateFromResponsesResponse: function_call items → tool_calls with id := call_id", () => {
  const out = translateFromResponsesResponse({
    output: [
      {
        type: "function_call",
        call_id: "call_xyz",
        name: "propose_file_edit",
        arguments: JSON.stringify({ path: "a.md", search: "x", replace: "y" }),
      },
    ],
  });
  const choice = out.choices[0];
  assert.equal(choice.finish_reason, "tool_calls");
  assert.equal(choice.message.content, "");
  assert.deepEqual(choice.message.tool_calls, [
    {
      id: "call_xyz",
      type: "function",
      function: {
        name: "propose_file_edit",
        arguments: JSON.stringify({ path: "a.md", search: "x", replace: "y" }),
      },
    },
  ]);
});

test("translateFromResponsesResponse: mixed text + function_call surface both", () => {
  const out = translateFromResponsesResponse({
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: "Proposing one edit." },
          { type: "output_text", text: " Standing by." },
        ],
      },
      {
        type: "function_call",
        call_id: "call_1",
        name: "propose_file_edit",
        arguments: "{}",
      },
    ],
  });
  const choice = out.choices[0];
  assert.equal(choice.message.content, "Proposing one edit. Standing by.");
  assert.equal(choice.message.tool_calls?.length, 1);
  assert.equal(choice.message.tool_calls[0].id, "call_1");
  assert.equal(choice.finish_reason, "tool_calls");
});

test("translateFromResponsesResponse: reasoning items are ignored", () => {
  const out = translateFromResponsesResponse({
    output: [
      { type: "reasoning", summary: [{ type: "summary_text", text: "thinking..." }] },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Done." }],
      },
    ],
  });
  assert.equal(out.choices[0].message.content, "Done.");
  assert.equal("tool_calls" in out.choices[0].message, false);
});

test("translateFromResponsesResponse: object-shaped arguments on a function_call are JSON-stringified", () => {
  const out = translateFromResponsesResponse({
    output: [
      {
        type: "function_call",
        call_id: "call_obj",
        name: "foo",
        arguments: { a: 1 },
      },
    ],
  });
  assert.equal(
    out.choices[0].message.tool_calls[0].function.arguments,
    JSON.stringify({ a: 1 }),
  );
});

test("translateFromResponsesResponse: empty/missing output → finish_reason 'stop' with empty content", () => {
  for (const json of [{ output: [] }, {}, { output: null }]) {
    const out = translateFromResponsesResponse(json);
    assert.equal(out.choices[0].finish_reason, "stop");
    assert.equal(out.choices[0].message.content, "");
    assert.equal("tool_calls" in out.choices[0].message, false);
  }
});

// ---------------------------------------------------------------------------
// Round-trip: a chat-completions-shape conversation translated to the
// responses request, with a synthesised responses-shape reply translated
// back, should preserve `tool_call_id`/`call_id`/`id` linkage end-to-end.
// This is the invariant `pushRejectedToolResponses` and the
// `role: "tool"` follow-up depend on.
// ---------------------------------------------------------------------------

test("round-trip: tool id flows assistant.tool_calls.id ↔ function_call.call_id ↔ choice.tool_calls.id", () => {
  const reqBody = translateToResponsesRequest({
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "go" },
    ],
    tools: [
      {
        type: "function",
        function: { name: "t", description: "", parameters: { type: "object" } },
      },
    ],
    model: "gpt-5-codex",
  });
  // The model's reply (function_call item):
  const fakeResponse = {
    output: [
      {
        type: "function_call",
        call_id: "call_round_trip",
        name: "t",
        arguments: "{}",
      },
    ],
  };
  const choice = translateFromResponsesResponse(fakeResponse).choices[0];
  assert.equal(choice.message.tool_calls[0].id, "call_round_trip");

  // The runner pushes choice.message back into `messages` and then a
  // role:"tool" follow-up with tool_call_id := the same id. Translating
  // the resulting messages array back to a responses request body must
  // re-emit the function_call_output with the matching call_id.
  const followUp = translateToResponsesRequest({
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "go" },
      choice.message,
      {
        role: "tool",
        tool_call_id: choice.message.tool_calls[0].id,
        content: JSON.stringify({ ok: true }),
      },
    ],
    model: "gpt-5-codex",
  });
  const out = followUp.input.find((it) => it.type === "function_call_output");
  assert.ok(out, "function_call_output should be present in the follow-up");
  assert.equal(out.call_id, "call_round_trip");

  // Sanity: the original request shape exists too.
  assert.equal(reqBody.model, "gpt-5-codex");
});
