"use client";

import { Card } from "./card";
import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  className?: string;
  isLoading?: boolean;
}

export function StatCard({ label, value, subValue, className, isLoading }: StatCardProps) {
  if (isLoading) {
    return (
      <Card className={cn("p-6", className)}>
        <Skeleton className="mb-2 h-4 w-20" />
        <Skeleton className="h-10 w-32" />
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <Card className={cn("p-6", className)}>
        <p className="text-sm font-medium text-neutral-400">{label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          {value}
        </p>
        {subValue && (
          <p className="mt-1 text-sm text-neutral-500">{subValue}</p>
        )}
      </Card>
    </motion.div>
  );
}
