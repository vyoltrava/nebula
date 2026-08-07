export function Post({ author, handle, text }: { author: string; handle: string; text: string }) {
  return (
    <article className="p-4 border-b border-gray-200 hover:bg-gray-50">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-300 shrink-0" />
        <div>
          <p className="font-semibold text-sm">
            {author} <span className="text-gray-500 font-normal">{handle}</span>
          </p>
          <p className="mt-1">{text}</p>
          <div className="flex gap-6 mt-2 text-gray-500 text-sm">
            <button>💬 Ответить</button>
            <button>❤️ Нравится</button>
          </div>
        </div>
      </div>
    </article>
  );
}