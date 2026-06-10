import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Translatarr",
    short_name: "Translatarr",
    description: "Provider-agnostic LLM translation app",
    start_url: "/",
    display: "standalone",
    background_color: "#0b100f",
    theme_color: "#0b100f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
