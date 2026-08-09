<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes, APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Preflight

Two gates, both versioned in `.githooks` and wired up by the `prepare` script,
so `npm install` on a fresh clone is enough to get them:

- **commit** → `npm run preflight`, typecheck + tests, ~15s.
- **push** → `npm run preflight:full`, adds lint, the coverage ratchet and a
  build, ~90s.

CI runs `preflight:full` too, on every branch. If it passes here it passes
there, with one exception: `tests/rls.test.ts` skips without `DATABASE_URL`, so
the "one user cannot read another's rows" suite only really runs in CI, against
a real Postgres. A change to a migration or an RLS policy is not proven locally.

`--no-verify` bypasses either hook. Fine for a deliberate WIP commit; not fine
as a way past a failing test.

The hooks fire in worktrees as well, `.githooks` is tracked, so each worktree
has its own copy and the relative `core.hooksPath` finds it.

# Worktrees and parallel agents

Worktrees exist to stop two agents writing to the same files at once. They are
not a general requirement for delegating work.

**Use `isolation: "worktree"` only for agents that write**, and only when more
than one of them is running at the same time, or when one is running alongside
your own edits. A single writer working on its own should use the normal
checkout.

**Never use it for read-only agents.** Investigators, reviewers and searches
read the working tree and report back; a worktree buys them nothing and costs a
checkout.

## What a fresh worktree gives you

Settings live in `.claude/settings.json`:

- `node_modules` is symlinked from the main checkout, so a new worktree is
  usable immediately with no install step. The consequence: an agent that
  changes `package.json` must run its own `npm install` in that worktree, or it
  will be mutating the shared tree every other worktree is reading.
- New worktrees branch from your current HEAD, not `origin/main`, so a worktree
  picks up the feature branch you are already on.

`npm test`, `npm run typecheck` and `npm run lint` all work in a fresh worktree
as-is. `.env.local` is not copied, because it is gitignored and holds real
Supabase and Fitbit credentials. Only `npm run dev` and `npm run build` need it:

```
powershell -ExecutionPolicy Bypass -File scripts/worktree-env.ps1
```

Worktrees are created under `.claude/worktrees/` and are gitignored. Removing
one by hand: delete the symlinked `node_modules` with `cmd /c rmdir` first, so
a recursive delete cannot follow the link into the real dependency tree.
