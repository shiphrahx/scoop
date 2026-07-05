// Posts to the sign-out route handler, which clears the session server-side.
export default function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="rounded-full border-2 border-[var(--border)] px-5 py-2 text-sm font-extrabold text-[var(--muted)] transition active:scale-95"
      >
        Sign out
      </button>
    </form>
  );
}
