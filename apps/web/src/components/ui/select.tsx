import { cn } from "@/lib/utils";
import { type SelectHTMLAttributes, forwardRef } from "react";
import { ChevronDown } from "lucide-react";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        className="h-11 w-full appearance-none rounded-md border border-app-border bg-app-bg px-3.5 pr-9 text-sm text-app-text focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent/30 dark:bg-app-bg-subtle"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
    </div>
  )
);
Select.displayName = "Select";
