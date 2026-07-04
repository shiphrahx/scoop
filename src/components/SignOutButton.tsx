// Posts to the sign-out route handler, which clears the session server-side.
export default function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold text-black/60 transition active:scale-95 dark:border-white/15 dark:text-white/60"
      >
        Sign out
      </button>
    </form>
  );
}
