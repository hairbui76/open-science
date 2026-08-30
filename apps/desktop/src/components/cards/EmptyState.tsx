import { Card } from "@/components/ui/Card";

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-10 text-center">
      {/* Drawn on the page, not floating above it — flat card, no shadow. */}
      <Card className="flex max-w-md flex-col gap-2 px-8 py-7">
        <div className="text-lg text-text-strong">{title}</div>
        {hint && <div className="text-sm text-text-muted">{hint}</div>}
      </Card>
    </div>
  );
}
