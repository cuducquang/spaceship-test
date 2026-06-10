import { redirect } from "next/navigation";

/** History now lives in the chat workspace's left panel. */
export default function HistoryPage() {
  redirect("/chat");
}
