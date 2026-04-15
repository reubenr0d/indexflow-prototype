import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "@privy-io/react-auth",
      "wagmi",
      "viem",
      "@tanstack/react-query",
      "graphql",
      "graphql-request",
      "react-markdown",
    ],
  },
};

export default nextConfig;
