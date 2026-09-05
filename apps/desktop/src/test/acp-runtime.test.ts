// AcpRuntime against an in-process ACP agent (#14, #25).
//
// The fake agent below answers the real wire shapes — every payload here was
// read off a live agent, not invented: `initialize` and `session/new` from
// `@agentclientprotocol/codex-acp` 1.1.9, `gemini --acp` 0.33.1 and
// `@zed-industries/claude-code-acp` 0.16.2 (all three answer protocolVersion 1
// with this shape), and the `session/update` kinds from a real captured turn
// (`agent_message_chunk` arrives as DELTAS carrying `messageId`, the turn ends
// with `{stopReason: "end_turn"}` on the prompt's own response).
import { describe, expect, it, vi } from "vitest";


import { AcpRuntime, isWithinRoots, modelConfigOption, pickPermissionOption } from "@ai4s/sdk/acp";
import type { JsonRpcTransport, OpenCodeEvent } from "@ai4s/sdk/acp";

/** Last element. `Array.prototype.at` is outside this tsconfig's lib target. */
function last<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}

/** A transport wired to a scriptable agent, both ends in this process. */
function fakeAgent(handle: (msg: Record<string, unknown>, agent: FakeAgent) => void) {
  const lineListeners = new Set<(line: string) => void>();
  const closeListeners = new Set<(reason?: string) => void>();
  const sent: Record<string, unknown>[] = [];
  let closed = false;

  const agent: FakeAgent = {
    sent,
    /** Answer a client request. */
    reply(id, result) {
      this.push({ jsonrpc: "2.0", id, result });
    },
    replyError(id, code, message) {
      this.push({ jsonrpc: "2.0", id, error: { code, message } });
    },
    notify(method, params) {
      this.push({ jsonrpc: "2.0", method, params });
    },
    /** An agent-initiated REQUEST — the agent is blocked until the client answers. */
    request(id, method, params) {
      this.push({ jsonrpc: "2.0", id, method, params });
    },
    push(message) {
      lineListeners.forEach((l) => l(JSON.stringify(message)));
    },
    die(reason) {
      closed = true;
      closeListeners.forEach((l) => l(reason));
    },
  };

  const transport: JsonRpcTransport = {
    send(line) {
      if (closed) return;
      const msg = JSON.parse(line) as Record<string, unknown>;
      sent.push(msg);
      handle(msg, agent);
    },
    onLine(l) {
      lineListeners.add(l);
      return () => lineListeners.delete(l);
    },
    onClose(l) {
      closeListeners.add(l);
      return () => closeListeners.delete(l);
    },
    close() {
      closed = true;
    },
  };
  return { transport, agent };
}

interface FakeAgent {
  sent: Record<string, unknown>[];
  reply(id: unknown, result: unknown): void;
  replyError(id: unknown, code: number, message: string): void;
  notify(method: string, params: unknown): void;
  request(id: number, method: string, params: unknown): void;
  push(message: Record<string, unknown>): void;
  die(reason?: string): void;
}

const INITIALIZE_RESULT = {
  protocolVersion: 1,
  agentInfo: { name: "@agentclientprotocol/codex-acp", title: "Codex", version: "1.1.9" },
  agentCapabilities: {
    loadSession: true,
    promptCapabilities: { image: true, embeddedContext: true },
    // Presence is the signal (empty object = supported), copied from what
    // codex-acp actually advertises today — history, listing and deletion are
    // stable v1 capabilities, not extensions.
    sessionCapabilities: { resume: {}, list: {}, close: {}, delete: {}, additionalDirectories: {} },
  },
  authMethods: [{ id: "chat-gpt", name: "ChatGPT" }],
};

const NEW_SESSION_RESULT = {
  sessionId: "019fd184-40c8-79d2-a310-268586830f43",
  models: {
    availableModels: [
      { modelId: "gpt-5.6-sol[low]", name: "GPT-5.6-Sol (low)" },
      { modelId: "gpt-5.6-sol[high]", name: "GPT-5.6-Sol (high)" },
    ],
    currentModelId: "gpt-5.6-sol[medium]",
  },
};

/** A runtime whose agent answers initialize + session/new, plus whatever the
 *  test's own handler does on top. */
async function connected(extra?: (msg: Record<string, unknown>, agent: FakeAgent) => void) {
  const events: OpenCodeEvent[] = [];
  const { transport, agent } = fakeAgent((msg, a) => {
    if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
    if (msg.method === "session/new") return a.reply(msg.id, NEW_SESSION_RESULT);
    extra?.(msg, a);
    // Default: an agent with no stored history. The test's own handler runs
    // first and its answer wins — a second response to an already-settled id is
    // dropped by the peer.
    if (msg.method === "session/list") a.reply(msg.id, { sessions: [] });
  });
  const runtime = new AcpRuntime({ transport, cwd: "/ws/project" });
  runtime.onEvent((e) => events.push(e));
  await runtime.connect();
  const sessionId = await runtime.createSession("Trend analysis");
  return { runtime, agent, events, sessionId };
}

describe("AcpRuntime", () => {
  it("negotiates the protocol and reports what the agent calls itself", async () => {
    const { runtime, agent } = await connected();
    expect(runtime.getStatus()).toBe("ready");
    expect(runtime.displayName).toBe("Codex");
    const init = agent.sent.find((m) => m.method === "initialize");
    expect(init?.params).toEqual({
      protocolVersion: 1,
      // fs and terminal stay false: advertising them would hand an external
      // process file access from inside the app, which AGENTS.md puts behind
      // approval. The agent's own tools still ask permission.
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });
  });

  it("creates the session in the workspace folder and keeps the app's own title", async () => {
    const { runtime, agent, sessionId } = await connected();
    expect(sessionId).toBe(NEW_SESSION_RESULT.sessionId);
    const created = agent.sent.find((m) => m.method === "session/new");
    expect(created?.params).toEqual({ cwd: "/ws/project", mcpServers: [] });
    // ACP has no session title, so the sidebar's name lives on our side.
    expect(await runtime.listSessions()).toEqual([
      { id: sessionId, title: "Trend analysis", directory: "/ws/project" },
    ]);
    // The agent's own model list is reported, but never set by us — ACP v1 has
    // no model-setting method.
    expect(runtime.modelsFor(sessionId).map((m) => m.modelId)).toEqual([
      "gpt-5.6-sol[low]",
      "gpt-5.6-sol[high]",
    ]);
    await expect(runtime.setDefaultModel("gpt-5.6-sol[high]")).rejects.toThrow(/owns its own model choice/);
  });

  it("accumulates streamed message deltas into the full current text", async () => {
    // The load-bearing difference from OpenCode: ACP streams DELTAS, while
    // `text.updated` carries the whole current value and the app upserts by
    // partId. A runtime that passed the delta through would render "ok" as "k".
    const { runtime, agent, events, sessionId } = await connected((msg, a) => {
      if (msg.method !== "session/prompt") return;
      for (const delta of ["o", "k", "!"]) {
        a.notify("session/update", {
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            messageId: "msg_1",
            content: { type: "text", text: delta },
          },
        });
      }
      a.reply(msg.id, { stopReason: "end_turn" });
    });

    await runtime.sendPrompt(sessionId, "Reply with exactly: ok!");
    const texts = events.filter((e) => e.type === "text.updated");
    expect(texts.map((e) => (e as { text: string }).text)).toEqual(["o", "ok", "ok!"]);
    expect(texts.every((e) => (e as { partId: string }).partId === "msg_1")).toBe(true);
    expect(last(events)).toEqual({ type: "session.idle", sessionId });
    expect(agent.sent.find((m) => m.method === "session/prompt")?.params).toEqual({
      sessionId,
      prompt: [{ type: "text", text: "Reply with exactly: ok!" }],
    });
  });

  it("keeps id-less chunks from different turns apart", async () => {
    // codex-acp precedes an answer with an id-less notice (a skills-budget
    // warning, seen on a real turn). A single shared fallback key would glue
    // every such notice in the session into one endlessly growing block.
    const { runtime, events, sessionId } = await connected((msg, a) => {
      if (msg.method !== "session/prompt") return;
      a.notify("session/update", {
        sessionId,
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "notice" } },
      });
      a.reply(msg.id, { stopReason: "end_turn" });
    });

    await runtime.sendPrompt(sessionId, "one");
    await runtime.sendPrompt(sessionId, "two");
    const idless = events.filter((e) => e.type === "text.updated") as Array<{ partId: string; text: string }>;
    expect(idless.map((e) => e.partId)).toEqual(["message@1", "message@2"]);
    // The second turn's notice starts fresh instead of reading "noticenotice".
    expect(idless.map((e) => e.text)).toEqual(["notice", "notice"]);
  });

  it("separates thinking from the answer, and maps tool calls", async () => {
    const { runtime, events, sessionId } = await connected((msg, a) => {
      if (msg.method !== "session/prompt") return;
      a.notify("session/update", {
        sessionId,
        update: {
          sessionUpdate: "agent_thought_chunk",
          messageId: "th_1",
          content: { type: "text", text: "thinking" },
        },
      });
      a.notify("session/update", {
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_1",
          title: "Read analysis.py",
          kind: "read",
          status: "in_progress",
          rawInput: { path: "analysis.py" },
        },
      });
      a.notify("session/update", {
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_1",
          status: "completed",
          content: [{ type: "content", content: { type: "text", text: "import pandas" } }],
        },
      });
      a.reply(msg.id, { stopReason: "end_turn" });
    });

    await runtime.sendPrompt(sessionId, "read it");
    expect(events.find((e) => e.type === "reasoning.updated")).toMatchObject({ text: "thinking" });
    const tools = events.filter((e) => e.type === "tool.updated");
    // An in-progress call must not read as finished, so an unknown/streaming
    // status maps to "running", never "success".
    expect(tools[0]).toMatchObject({ callId: "call_1", tool: "read", status: "running" });
    expect(tools[1]).toMatchObject({ callId: "call_1", status: "success", output: "import pandas" });
  });

  it("surfaces the agent's commands from the unprompted update it sends", async () => {
    const { runtime, agent, sessionId } = await connected();
    // codex-acp pushes this right after session/new, before any prompt.
    agent.notify("session/update", {
      sessionId,
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          { name: "plan", description: "Turn plan mode on.", input: null },
          { name: "review", description: "Review uncommitted changes", input: { hint: "optional" } },
        ],
      },
    });
    expect(await runtime.listCommands()).toEqual([
      { name: "plan", description: "Turn plan mode on.", source: "command" },
      { name: "review", description: "Review uncommitted changes", source: "command" },
    ]);
  });

  it("routes a permission request to the app and answers the blocked agent", async () => {
    const { runtime, agent, events, sessionId } = await connected();
    agent.request(99, "session/request_permission", {
      sessionId,
      toolCall: { toolCallId: "call_2", kind: "execute", title: "Run tests", rawInput: { command: "pytest -q" } },
      options: [
        { optionId: "allow-once", kind: "allow_once", name: "Allow" },
        { optionId: "allow-always", kind: "allow_always", name: "Always allow" },
        { optionId: "no", kind: "reject_once", name: "Reject" },
      ],
    });
    await vi.waitFor(() => expect(events.some((e) => e.type === "permission.asked")).toBe(true));

    const asked = events.find((e) => e.type === "permission.asked") as {
      requestId: string;
      action: string;
      resources: string[];
    };
    // The dialog needs to say WHAT is being approved — the command line, not the
    // tool's internal id.
    expect(asked.action).toBe("execute");
    expect(asked.resources).toEqual(["pytest -q"]);
    expect((await runtime.listPermissions(sessionId)).map((p) => p.requestId)).toEqual([asked.requestId]);

    await runtime.replyPermission(asked.requestId, "once");
    // The reply IS the response to the agent's request, and it must carry the
    // agent's OWN option id.
    await vi.waitFor(() =>
      expect(agent.sent.some((m) => m.id === 99 && m.result !== undefined)).toBe(true),
    );
    const answer = agent.sent.find((m) => m.id === 99);
    expect(answer?.result).toEqual({ outcome: { outcome: "selected", optionId: "allow-once" } });
    expect(await runtime.listPermissions()).toEqual([]);
    expect(events.some((e) => e.type === "permission.resolved")).toBe(true);
  });

  it("ends the turn when the agent dies mid-prompt", async () => {
    // Without this the UI spins on a turn that can never finish: the prompt's
    // response never arrives because the process is gone.
    const { runtime, events, sessionId } = await connected((msg, a) => {
      if (msg.method === "session/prompt") setTimeout(() => a.die("codex-acp exited (code 1): auth failed"), 0);
    });
    await runtime.sendPrompt(sessionId, "hello");
    expect(events.filter((e) => e.type === "error").map((e) => (e as { message: string }).message)).toContain(
      "codex-acp exited (code 1): auth failed",
    );
    expect(last(events)).toEqual({ type: "session.idle", sessionId });
    expect(runtime.getStatus()).toBe("offline");
  });

  it("reports a stop reason that is neither completion nor cancellation", async () => {
    const { runtime, events, sessionId } = await connected((msg, a) => {
      if (msg.method === "session/prompt") a.reply(msg.id, { stopReason: "max_tokens" });
    });
    await runtime.sendPrompt(sessionId, "write a novel");
    expect(events.find((e) => e.type === "error")).toMatchObject({ message: "the turn stopped: max_tokens" });
  });

  it("cancels with a notification, since session/cancel has no response", async () => {
    const { runtime, agent, sessionId } = await connected();
    await runtime.abortSession(sessionId);
    const cancel = agent.sent.find((m) => m.method === "session/cancel");
    expect(cancel).toBeTruthy();
    expect(cancel?.id).toBeUndefined();
  });

  it("refuses what ACP cannot do instead of pretending", async () => {
    const { runtime, sessionId } = await connected();
    // Every one of these is a real capability gap in ACP v1. Silently doing
    // nothing would be worse than an error the UI can show.
    await expect(runtime.revert(sessionId, "m1")).rejects.toThrow(/reverting/);
    await expect(runtime.runShell(sessionId, "ls")).rejects.toThrow(/outside a turn/);
    await expect(runtime.setSessionArchived(sessionId, true)).rejects.toThrow(/archiving/);
    expect(await runtime.listSkills()).toEqual([]);
  });

  it("asks for nothing the agent did not advertise", async () => {
    // Capability gating is the spec's rule, not politeness: a Client MUST check
    // `initialize` before calling session/list, session/load or session/delete.
    const { transport, agent } = fakeAgent((msg, a) => {
      if (msg.method === "initialize")
        return a.reply(msg.id, { protocolVersion: 1, agentInfo: { name: "plain" } });
      if (msg.method === "session/new") return a.reply(msg.id, { sessionId: "s1" });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws/project" });
    await runtime.connect();
    const sessionId = await runtime.createSession("Local only");

    expect(runtime.supportsSessionList).toBe(false);
    expect(runtime.supportsSessionReplay).toBe(false);
    expect(runtime.supportsSessionDelete).toBe(false);
    // Sessions this client made are still listed — that much needs no agent.
    expect(await runtime.listSessions()).toEqual([
      { id: "s1", title: "Local only", directory: "/ws/project" },
    ]);
    expect(await runtime.getMessages(sessionId)).toEqual([]);
    await runtime.deleteSession(sessionId);
    expect(await runtime.listSessions()).toEqual([]);
    expect(agent.sent.map((m) => m.method)).toEqual(["initialize", "session/new"]);
  });

  it("replays a past conversation as history instead of as live events", async () => {
    const { runtime, agent, events } = await connected((msg, a) => {
      if (msg.method !== "session/load") return;
      const sessionId = (msg.params as { sessionId: string }).sessionId;
      const update = (update: Record<string, unknown>) =>
        a.notify("session/update", { sessionId, update });
      update({
        sessionUpdate: "user_message_chunk",
        messageId: "u1",
        content: { type: "text", text: "Plot the trend" },
      });
      update({ sessionUpdate: "agent_thought_chunk", messageId: "t1", content: { type: "text", text: "thinking" } });
      update({ sessionUpdate: "tool_call", toolCallId: "c1", kind: "read", title: "read data.csv", status: "pending" });
      update({
        sessionUpdate: "tool_call_update",
        toolCallId: "c1",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "42 rows" } }],
      });
      update({ sessionUpdate: "agent_message_chunk", messageId: "a1", content: { type: "text", text: "Rising " } });
      update({ sessionUpdate: "agent_message_chunk", messageId: "a1", content: { type: "text", text: "since May." } });
      // The response comes only after the whole conversation has been streamed.
      a.reply(msg.id, {});
    });
    const before = events.length;
    const history = await runtime.getMessages("019fd184-40c8-79d2-a310-268586830f43");

    // The replay is HISTORY: emitting it would append the whole conversation to
    // the thread that asked for it.
    expect(events.length).toBe(before);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ role: "user", id: "u1" });
    expect(history[0].parts[0].text).toBe("Plot the trend");
    const assistant = history[1];
    expect(assistant.role).toBe("assistant");
    // Deltas of one message are one part, and the tool keeps its own.
    expect(assistant.parts.map((p) => p.type)).toEqual(["reasoning", "tool", "text"]);
    expect(assistant.parts[2].text).toBe("Rising since May.");
    expect(assistant.parts[1].state).toMatchObject({
      // The runtime's OWN status vocabulary, not ACP's — this is what the
      // history reader understands.
      status: "completed",
      title: "read data.csv",
      output: "42 rows",
    });
    // Every replayed message is finished: an assistant message with no
    // completion time is how the app recognises a turn still in flight, and a
    // reopened session must not show "Working…" for a turn that ended days ago.
    expect(history.every((m) => typeof m.completed === "number")).toBe(true);
    // Live events flow again once the replay is over.
    agent.notify("session/update", {
      sessionId: "019fd184-40c8-79d2-a310-268586830f43",
      update: { sessionUpdate: "agent_message_chunk", messageId: "a2", content: { type: "text", text: "ok" } },
    });
    expect(last(events)).toMatchObject({ type: "text.updated", text: "ok" });
  });

  it("lists the agent's own sessions, paged, without losing the one just created", async () => {
    const { runtime, agent, sessionId } = await connected((msg, a) => {
      if (msg.method !== "session/list") return;
      const cursor = (msg.params as { cursor?: string }).cursor;
      if (!cursor)
        return a.reply(msg.id, {
          sessions: [
            { sessionId: "old-1", cwd: "/ws/other", title: "Yesterday", updatedAt: "2026-08-04T10:00:00Z" },
          ],
          nextCursor: "page-2",
        });
      a.reply(msg.id, { sessions: [{ sessionId: "old-2", cwd: "/ws/project" }], nextCursor: null });
    });
    const sessions = await runtime.listSessions();

    expect(sessions.map((s) => s.id)).toEqual(["old-1", "old-2", sessionId]);
    // Each session carries its OWN folder: the sidebar groups by it, so a
    // conversation from another project must not claim the current one.
    expect(sessions[0]).toMatchObject({
      title: "Yesterday",
      directory: "/ws/other",
      updated: Date.parse("2026-08-04T10:00:00Z"),
    });
    // Deliberately unfiltered by cwd, though session/list accepts that filter —
    // filtering would hide every conversation outside the current folder.
    const listed = agent.sent.filter((m) => m.method === "session/list");
    expect(listed.map((m) => m.params)).toEqual([{}, { cursor: "page-2" }]);
  });

  it("keeps the sidebar when listing fails", async () => {
    const { runtime, sessionId } = await connected((msg, a) => {
      if (msg.method === "session/list") a.replyError(msg.id, -32000, "no history store");
    });
    // A transient RPC error must not read as "your history is gone".
    expect((await runtime.listSessions()).map((s) => s.id)).toEqual([sessionId]);
  });

  it("restores a session the agent process no longer knows, without replaying it", async () => {
    // The case that used to strand a conversation: the agent child restarted
    // (crash, or the user switched agents and back) while the thread stayed on
    // screen, and the next prompt went to a session the new process had never
    // heard of. `session/resume` restores the context and reconnects the MCP
    // servers WITHOUT replaying history we are already showing.
    const events: OpenCodeEvent[] = [];
    const { transport, agent } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/list")
        return a.reply(msg.id, {
          sessions: [{ sessionId: "from-yesterday", cwd: "/ws/older-project", title: "Trend" }],
        });
      if (msg.method === "session/resume") return a.reply(msg.id, {});
      if (msg.method === "session/prompt") return a.reply(msg.id, { stopReason: "end_turn" });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws/current" });
    runtime.onEvent((e) => events.push(e));
    await runtime.connect();
    // The sidebar listed it; nothing here created it.
    await runtime.listSessions();

    await runtime.sendPrompt("from-yesterday", "carry on");

    const resumed = agent.sent.find((m) => m.method === "session/resume");
    // Restored into the folder it BELONGS to (from session/list), not the one
    // the app happens to be standing in.
    expect(resumed?.params).toEqual({
      sessionId: "from-yesterday",
      cwd: "/ws/older-project",
      mcpServers: [],
    });
    // It ran: resume came first, then the prompt.
    expect(agent.sent.filter((m) => m.method === "session/load")).toEqual([]);
    expect(agent.sent.map((m) => m.method)).toEqual([
      "initialize",
      "session/list",
      "session/resume",
      "session/prompt",
    ]);
    expect(last(events)).toEqual({ type: "session.idle", sessionId: "from-yesterday" });
  });

  it("loads instead when the agent cannot resume, and keeps that replay out of the thread", async () => {
    const events: OpenCodeEvent[] = [];
    const { transport, agent } = fakeAgent((msg, a) => {
      if (msg.method === "initialize")
        return a.reply(msg.id, {
          protocolVersion: 1,
          agentInfo: { name: "loader" },
          // Can replay, cannot resume.
          agentCapabilities: { loadSession: true },
        });
      if (msg.method === "session/load") {
        a.notify("session/update", {
          sessionId: "old-1",
          update: {
            sessionUpdate: "agent_message_chunk",
            messageId: "a1",
            content: { type: "text", text: "said this yesterday" },
          },
        });
        return a.reply(msg.id, {});
      }
      if (msg.method === "session/prompt") return a.reply(msg.id, { stopReason: "end_turn" });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws/current" });
    runtime.onEvent((e) => events.push(e));
    await runtime.connect();

    await runtime.sendPrompt("old-1", "carry on");

    expect(agent.sent.map((m) => m.method)).toEqual(["initialize", "session/load", "session/prompt"]);
    // The point of diverting it: yesterday's answer must not arrive as a live
    // event on top of the thread already showing it.
    expect(events.filter((e) => e.type === "text.updated")).toEqual([]);
    expect(last(events)).toEqual({ type: "session.idle", sessionId: "old-1" });
  });

  it("checks sign-in at connect and reports the login command", async () => {
    // `initialize` succeeds for a signed-out agent, so "connected" in Settings
    // said nothing. The credentials are first exercised by `session/new`, so
    // the probe opens one and reads the answer.
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize")
        return a.reply(msg.id, {
          ...INITIALIZE_RESULT,
          authMethods: [{ id: "claude-login", description: "Run `claude /login` in the terminal" }],
        });
      if (msg.method === "session/new")
        return a.replyError(msg.id, -32603, "Internal error: Failed to authenticate. API Error: 401");
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    expect(runtime.getStatus()).toBe("ready");
    expect(await runtime.probeSignIn()).toMatch(/Run `claude \/login` in the terminal/);
    expect(runtime.signInRequired).toMatch(/Run `claude \/login` in the terminal/);
  });

  it("adopts the probe's session so connecting costs no extra round-trip", async () => {
    let opened = 0;
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/list") return a.reply(msg.id, { sessions: [] });
      if (msg.method === "session/new") {
        opened++;
        return a.reply(msg.id, { ...NEW_SESSION_RESULT, sessionId: `s-${opened}` });
      }
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    expect(await runtime.probeSignIn()).toBeNull();
    expect(opened).toBe(1);
    const id = await runtime.createSession("first");
    expect(id).toBe("s-1");
    expect(opened).toBe(1);
    expect((await runtime.listSessions()).find((s) => s.id === id)?.title).toBe("first");
  });

  it("does not treat a probe failure that is not about sign-in as one", async () => {
    // Seen from a real bridge: a session that closes before answering. That is
    // the first real createSession's to explain, with its own context.
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new")
        return a.replyError(msg.id, -32603, "Internal error: Query closed before response received");
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    expect(await runtime.probeSignIn()).toBeNull();
    expect(runtime.getStatus()).toBe("ready");
  });

  it("opens a fresh session when the folder moved since the probe", async () => {
    const cwds: unknown[] = [];
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new") {
        cwds.push((msg.params as { cwd: unknown }).cwd);
        return a.reply(msg.id, { ...NEW_SESSION_RESULT, sessionId: `s-${cwds.length}` });
      }
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws/a" });
    await runtime.connect();
    await runtime.probeSignIn();
    runtime.setCwd("/ws/b");
    const id = await runtime.createSession();
    expect(id).toBe("s-2");
    expect(cwds).toEqual(["/ws/a", "/ws/b"]);
  });

  it("offers the agent's models as a selector when it gives no config option for them", async () => {
    // claude-code-acp answers session/new with `models` and no configOptions.
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new")
        return a.reply(msg.id, {
          sessionId: "s1",
          models: {
            availableModels: [
              { modelId: "default", name: "Default (recommended)" },
              { modelId: "sonnet", name: "Sonnet" },
              { modelId: "haiku", name: "Haiku" },
            ],
            currentModelId: "default",
          },
        });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    const id = await runtime.createSession();
    const options = runtime.configOptionsFor(id);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ category: "model", currentValue: "default" });
    expect(options[0].options?.map((o) => o.value)).toEqual(["default", "sonnet", "haiku"]);
  });

  it("leaves an agent's own model option alone", async () => {
    const own = { id: "model", category: "model", currentValue: "a", options: [{ value: "a" }, { value: "b" }] };
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new")
        return a.reply(msg.id, {
          sessionId: "s1",
          models: { availableModels: [{ modelId: "x" }], currentModelId: "x" },
          configOptions: [own],
        });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    const id = await runtime.createSession();
    expect(runtime.configOptionsFor(id)).toEqual([own]);
  });

  it("switches the synthesised model through session/set_model", async () => {
    const { transport, agent } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new")
        return a.reply(msg.id, {
          sessionId: "s1",
          models: { availableModels: [{ modelId: "default" }, { modelId: "sonnet" }], currentModelId: "default" },
        });
      if (msg.method === "session/set_model") return a.reply(msg.id, {});
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    const id = await runtime.createSession();
    const [option] = runtime.configOptionsFor(id);
    const after = await runtime.setConfigOption(id, option.id, "sonnet");
    const sent = agent.sent.find((m) => m.method === "session/set_model");
    expect(sent?.params).toEqual({ sessionId: "s1", modelId: "sonnet" });
    expect(agent.sent.some((m) => m.method === "session/set_config_option")).toBe(false);
    expect(after[0]).toMatchObject({ currentValue: "sonnet" });
  });

  it("keeps a session the user removed out of the list when the agent cannot delete it", async () => {
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/list")
        return a.reply(msg.id, {
          sessions: [
            { sessionId: "gone", cwd: "/ws", title: "removed here" },
            { sessionId: "kept", cwd: "/ws", title: "still wanted" },
          ],
        });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws", hiddenSessions: () => new Set(["gone"]) });
    await runtime.connect();
    expect((await runtime.listSessions()).map((s) => s.id)).toEqual(["kept"]);
  });

  it("remembers the agent's model list so a draft can offer it before its session exists", async () => {
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new")
        return a.reply(msg.id, {
          sessionId: "s1",
          models: { availableModels: [{ modelId: "default" }, { modelId: "sonnet" }], currentModelId: "default" },
        });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    expect(runtime.lastModels()).toBeNull();
    await runtime.createSession();
    expect(runtime.lastModels()?.models.map((m) => m.modelId)).toEqual(["default", "sonnet"]);
    // The draft's selector: the same option shape, with the pending choice selected.
    const draft = modelConfigOption(runtime.lastModels()!.models, "sonnet");
    expect(draft).toMatchObject({ category: "model", currentValue: "sonnet" });
    expect(draft.options?.map((o) => o.value)).toEqual(["default", "sonnet"]);
  });

  it("lists only the sessions that live in folders this app manages", async () => {
    // The agent's session store is shared with the user's terminal: claude
    // Code keeps every session in ~/.claude regardless of who created it, and
    // `session/list` without a filter returns all of them. The sidebar showed
    // the user's unrelated terminal work. Scope to the workspace root and the
    // project folders (in-place imports included), and keep what we created.
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new") return a.reply(msg.id, NEW_SESSION_RESULT);
      if (msg.method === "session/list")
        return a.reply(msg.id, {
          sessions: [
            { sessionId: "ws-1", cwd: "/ws/one", title: "in workspace" },
            { sessionId: "proj-1", cwd: "/home/me/imported-proj/sub", title: "in a project" },
            { sessionId: "terminal-1", cwd: "/home/me/other-repo", title: "terminal work" },
            { sessionId: "prefix-trap", cwd: "/ws-not-ours/x", title: "shares a prefix only" },
          ],
        });
    });
    const runtime = new AcpRuntime({
      transport,
      cwd: "/ws",
      sessionRoots: () => ["/ws", "/home/me/imported-proj"],
    });
    await runtime.connect();
    const ids = (await runtime.listSessions()).map((s) => s.id).sort();
    expect(ids).toEqual(["proj-1", "ws-1"]);
  });

  it("keeps a session it created even before the agent lists it", async () => {
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new") return a.reply(msg.id, NEW_SESSION_RESULT);
      if (msg.method === "session/list") return a.reply(msg.id, { sessions: [] });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws", sessionRoots: () => ["/ws"] });
    await runtime.connect();
    const id = await runtime.createSession("mine");
    expect((await runtime.listSessions()).map((s) => s.id)).toContain(id);
  });

  it("does not filter at all when no roots are given", async () => {
    // Backwards compatible: a caller that never opted in sees the old behaviour.
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/list")
        return a.reply(msg.id, { sessions: [{ sessionId: "any", cwd: "/elsewhere" }] });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    expect((await runtime.listSessions()).map((s) => s.id)).toEqual(["any"]);
  });

  it("refuses a session it cannot restore rather than pretending to send", async () => {
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize")
        return a.reply(msg.id, { protocolVersion: 1, agentInfo: { name: "plain" } });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    await expect(runtime.sendPrompt("ghost", "hi")).rejects.toThrow(/unknown session ghost/);
  });

  it("tells the user the actual login command, not just the method's name", async () => {
    // The agent ships the instruction in `description` — claude-code-acp sends
    // "Run `claude /login` in the terminal". Naming the method ("Log in with
    // Claude Code") without it leaves the user to guess the command, which is
    // the one thing they needed.
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize")
        return a.reply(msg.id, {
          ...INITIALIZE_RESULT,
          authMethods: [
            {
              id: "claude-login",
              name: "Log in with Claude Code",
              description: "Run `claude /login` in the terminal",
            },
          ],
        });
      if (msg.method === "session/new") return a.replyError(msg.id, -32000, "Not logged in");
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    await expect(runtime.createSession()).rejects.toThrow(/Run `claude \/login` in the terminal/);
  });

  it("explains an auth failure the agent reports as an ordinary error", async () => {
    // claude-code-acp does not use ACP's auth_required code: a 401 surfaces as
    // a generic internal error carrying the API's own words. Matching only on
    // -32000 left the user staring at a raw "API key is invalid" with no next
    // step, which is what shipped in 0.6.2.
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize")
        return a.reply(msg.id, {
          ...INITIALIZE_RESULT,
          authMethods: [
            { id: "claude-login", name: "Log in with Claude Code", description: "Run `claude /login` in the terminal" },
          ],
        });
      if (msg.method === "session/new")
        return a.replyError(
          msg.id,
          -32603,
          'Internal error: Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."}}',
        );
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    await expect(runtime.createSession()).rejects.toThrow(/Run `claude \/login` in the terminal/);
  });

  it("turns a signed-out agent's refusal into something the user can act on", async () => {
    // -32000 is ACP's auth_required. The sign-in is the AGENT's own, so there is
    // nothing to fix in Settings — the raw refusal is a dead end, and the whole
    // fix is the sentence saying where the login lives.
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new") return a.replyError(msg.id, -32000, "Not logged in");
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();

    await expect(runtime.createSession()).rejects.toThrow(
      /Codex is not signed in: Not logged in\. Its sign-in is its own — run the agent's login command in a terminal \(it offers ChatGPT\), then reconnect/,
    );
  });

  it("leaves every other failure exactly as the agent worded it", async () => {
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new") return a.replyError(msg.id, -32603, "disk full");
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws" });
    await runtime.connect();
    await expect(runtime.createSession()).rejects.toThrow(/^disk full$/);
  });

  it("changes one of the agent's own selectors and takes the answer whole", async () => {
    const OPTIONS = [
      { id: "model", name: "Model", category: "model", type: "select", currentValue: "fast", options: [] },
    ];
    // Built directly: this agent answers `session/new` with its own selectors,
    // which the shared fixture does not.
    const { transport } = fakeAgent((msg, a) => {
      if (msg.method === "initialize") return a.reply(msg.id, INITIALIZE_RESULT);
      if (msg.method === "session/new")
        return a.reply(msg.id, { sessionId: "s-cfg", configOptions: OPTIONS });
      if (msg.method === "session/set_config_option")
        return a.reply(msg.id, {
          configOptions: [{ ...OPTIONS[0], currentValue: "slow" }, { id: "effort", type: "select", currentValue: "high" }],
        });
    });
    const runtime = new AcpRuntime({ transport, cwd: "/ws/project" });
    await runtime.connect();
    const sessionId = await runtime.createSession("Config");
    expect(runtime.configOptionsFor(sessionId)).toEqual(OPTIONS);
    const next = await runtime.setConfigOption(sessionId, "model", "slow");

    // The agent answers with the COMPLETE list and it replaces ours: options
    // depend on each other (a model decides which efforts exist), so merging a
    // stale copy would offer levels the agent no longer has.
    expect(next.map((o) => o.id)).toEqual(["model", "effort"]);
    expect(runtime.configOptionsFor(sessionId)[0].currentValue).toBe("slow");
  });
});

describe("pickPermissionOption", () => {
  const options = [
    { optionId: "a1", kind: "allow_once" },
    { optionId: "a2", kind: "allow_always" },
    { optionId: "r1", kind: "reject_once" },
  ];

  it("maps our three replies onto the agent's own option ids", () => {
    expect(pickPermissionOption(options, "once")).toBe("a1");
    expect(pickPermissionOption(options, "always")).toBe("a2");
    expect(pickPermissionOption(options, "reject")).toBe("r1");
  });

  it("falls back to allow_always for a one-off only when there is no allow_once", () => {
    expect(pickPermissionOption([{ optionId: "a2", kind: "allow_always" }], "once")).toBe("a2");
  });

  it("never substitutes another option for a missing allow", () => {
    // The dangerous direction: "always" must not silently become "once" — and an
    // agent offering no allow at all must not have one invented.
    expect(pickPermissionOption([{ optionId: "a1", kind: "allow_once" }], "always")).toBeUndefined();
    expect(pickPermissionOption([{ optionId: "r1", kind: "reject_once" }], "once")).toBeUndefined();
    expect(pickPermissionOption(undefined, "once")).toBeUndefined();
  });
});

describe("isWithinRoots", () => {
  it("accepts the root itself and anything beneath it", () => {
    expect(isWithinRoots("/ws", ["/ws"])).toBe(true);
    expect(isWithinRoots("/ws/a/b", ["/ws"])).toBe(true);
  });

  it("rejects a sibling that merely shares a prefix", () => {
    expect(isWithinRoots("/ws-other/x", ["/ws"])).toBe(false);
  });

  it("ignores trailing separators on either side", () => {
    expect(isWithinRoots("/ws/a/", ["/ws/"])).toBe(true);
  });

  it("treats Windows paths case-insensitively and across slash styles", () => {
    // The agent reports what the OS gave it; the app's project path is the
    // canonical form. On Windows those differ in case and separators.
    expect(isWithinRoots("C:\\Users\\Me\\Proj\\sub", ["c:/users/me/proj"])).toBe(true);
    expect(isWithinRoots("C:\\Users\\Me\\Projects", ["c:/users/me/proj"])).toBe(false);
  });

  it("is case-sensitive on POSIX paths", () => {
    expect(isWithinRoots("/Ws/a", ["/ws"])).toBe(false);
  });

  it("is false for an empty root list", () => {
    expect(isWithinRoots("/ws", [])).toBe(false);
  });
});
