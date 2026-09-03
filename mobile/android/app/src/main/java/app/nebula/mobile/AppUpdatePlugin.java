package app.nebula.mobile;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 🔥 Обновление APK прямо из приложения:
 * скачивает APK по URL (GitHub Release) в Downloads и запускает системный
 * установщик. После первого ручного перехода на эту сборку дальнейшие
 * обновления ставятся без перекидывания файлов на телефон.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String FILE_PROVIDER = "app.nebula.mobile.fileprovider";
    private static final String APK_MIME = "application/vnd.android.package-archive";

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        final PluginCall safeCall = call;
        getBridge().execute(() -> {
            try {
                Context ctx = getBridge().getContext();

                // Скачиваем через DownloadManager в публичный Downloads —
                // так файл виден и системному установщику, и пользователю.
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setTitle("trelod update");
                req.setDescription("Скачивание обновления приложения…");
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setMimeType(APK_MIME);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "trelod-update.apk");

                DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) {
                    safeCall.reject("DownloadManager unavailable");
                    return;
                }
                dm.enqueue(req);

                // Пробуем сразу открыть установщик, если файл уже скачан ранее
                tryInstallLastDownload(ctx);

                JSObject res = new JSObject();
                res.put("ok", true);
                res.put("message", "Скачивание начато. После завершения открой файл trelod-update.apk из шторки/Downloads для установки.");
                safeCall.resolve(res);
            } catch (Exception e) {
                safeCall.reject("download failed: " + e.getMessage());
            }
        });
    }

    /** Версия установленного APK (versionName из build.gradle) — для проверки обновлений. */
    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            Context ctx = getBridge().getContext();
            String v = ctx.getPackageManager()
                    .getPackageInfo(ctx.getPackageName(), 0).versionName;
            JSObject result = new JSObject();
            result.put("version", v);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("getVersion failed: " + e.getMessage());
        }
    }

    /** Запускает установщик для последнего скачанного APK, если он есть. */
    private void tryInstallLastDownload(Context ctx) {
        try {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File apk = new File(dir, "trelod-update.apk");
            if (apk.exists() && apk.length() > 0) {
                installApk(ctx, apk);
            }
        } catch (Exception ignored) {
            // APK ещё качается — юзер поставит из шторки/Downloads
        }
    }

    /** Установка APK через FileProvider + системный установщик. */
    private void installApk(Context ctx, File apk) throws Exception {
        Uri uri = FileProvider.getUriForFile(ctx, FILE_PROVIDER, apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, APK_MIME);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        ctx.startActivity(intent);
    }
}
