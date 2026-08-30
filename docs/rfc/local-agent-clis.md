# RFC: Driving locally-installed agent CLIs

Status: **Design agreed 2026-08-30; not implemented.**
Amends: [`multi-agent-acp.md`](./multi-agent-acp.md) — it does not overturn it.
Builds on: [`agent-runtime.md`](./agent-runtime.md) — the `AgentRuntime` boundary.

## TL;DR

Two gaps separate what we ship from "use the agent CLIs already on my machine":

1. **Nothing detects them.** Configuring an agent means typing a command and its
   arguments by hand. The app never says which CLIs are installed.
2. **The two most common CLIs are not actually run locally.** The Claude Code and
   Codex presets in `lib/acpAgents.ts` launch `npx -y @zed-industries/claude-code-acp`
   and `npx -y @agentclientprotocol/codex-acp` — npm bridges that need Node and a
   first-run download, on a desktop app that otherwise bundles its own runtimes.

This RFC closes both in two independent stages: **detection** (a data catalog plus
one probe command) and a **native Claude Code runtime** (a third `AgentRuntime`
implementation). Codex deliberately stays on its bridge; see "Why not Codex".

## Why this does not overturn the ACP RFC

`multi-agent-acp.md` argued against per-agent adapters, betting that agents would
adopt ACP natively so that "support agent X" becomes "configure a stdio command".
That bet was right about the direction and wrong about the timetable for the two
CLIs our users most often have. Verified on 2026-08-30 against the installed
binaries:

| CLI | Native ACP | What it actually exposes |
| --- | --- | --- |
| `claude` 2.1.251 | no | `-p --input-format stream-json --output-format stream-json` |
| `codex` | no | `exec`, `mcp-server` (stdio MCP), `app-server` (experimental) |

So ACP remains the general answer and the only way to add an agent without code.
This RFC adds exactly one native adapter, for one CLI, where the bridge costs a
Node dependency we otherwise do not impose — and keeps the bridge as the
documented fallback. The rule it establishes is deliberately narrow:

> A native adapter is justified only when the CLI cannot speak ACP **and** it can
> route tool approvals back to Open Science's approval dialog. No approval
> routing, no native adapter.

## Stage 1 — detection

### Catalog

A shipped data file, `apps/desktop/src/lib/cliCatalog.ts`, one entry per known CLI:

```ts
{
  id: "claude",
  name: "Claude Code",
  bin: "claude",
  versionArgs: ["--version"],
  authProbe?: { args: [...] },
  launch: { kind: "acp", command, args } | { kind: "native", runtime: "claude-code" },
}
```

Data, not code, so a community CLI is one entry rather than a patch to the
runtime layer — the "runtimes stay pluggable" guardrail in `AGENTS.md`. Initial
entries: `claude`, `codex`, `gemini`, `opencode`, `cursor-agent`, `qwen`,
`copilot`, `amp`. Hand-entered commands keep working exactly as today; the
catalog is a convenience, never an allowlist.

### Probe

One new Tauri command, `detect_agent_clis`, returning
`{ id, found, path, version, authOk }` per entry.

It **must** resolve against `crate::runtime::enriched_path()`, not the inherited
process PATH. `acp.rs` already documents why: a GUI-launched app gets a minimal
PATH, and an agent CLI is typically a user-installed binary outside it. Probing
the inherited PATH would report "nothing installed" on a normal macOS desktop —
the single most likely way for this feature to look broken.

### Surface

Settings gains an "Installed agent CLIs" section: what is on this machine, its
version, whether it is signed in, and one click to configure it. Hidden in the
gateway web client under `isGatewayWeb`, matching the existing ACP picker —
detection describes the machine the app runs on, which is not the phone the user
is holding.

## Stage 2 — a native Claude Code runtime

### Why no new Rust is needed

`acp_start(agent_id, command, args)` spawns an arbitrary command with piped stdio
and relays its stdout **line by line** as `acp:line` events. It is ACP-named but
protocol-neutral, and Claude's `--output-format stream-json` is JSONL, so it
rides the same pipe. Stage 2 is therefore a TypeScript-only addition:
`packages/sdk/src/claude/ClaudeCodeRuntime.ts`, extending `BaseAgentRuntime` and
implementing `AgentRuntime` — the same seam `AcpRuntime` and `OpenCodeClient`
already sit behind. The UI, the event bus and the approval dialog are unchanged.

Because that command family now serves two protocols, rename it while it has
only two callers: `acp_start`/`acp_send`/`acp_stop`/`acp_running` and the
`acp:line`/`acp:exit` events become `agent_proc_*` / `agent_proc:*`.

### Launch

```
claude -p --input-format stream-json --output-format stream-json
       --permission-mode manual  [--model <id>]
```

`--verbose` is deliberately absent. Older Claude Code builds rejected
`--output-format stream-json` without it; 2.1.251 carries no such requirement
(no "requires --verbose" diagnostic exists in the binary). Whether the pinned
floor needs it is part of the version-floor question below — add it only if a
build we actually support demands it, rather than carrying a flag by folklore.

`manual` is the only permission mode the adapter ever constructs. The strings
`bypassPermissions`, `dontAsk`, `acceptEdits` and `--dangerously-skip-permissions`
must not appear in the adapter at all — the safety default in `AGENTS.md` is
"never ship `off`", and the most durable way to honour it is for those values to
be absent rather than merely unused.

### Event mapping

| Claude stream-json | `OpenCodeEvent` |
| --- | --- |
| `assistant` message, `text` block | `text.updated` |
| `assistant` message, `thinking` block | `reasoning.updated` |
| `assistant` message, `tool_use` block | `tool.updated` (running) |
| `user` message, `tool_result` block | `tool.updated` (completed) |
| `control_request` / `can_use_tool` | `permission.asked` |
| our `control_response` | `permission.resolved` |
| `result` | `session.idle` |
| stderr, non-zero exit, unparseable line | `error` |

### The approval round trip

Claude sends
`{ type: "control_request", request_id, request: { subtype: "can_use_tool", tool_name, input, permission_suggestions?, blocked_path? } }`.
The adapter emits `permission.asked`; the existing dialog renders it; the user's
answer arrives via `AgentRuntime.replyPermission(requestId, reply)`; the adapter
writes back a `control_response` echoing `request_id`.

Answering is **mandatory**. The CLI's own description of this protocol states
that without a permission surface, `ask` decisions are terminal — so a dropped,
late or forgotten reply does not stall the turn, it denies the tool. Every
`can_use_tool` must produce exactly one `control_response`, including when the
dialog is dismissed (explicit deny) and when the session is aborted.

`permission_suggestions` (Claude proposing scoped grants such as `Bash(git *)`)
is parsed but not acted on: our dialog has no vocabulary for a persisted scoped
rule. Mapping it is a follow-up, not part of this work.

### Sessions

`system/init` carries a session id, and `--resume`/`--continue` exist, so create
and resume are real. The remainder of the 30-method `AgentRuntime` interface gets
the treatment `AcpRuntime` already gives it: `forkSession` throws,
`querySessions`/`revert`/`unrevert` are no-ops. The adapter reports what the CLI
cannot do rather than pretending.

### Version drift

The control protocol is an SDK-internal surface, not a published spec; the shapes
above were read out of the 2.1.251 bundle. On connect the adapter reads
`system/init` and, if the CLI is below a pinned floor or does not present the
expected shape, it **refuses to run natively and names the ACP bridge**. Half-working
is not an option, and this check is what keeps the adapter from becoming the
per-agent drift `multi-agent-acp.md` warned about.

## Why not Codex

`codex exec` offers sandbox policies and `--dangerously-bypass-approvals-and-sandbox`,
but no way to route an approval request back to us. A sandbox is a containment
boundary, not consent, so running it natively would execute commands without the
approval `AGENTS.md` requires. Codex keeps its ACP bridge, whose `codex-acp`
server implements ACP permission requests properly, and gains detection and
one-click setup from Stage 1 like everything else.

`codex app-server` (JSON-RPC, what the Codex IDE extensions drive) does carry
interactive approval callbacks and is the obvious candidate for a future native
adapter — once it is no longer marked experimental.

## Testing

- **Recorded JSONL fixtures**, captured once from the real CLI and committed: a
  plain turn, a tool-use turn, permission ask/allow, ask/deny, and an abort.
  Tests replay them through `ClaudeCodeRuntime` and assert the emitted event
  sequence. No CLI, no network and no API credits in CI — and the fixtures are
  the only documentation this protocol has.
- **A mechanical safety test**: for any input, the constructed argv contains none
  of the bypass values listed above.
- **Exactly-one-response test**: every `can_use_tool` fixture yields exactly one
  `control_response` with the echoed `request_id`, including the dismissal and
  abort paths.
- **Version-floor test**: an old or malformed `system/init` refuses to connect and
  names the bridge.
- **Detection tests**: fake executables on a temp PATH covering found,
  found-but-unversioned, absent, and present-but-not-signed-in.

## Failure modes

| Failure | Behaviour |
| --- | --- |
| CLI absent from `enriched_path()` | Listed as not installed; no configure button offered. |
| Installed, not signed in | Shown as such, naming the CLI's own login command. |
| CLI upgraded, protocol moved | Refuses natively, points at the bridge. |
| Unparseable JSON line | Skip it, emit `error`, keep the session alive. |
| Child dies mid-turn | `error` + `session.idle`; the supervisor already reports exit. |
| Gateway web mode | Hidden entirely. |

## Phased plan

1. **Stage 1** — catalog, `detect_agent_clis`, Settings section. Ships and is
   useful on its own; no transport changes.
2. **Stage 2a** — rename the `acp_*` process commands to `agent_proc_*`.
3. **Stage 2b** — `ClaudeCodeRuntime` behind the version floor, with fixtures.
4. **Stage 2c** — flip the catalog's Claude Code entry from `acp` to `native`,
   keeping the bridge documented as the fallback.

## Open questions

- Where should the version floor be pinned? 2.1.251 is what this design was read
  from; the floor should be the oldest build actually verified to emit
  `can_use_tool`, which needs a check against one or two older releases. Two
  older builds (2.1.246, 2.1.247) are present on this machine and are the
  obvious first check. That check also settles whether `--verbose` is needed.
- Should detection re-probe on a timer or only on demand? On demand is simpler
  and is the assumption above; a user who installs a CLI while Settings is open
  must press refresh.
