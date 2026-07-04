import SignOutButton from "@/components/SignOutButton";

export default function MePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
      <span className="text-5xl" aria-hidden>
        🙂
      </span>
      <h1 className="text-2xl font-extrabold">Me</h1>
      <p className="text-sm text-black/50 dark:text-white/50">
        Profile and settings coming soon.
      </p>
      <SignOutButton />
    </main>
  );
}
