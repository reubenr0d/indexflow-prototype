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
const dismissPendingListeners = new Set<() => void>();

export function showToast(type: ToastType, message: string) {
  const toast: ToastData = { id: String(++toastId), type, message };
  listeners.forEach((l) => l(toast));
}

export function dismissPending() {
  dismissPendingListeners.forEach((l) => l());
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    const listener = (toast: ToastData) => {
      setToasts((prev) => {
        if (toast.type === "pending") {
          return [...prev, toast];
        }
        return [...prev.filter((t) => t.type !== "pending"), toast];
      });
      if (toast.type !== "pending") {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, 5000);
      }
    };
    const pendingDismisser = () => {
      setToasts((prev) => prev.filter((t) => t.type !== "pending"));
    };
    listeners.add(listener);
    dismissPendingListeners.add(pendingDismisser);
    return () => {
      listeners.delete(listener);
      dismissPendingListeners.delete(pendingDismisser);
    };
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="fixed right-4 top-16 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className={cn(
              "flex items-center gap-3 rounded-md border border-app-border bg-app-surface px-4 py-3 shadow-[var(--shadow)]",
              t.type === "error" && "border-app-danger/40 bg-app-danger/5"
            )}
          >
            {t.type === "pending" && <Loader2 className="h-4 w-4 animate-spin text-app-accent" />}
            {t.type === "success" && <Check className="h-4 w-4 text-app-success" />}
            {t.type === "error" && <X className="h-4 w-4 text-app-danger" />}
            <span className="text-sm font-medium text-app-text">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="ml-1 text-app-muted hover:text-app-text"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
