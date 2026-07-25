import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep a recently-visited screen in the client cache instead of re-fetching
    // it from the server on every tab tap. Next's default for dynamic routes is
    // 0s, which means bouncing Home → Plan → Home pays a full server render (and
    // its Supabase round trips) each way — on mobile data that is seconds of
    // staring at a skeleton for a screen the phone had a moment ago.
    //
    // Safe here because every mutation goes through a server action that calls
    // revalidatePath, which drops these entries: logging food or a weight still
    // shows up immediately.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
