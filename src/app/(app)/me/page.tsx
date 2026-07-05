import ApiKeySettings from "./ApiKeySettings";
import SignOutButton from "@/components/SignOutButton";
import { hasApiKey } from "@/lib/queries";

export default async function MePage() {
  const connected = await hasApiKey();

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-5 pt-8 pb-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-green-500 text-5xl shadow-[0_5px_0_0_#15803d]">
          🙂
        </span>
        <h1 className="text-3xl font-black">Me</h1>
      </div>

      <ApiKeySettings connected={connected} />

      <SignOutButton />
    </main>
  );
}
