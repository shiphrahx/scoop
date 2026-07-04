import ApiKeySettings from "./ApiKeySettings";
import SignOutButton from "@/components/SignOutButton";
import { hasApiKey } from "@/lib/queries";

export default async function MePage() {
  const connected = await hasApiKey();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-5 pt-8 pb-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-5xl" aria-hidden>
          🙂
        </span>
        <h1 className="text-2xl font-extrabold">Me</h1>
      </div>

      <ApiKeySettings connected={connected} />

      <SignOutButton />
    </main>
  );
}
