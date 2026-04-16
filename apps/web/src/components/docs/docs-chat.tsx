"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X, Sparkles, CornerDownLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";

const STARTER_QUESTIONS = [
  "How do deposits and withdrawals work?",
  "What oracle does IndexFlow use?",
  "Explain the share price mechanism",
  "How does the AI agent manage vaults?",
];

const transport = new DefaultChatTransport({
  api: "/api/docs-chat",
});

function getTextContent(parts: unknown[]): string {
  return (parts ?? [])
    .filter(
      (p): p is { type: "text"; text: string } =>
        typeof p === "object" &&
        p !== null &&
        (p as Record<string, unknown>).type === "text" &&
        typeof (p as Record<string, unknown>).text === "string",
    )
    .map((p) => p.text)
    .join("");
}

export function DocsChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status, error } = useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    await sendMessage({ text: trimmed });
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-app-accent/30 bg-app-accent px-4 py-2.5 text-sm font-medium text-app-accent-fg shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Open docs chat"
        >
          <Sparkles className="h-4 w-4" />
          Ask AI
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[min(520px,calc(100vh-6rem))] w-[min(400px,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-app-accent" />
              <span className="text-sm font-semibold text-app-text">
                Ask the docs
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-app-muted transition-colors hover:bg-app-surface-hover hover:text-app-text"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && !isLoading ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-app-accent/10">
                  <Sparkles className="h-5 w-5 text-app-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-app-text">
                    IndexFlow Docs Assistant
                  </p>
                  <p className="mt-1 text-xs text-app-muted">
                    Ask anything about the protocol
                  </p>
                </div>
                <div className="mt-2 flex w-full flex-col gap-2">
                  {STARTER_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      className="rounded-lg border border-app-border px-3 py-2 text-left text-xs text-app-muted transition-colors hover:border-app-accent/30 hover:bg-app-surface-hover hover:text-app-text"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => {
                  const text = getTextContent(msg.parts);
                  if (!text) return null;

                  return (
                    <div
                      key={msg.id}
                      className={
                        msg.role === "user" ? "flex justify-end" : "flex"
                      }
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-app-accent/15 text-app-text"
                            : "bg-app-bg-subtle text-app-text"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <div className="docs-chat-prose prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-headings:my-2 prose-a:text-app-accent">
                            <ReactMarkdown>{text}</ReactMarkdown>
                          </div>
                        ) : (
                          text
                        )}
                      </div>
                    </div>
                  );
                })}
                {isLoading &&
                  messages[messages.length - 1]?.role === "user" && (
                    <div className="flex">
                      <div className="rounded-lg bg-app-bg-subtle px-3 py-2">
                        <div className="flex gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-app-muted [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-app-muted [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-app-muted" />
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-lg border border-app-danger/30 bg-app-danger/5 px-3 py-2 text-xs text-app-danger">
                Failed to get a response. Please try again.
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="border-t border-app-border px-3 py-3"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                className="flex-1 rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none transition-colors placeholder:text-app-muted/60 focus:border-app-accent/40"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-app-accent text-app-accent-fg transition-opacity disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-app-muted/50">
              <CornerDownLeft className="h-2.5 w-2.5" />
              to send
            </p>
          </form>
        </div>
      )}
    </>
  );
}
