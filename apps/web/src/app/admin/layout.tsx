"use client";

import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { useAccount } from "wagmi";
import { Shield } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Shield className="mb-4 h-12 w-12 text-neutral-300" />
        <p className="text-lg font-medium text-neutral-400">Access Restricted</p>
        <p className="mt-2 text-sm text-neutral-400">
          Connect an admin wallet to access this panel.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <AdminSidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
