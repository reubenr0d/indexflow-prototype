"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "pending" | "success" | "error";

export interface ToastData {
  id: string;
  type: ToastType;
  message: string;
}

let toastId = 0;
const listeners = new Set<(toast: ToastData) => void>();

export function showToast(type: ToastType, message: string) {
  const toast: ToastData = { id: String(++toastId), type, message };
  listeners.forEach((l) => l(toast));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    const listener = (toast: ToastData) => {
      setToasts((prev) => [...prev, toast]);
      if (toast.type !== "pending") {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, 5000);
      }
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className={cn(
              "flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-neutral-100 dark:bg-neutral-900 dark:ring-neutral-800",
              t.type === "error" && "bg-red-50 ring-red-100 dark:bg-red-950/40 dark:ring-red-900"
            )}
          >
            {t.type === "pending" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            {t.type === "success" && <Check className="h-4 w-4 text-emerald-500" />}
            {t.type === "error" && <X className="h-4 w-4 text-red-500" />}
            <span className="text-sm font-medium text-neutral-900 dark:text-white">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-2 text-neutral-400 hover:text-neutral-600">
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
