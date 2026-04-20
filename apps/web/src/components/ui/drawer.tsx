"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Minus, X, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ComponentPropsWithoutRef,
  type ComponentRef,
  forwardRef,
  createContext,
  useContext,
  useState,
  useCallback,
} from "react";

interface DrawerContextValue {
  isMinimized: boolean;
  minimize: () => void;
  maximize: () => void;
  minimizedContent: React.ReactNode;
  setMinimizedContent: (content: React.ReactNode) => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useDrawer() {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error("useDrawer must be used within a Drawer");
  }
  return context;
}

interface DrawerProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Root> {
  children: React.ReactNode;
}

export function Drawer({ children, ...props }: DrawerProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [minimizedContent, setMinimizedContent] = useState<React.ReactNode>(null);

  const minimize = useCallback(() => setIsMinimized(true), []);
  const maximize = useCallback(() => setIsMinimized(false), []);

  return (
    <DrawerContext.Provider
      value={{ isMinimized, minimize, maximize, minimizedContent, setMinimizedContent }}
    >
      <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>
    </DrawerContext.Provider>
  );
}

export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;
export const DrawerPortal = DialogPrimitive.Portal;

export const DrawerOverlay = forwardRef<
  ComponentRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  const { isMinimized } = useDrawer();

  if (isMinimized) return null;

  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  );
});
DrawerOverlay.displayName = "DrawerOverlay";

interface DrawerContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  showMinimize?: boolean;
}

export const DrawerContent = forwardRef<
  ComponentRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, showMinimize = true, ...props }, ref) => {
  const { isMinimized, minimize, maximize, minimizedContent } = useDrawer();

  if (isMinimized) {
    return (
      <DrawerPortal>
        <div className="fixed bottom-4 right-4 z-50">
          <button
            onClick={maximize}
            className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-4 py-2.5 shadow-lg transition-all hover:bg-app-bg-subtle hover:shadow-xl"
          >
            {minimizedContent || (
              <span className="text-sm font-medium text-app-text">Processing...</span>
            )}
            <Maximize2 className="h-4 w-4 text-app-muted" />
          </button>
        </div>
      </DrawerPortal>
    );
  }

  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-lg rounded-t-2xl border border-b-0 border-app-border bg-app-surface shadow-lg duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border-b",
          className
        )}
        {...props}
      >
        <div className="mx-auto mb-2 mt-3 h-1 w-12 rounded-full bg-app-border sm:hidden" />
        {children}
        <div className="absolute right-3 top-3 flex items-center gap-1">
          {showMinimize && (
            <button
              onClick={minimize}
              className="rounded-sm p-1 text-app-muted transition-colors hover:bg-app-bg-subtle hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
              aria-label="Minimize"
            >
              <Minus className="h-4 w-4" />
            </button>
          )}
          <DialogPrimitive.Close className="rounded-sm p-1 text-app-muted transition-colors hover:bg-app-bg-subtle hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
      </DialogPrimitive.Content>
    </DrawerPortal>
  );
});
DrawerContent.displayName = "DrawerContent";

export function DrawerHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 px-6 pt-6 text-center sm:text-left", className)}
      {...props}
    />
  );
}

export function DrawerBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("max-h-[60vh] overflow-y-auto px-6 py-4 sm:max-h-[50vh]", className)}
      {...props}
    />
  );
}

export function DrawerFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 px-6 pb-6 pt-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

export const DrawerTitle = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-app-text", className)}
    {...props}
  />
));
DrawerTitle.displayName = "DrawerTitle";

export const DrawerDescription = forwardRef<
  ComponentRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-app-muted", className)}
    {...props}
  />
));
DrawerDescription.displayName = "DrawerDescription";
