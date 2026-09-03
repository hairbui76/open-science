// Which agent CLIs this build knows how to find and configure (Stage 1 of
// docs/rfc/local-agent-clis.md).
//
// DATA, deliberately not code: adding a CLI is one entry here, not a patch to
// the runtime layer, which is what keeps runtimes pluggable (AGENTS.md). It is
// a convenience, never an allowlist — a hand-entered command still works, and
// anything absent from this list is simply not auto-detected.

export type CliLaunch =
  | { kind: "acp"; command: string; args: string[] }
  | { kind: "native"; runtime: "claude-code" };

export interface CliCatalogEntry {
  id: string;
  /** Display name. NOT translated: these are product names. */
  name: string;
  /** Executable to look for on the enriched PATH. */
  bin: string;
  versionArgs: string[];
  /** Optional sign-in probe; a zero exit means signed in. */
  authArgs?: string[];
  launch: CliLaunch;
  /** Whether this build has confirmed the launch command against a real binary.
   *  Only verified entries get one-click configure in Settings; others require
   *  manual command entry. Widening this requires actually running that CLI first. */
  verified: boolean;
}

export const AGENT_CLI_CATALOG: readonly CliCatalogEntry[] = [
  // Claude Code has no native ACP mode (verified 2026-08-30 against 2.1.251),
  // so it runs through Zed's bridge until the native runtime lands.
  //
  // authArgs verified 2026-08-30 against a real `claude` binary: `auth status`
  // prints JSON containing "loggedIn": true and exits 0 when signed in.
  {
    id: "claude",
    name: "Claude Code",
    bin: "claude",
    versionArgs: ["--version"],
    authArgs: ["auth", "status"],
    launch: { kind: "acp", command: "npx", args: ["-y", "@zed-industries/claude-code-acp"] },
    verified: true,
  },
  // Codex stays on its bridge permanently: `codex exec` cannot route an
  // approval request back to us, and a sandbox is containment, not consent.
  //
  // authArgs verified 2026-08-30 against a real `codex` binary: `login status`
  // prints "Logged in using ChatGPT" and exits 0 when signed in.
  {
    id: "codex",
    name: "Codex",
    bin: "codex",
    versionArgs: ["--version"],
    authArgs: ["login", "status"],
    launch: { kind: "acp", command: "npx", args: ["-y", "@agentclientprotocol/codex-acp"] },
    verified: true,
  },
  // The launch line `gemini --acp` IS verified: PROGRESS.md (2026-08-05)
  // records it answering `initialize` with protocolVersion 1 against a real
  // 0.33.1 binary, and it already ships as an ACP_PRESETS one-click entry
  // (lib/acpAgents.ts).
  {
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    versionArgs: ["--version"],
    launch: { kind: "acp", command: "gemini", args: ["--acp"] },
    verified: true,
  },
  // Unconfirmed: the launch line `opencode acp` is an educated guess, not yet
  // verified against a real binary.
  {
    id: "opencode",
    name: "OpenCode",
    bin: "opencode",
    versionArgs: ["--version"],
    launch: { kind: "acp", command: "opencode", args: ["acp"] },
    verified: false,
  },
  // Unconfirmed: the launch line `cursor-agent --acp` is an educated guess, not yet
  // verified against a real binary.
  {
    id: "cursor-agent",
    name: "Cursor Agent",
    bin: "cursor-agent",
    versionArgs: ["--version"],
    launch: { kind: "acp", command: "cursor-agent", args: ["--acp"] },
    verified: false,
  },
  // Unconfirmed: the launch line `qwen --acp` is an educated guess, not yet
  // verified against a real binary.
  {
    id: "qwen",
    name: "Qwen Code",
    bin: "qwen",
    versionArgs: ["--version"],
    launch: { kind: "acp", command: "qwen", args: ["--acp"] },
    verified: false,
  },
  // Unconfirmed: the launch line `copilot --acp` is an educated guess, not yet
  // verified against a real binary.
  {
    id: "copilot",
    name: "GitHub Copilot CLI",
    bin: "copilot",
    versionArgs: ["--version"],
    launch: { kind: "acp", command: "copilot", args: ["--acp"] },
    verified: false,
  },
  // Unconfirmed: the launch line `amp --acp` is an educated guess, not yet
  // verified against a real binary.
  {
    id: "amp",
    name: "Amp",
    bin: "amp",
    versionArgs: ["--version"],
    launch: { kind: "acp", command: "amp", args: ["--acp"] },
    verified: false,
  },
];
