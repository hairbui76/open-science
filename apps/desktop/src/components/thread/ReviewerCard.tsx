import { memo, useState } from "react";
import { ChevronDown, ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FindingLevel, ReviewerBlock } from "@ai4s/shared";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const BADGE: Record<FindingLevel, { className: string }> = {
  warn: { className: "bg-warn/15 text-warn ring-warn/30" },
  ok: { className: "bg-ok/15 text-ok ring-ok/30" },
  error: { className: "bg-error/15 text-error ring-error/30" },
};

/** Structured reviewer findings. Dismissal is a session-local reading aid —
 *  the underlying review text stays in the conversation. */
export const ReviewerCard = memo(function ReviewerCard({ block }: { block: ReviewerBlock }) {
  const { t } = useTranslation(["session", "common"]);
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  const visible = block.findings
    .map((f, i) => [f, i] as const)
    .filter(([, i]) => !dismissed.has(i));
  return (
    // Flat: a finding list is conversation content, not floating chrome.
    // `overflow-hidden` keeps the header's hover fill inside the rounded edge.
    <Card className="overflow-hidden">
      <button
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors duration-quick ease-standard hover:bg-fill-3"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ShieldCheck size={16} className="text-text-muted" />
        <span className="text-sm font-medium text-text-strong">{t("reviewer.heading")}</span>
        <span className="text-sm text-text-muted">
          {t("reviewer.findingCount", { count: visible.length })}
          {dismissed.size > 0 && ` ${t("reviewer.dismissedCount", { count: dismissed.size })}`}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "ml-auto text-text-muted transition-transform duration-base ease-standard",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {visible.map(([f, i]) => {
            const badge = BADGE[f.level];
            return (
              <div key={i} className="group space-y-1.5">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-pill px-2 py-0.5 text-xs font-medium ring-1",
                      badge.className,
                    )}
                  >
                    {t(`reviewer.badge.${f.level}`)}
                  </span>
                  {(f.tag || f.check) && (
                    <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-muted ring-1 ring-border">
                      {f.tag ?? (f.check ? t(`reviewer.checkTag.${f.check}`) : "")}
                    </span>
                  )}
                  <span className="min-w-0 break-words text-sm font-medium text-text-strong">
                    {f.title}
                  </span>
                  <IconButton
                    size="sm"
                    label={t("reviewer.dismissAria", { title: f.title })}
                    // The tooltip stays the short, generic wording; the long
                    // per-finding phrasing is for the screen reader only.
                    title={t("reviewer.dismissTitle")}
                    className="ml-auto opacity-0 group-hover:opacity-100"
                    onClick={() => setDismissed(new Set([...dismissed, i]))}
                  >
                    <X size={14} />
                  </IconButton>
                </div>
                {f.evidence && (
                  // Evidence is code and file paths — one long token with no
                  // space in it, which `pre-wrap` alone will not break. Without
                  // `break-words` a finding stuck out past the card and made
                  // the whole conversation scroll sideways.
                  <p className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-text-muted">
                    {f.evidence}
                  </p>
                )}
              </div>
            );
          })}
          {visible.length === 0 && block.findings.length > 0 && (
            <p className="text-sm text-text-muted">{t("reviewer.allDismissed")}</p>
          )}
          {block.note && <p className="text-sm text-text-muted">{block.note}</p>}
        </div>
      )}
    </Card>
  );
});
