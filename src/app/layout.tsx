import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { siteUrl } from "@/lib/site";

const title = "Scoop: your portion coach";
const description =
  "Stop counting. Scoop reads your body data and tells you the exact portion to eat to hit today's macros. Free, installs to your home screen.";

// Plus Jakarta Sans, clean, modern, premium. Two weights: regular + semibold,
// with 700 reserved for the big stat numbers.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

// No mono font here on purpose. The only monospaced text in the whole product
// is the worked example on the marketing page, and loading it from the root
// layout put a second `<link rel=preload as=font>` on the critical path of every
// signed-in screen for a face those screens never render. It now loads from the
// landing page alone (see src/app/page.tsx).

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  // Inner pages set their own title; it lands inside this frame.
  title: { default: title, template: "%s · Scoop" },
  description,
  applicationName: "Scoop",
  appleWebApp: {
    capable: true,
    title: "Scoop",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "Scoop",
    title,
    description,
    url: "/",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Scoop: tell me how much to eat. Stop making me do the math.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#eef4f3",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="sc-bg" aria-hidden />
        {/* With Cache Components on, every route's dynamic (per-user) work needs
            a Suspense boundary above it. This is the outermost one: it lets the
            static shell, <html>, fonts, the background, paint instantly while
            the signed-in layout and page stream in. Inner routes add their own
            (loading.tsx, per-section boundaries) for finer-grained shells; the
            background stays painted throughout, so the fallback is not a blank
            screen. */}
        <Suspense fallback={null}>{children}</Suspense>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
