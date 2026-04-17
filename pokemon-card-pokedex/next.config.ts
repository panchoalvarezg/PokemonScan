import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    // Tesseract.js se usa sólo en el cliente; lo excluimos del bundle server.
    serverActions: { bodySizeLimit: "8mb" },
  },
  // Permite que la función de escaneo acepte imágenes grandes.
  serverExternalPackages: ["tesseract.js"],
};

export default nextConfig;
