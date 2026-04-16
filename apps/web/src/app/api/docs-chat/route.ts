import { streamText, type UIMessage, type ModelMessage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getDocsManifest, getDocBySlug } from "@/lib/docs.server";
import { getAllPosts } from "@/lib/blog.server";

let cachedSystemPrompt: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function buildSystemPrompt(): Promise<string> {
  const now = Date.now();
  if (cachedSystemPrompt && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSystemPrompt;
  }

  const manifest = await getDocsManifest();
  const docs = await Promise.all(
    manifest.map(async (entry) => {
      const doc = await getDocBySlug(entry.slug);
      return doc
        ? `## ${doc.title} (${doc.category})\nURL: /docs/${doc.slug}\n\n${doc.content}`
        : "";
    }),
  );

  const posts = await getAllPosts();
  const blogContent = posts.map(
    (post) =>
      `## ${post.title}\nURL: /blog/${post.slug}\nDate: ${post.date}\n\n${post.content}`,
  );

  const prompt = `You are the IndexFlow documentation assistant. Your role is to answer questions about the IndexFlow protocol accurately and helpfully, using ONLY the documentation and blog content provided below.

Rules:
- Answer based strictly on the provided content. Do not invent information.
- When relevant, mention which doc page or blog post contains the answer (e.g. "See the Investor Flow docs at /docs/investor-flow").
- Use clear, concise language. Format answers with markdown when it helps readability.
- If the answer is not covered by the documentation, say so honestly.
- You may synthesize information across multiple documents to give a complete answer.

---
# PROTOCOL DOCUMENTATION
${docs.filter(Boolean).join("\n\n---\n\n")}

---
# BLOG POSTS
${blogContent.join("\n\n---\n\n")}`;

  cachedSystemPrompt = prompt;
  cacheTimestamp = now;
  return prompt;
}

function uiToModelMessages(uiMessages: UIMessage[]): ModelMessage[] {
  return uiMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const textParts = (m.parts ?? []).filter(
        (p): p is { type: "text"; text: string } => p.type === "text",
      );
      const text = textParts.map((p) => p.text).join("");
      return {
        role: m.role as "user" | "assistant",
        content: text,
      };
    });
}

export async function POST(req: Request) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "LLM_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const { messages: uiMessages } = await req.json();

  const systemPrompt = await buildSystemPrompt();
  const modelMessages = uiToModelMessages(uiMessages);

  const provider = createOpenAI({ apiKey });
  const result = streamText({
    model: provider("gpt-4o-mini"),
    system: systemPrompt,
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
