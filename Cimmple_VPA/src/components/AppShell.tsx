import { Outlet } from "react-router-dom";
import { BottomTabs } from "./BottomTabs";

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas dark:bg-canvas-dark">
      <main className="mx-auto w-full max-w-[600px] flex-1 px-4 py-6 pb-[calc(68px+2rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  );
}
