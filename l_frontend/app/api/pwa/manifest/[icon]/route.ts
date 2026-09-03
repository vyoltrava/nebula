import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { join } from "node:path";
import iconsConfig from "@/config/app-icons.json";

/**
 * GET /api/pwa/manifest/[icon]
 * Динамический манифест для выбранной иконки приложения.
 * Иконки лежат в public/pwa/icons/<id>/; в манифест попадают только
 * реально существующие файлы — свои иконки добавляются простым
 * копированием папки + записью в config/app-icons.json.
 */
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ icon: string }> }
) {
  const { icon } = await params;

  const known = (iconsConfig as Array<{ id: string; name: string }>)
    .some((i) => i.id === icon);
  if (!known) {
    return NextResponse.json({ error: "Unknown icon" }, { status: 404 });
  }

  const dir = join(process.cwd(), "public", "pwa", "icons", icon);
  if (!existsSync(dir)) {
    return NextResponse.json({ error: "Icon files not found" }, { status: 404 });
  }

  const icons: Array<{ src: string; sizes: string; type: string; purpose: string }> = [];
  const pushIf = (file: string, purpose: "any" | "maskable") => {
    if (existsSync(join(dir, file))) {
      const m = file.match(/(\d+)\.png$/);
      if (m) icons.push({ src: `/pwa/icons/${icon}/${file}`, sizes: `${m[1]}x${m[1]}`, type: "image/png", purpose });
    }
  };
  pushIf("icon-192.png", "any");
  pushIf("icon-512.png", "any");
  pushIf("icon-384.png", "any");
  pushIf("maskable-192.png", "maskable");
  pushIf("maskable-512.png", "maskable");

  if (icons.length === 0) {
    return NextResponse.json({ error: "No icon files" }, { status: 404 });
  }

  const manifest = {
    id: "/",
    name: "trelod — социальная сеть Nebula",
    short_name: "trelod",
    description: "Социальная сеть Nebula: сообщения, посты, звонки и общение в реальном времени.",
    lang: "ru",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#171717",
    theme_color: "#6366f1",
    categories: ["social", "communication", "productivity"],
    prefer_related_applications: false,
    related_applications: [],
    icons,
  };

  return NextResponse.json(manifest, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
