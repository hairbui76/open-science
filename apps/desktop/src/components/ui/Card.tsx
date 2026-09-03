import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Flat content container: an artifact card, an empty state, a result row.
 * `raised` adds the soft card shadow for something that sits above the page
 * (a preview tile); the default is border-only, which is what most of the
 * app's dense surfaces want.
 *
 * Cards are content. For floating *chrome* — a rail, a toolbar, a menu — use
 * Panel instead: it carries the lift shadow and the optional glass material.
 */
export const Card = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { raised?: boolean }
>(function Card({ raised = false, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-border bg-surface",
        raised && "shadow-card",
        className,
      )}
      {...rest}
    />
  );
});
