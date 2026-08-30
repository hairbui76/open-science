import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Section } from "./Section";
import { detectAgentClis, type CliRow } from "@/lib/cliDetect";
import { isTauri } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { loadAcpAgents, newAcpAgentId, saveAcpAgents, setActiveAcpAgentId } from "@/lib/acpAgents";

/**
 * Settings → Runtime → which agent CLIs this computer has.
 *
 * REPORTS first: the app cannot install anything, so the useful answer is
 * "here is what you already have, and here is one click to use it". Every
 * catalog row renders regardless of outcome — a CLI that is absent stays
 * listed with "Not installed" rather than disappearing, because that is
 * itself the answer the user came here for. A summary line is added only
 * when nothing at all was found.
 *
 * One-click configure is further gated on `verified` (cliCatalog.ts): most
 * catalog entries carry a launch command that is an educated guess, never run
 * against a real binary. Writing an unconfirmed command into the user's ACP
 * config would silently produce a broken agent that looks like our bug, so a
 * found-but-unverified row still reports what it found — name, version, auth
 * — and leaves configuration to the ACP card below, where the user enters the
 * command by hand.
 *
 * Desktop only, like the ACP card beside it: the CLI runs as a child process
 * on this host, which the gateway web client (a phone) does not have.
 */
export function InstalledClisCard() {
  const { t } = useTranslation(["settings"]);
  const [rows, setRows] = useState<CliRow[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    setBusy(true);
    void detectAgentClis()
      .then(setRows)
      .finally(() => setBusy(false));
  }, []);
  useEffect(refresh, [refresh]);

  if (!isTauri) return null;

  const use = (row: CliRow) => {
    // Only an ACP launch can be configured today. `native` has no runtime yet
    // — a later plan adds one (docs/rfc/local-agent-clis.md) — and must not be
    // silently wired to a dead button here; it should be revisited then.
    if (row.launch.kind !== "acp") return;
    const agents = loadAcpAgents();
    const id = newAcpAgentId(agents);
    saveAcpAgents([
      ...agents,
      { id, name: row.name, command: row.launch.command, args: row.launch.args },
    ]);
    setActiveAcpAgentId(id);
    toast.success(t("installedClis.added", { name: row.name }));
    refresh();
  };

  const noneFound = rows.length > 0 && rows.every((row) => !row.found);

  return (
    <Section
      title={t("installedClis.title")}
      hint={t("installedClis.hint")}
      action={
        <Button size="sm" onClick={refresh} disabled={busy}>
          {t("installedClis.refresh")}
        </Button>
      }
    >
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-text">{row.name}</span>
            {row.version && (
              <span className="shrink-0 font-mono text-xs text-faint">{row.version}</span>
            )}
            {row.authOk === true && <Chip readOnly>{t("installedClis.signedIn")}</Chip>}
            {row.authOk === false && <Chip readOnly>{t("installedClis.signedOut")}</Chip>}
            {row.found ? (
              row.verified && (
                <Button size="sm" onClick={() => use(row)}>
                  {t("installedClis.use")}
                </Button>
              )
            ) : (
              <span className="shrink-0 text-xs text-faint">{t("installedClis.notInstalled")}</span>
            )}
          </li>
        ))}
      </ul>
      {noneFound && <p className="mt-2 text-xs text-muted">{t("installedClis.none")}</p>}
    </Section>
  );
}
