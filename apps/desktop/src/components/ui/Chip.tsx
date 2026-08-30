import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A small pill: a filter, a picked model, a workspace label. `selected` is the
 * one place the brand hue appears routinely — it marks "this is the option
 * currently chosen", which is deliberately a different job from the primary
 * CTA, so a selected chip and a CTA can share a screen without competing.
 */
export const Chip = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Visual state only: draws the brand tint. Says nothing about ARIA. */
    selected?: boolean;
    /**
     * Emits aria-pressed. Opt-in, and deliberately separate from `selected`:
     * most chips are not toggles. A popover trigger is described by
     * aria-expanded and an action chip by nothing at all, so defaulting
     * aria-pressed from `selected` announced a toggle that did not exist —
     * every trigger then had to suppress it by hand.
     */
    pressed?: boolean;
    /** Renders as a static label rather than a control (no hover, not tabbable). */
    readOnly?: boolean;
    children?: ReactNode;
  }
>(function Chip({ selected = false, pressed, readOnly = false, className, type, ...rest }, ref) {
  return (
    <button
      ref={ref}
      data-ui-control=""
      type={type ?? "button"}
      aria-pressed={readOnly ? undefined : pressed}
      disabled={readOnly || rest.disabled}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill border px-2.5 text-xs",
        "transition-colors duration-quick ease-standard",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-selected",
        selected
          ? "border-transparent bg-brand-soft font-medium text-brand-text"
          : "border-border bg-surface text-text-muted",
        !readOnly && !selected && "hover:bg-fill-3 hover:text-text",
        // A read-only chip is disabled for interaction but must not look
        // disabled — it is a label, not a dead control.
        readOnly ? "cursor-default disabled:opacity-100" : "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
});
