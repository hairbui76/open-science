// Asking the host which catalogued CLIs it actually has.
import { AGENT_CLI_CATALOG, type CliCatalogEntry } from "./cliCatalog";
import { isTauri } from "./tauri";

export interface DetectedCli {
  id: string;
  found: boolean;
  path: string | null;
  version: string | null;
  /** null = the entry declares no auth probe, i.e. unknown, not signed out. */
  authOk: boolean | null;
  /** The auth probe's stdout, when one ran; see `interpretAuth`. */
  authOutput: string | null;
}

export type AuthVerdict =
  /** Signed in, and nothing is getting in the way. */
  | { kind: "ok" }
  /** The CLI says it is not signed in; `hint` is its own login command. */
  | { kind: "signedOut"; hint: string }
  /** Signed in, but an environment API key overrides that login — the agent
   *  will use the key, and a stale one produces a 401 on a machine that IS
   *  signed in. `variable` names it. */
  | { kind: "envKeyOverride"; variable: string }
  /** The entry declares no auth probe, or it did not run. */
  | { kind: "unknown" };

/** The login command each probe-bearing entry answers with. Kept beside the
 *  interpretation because it is the same knowledge: what the CLI's output means
 *  and what to do about it. */
const LOGIN_HINT: Record<string, string> = {
  claude: "claude /login",
  codex: "codex login",
};

/**
 * Read a CLI's own account of its sign-in state. Exit status alone says signed
 * in or not; `claude auth status` additionally prints JSON whose
 * `apiKeySource` names an environment variable when one is overriding the
 * login. That is the case worth naming: the CLI reports `loggedIn: true` and
 * the user is told they are signed in, while every request goes out with the
 * key instead.
 */
export function interpretAuth(row: Pick<CliRow, "id" | "authOk" | "authOutput">): AuthVerdict {
  if (row.authOk === null) return { kind: "unknown" };
  const hint = LOGIN_HINT[row.id] ?? "the agent's login command";
  if (row.authOk === false) return { kind: "signedOut", hint };
  if (row.id === "claude" && row.authOutput) {
    try {
      const parsed = JSON.parse(row.authOutput) as { loggedIn?: unknown; apiKeySource?: unknown };
      if (parsed.loggedIn === false) return { kind: "signedOut", hint };
      if (typeof parsed.apiKeySource === "string" && parsed.apiKeySource) {
        return { kind: "envKeyOverride", variable: parsed.apiKeySource };
      }
    } catch {
      // Not JSON: an older CLI, or a different tool on PATH under that name.
      // The exit status already said "signed in", and that stands.
    }
  }
  return { kind: "ok" };
}

export type CliRow = CliCatalogEntry & Omit<DetectedCli, "id">;

/** Catalog order wins: a list that reshuffles as probes land is unreadable. */
export function mergeDetection(
  catalog: readonly CliCatalogEntry[],
  detected: readonly DetectedCli[],
): CliRow[] {
  const byId = new Map(detected.map((d) => [d.id, d]));
  return catalog.map((entry) => {
    const d = byId.get(entry.id);
    return {
      ...entry,
      found: d?.found ?? false,
      path: d?.path ?? null,
      version: d?.version ?? null,
      authOk: d?.authOk ?? null,
      authOutput: d?.authOutput ?? null,
    };
  });
}

export async function detectAgentClis(): Promise<CliRow[]> {
  if (!isTauri) return mergeDetection(AGENT_CLI_CATALOG, []);
  const { invoke } = await import("@tauri-apps/api/core");
  const probes = AGENT_CLI_CATALOG.map((e) => ({
    id: e.id,
    bin: e.bin,
    versionArgs: e.versionArgs,
    authArgs: e.authArgs ?? null,
  }));
  const detected = await invoke<DetectedCli[]>("detect_agent_clis", { probes });
  return mergeDetection(AGENT_CLI_CATALOG, detected);
}
