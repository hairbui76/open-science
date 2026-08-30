import { useTranslation } from "react-i18next";
import type { ModelStatus, RuntimeStatus } from "@ai4s/shared";
import { useRuntimeStore } from "@/lib/runtime";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui/Chip";

const RUNTIME_TONE: Record<RuntimeStatus, string> = {
  ready: "bg-ok",
  connecting: "bg-warn",
  error: "bg-error",
  offline: "bg-muted",
};

const MODEL_TONE: Record<ModelStatus, string> = {
  connected: "bg-ok",
  disconnected: "bg-muted",
  error: "bg-error",
};

export function StatusPills() {
  const { t } = useTranslation("nav");
  // Both live from the runtime: connection status + the configured default model.
  const runtime = useRuntimeStore((s) => s.status);
  const defaultModel = useRuntimeStore((s) => s.defaultModel);
  const model: ModelStatus = defaultModel ? "connected" : "disconnected";

  return (
    <div className="flex flex-col items-start gap-1">
      <Pill
        dot={RUNTIME_TONE[runtime]}
        label={t("status.runtime")}
        value={t(`status.values.${runtime}`)}
      />
      <Pill
        dot={MODEL_TONE[model]}
        label={t("status.model")}
        value={defaultModel ? defaultModel.split("/").pop()! : t("status.modelNotSet")}
      />
    </div>
  );
}

/** `readOnly`: these report state, they are not controls — there is nothing to
 *  click, so the chip is a label that happens to be pill-shaped. */
function Pill({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <Chip readOnly className="max-w-full">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 truncate capitalize text-text" title={value}>
        {value}
      </span>
    </Chip>
  );
}
