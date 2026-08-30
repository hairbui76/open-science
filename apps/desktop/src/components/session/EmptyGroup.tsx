import { useTranslation } from "react-i18next";
import { LayoutGrid, Plus } from "lucide-react";
import { useDragPane } from "@/lib/dragPane";
import { useLayoutStore } from "@/lib/layout";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";

/**
 * Onboarding for an empty group (no panes): a full-area drop target plus a
 * "New session" button. The drag controller marks it via `data-empty-group`,
 * so dropping a session here fills the group; the button fills it with a fresh
 * draft pane. Highlights while a drag hovers it.
 */
export function EmptyGroup() {
  const { t } = useTranslation("session");
  const reset = useLayoutStore((s) => s.reset);
  // A session drag hovering the empty zone → highlight.
  const hovering = useDragPane((s) => !!s.active && !!s.active.target && "empty" in s.active.target);
  return (
    <div
      data-empty-group
      className={cn(
        "flex h-full w-full items-center justify-center p-8 transition-colors duration-quick ease-standard",
        // Drop feedback stays on the neutral ladder: the brand pop on this
        // screen belongs to the one CTA below, and a drag highlight that
        // competes with it would put two brand surfaces on an empty pane.
        hovering && "bg-fill-2 ring-1 ring-inset ring-border-selected",
      )}
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <LayoutGrid size={28} strokeWidth={1.5} className="text-text-muted" />
        <div className="text-sm font-medium text-text-strong">{t("group.empty.title")}</div>
        <p className="text-sm text-text-muted">{t("group.empty.hint")}</p>
        {/* Fills the empty group with a fresh draft pane — the only action an
            empty Screen offers, so it is this screen's single brand CTA. */}
        <Button variant="brand" onClick={() => reset(null)} className="mt-1">
          <Plus size={14} strokeWidth={2} />
          {t("group.empty.newSession")}
        </Button>
      </div>
    </div>
  );
}
