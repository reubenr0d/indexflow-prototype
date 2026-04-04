import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-app-border/40 dark:bg-app-border/25",
        className
      )}
      {...props}
    />
  );
}
