import { describe, expect, it } from "vitest";
import { interpretAuth, mergeDetection } from "./cliDetect";
import type { CliCatalogEntry } from "./cliCatalog";

const CATALOG: CliCatalogEntry[] = [
  { id: "a", name: "A", bin: "a", versionArgs: ["-v"], launch: { kind: "acp", command: "a", args: [] }, verified: true },
  { id: "b", name: "B", bin: "b", versionArgs: ["-v"], launch: { kind: "acp", command: "b", args: [] }, verified: false },
];

describe("mergeDetection", () => {
  it("marks an entry the probe never reported as not found", () => {
    const rows = mergeDetection(CATALOG, [
      { id: "a", found: true, path: "/usr/bin/a", version: "1.2.3", authOk: true, authOutput: null },
    ]);
    expect(rows.find((r) => r.id === "a")?.found).toBe(true);
    expect(rows.find((r) => r.id === "b")?.found).toBe(false);
  });

  it("keeps catalog order so the list does not reshuffle between refreshes", () => {
    const rows = mergeDetection(CATALOG, [
      { id: "b", found: true, path: "/usr/bin/b", version: null, authOk: null, authOutput: null },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("ignores a result for an id the catalog does not have", () => {
    const rows = mergeDetection(CATALOG, [
      { id: "ghost", found: true, path: "/x", version: null, authOk: null, authOutput: null },
    ]);
    expect(rows).toHaveLength(2);
  });
});

describe("interpretAuth", () => {
  const claude = (authOk: boolean | null, authOutput: string | null) =>
    interpretAuth({ id: "claude", authOk, authOutput });

  it("is unknown when no probe ran", () => {
    expect(claude(null, null)).toEqual({ kind: "unknown" });
  });

  it("names the login command when the CLI is signed out", () => {
    expect(claude(false, "")).toEqual({ kind: "signedOut", hint: "claude /login" });
    expect(interpretAuth({ id: "codex", authOk: false, authOutput: null })).toEqual({
      kind: "signedOut",
      hint: "codex login",
    });
  });

  it("is ok when signed in through the login itself", () => {
    // What `claude auth status` prints with no key in the environment:
    // `apiKeySource` is simply absent.
    expect(claude(true, '{"loggedIn": true, "authMethod": "claude.ai"}')).toEqual({ kind: "ok" });
  });

  it("names the environment variable that is overriding a real login", () => {
    // The 401-while-signed-in case: the CLI still says loggedIn, but every
    // request goes out with the key. Seen verbatim with a bogus key set.
    expect(
      claude(true, '{"loggedIn": true, "authMethod": "claude.ai", "apiKeySource": "ANTHROPIC_API_KEY"}'),
    ).toEqual({ kind: "envKeyOverride", variable: "ANTHROPIC_API_KEY" });
  });

  it("trusts the exit status when the output is not JSON", () => {
    expect(claude(true, "not json")).toEqual({ kind: "ok" });
  });
});
