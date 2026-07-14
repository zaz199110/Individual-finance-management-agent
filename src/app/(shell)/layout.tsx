import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ChatPageSkeleton } from "@/components/chat/ChatPageSkeleton";

export default function ShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<ChatPageSkeleton />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
