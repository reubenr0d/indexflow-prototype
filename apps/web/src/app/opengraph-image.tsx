import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "IndexFlow — Oracle-priced basket vaults";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0a0f1a 0%, #0f172a 50%, #134e4a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "40px",
          }}
        >
          <svg width="64" height="64" viewBox="0 0 32 32">
            <circle cx="16" cy="16" r="16" fill="white" />
            <polygon points="16,8 8,24 24,24" fill="#0d9488" />
          </svg>
          <span
            style={{
              fontSize: "56px",
              fontWeight: 700,
              color: "#f1f5f9",
              letterSpacing: "-1px",
            }}
          >
            IndexFlow
          </span>
        </div>
        <p
          style={{
            fontSize: "28px",
            color: "#94a3b8",
            textAlign: "center",
            maxWidth: "800px",
            lineHeight: 1.4,
          }}
        >
          Oracle-priced basket vaults backed by shared perpetual infrastructure
        </p>
        <div
          style={{
            display: "flex",
            gap: "24px",
            marginTop: "40px",
          }}
        >
          {["Deposit USDC", "Earn Exposure", "Verifiable Pricing"].map((label) => (
            <div
              key={label}
              style={{
                background: "rgba(13, 148, 136, 0.15)",
                border: "1px solid rgba(13, 148, 136, 0.3)",
                borderRadius: "8px",
                padding: "12px 24px",
                fontSize: "18px",
                color: "#2dd4bf",
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
