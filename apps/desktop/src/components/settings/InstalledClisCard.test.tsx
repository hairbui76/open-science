import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import * as detect from "@/lib/cliDetect";
import { useRuntimeStore } from "@/lib/runtime";
import { InstalledClisCard } from "./InstalledClisCard";

vi.mock("@/lib/tauri", () => ({ isTauri: true }));

vi.mock("@/lib/cliDetect", async (importOriginal) => {
  const mod = await importOriginal<typeof detect>();
  return { ...mod, detectAgentClis: vi.fn() };
});
const detectAgentClis = vi.mocked(detect.detectAgentClis);

// The card only decides WHICH runtime to select; the connection itself is the
// store's job (same split as AcpAgentsCard.test.tsx), so a reconnect is a spy.
const connectRetry = vi.hoisted(() => vi.fn(async () => true));

const row = (over: Partial<detect.CliRow>): detect.CliRow => ({
  id: "claude",
  name: "Claude Code",
  bin: "claude",
  versionArgs: ["--version"],
  launch: { kind: "acp", command: "npx", args: ["-y", "x"] },
  // Matches the real catalog's "claude" entry, which IS verified — tests that
  // want the unverified path override this explicitly (ruling R6).
  verified: true,
  found: true,
  path: "/usr/bin/claude",
  version: "2.1.251",
  authOk: null,
  ...over,
});

describe("InstalledClisCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    localStorage.clear();
    detectAgentClis.mockReset();
    connectRetry.mockClear();
    useRuntimeStore.setState({ connectRetry, status: "ready", runtimeKind: "opencode" });
  });

  it("shows an installed CLI with its version", async () => {
    detectAgentClis.mockResolvedValue([row({})]);
    render(<InstalledClisCard />);
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("2.1.251")).toBeInTheDocument();
  });

  it("offers no configure button for a CLI that is not installed", async () => {
    detectAgentClis.mockResolvedValue([row({ found: false, path: null, version: null })]);
    render(<InstalledClisCard />);
    expect(await screen.findByText("Not installed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use" })).not.toBeInTheDocument();
  });

  it("configuring an installed CLI writes an ACP agent, makes it active, and reconnects", async () => {
    detectAgentClis.mockResolvedValue([row({})]);
    render(<InstalledClisCard />);
    await userEvent.click(await screen.findByRole("button", { name: "Use" }));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("ai4s.acp.agents.v1") ?? "[]");
      expect(saved).toHaveLength(1);
      expect(saved[0].command).toBe("npx");
      expect(localStorage.getItem("ai4s.acp.active.v1")).toBe(saved[0].id);
    });
    // The runtime is chosen at connect time — selecting it does nothing to
    // what is actually running until this fires.
    expect(connectRetry).toHaveBeenCalled();
  });

  it("clicking Use twice does not create a duplicate agent entry", async () => {
    detectAgentClis.mockResolvedValue([row({})]);
    render(<InstalledClisCard />);
    const button = await screen.findByRole("button", { name: "Use" });
    await userEvent.click(button);
    await userEvent.click(button);
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("ai4s.acp.agents.v1") ?? "[]");
      expect(saved).toHaveLength(1);
    });
  });

  it("shows an explanation instead of an empty list when detection fails", async () => {
    detectAgentClis.mockRejectedValue(new Error("invoke failed"));
    render(<InstalledClisCard />);
    expect(await screen.findByText("Could not check installed CLIs.")).toBeInTheDocument();
  });

  it("reports a signed-out CLI without hiding it", async () => {
    detectAgentClis.mockResolvedValue([row({ authOk: false })]);
    render(<InstalledClisCard />);
    expect(await screen.findByText("Not signed in")).toBeInTheDocument();
  });

  // Ruling R6: an unverified launch command is an educated guess never run
  // against a real binary (cliCatalog.ts). Writing it into the user's ACP
  // config would produce a broken agent that looks like our bug, so a found
  // row still reports what it found but withholds the one-click button.
  it("offers no configure button for a found but unverified CLI", async () => {
    detectAgentClis.mockResolvedValue([
      row({ id: "qwen", name: "Qwen Code", verified: false }),
    ]);
    render(<InstalledClisCard />);
    expect(await screen.findByText("Qwen Code")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use" })).not.toBeInTheDocument();
  });
});
