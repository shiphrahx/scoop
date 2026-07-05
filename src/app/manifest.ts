import type { MetadataRoute } from "next";

// Web app manifest — makes Scoop installable to the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scoop — your portion coach",
    short_name: "Scoop",
    description:
      "We tell you the portion to eat to hit your macros. No searching, just scooping.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#22c55e",
    categories: ["health", "fitness", "food"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
