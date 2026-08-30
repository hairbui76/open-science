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
