import { Sidebar } from "@/components/Sidebar";
import { RightPanel } from "@/components/RightPanel";
import { CreatePost } from "@/components/CreatePost";
import { FeedTabs } from "@/components/FeedTabs";
import { Post } from "@/components/Post";

const posts = [
  { id: 1, author: "Иван", handle: "@ivan123", text: "Первый пост! Строю соцсеть 🚀" },
  { id: 2, author: "Мария", handle: "@maria_DEV", text: "Лента крутится отдельно от боковых колонок 👌" },
  { id: 3, author: "Пётр", handle: "@petr42", text: "Проверяю работу вкладок" },
];

export default function Home() {
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <Sidebar />

      {/* Центр — лента */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto border-x border-gray-200 bg-white min-h-full">
          <CreatePost />
          <FeedTabs />
          {posts.map((post) => (
            <Post key={post.id} {...post} />
          ))}
        </div>
      </main>

      <RightPanel />
    </div>
  );
}