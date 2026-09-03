import { CheckCircle2, XCircle } from "lucide-react";
import { useToastStore } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { Panel } from "./Panel";

/** Bottom-center stack of transient notifications (download saved/failed, …). */
export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2">
      {toasts.map((t) => (
        // Floating chrome, so glass and the popover shadow rather than the
        // rail's heavier lift; the tone lives in the border, not the fill.
        <Panel
          key={t.id}
          glass
          lifted={false}
          className={cn(
            "pointer-events-auto max-w-[70vw] overflow-hidden shadow-pop",
            t.tone === "success" ? "border-ok/30" : "border-error/30",
          )}
        >
          <button
            onClick={() => dismiss(t.id)}
            className={cn(
              "flex w-full items-center gap-2 rounded-card px-3.5 py-2 text-sm",
              "transition-colors duration-quick ease-standard hover:bg-fill-3",
              t.tone === "success" ? "text-text" : "text-error",
            )}
          >
            {t.tone === "success" ? (
              <CheckCircle2 size={15} className="shrink-0 text-ok" />
            ) : (
              <XCircle size={15} className="shrink-0 text-error" />
            )}
            <span className="truncate">{t.message}</span>
          </button>
        </Panel>
      ))}
    </div>
  );
}
