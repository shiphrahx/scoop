"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, Plus, X } from "lucide-react";

// The event Chromium fires when a site is installable. Not in lib.dom yet.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag, set once the app runs from the home screen.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Whether we should offer the iOS instructions. Fixed for the life of the page,
// so the subscribe callback never has to fire. Read through
// useSyncExternalStore so the server renders `false` and hydration matches.
const neverChanges = () => () => {};
const iosNeedsInstall = () => isIos() && !isStandalone();
const notOnServer = () => false;

// "Add Scoop to your phone." Chromium hands us a real install prompt; iOS has
// no such API, so there we show the Share → Add to Home Screen steps instead.
// Renders nothing when the app is already installed or can't be.
export default function InstallAppButton({
  className = "sc-btn sc-btn-neutral px-7 py-4 text-lg",
}: {
  className?: string;
}) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [installed, setInstalled] = useState(false);
  const ios = useSyncExternalStore(neverChanges, iosNeedsInstall, notOnServer);

  useEffect(() => {
    if (isStandalone()) return;

    const onPrompt = (e: Event) => {
      // Keep the browser's own mini-infobar away; we place the button ourselves.
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setShowIosSteps(false);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (ios) {
      setShowIosSteps((v) => !v);
      return;
    }
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // A prompt can only be used once; drop it either way.
    setPrompt(null);
    if (outcome === "accepted") setInstalled(true);
  }

  // Nothing to offer: already installed, or a browser that can't install.
  if (installed || (!ios && !prompt)) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={install}
        className={className}
        aria-expanded={ios ? showIosSteps : undefined}
      >
        <Download size={20} strokeWidth={2.5} />
        Add to phone
      </button>

      {showIosSteps && (
        <div className="sc-card relative max-w-xs p-5 text-left text-sm">
          <button
            type="button"
            onClick={() => setShowIosSteps(false)}
            aria-label="Close"
            className="absolute right-3 top-3 text-[var(--muted)]"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
          <p className="pr-6 font-semibold">Install on iPhone</p>
          <ol className="mt-3 space-y-2.5 text-[var(--muted)]">
            <li className="flex items-center gap-2">
              <Share size={16} strokeWidth={2.2} className="shrink-0" />
              Tap Share in Safari&rsquo;s toolbar
            </li>
            <li className="flex items-center gap-2">
              <Plus size={16} strokeWidth={2.2} className="shrink-0" />
              Choose &ldquo;Add to Home Screen&rdquo;
            </li>
          </ol>
        </div>
      )}
    </div>
  );
}
