package app.nebula.mobile;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final int PERM_REQUEST = 4242;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 🔥 Нативные плагины: смена иконки лаунчера (как в Telegram)
        // и автообновление APK прямо из приложения
        registerPlugin(AppIconPlugin.class);
        registerPlugin(AppUpdatePlugin.class);

        // Запрос нативных разрешений для веб-звонков (getUserMedia в WebView)
        // и уведомлений (Android 13+). WebView Капаситора выдаёт их странице,
        // только если они уже получены на уровне приложения.
        requestAppPermissions();
    }

    private void requestAppPermissions() {
        String[] wanted;
        if (Build.VERSION.SDK_INT >= 33) {
            wanted = new String[]{
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO,
                    Manifest.permission.POST_NOTIFICATIONS
            };
        } else {
            wanted = new String[]{
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO
            };
        }

        boolean needsRequest = false;
        for (String p : wanted) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                needsRequest = true;
                break;
            }
        }
        if (needsRequest) {
            ActivityCompat.requestPermissions(this, wanted, PERM_REQUEST);
        }
    }
}

