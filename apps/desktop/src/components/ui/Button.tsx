import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The app's button. Pill-shaped, built out of the ink accent rather than a
 * brand hue: `primary` is what an ordinary confirm/submit looks like, and the
 * brand pop (`bg-brand`) is reserved for the one CTA a screen is actually
 * about. Keeping that distinction in the variant list is what stops every
 * screen from growing three competing coloured buttons.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "brand";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90 active:opacity-100",
  secondary: "border border-border bg-transparent text-text hover:bg-fill-3 active:bg-fill-2",
  ghost: "text-text-muted hover:bg-fill-3 hover:text-text active:bg-fill-2",
  danger: "bg-error text-error-fg hover:opacity-90 active:opacity-100",
  // Sparse by policy: at most one per screen.
  brand: "bg-brand text-brand-fg hover:opacity-90 active:opacity-100",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-7 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-4 text-sm",
};

export const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center rounded-pill font-medium " +
  "transition-colors duration-quick ease-standard " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-selected " +
  "disabled:pointer-events-none disabled:opacity-50";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    children?: ReactNode;
  }
>(function Button({ variant = "secondary", size = "md", className, type, ...rest }, ref) {
  return (
    <button
      ref={ref}
      data-ui-control=""
      // Buttons inside a form default to submit, which has silently submitted
      // filter/toolbar forms before; every button here is explicit.
      type={type ?? "button"}
      className={cn(BUTTON_BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    />
  );
});

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
};

/**
 * Square-footprint, fully-round icon control. Separate from Button because the
 * padding rules differ (an icon needs a fixed box, not text padding) and every
 * instance needs an accessible name it cannot get from a visible label.
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Required: an icon-only control has no text for a screen reader. */
    label: string;
    children?: ReactNode;
  }
>(function IconButton({ variant = "ghost", size = "md", label, className, type, ...rest }, ref) {
  return (
    <button
      ref={ref}
      data-ui-control=""
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={cn(BUTTON_BASE, VARIANTS[variant], ICON_SIZES[size], "p-0", className)}
      {...rest}
    />
  );
});
