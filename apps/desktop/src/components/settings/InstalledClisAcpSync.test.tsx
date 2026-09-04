import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as detect from "@/lib/cliDetect";
import { useRuntimeStore } from "@/lib/runtime";
import { AcpAgentsCard } from "./AcpAgentsCard";
import { InstalledClisCard } from "./InstalledClisCard";

// Regression coverage for the CRITICAL finding: InstalledClisCard.use() and
// AcpAgentsCard both write `lib/acpAgents.ts`'s localStorage keys, and both
// are mounted together on the real Settings page. Before acpAgents.ts gained
// subscribe/notify, AcpAgentsCard seeded its list ONCE via `useState(() =>
// loadAcpAgents())`, so it kept operating on a stale copy after the sibling's
// write — its next preset/select/remove click then overwrote the sibling's
// change entirely (same `newAcpAgentId` result on a stale, shorter array).

vi.mock("@/lib/tauri", () => ({ isTauri: true }));

vi.mock("@/lib/cliDetect", async (importOriginal) => {
  const mod = await importOriginal<typeof detect>();
  return { ...mod, detectAgentClis: vi.fn() };
});
const detectAgentClis = vi.mocked(detect.detectAgentClis);

const connectRetry = vi.hoisted(() => vi.fn(async () => true));

const claudeRow: detect.CliRow = {
  id: "claude",
  name: "Claude Code",
  bin: "claude",
  versionArgs: ["--version"],
  launch: { kind: "acp", command: "npx", args: ["-y", "@zed-industries/claude-code-acp"] },
  verified: true,
  found: true,
  path: "/usr/bin/claude",
  version: "2.1.251",
  authOk: null,
  authOutput: null,
};

describe("InstalledClisCard + AcpAgentsCard mounted together", () => {
  beforeEach(() => {
    localStorage.clear();
    connectRetry.mockClear();
    useRuntimeStore.setState({ connectRetry, status: "ready", runtimeKind: "opencode" });
    detectAgentClis.mockReset();
    detectAgentClis.mockResolvedValue([claudeRow]);
  });

  it("Use on InstalledClisCard is reflected by AcpAgentsCard with no remount", async () => {
    render(
      <>
        <InstalledClisCard />
        <AcpAgentsCard />
      </>,
    );

    expect(screen.getByRole("radio", { name: "OpenCode (bundled)" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await userEvent.click(await screen.findByRole("button", { name: "Use" }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "Claude Code" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });
    expect(screen.getByRole("radio", { name: "OpenCode (bundled)" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("a later AcpAgentsCard preset click does not overwrite the entry InstalledClisCard just wrote", async () => {
    render(
      <>
        <InstalledClisCard />
        <AcpAgentsCard />
      </>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Use" }));
    await waitFor(() => expect(localStorage.getItem("ai4s.acp.active.v1")).not.toBeNull());

    // Old bug: this read the ACP card's OWN stale (empty) `agents` state, so
    // `newAcpAgentId` reissued "acp-1" — the id InstalledClisCard had just
    // used — and its `apply()` wrote a one-entry array (Codex) with the
    // active id reset to null, silently destroying the CLI card's write.
    await userEvent.click(screen.getByRole("button", { name: "Codex" }));

    const saved = JSON.parse(localStorage.getItem("ai4s.acp.agents.v1") ?? "[]") as Array<{
      id: string;
      name: string;
    }>;
    expect(saved).toHaveLength(2);
    expect(saved.map((a) => a.name).sort()).toEqual(["Claude Code", "Codex"]);
    expect(saved[0].id).not.toBe(saved[1].id);
    // The runtime InstalledClisCard selected must still be the active one.
    expect(screen.getByRole("radio", { name: "Claude Code" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
