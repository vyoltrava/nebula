import { Sidebar } from "@/components/Sidebar";
import { RightPanel } from "@/components/RightPanel";
import { CreatePost } from "@/components/CreatePost";
import { FeedTabs } from "@/components/FeedTabs";

export default async function Home() {
  const posts = await fetch("http://localhost:8000/api/posts", {
    cache: "no-store",
  }).then((r) => r.json());

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />

      <div className="w-px shrink-0 bg-white/10 my-3" />

      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <CreatePost />
        <FeedTabs />
      </main>

      <RightPanel />
    </div>
  );
}