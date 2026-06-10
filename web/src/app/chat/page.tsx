"use client";

import { Suspense } from "react";
import { ChatWorkspace } from "@/components/chat/workspace";

export default function ChatPage() {
  return (
    <Suspense>
      <ChatWorkspace />
    </Suspense>
  );
}
