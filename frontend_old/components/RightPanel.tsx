const tags = [
  { name: "#webdev", count: "1,2K" },
  { name: "#nextjs", count: "890" },
  { name: "#python", count: "654" },
];

const authors = [
  { name: "Мария", handle: "@maria_dev" },
  { name: "Пётр", handle: "@petr42" },
];

export function RightPanel() {
  return (
    <aside className="w-80 shrink-0 h-screen sticky top-0 overflow-y-auto p-4 space-y-4">
      <input
        type="search"
        placeholder="Поиск"
        className="w-full rounded-full border border-gray-300 bg-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      <section className="bg-white rounded-2xl border border-gray-200 p-4">
        <h2 className="font-bold mb-3">Популярные теги</h2>
        {tags.map((t) => (
          <div key={t.name} className="p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
            <p className="font-semibold text-sm">{t.name}</p>
            <p className="text-gray-500 text-xs">{t.count} постов</p>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-4">
        <h2 className="font-bold mb-3">Интересные авторы</h2>
        <div className="space-y-3">
          {authors.map((a) => (
            <div key={a.handle} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-gray-300" />
                <div>
                  <p className="font-semibold text-sm">{a.name}</p>
                  <p className="text-gray-500 text-xs">{a.handle}</p>
                </div>
              </div>
              <button className="text-sm font-semibold bg-gray-900 text-white rounded-full px-4 py-1.5">
                Читать
              </button>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}