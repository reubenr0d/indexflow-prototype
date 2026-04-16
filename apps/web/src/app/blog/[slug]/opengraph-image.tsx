import { ImageResponse } from "next/og";
import { getPostBySlug, getAllPostSlugs } from "@/lib/blog.server";

export const runtime = "nodejs";
export const alt = "IndexFlow Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  const slugs = await getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

export default async function BlogOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  const title = post?.title ?? "IndexFlow Blog";
  const tags = post?.tags ?? [];
  const date = post
    ? new Date(post.date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const readingTime = post?.readingTime ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          background:
            "linear-gradient(135deg, #0a0f1a 0%, #0f172a 50%, #134e4a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
          padding: "60px",
        }}
      >
        {/* Top: Logo + Blog label */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <svg width="40" height="40" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="16" fill="white" />
            <polygon points="16,8 8,24 24,24" fill="#0d9488" />
          </svg>
          <span
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#f1f5f9",
              letterSpacing: "-0.5px",
            }}
          >
            IndexFlow
          </span>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "#2dd4bf",
              textTransform: "uppercase",
              letterSpacing: "3px",
              marginLeft: "8px",
            }}
          >
            Blog
          </span>
        </div>

        {/* Center: Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <p
            style={{
              fontSize: title.length > 60 ? "36px" : "44px",
              fontWeight: 700,
              color: "#f1f5f9",
              lineHeight: 1.2,
              maxWidth: "1000px",
              margin: 0,
            }}
          >
            {title}
          </p>
        </div>

        {/* Bottom: Tags + date */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", gap: "10px" }}>
            {tags.slice(0, 4).map((tag) => (
              <div
                key={tag}
                style={{
                  background: "rgba(13, 148, 136, 0.15)",
                  border: "1px solid rgba(13, 148, 136, 0.3)",
                  borderRadius: "20px",
                  padding: "6px 16px",
                  fontSize: "14px",
                  color: "#2dd4bf",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                {tag}
              </div>
            ))}
          </div>
          {date && (
            <div
              style={{
                display: "flex",
                gap: "16px",
                fontSize: "16px",
                color: "#94a3b8",
              }}
            >
              <span>{date}</span>
              {readingTime > 0 && <span>{readingTime} min read</span>}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
