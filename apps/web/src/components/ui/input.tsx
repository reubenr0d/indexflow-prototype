import { cn } from "@/lib/utils";
import { type InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-md border border-app-border bg-app-bg px-3.5 text-sm text-app-text placeholder:text-app-muted/70 focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent/30 dark:bg-app-bg-subtle",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
