import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const FIELD_BASE =
  "w-full rounded-input border border-border bg-surface px-3 py-1.5 text-sm text-text " +
  "transition-colors duration-quick ease-standard " +
  "placeholder:text-text-faint " +
  "focus:outline-none focus:border-border-selected " +
  "disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(FIELD_BASE, className)} {...rest} />;
  },
);

/**
 * Native <select> with the platform's metallic bezel replaced by the app's own
 * chevron — see the .select-chrome rule in index.css. Kept native so the OS
 * popup, keyboard behaviour and accessibility come for free.
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={cn(FIELD_BASE, "select-chrome", className)} {...rest} />;
  },
);
