// A hint from the browser about whether it is wide enough for the desktop
// layout, so the server can skip work the phone will only throw away.
//
// The server has no way to know a viewport, and `hidden lg:flex` hides markup
// without saving the render or the queries behind it. The client does know, so
// it writes this cookie (see DesktopDashboardMount) and the next request can
// act on it. It is a hint only: absent, a first visit, means "assume wide and
// fetch everything", which is the safe way round, and a client that finds the
// hint was wrong asks for a refresh.
//
// Constants only. The server-side reader lives in ./viewport.server so that the
// client component sharing these values doesn't drag `next/headers` in with it.
export const VIEWPORT_COOKIE = "scoop_wide";
export const DESKTOP_MIN_WIDTH_PX = 1024;
export const NARROW = "0";
export const WIDE = "1";
