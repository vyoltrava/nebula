// Объявляем тип для глобального окна, чтобы TypeScript не ругался
declare global {
  interface Window {
    showCustomConfirm?: (options: {
      title: string;
      description?: string;
      confirmText?: string;
      cancelText?: string;
      variant?: "danger" | "default";
    }) => Promise<boolean>;
  }
}

export async function showConfirm(
  title: string,
  description?: string,
  variant: "danger" | "default" = "default"
): Promise<boolean> {
  if (typeof window !== "undefined" && window.showCustomConfirm) {
    return await window.showCustomConfirm({ title, description, variant });
  }
  // Фоллбэк на обычный confirm, если что-то пошло не так (для безопасности)
  return window.confirm(title);
}