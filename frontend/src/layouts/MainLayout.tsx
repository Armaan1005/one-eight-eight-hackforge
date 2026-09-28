import { useEffect, type ReactNode } from "react";
import { Sidebar, TabBar } from "../components/Sidebar";
import { ensureJobsHubStarted } from "../services/signalr";

export function MainLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    ensureJobsHubStarted().catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-8 md:px-10 md:pb-16 md:pt-10">{children}</main>
      </div>
      <TabBar />
    </div>
  );
}
