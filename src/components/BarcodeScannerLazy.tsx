"use client";

// The camera scanner, fetched the moment it's opened and not before.
//
// zxing is around half a megabyte and it sat in the static import graph of three
// screens, including "Log food", the most-used flow on the phone, so every
// visit paid to download and parse a decoder that only runs if the user taps
// Scan. Every caller renders it behind `{scanning && …}`, so this swaps a
// download at page load for one at the tap that needs it.

import dynamic from "next/dynamic";
import { Camera } from "lucide-react";

const BarcodeScanner = dynamic(() => import("./BarcodeScanner"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--scrim)]">
      <div className="flex flex-col items-center gap-2 text-white">
        <Camera size={28} />
        <p className="text-sm">Starting the camera…</p>
      </div>
    </div>
  ),
});

export default BarcodeScanner;
