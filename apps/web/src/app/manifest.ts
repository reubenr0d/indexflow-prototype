import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "IndexFlow",
    short_name: "IndexFlow",
    description: "Oracle-priced basket vaults backed by shared perp infrastructure.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0f1a",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "maskable",
      },
    ],
  };
}
