import { describe, expect, it } from "vitest";
import { AGENT_CLI_CATALOG } from "./cliCatalog";

describe("agent CLI catalog", () => {
  it("has a unique id per entry", () => {
    const ids = AGENT_CLI_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every entry a bin and a way to probe its version", () => {
    for (const e of AGENT_CLI_CATALOG) {
      expect(e.bin.trim()).not.toBe("");
      expect(e.versionArgs.length).toBeGreaterThan(0);
    }
  });

  it("ships Claude Code on the ACP bridge until the native runtime lands", () => {
    const claude = AGENT_CLI_CATALOG.find((e) => e.id === "claude");
    expect(claude?.launch.kind).toBe("acp");
  });

  it("never carries a permission bypass in a launch command", () => {
    // The safety default is "never ship off" (AGENTS.md). A catalog entry is a
    // launch line, so the bypass flags must not be expressible here either.
    const banned = ["--dangerously-skip-permissions", "bypassPermissions", "dontAsk"];
    for (const e of AGENT_CLI_CATALOG) {
      if (e.launch.kind !== "acp") continue;
      const line = [e.launch.command, ...e.launch.args].join(" ");
      for (const b of banned) expect(line).not.toContain(b);
    }
  });
});
