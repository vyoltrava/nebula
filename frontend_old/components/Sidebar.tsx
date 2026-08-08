import Link from "next/link";

const nav = [
  { href: "/", icon: "🏠", label: "Главная", active: true },
  { href: "/notifications", icon: "🔔", label: "Уведомления" },
  { href: "/settings", icon: "⚙️", label: "Настройки" },
];

export function Sidebar() {
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 overflow-y-auto border-r border-gray-200 bg-white p-4 flex flex-col justify-between">
      <div>
        <h1 className="text-xl font-bold mb-6">MySocial</h1>
        <nav className="space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2 rounded-full hover:bg-gray-100 ${
                item.active ? "font-bold" : ""
              }`}
            >
              <span>{item.icon}</span> {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Аккаунт */}
      <div className="flex items-center gap-3 p-2 rounded-full hover:bg-gray-100 cursor-pointer">
        <img src="/avatar.png" alt="" className="w-10 h-10 rounded-full bg-gray-300" />
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">Иван</p>
          <p className="text-gray-500 text-sm truncate">@ivan123</p>
        </div>
      </div>
    </aside>
  );
}