import type { MetadataRoute } from "next";

// Web app manifest, makes Scoop installable to the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scoop: your portion coach",
    short_name: "Scoop",
    description:
      "We tell you the portion to eat to hit your macros. No searching, just scooping.",
    // The installed app opens straight into the app, not the marketing page,
    // otherwise every cold open paid for a full landing render and a second
    // navigation before the user saw a single number. Signed-out visitors are
    // sent to /login by the proxy, so nothing is exposed.
    start_url: "/dashboard",
    scope: "/",
    // Pinned so changing start_url later can't make the browser treat this as a
    // different app and orphan everyone's installed icon.
    id: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    // Tapping the icon when Scoop is already running focuses that window and
    // navigates it, instead of tearing down and cold-starting a second one.
    // A cold start is the slowest way into the app; this skips it entirely for
    // the common case of coming back to an app still in memory.
    launch_handler: { client_mode: "navigate-existing" },
    orientation: "portrait",
    // The splash screen the OS paints before the first frame arrives. White
    // flashed against the app's own near-white-teal background on every launch;
    // matching them makes the hand-off invisible, so the launch reads as the app
    // opening rather than a blank page loading. theme_color follows the same
    // value the app sets for the status bar (see viewport in app/layout.tsx),
    // which was green and did not match anything on screen.
    background_color: "#eef4f3",
    theme_color: "#eef4f3",
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
