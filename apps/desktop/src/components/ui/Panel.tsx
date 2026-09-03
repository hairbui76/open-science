import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Floating chrome: the sidebar rail, a toolbar, a context menu, a toast.
 * Painted on --panel (a step lighter than the page ground) and lifted with
 * shadow-lift, so it reads as sitting above the page rather than drawn on it.
 *
 * `glass` frosts it. The blur lives in the .panel-glass rule in index.css
 * behind an @supports guard rather than in a Tailwind utility, because the
 * fallback has to be a solid, opaque --panel: a backdrop-filter that does not
 * paint would otherwise leave a translucent surface with page content showing
 * through the text. Same lesson as #122 — legibility never depends on an
 * effect the engine may not have.
 */
export const Panel = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { glass?: boolean; lifted?: boolean }
>(function Panel({ glass = false, lifted = true, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-card border border-border",
        glass ? "panel-glass" : "bg-panel",
        lifted && "shadow-lift",
        className,
      )}
      {...rest}
    />
  );
});
