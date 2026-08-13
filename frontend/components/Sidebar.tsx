"use client";
import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Home, Bell, Settings, LogOut, Heart, MessageCircle, UserPlus, 
  AtSign, X, Shield, ShieldCheck, MessageSquare, Palette, 
  Bug, Menu, Search, Megaphone, Bookmark, ShieldAlert, Wrench, RefreshCw, Quote, ChevronLeft
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { getToken, clearToken } from "@/lib/auth";
import { BugReportModal } from "@/components/BugReportModal";
import { getCachedUser, setCachedUser, clearCachedUser } from "@/lib/authCache";
import { useUnreadCounts } from "@/lib/UnreadCountsContext";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(() => getCachedUser());
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [showBugModal, setShowBugModal] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  
  // Состояние для мобильного колеса
  const [wheelActive, setWheelActive] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [rotation, setRotation] = useState(0);
  const wheelStartY = useRef(0);
  const wheelStartRotation = useRef(0);
  const isDragging = useRef(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const hasSelected = useRef(false);
  const lastHighlightedIndex = useRef(-1);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [buttonRect, setButtonRect] = useState({ x: 0, y: 0 });
  
  const { counts, refresh } = useUnreadCounts();

  // Навигационные пункты для колеса
  const wheelItems = [
    { href: "/", icon: Home, label: "Главная" },
    { href: "/bookmarks", icon: Bookmark, label: "Закладки" },
    { href: "/updates", icon: Megaphone, label: "Обновления" },
    { href: "/rules", icon: Shield, label: "Правила" },
    { href: "/settings", icon: Settings, label: "Настройки" },
  ];

  // Добавляем сообщения если пользователь авторизован
  if (user) {
    wheelItems.push({ href: "/messages", icon: MessageSquare, label: "Сообщения" });
  }

  // Добавляем админку если есть права
  if (user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users")) {
    wheelItems.push({ 
      href: "/admin", 
      icon: user?.is_admin ? ShieldAlert : user?.is_moderator ? ShieldCheck : Shield, 
      label: user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель" 
    });
  }

  // Добавляем уведомления
  wheelItems.push({ href: "/notifications", icon: Bell, label: "Уведомления" });

  // Добавляем профиль и выход если пользователь есть
  if (user) {
    wheelItems.push({ href: `/${user.username}`, icon: Home, label: "Профиль" });
    wheelItems.push({ href: "#logout", icon: LogOut, label: "Выйти" });
  } else {
    wheelItems.push({ href: "/login", icon: Home, label: "Войти" });
  }

  const nav = [
    { href: "/", icon: Home, label: "Главная" },
    { href: "/bookmarks", icon: Bookmark, label: "Закладки" },
    { href: "/updates", icon: Megaphone, label: "Обновления" },
    { href: "/rules", icon: Shield, label: "Правила" },
    { href: "/settings", icon: Settings, label: "Настройки" },
  ];

  useEffect(() => {
    refresh();
  }, [pathname]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        setUser(data);
        setCachedUser(data);
      })
      .catch((err) => {
        if (err.name !== "AbortError") console.error("Failed to load user:", err);
      });
    return () => controller.abort();
  }, []);

  async function loadNotifications() {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setNotifs(await res.json());
      setShowNotifs(true);
    }
  }

  async function markRead(id: number) {
    const token = getToken();
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    refresh();
  }

  async function markAllRead() {
    const token = getToken();
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/read-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    refresh(); 
  }

  function getNotifLink(n: any): string {
    switch (n.type) {
      case "message": return "/messages";
      case "follow":
      case "like":
      case "reply":
      case "mention":
        return n.actor?.id ? `/user/${n.actor.id}` : "/";
      default: return n.actor?.id ? `/user/${n.actor.id}` : "/";
    }
  }

  // Обновляем позицию кнопки
  useEffect(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonRect({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    }
  }, []);

  // Обработчики для колеса
  const handlePressStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    hasSelected.current = false;
    isDragging.current = false;
    setHighlightedIndex(-1);
    lastHighlightedIndex.current = -1;
    
    // Обновляем позицию кнопки
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonRect({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      });
    }
    
    // Запускаем таймер для определения длительного нажатия
    longPressTimer.current = setTimeout(() => {
      isDragging.current = true;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      wheelStartY.current = clientY;
      wheelStartRotation.current = rotation;
      setWheelActive(true);
    }, 300);
  };

  const handlePressMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging.current || !wheelActive) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      return;
    }
    
    e.preventDefault();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - wheelStartY.current;
    
    // Вращение колеса - вверх по часовой, вниз против часовой
    const sensitivity = 2;
    const newRotation = wheelStartRotation.current + deltaY / sensitivity;
    setRotation(newRotation);
    
    // Вычисляем текущий выбранный индекс
    const totalItems = wheelItems.length;
    const anglePerItem = 360 / totalItems;
    const normalizedRotation = ((newRotation % 360) + 360) % 360;
    const index = Math.round(normalizedRotation / anglePerItem) % totalItems;
    setSelectedIndex(index);
    
    // Подсвечиваем текущий выбранный элемент
    if (index !== lastHighlightedIndex.current) {
      setHighlightedIndex(index);
      lastHighlightedIndex.current = index;
      hasSelected.current = true;
    }
  };

  const handlePressEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (!isDragging.current || !wheelActive) {
      isDragging.current = false;
      return;
    }
    
    isDragging.current = false;
    setWheelActive(false);
    
    // Переход если был сделан выбор
    if (hasSelected.current && highlightedIndex !== -1) {
      const selectedItem = wheelItems[highlightedIndex];
      if (selectedItem) {
        if (selectedItem.href === "#logout") {
          clearToken();
          setUser(null);
          clearCachedUser();
          router.push("/");
        } else {
          router.push(selectedItem.href);
        }
      }
    }
    
    // Сбрасываем состояние
    setSelectedIndex(0);
    setHighlightedIndex(-1);
    lastHighlightedIndex.current = -1;
    setRotation(0);
  };

  const icons = {
    like: <Heart size={12} fill="currentColor" />,
    reply: <MessageCircle size={12} />,
    follow: <UserPlus size={12} />,
    mention: <AtSign size={12} />,
    message: <MessageSquare size={12} />,
    login_alert: <ShieldAlert size={12} />,
    repost: <RefreshCw size={12} />,
    quote: <Quote size={12} />,
  };

  const iconBg: Record<string, string> = {
    like: "bg-pink-500/20 text-pink-400",
    reply: "bg-blue-500/20 text-blue-400",
    follow: "bg-purple-500/20 text-purple-400",
    mention: "bg-yellow-500/20 text-yellow-400",
    message: "bg-green-500/20 text-green-400",
    login_alert: "bg-red-500/20 text-red-400",
    repost: "bg-emerald-500/20 text-emerald-400",
    quote: "bg-cyan-500/20 text-cyan-400",
  };

  const texts = {
    like: "лайкнул(а) ваш пост",
    reply: "ответил(а) на ваш пост",
    follow: "подписался(ась) на вас",
    mention: "упомянул(а) вас в посте",
    message: "прислал(а) сообщение",
    login_alert: "вход с нового устройства",
    repost: "репостнул(а) ваш пост",
    quote: "цитировал(а) ваш пост",
  };

  const glow = user
    ? user.is_admin ? "#ffffff"
    : user.is_moderator ? "#3b82f6"
    : user.role?.color ?? null
    : null;

  // Десктопный контент
  const desktopSidebarContent = (
    <>
      <div className="flex items-center gap-2">
        <img 
          src="/logo-icon.svg"
          alt="Trelod logo"
          className="w-9 h-9"
        />
        <h1 className="font-logo text-4xl text-[#8b5cf6]">trelod</h1>
      </div>

      <nav className="flex flex-col">
        {nav.map(({ href, icon: Icon, label }, idx) => {
          const active = pathname === href;
          const isUpdates = href === "/updates";
          const showUpdatesBadge = isUpdates && (counts.updates || 0) > 0;

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 last:border-none group ${
                active
                  ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                  : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
              }`}
            >
              <Icon size={18} className={active ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} /> 
              <span>{label}</span>
              
              {showUpdatesBadge && (
                <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                  {counts.updates}
                </span>
              )}
            </Link>
          );
        })}

        {user && (
          <Link
            href="/messages"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all relative border-b border-white/5 group ${
              pathname?.startsWith("/messages")
                ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}
          >
            <MessageSquare size={18} className={pathname?.startsWith("/messages") ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} /> 
            <span>Сообщения</span>
            {counts.chats > 0 && (
              <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
                {counts.chats}
              </span>
            )}
          </Link>
        )}

        {(user?.is_admin || user?.is_moderator || user?.permissions?.includes("manage_users")) && (
          <Link
            href="/admin"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 group ${
              pathname === "/admin"
                ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}
          >
            {user?.is_admin 
              ? <ShieldAlert size={18} className={pathname === "/admin" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} /> 
              : user?.is_moderator 
                ? <ShieldCheck size={18} className={pathname === "/admin" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} /> 
                : <ShieldAlert size={18} className="text-[#f59e0b]" />
            }
            <span>{user?.is_admin ? "Админка" : user?.is_moderator ? "Модерация" : "Админ панель"}</span>
          </Link>
        )}

        {user?.is_admin && (
          <Link
            href="/admin/roles"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 group ${
              pathname === "/admin/roles"
                ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}
          >
            <Palette size={18} className={pathname === "/admin/roles" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} /> 
            <span>Роли</span>
          </Link>
        )}

        {user?.permissions?.includes("tech_access") && (
          <Link
            href="/admin/technical"
            className={`flex items-center gap-3 px-4 py-3 font-medium transition-all border-b border-white/5 group ${
              pathname === "/admin/technical"
                ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}
          >
            <Wrench size={18} className={pathname === "/admin/technical" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} /> 
            <span>Техпанель</span>
          </Link>
        )}

        <button
          onClick={loadNotifications}
          className={`flex items-center gap-3 px-4 py-3 font-medium transition-all relative border-b border-white/5 group ${
            pathname === "/notifications"
              ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
              : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
          }`}
        >
          <Bell size={18} className={pathname === "/notifications" ? "text-[#8b5cf6]" : "text-white/80 group-hover:text-white"} /> 
          <span>Уведомления</span>
          {counts.notifications > 0 && (
            <span className="ml-auto bg-[#8b5cf6] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">
              {counts.notifications}
            </span>
          )}
        </button>

        <div className="mt-4 px-4">
          <button
            onClick={() => setShowBugModal(true)}
            className="w-fit p-2.5 rounded-xl text-orange-400/80 hover:text-orange-400 hover:bg-orange-500/10 transition-all"
            title="Сообщить о проблеме"
          >
            <Bug size={18} />
          </button>
        </div>
      </nav>

      <div className="mt-4 flex flex-col gap-2 pt-4 border-t border-white/5">
        {user ? (
          <>
            <Link
              href={`/${user.username}`}
              className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer group w-full"
            >
              <div
                className="shrink-0"
                style={glow ? { filter: `drop-shadow(0 0 8px ${glow})` } : undefined}
              >
                <Avatar src={user.avatar_url} name={user.display_name} id={user.id} />
              </div>
              <div className="leading-tight min-w-0 flex-1">
                <p
                  className={`font-semibold text-sm truncate transition-all ${
                    glow ? "group-hover:opacity-80" : "text-white group-hover:text-[#8b5cf6]"
                  }`}
                  style={
                    glow
                      ? { color: glow, textShadow: `0 0 6px ${glow}B3, 0 0 14px ${glow}66` }
                      : undefined
                  }
                >
                  {user.display_name}
                </p>
                <p className="text-sm text-white/40 truncate">@{user.username}</p>
              </div>
              <button
                onClick={(e) => { 
                  e.preventDefault();
                  e.stopPropagation();
                  clearToken(); 
                  setUser(null); 
                  clearCachedUser(); 
                }}
                className="shrink-0 p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/20 transition-all"
                title="Выйти"
              >
                <LogOut size={18} />
              </button>
            </Link>
          </>
        ) : (
          <Link
            href="/login"
            className="flex items-center justify-center bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 rounded-lg px-4 py-2.5 font-medium text-[#a78bfa] hover:bg-[#8b5cf6]/25 transition-all w-full"
          >
            Войти
          </Link>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* ================= МОБИЛЬНАЯ ВЕРСИЯ (ПОЛУКОЛЕСО ОТ КНОПКИ) ================= */}
      <div className="md:hidden">
        {/* Кнопка-таблетка - прижата к правому краю */}
        <div 
          ref={buttonRef}
          className="fixed right-4 bottom-24 z-[98]"
        >
          <button
            onTouchStart={handlePressStart}
            onTouchMove={handlePressMove}
            onTouchEnd={handlePressEnd}
            onTouchCancel={handlePressEnd}
            onMouseDown={handlePressStart}
            onMouseMove={handlePressMove}
            onMouseUp={handlePressEnd}
            onMouseLeave={handlePressEnd}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
              wheelActive 
                ? 'bg-[#8b5cf6]/30 scale-110' 
                : 'bg-[#171717]/80 backdrop-blur-sm border border-white/10 hover:bg-[#8b5cf6]/20'
            } shadow-lg shadow-black/50 active:scale-95`}
            aria-label="Открыть навигационное колесо (зажмите)"
          >
            <Menu size={22} className={`transition-all ${wheelActive ? 'text-[#8b5cf6]' : 'text-white/80'}`} />
          </button>
        </div>

        {/* Полуколесо - появляется от кнопки, кнопка - центр */}
        {wheelActive && (
          <>
            {/* Затемнение фона */}
            <div 
              className="fixed inset-0 bg-black/30 z-[99]"
            />
            
            {/* Полуколесо позиционируется относительно кнопки */}
            <div 
              className="fixed z-[100] pointer-events-none"
              style={{
                left: buttonRect.x,
                top: buttonRect.y,
                transform: 'translate(-50%, -50%)'
              }}
            >
              <div className="relative w-[320px] h-[320px]">
                {/* Декоративные кольца */}
                <div className="absolute inset-0 rounded-full border border-white/5"></div>
                <div className="absolute inset-8 rounded-full border border-white/5"></div>
                
                {/* Прямоугольный индикатор выбора в центре */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 border-2 border-[#8b5cf6]/50 rounded-xl bg-[#8b5cf6]/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]/40 animate-pulse"></div>
                </div>
                
                {/* Элементы полуколеса - только левая половина */}
                {wheelItems.map((item, index) => {
                  const totalItems = wheelItems.length;
                  const anglePerItem = 360 / totalItems;
                  const angle = (index * anglePerItem + rotation) % 360;
                  const rad = (angle - 90) * Math.PI / 180;
                  
                  const radius = 120;
                  const centerX = 160;
                  const centerY = 160;
                  const x = centerX + radius * Math.cos(rad);
                  const y = centerY + radius * Math.sin(rad);
                  
                  // Проверяем, находится ли элемент в прямоугольнике выбора
                  const isHighlighted = highlightedIndex === index;
                  
                  // Размер и прозрачность
                  const normalizedAngle = ((angle % 360) + 360) % 360;
                  const distanceFromTop = Math.min(
                    Math.abs(normalizedAngle - 0),
                    Math.abs(normalizedAngle - 360),
                    Math.abs(normalizedAngle - (-360))
                  );
                  const proximityFactor = Math.max(0, 1 - (distanceFromTop / 90));
                  
                  const size = 18 + (isHighlighted ? 26 : proximityFactor * 14);
                  const opacity = isHighlighted ? 1 : 0.3 + proximityFactor * 0.4;
                  
                  // Показываем только левую половину (x < centerX)
                  const isVisible = x < centerX + 15;
                  
                  if (!isVisible) return null;
                  
                  return (
                    <div
                      key={index}
                      className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-150 ${
                        isHighlighted ? 'scale-125' : ''
                      }`}
                      style={{
                        left: x,
                        top: y,
                        opacity: Math.max(opacity, 0.15),
                        zIndex: isHighlighted ? 10 : 5,
                        pointerEvents: 'none',
                      }}
                    >
                      <div className={`flex flex-col items-center gap-0.5 ${isHighlighted ? 'text-white' : 'text-white/60'}`}>
                        <div className={`rounded-full p-1.5 transition-all ${
                          isHighlighted 
                            ? 'bg-[#8b5cf6]/40 shadow-lg shadow-[#8b5cf6]/40 border border-[#8b5cf6]/30' 
                            : 'bg-white/5'
                        }`}>
                          <item.icon 
                            size={size} 
                            className={`transition-all ${
                              isHighlighted 
                                ? 'text-[#8b5cf6]' 
                                : 'text-white/40'
                            }`}
                          />
                        </div>
                        <span className={`text-[8px] font-medium transition-all whitespace-nowrap ${
                          isHighlighted ? 'text-[#8b5cf6] font-bold' : 'text-white/30'
                        }`}>
                          {item.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
                
                {/* Подсказка */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] text-white/20 whitespace-nowrap pointer-events-none">
                  ↑↓ для выбора
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ДЕСКТОП */}
      <aside className="hidden md:flex md:w-64 shrink-0 overflow-y-auto p-5 flex-col gap-5 bg-[#171717]">
        {desktopSidebarContent}
      </aside>

      {/* ================= МОДАЛКА УВЕДОМЛЕНИЙ ================= */}
      {showNotifs && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-[99]"
            onClick={() => setShowNotifs(false)}
          />
          <div className="fixed left-4 right-4 md:left-[272px] md:right-auto md:top-4 top-16 w-auto md:w-[380px] max-h-[70vh] md:max-h-[520px] overflow-hidden border border-white/10 rounded-2xl bg-[#1f1f23] shadow-2xl z-[100] flex flex-col">
            
            <div className="sticky top-0 bg-[#1f1f23]/95 backdrop-blur-md border-b border-white/10 p-3 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-white">Уведомления</h3>
              <div className="flex items-center gap-1">
                {notifs.some((n) => !n.read) && (
                  <button
                    onClick={markAllRead}
                    className="text-xs text-[#8b5cf6] hover:text-[#a78bfa] font-semibold px-2 py-1 rounded-lg hover:bg-[#8b5cf6]/10 transition-colors"
                  >
                    Прочитать все
                  </button>
                )}
                <button 
                  onClick={() => setShowNotifs(false)} 
                  className="p-1.5 text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {notifs.length === 0 && (
                <div className="p-8 text-center">
                  <Bell size={32} className="text-white/20 mx-auto mb-3" />
                  <p className="text-sm text-white/50">Пока нет уведомлений</p>
                </div>
              )}

              {notifs.map((n) => {
                const link = getNotifLink(n);
                return (
                  <Link
                    key={n.id}
                    href={link}
                    onClick={() => {
                      if (!n.read) markRead(n.id);
                      setShowNotifs(false);
                    }}
                    className={`flex items-start gap-3 p-3 border-b border-white/5 hover:bg-white/5 transition-colors relative ${
                      !n.read ? "bg-[#8b5cf6]/[0.03]" : ""
                    }`}
                  >
                    {!n.read && (
                      <div className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-[#8b5cf6]" />
                    )}

                    <div className="shrink-0 relative">
                      <Avatar 
                        src={n.actor?.avatar_url} 
                        name={n.actor?.display_name || "User"} 
                        id={n.actor?.id} 
                        size={42} 
                      />
                      <div className={`absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-[#1f1f23] ${iconBg[n.type] || "bg-[#8b5cf6]/20 text-[#8b5cf6]"}`}>
                        {icons[n.type as keyof typeof icons] || <Bell size={9} />}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-white/90 leading-snug">
                        <span className="font-semibold text-white">{n.actor?.display_name || "Неизвестный"}</span>{' '}
                        {texts[n.type as keyof typeof texts] || "совершил(а) действие"}
                      </p>
                      <p className="text-[11px] text-white/40 mt-1">
                        {new Date(n.created_at).toLocaleTimeString("ru-RU", { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    {!n.read && (
                      <div className="w-2 h-2 rounded-full bg-[#8b5cf6] shrink-0 mt-2 shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="sticky bottom-0 bg-[#1f1f23]/95 backdrop-blur-md border-t border-white/10 p-2.5 shrink-0">
              <Link
                href="/notifications"
                onClick={() => setShowNotifs(false)}
                className="block w-full text-center text-sm font-semibold text-[#8b5cf6] hover:text-[#a78bfa] py-2 rounded-lg hover:bg-[#8b5cf6]/10 transition-all"
              >
                Посмотреть все
              </Link>
            </div>
          </div>
        </>
      )}

      {showBugModal && <BugReportModal onClose={() => setShowBugModal(false)} />}
    </>
  );
}