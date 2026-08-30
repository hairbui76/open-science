import { memo } from "react";
import {
  Box,
  FileBarChart,
  FileCode2,
  FileText,
  Image as ImageIcon,
  NotebookPen,
  Paperclip,
  SquareArrowOutUpRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ArtifactBlock, ArtifactKind } from "@ai4s/shared";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

const ICON: Record<ArtifactKind, React.ReactNode> = {
  figure: <ImageIcon size={15} />,
  script: <FileCode2 size={15} />,
  report: <FileText size={15} />,
  table: <FileBarChart size={15} />,
  notebook: <NotebookPen size={15} />,
  model: <Box size={15} />,
  data: <Paperclip size={15} />,
};

/** A file the agent produced, surfaced live in the thread and openable in the inspector. */
export const ArtifactCard = memo(function ArtifactCard({
  block,
  onOpen,
}: {
  block: ArtifactBlock;
  onOpen?: (a: ArtifactBlock) => void;
}) {
  const { t } = useTranslation(["session", "common"]);
  return (
    // Flat: this sits in the conversation flow, it does not float over it.
    <Card
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 text-sm",
        onOpen && "cursor-pointer transition-colors duration-quick ease-standard hover:bg-fill-3",
      )}
      onClick={onOpen ? () => onOpen(block) : undefined}
      role={onOpen ? "button" : undefined}
    >
      <span className="shrink-0 text-accent">{ICON[block.artifact]}</span>
      <span className="truncate font-medium text-text-strong">{block.filename}</span>
      <span className="shrink-0 rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-text-muted ring-1 ring-border">
        {t(`artifact.kind.${block.artifact}`)}
      </span>
      <span className="shrink-0 truncate text-xs text-text-muted">
        {t("artifact.via", { tool: block.tool })}
      </span>
      <div className="flex-1" />
      {onOpen && (
        <span className="flex shrink-0 items-center gap-1 rounded-input px-2 py-1 text-xs text-link">
          <SquareArrowOutUpRight size={13} /> {t("artifact.open")}
        </span>
      )}
    </Card>
  );
});
