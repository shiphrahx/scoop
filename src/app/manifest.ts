import type { MetadataRoute } from "next";

// Web app manifest — makes Scoop installable to the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scoop — your portion coach",
    short_name: "Scoop",
    description:
      "We tell you the portion to eat to hit your macros. No searching, just scooping.",
    // The installed app opens straight into the app, not the marketing page —
    // otherwise every cold open paid for a full landing render and a second
    // navigation before the user saw a single number. Signed-out visitors are
    // sent to /login by the proxy, so nothing is exposed.
    start_url: "/dashboard",
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
