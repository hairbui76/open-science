import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import { useSshStore } from "@/lib/ssh";
import { Button, IconButton } from "./Button";
import { Input } from "./Input";
import { Panel } from "./Panel";

/**
 * Sign-in for a compute host that authenticates interactively (#73) — a
 * password, a one-time code, a push approval, or several of those in sequence.
 *
 * The dialog shows the server's OWN question rather than a label of our own:
 * campus 2FA flows word themselves too differently to classify ("Password:",
 * "Passcode or option (1-3):", "Enter PIN+TOKENCODE:"), and guessing wrong is
 * how a working cluster becomes an unusable one. Whatever the server asks is
 * relayed; whatever the user types goes straight into ssh's terminal.
 *
 * It appears wherever the need arises — pressing Connect in Settings, or the
 * agent reaching for a machine mid-run — because the work is blocked until the
 * question is answered.
 */
export function SshSignInDialog() {
  const { t } = useTranslation(["settings", "common"]);
  const host = useSshStore((s) => s.dialogHost);
  const session = useSshStore((s) => (s.dialogHost ? s.sessions[s.dialogHost] : undefined));
  const submitting = useSshStore((s) => s.submitting);
  const answer = useSshStore((s) => s.answer);
  const cancel = useSshStore((s) => s.cancel);
  const dismiss = useSshStore((s) => s.dismiss);

  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prompt = session?.prompt ?? null;

  // Each new question starts from an empty field: a multi-step flow (password,
  // then a code) must never resend the previous answer.
  useEffect(() => {
    setValue("");
    setReveal(false);
    if (prompt) inputRef.current?.focus();
  }, [prompt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void cancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancel]);

  if (!host) return null;
  const failed = session?.status === "failed";
  const waiting = !prompt && !failed;

  const submit = () => {
    if (!prompt || submitting || !value) return;
    void answer(value);
    setValue("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="presentation"
      onClick={() => void cancel()}
    >
      {/* Solid, never glass: a secret is typed here, and nothing of the page
          behind may bleed through the field. */}
      <Panel
        role="dialog"
        aria-label={t("ssh.title", { host })}
        className="w-full max-w-[420px] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Lock size={14} className="shrink-0 text-text-muted" />
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-text-strong">
            {t("ssh.title", { host })}
          </div>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{t("ssh.hint")}</p>

        {/* What the server said around the question: banners, "Duo push sent",
            "Success. Logging you in…" — the context a terminal would show. */}
        {session?.notice && (
          <pre className="mt-3 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-input bg-surface-2 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text-muted">
            {session.notice}
          </pre>
        )}

        {failed ? (
          <p className="mt-3 text-[13px] text-error">{session?.error || t("ssh.failed")}</p>
        ) : waiting ? (
          <div className="mt-3 flex items-center gap-2 text-[13px] text-text-muted">
            <Loader2 size={13} className="animate-spin" />
            {t("ssh.connecting")}
          </div>
        ) : (
          <>
            {/* The server's own words, verbatim — never a label of ours. */}
            <label
              htmlFor="ssh-answer"
              className="mt-3 block font-mono text-[12px] leading-relaxed text-text"
            >
              {prompt}
            </label>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Input
                id="ssh-answer"
                ref={inputRef}
                type={reveal ? "text" : "password"}
                value={value}
                // A password or one-time code: the browser must neither offer
                // to fill it nor hand it to a spell checker.
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                className="min-w-0 flex-1 px-2.5 font-mono text-[13px]"
              />
              <IconButton
                size="sm"
                label={t(reveal ? "ssh.hide" : "ssh.reveal")}
                onClick={() => setReveal((r) => !r)}
              >
                {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
              </IconButton>
            </div>
          </>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-text-muted">{t("ssh.privacy")}</p>

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => void (failed ? dismiss() : cancel())}>
            {failed ? t("ssh.close") : t("common:actions.cancel")}
          </Button>
          {!failed && (
            // The one action this modal exists for, so it carries the brand
            // pop; everything else here is secondary chrome.
            <Button
              variant="brand"
              disabled={submitting || !prompt || !value}
              onClick={submit}
            >
              {t("ssh.submit")}
            </Button>
          )}
        </div>
      </Panel>
    </div>
  );
}
