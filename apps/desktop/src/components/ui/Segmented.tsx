import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Accessible name when `label` is an icon rather than text. */
  ariaLabel?: string;
};

/**
 * Single-select pill row — a mode switch (Preview/Code, a filter row). Uses
 * radiogroup semantics rather than tabs: these switch a value, they do not
 * reveal panels, and a screen reader announcing "tab" for a filter is wrong.
 *
 * Arrow keys move between options because a radiogroup is a single tab stop;
 * without it, keyboard users reach the group and cannot change the value.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group as a whole. */
  label: string;
  className?: string;
}) {
  const move = (delta: number) => {
    const i = options.findIndex((o) => o.value === value);
    if (i < 0) return;
    const next = options[(i + delta + options.length) % options.length];
    onChange(next.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex items-center gap-1", className)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            data-ui-control=""
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.ariaLabel}
            // Only the selected option is in the tab order, so the group is one
            // tab stop and the arrow keys above do the rest.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill px-3 text-xs",
              "transition-colors duration-quick ease-standard",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-selected",
              selected
                ? "bg-accent font-medium text-accent-fg"
                : "text-text-muted hover:bg-fill-3 hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
