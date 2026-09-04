// Which sessions from an agent's store belong in this app's sidebar.
//
// An ACP agent keeps its sessions wherever it likes — claude-code-acp uses the
// same ~/.claude the user's terminal does — and `session/list` returns all of
// them. The app only knows which FOLDERS it manages: the workspace root and
// each project's path, in-place imports included. That folder set is the
// scope; a session is ours if it lives in one of those folders.

/** Windows paths compare case-insensitively and accept either separator; the
 *  agent reports what the OS gave it, the app holds the canonical form. */
function isWindowsShaped(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

function normalize(p: string): string {
  let out = p.replace(/\\/g, "/");
  if (isWindowsShaped(p)) out = out.toLowerCase();
  // Strip trailing separators so "/ws/" and "/ws" are one folder; keep a bare
  // root ("/") intact.
  while (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

/** True when `cwd` is one of `roots` or lies beneath one. A sibling that
 *  merely shares a prefix ("/ws-other" against "/ws") does not count. */
export function isWithinRoots(cwd: string, roots: readonly string[]): boolean {
  const c = normalize(cwd);
  for (const r of roots) {
    const root = normalize(r);
    if (c === root) return true;
    if (c.startsWith(root === "/" ? "/" : root + "/")) return true;
  }
  return false;
}
