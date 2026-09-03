// Configured ACP agents, and which one the app runs (#14, client direction).
//
// An ACP agent is a COMMAND the user asked us to run — not code in this repo
// (docs/rfc/multi-agent-acp.md). So this module owns exactly that: the list of
// configured commands and the one that is currently selected. Starting the
// process is `lib/acpTransport.ts` + `src-tauri/src/acp.rs`; driving it is
// `AcpRuntime` in the SDK.
//
// Stored locally rather than in OpenCode's config: it is app behaviour (which
// runtime the desktop drives), and OpenCode must not be asked to describe a
// runtime that replaces it.
//
// Two Settings cards (AcpAgentsCard, InstalledClisCard) both write here. This
// module owns the storage keys, so it also owns telling every reader about a
// write — otherwise a card that seeded its state once from `loadAcpAgents()`
// keeps operating on a stale copy after a SIBLING card's write, and its next
// action (a preset click, a remove, a select) overwrites the sibling's change
// with that stale copy. `useAcpAgents`/`useActiveAcpAgentId` below are how
// components read this live, via `useSyncExternalStore`.

import { useSyncExternalStore } from "react";

/** A configured ACP agent. `id` is also the key the Rust supervisor tracks its
 *  child under, so it must stay stable across edits of the same entry. */
export interface AcpAgentConfig {
  id: string;
  /** Display label ("Codex", "Gemini CLI"). */
  name: string;
  /** Executable to run. */
  command: string;
  args: string[];
}

const AGENTS_KEY = "ai4s.acp.agents.v1";
const ACTIVE_KEY = "ai4s.acp.active.v1";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to writes made through `saveAcpAgents`/`setActiveAcpAgentId`, by
 *  ANY caller. Returns an unsubscribe function — the shape `useSyncExternalStore`
 *  wants directly. */
export function subscribeAcpAgents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Agents known to speak ACP v1, offered as one-click starting points. Every one
 *  of these was probed against this app's own `initialize` before being listed
 *  (see PROGRESS.md, 2026-08-05): all three answer protocolVersion 1. They are
 *  suggestions the user can edit, not an allowlist — any command that speaks ACP
 *  over stdio works. */
export const ACP_PRESETS: ReadonlyArray<Omit<AcpAgentConfig, "id">> = [
  { name: "Codex", command: "npx", args: ["-y", "@agentclientprotocol/codex-acp"] },
  { name: "Gemini CLI", command: "gemini", args: ["--acp"] },
  { name: "Claude Code", command: "npx", args: ["-y", "@zed-industries/claude-code-acp"] },
];

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Keep only entries this app can actually start — a hand-edited or truncated
 *  localStorage value must not put a half-built agent in the picker. */
function sanitize(raw: unknown): AcpAgentConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: AcpAgentConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, name, command, args } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id) continue;
    if (typeof command !== "string" || !command.trim()) continue;
    if (out.some((a) => a.id === id)) continue; // one child per id in Rust
    out.push({
      id,
      name: typeof name === "string" && name.trim() ? name.trim() : command.trim(),
      command: command.trim(),
      args: Array.isArray(args) ? args.filter((a): a is string => typeof a === "string") : [],
    });
  }
  return out;
}

// Cached by the raw stored string, not by a version counter: a write made
// directly to localStorage (tests do this; so, in principle, could another
// tab) must still invalidate the cache on the next read. `useSyncExternalStore`
// requires a snapshot function to return the SAME reference when nothing has
// changed — a fresh array on every call reads as "changed" on every render
// and React gives up with "Maximum update depth exceeded" — so this trades a
// cheap raw-string re-read for a stable array reference on the common path.
// One shared empty array, returned by every path that has no agents to report.
// `useSyncExternalStore` compares snapshots with `Object.is`, so a fresh `[]`
// literal reads as "changed" on every render and React gives up with "Maximum
// update depth exceeded" — which would take down the whole Settings route on a
// browser with site data blocked. Never return a bare `[]` from here.
const EMPTY_AGENTS: AcpAgentConfig[] = [];

let cachedAgentsRaw: string | null | undefined;
let cachedAgents: AcpAgentConfig[] = [];

export function loadAcpAgents(): AcpAgentConfig[] {
  const store = storage();
  if (!store) return EMPTY_AGENTS;
  let raw: string | null;
  try {
    raw = store.getItem(AGENTS_KEY);
  } catch {
    return EMPTY_AGENTS;
  }
  if (raw !== cachedAgentsRaw) {
    cachedAgentsRaw = raw;
    try {
      cachedAgents = sanitize(JSON.parse(raw ?? "[]"));
    } catch {
      cachedAgents = [];
    }
  }
  return cachedAgents;
}

export function saveAcpAgents(agents: AcpAgentConfig[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(AGENTS_KEY, JSON.stringify(sanitize(agents)));
  } catch {
    /* storage full/unavailable never blocks the picker */
    return;
  }
  notify();
}

/** The selected agent's id, or null for the bundled OpenCode runtime. */
export function activeAcpAgentId(): string | null {
  return storage()?.getItem(ACTIVE_KEY) || null;
}

export function setActiveAcpAgentId(id: string | null): void {
  const store = storage();
  if (!store) return;
  try {
    if (id) store.setItem(ACTIVE_KEY, id);
    else store.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
    return;
  }
  notify();
}

/** Live list of configured agents — re-renders the caller when a `saveAcpAgents`
 *  write lands from ANYWHERE, including a sibling component. */
export function useAcpAgents(): AcpAgentConfig[] {
  return useSyncExternalStore(subscribeAcpAgents, loadAcpAgents, () => EMPTY_AGENTS);
}

/** Live selected agent id — re-renders the caller when a `setActiveAcpAgentId`
 *  write lands from ANYWHERE, including a sibling component. */
export function useActiveAcpAgentId(): string | null {
  return useSyncExternalStore(subscribeAcpAgents, activeAcpAgentId, () => null);
}

/**
 * The agent to run, or null for the bundled OpenCode runtime.
 *
 * A selection naming an agent that is no longer configured resolves to null, not
 * to an error: deleting the selected entry must fall back to OpenCode rather
 * than leave the app with no runtime at all.
 */
export function activeAcpAgent(): AcpAgentConfig | null {
  const id = activeAcpAgentId();
  if (!id) return null;
  return loadAcpAgents().find((a) => a.id === id) ?? null;
}

/** A stable, human-readable id no existing entry uses. Deterministic on purpose —
 *  the id keys a child process, and it appears in debug output. */
export function newAcpAgentId(existing: AcpAgentConfig[]): string {
  for (let n = 1; ; n++) {
    const id = `acp-${n}`;
    if (!existing.some((a) => a.id === id)) return id;
  }
}

/**
 * Split an argument line the way a shell would for the simple cases: whitespace
 * separates, and single or double quotes keep a run together.
 *
 * Deliberately NOT a shell: the arguments go straight to `Command::args`, never
 * through `sh`, so there is nothing here to expand, glob or substitute — which is
 * also why a path with spaces has to be quotable.
 */
export function parseCommandArgs(text: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) args.push(current);
      current = "";
      started = false;
      continue;
    }
    current += ch;
    started = true;
  }
  if (started) args.push(current);
  return args;
}

/** The inverse, for the editor field: quote any argument that contains spaces. */
export function formatCommandArgs(args: string[]): string {
  return args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ");
}
