"use client";

import { Suspense, use } from "react";
import { ChatWorkspace } from "@/components/chat/workspace";

export default function ChatByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <ChatWorkspace conversationId={id} />
    </Suspense>
  );
}
