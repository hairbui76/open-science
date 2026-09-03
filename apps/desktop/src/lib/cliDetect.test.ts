import { describe, expect, it } from "vitest";
import { mergeDetection } from "./cliDetect";
import type { CliCatalogEntry } from "./cliCatalog";

const CATALOG: CliCatalogEntry[] = [
  { id: "a", name: "A", bin: "a", versionArgs: ["-v"], launch: { kind: "acp", command: "a", args: [] }, verified: true },
  { id: "b", name: "B", bin: "b", versionArgs: ["-v"], launch: { kind: "acp", command: "b", args: [] }, verified: false },
];

describe("mergeDetection", () => {
  it("marks an entry the probe never reported as not found", () => {
    const rows = mergeDetection(CATALOG, [
      { id: "a", found: true, path: "/usr/bin/a", version: "1.2.3", authOk: true },
    ]);
    expect(rows.find((r) => r.id === "a")?.found).toBe(true);
    expect(rows.find((r) => r.id === "b")?.found).toBe(false);
  });

  it("keeps catalog order so the list does not reshuffle between refreshes", () => {
    const rows = mergeDetection(CATALOG, [
      { id: "b", found: true, path: "/usr/bin/b", version: null, authOk: null },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("ignores a result for an id the catalog does not have", () => {
    const rows = mergeDetection(CATALOG, [
      { id: "ghost", found: true, path: "/x", version: null, authOk: null },
    ]);
    expect(rows).toHaveLength(2);
  });
});
