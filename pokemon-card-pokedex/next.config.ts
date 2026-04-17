import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` genera un build auto-contenido en `.next/standalone` que se
  // copia tal cual al contenedor Docker; sin esto la imagen pesa varios GB.
  output: "standalone",
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
