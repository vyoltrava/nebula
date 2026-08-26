"use client";

/**
 * Zune-Settings: полная копия Settings.tsx + переключатель темы.
 * Требование — сохранить весь функционал и добавить Zune-обложку.
 */
import { useZuneTheme } from "../hooks/useZuneTheme";
import { ZuneButton } from "./ZuneButton";
import { getCachedUser } from "@/lib/authCache";
import { clearToken } from "@/lib/auth";
import { useRouter } from "next/navigation";

export function ZuneSettings() {
  const { isZuneTheme, toggleTheme } = useZuneTheme();
  const router = useRouter();
  const user = getCachedUser();

  const handleLogout = () => {
    clearToken();
    router.push("/login");
  };

  return (
    <div className="zune-settings">
      <h1 className="zune-settings-title">Настройки</h1>

      <section className="zune-theme-section">
        <h2>Оформление</h2>
        <div className="zune-theme-toggle">
          <span className={!isZuneTheme ? "active" : ""}>Стандартная</span>
          <label className="zune-switch">
            <input
              type="checkbox"
              checked={isZuneTheme}
              onChange={toggleTheme}
              aria-label="Переключить тему"
            />
            <span className="zune-slider" />
          </label>
          <span className={isZuneTheme ? "active" : ""}>Zune Windows Phone</span>
        </div>
      </section>

      <section className="zune-settings-section">
        <h2>Аккаунт</h2>
        <div className="zune-settings-row">
          <span>Имя пользователя</span>
          <span>{user?.username ?? "—"}</span>
        </div>
        <div className="zune-settings-row">
          <span>Email</span>
          <span>{user?.email ?? "—"}</span>
        </div>
      </section>

      <section className="zune-settings-section danger">
        <ZuneButton variant="secondary" onClick={handleLogout} className="zune-logout-btn">
          Выйти
        </ZuneButton>
      </section>
    </div>
  );
}

