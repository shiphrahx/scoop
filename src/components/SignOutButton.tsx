import { LogOut } from "lucide-react";

// Posts to the sign-out route handler, which clears the session server-side.
export default function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="sc-btn sc-btn-neutral text-sm text-[var(--muted)]"
      >
        <LogOut size={16} />
        Sign out
      </button>
    </form>
  );
}
