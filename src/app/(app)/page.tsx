import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    "there";

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pt-8 pb-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-black/50 dark:text-white/50">Welcome</p>
          <h1 className="text-2xl font-extrabold">Hi, {name} 👋</h1>
        </div>
        <SignOutButton />
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-black/10 p-8 text-center dark:border-white/15">
        <span className="text-5xl" aria-hidden>
          🍦
        </span>
        <p className="text-lg font-semibold">Nothing here yet</p>
        <p className="max-w-xs text-sm text-black/50 dark:text-white/50">
          Your macros for today will show up here once onboarding is built.
        </p>
      </section>
    </main>
  );
}
