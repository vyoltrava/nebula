package app.nebula.mobile;

import android.content.ComponentName;
import android.content.pm.PackageManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 🔥 Смена иконки лаунчера (как в Telegram).
 * В манифесте объявлены activity-alias `.Icon<X>`; включается ровно один.
 * id — совпадает с list-иконок PWA: "standart" | "white" | "ukraina" | "inversiya".
 */
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {

    private static final String ALIAS_PREFIX = "app.nebula.mobile.Icon";
    private static final String[] THEMES = {
            "Standart", "White", "Ukraina", "Inversiya"
    };

    @PluginMethod
    public void setIcon(PluginCall call) {
        String iconId = call.getString("alias", "standart");
        String capitalized = iconId.substring(0, 1).toUpperCase() + iconId.substring(1);

        boolean found = false;
        for (String t : THEMES) {
            if (t.equals(capitalized)) {
                found = true;
                break;
            }
        }
        if (!found) {
            call.reject("Unknown icon: " + iconId);
            return;
        }

        String target = ALIAS_PREFIX + capitalized;
        PackageManager pm = getBridge().getContext().getPackageManager();
        for (String t : THEMES) {
            String cls = ALIAS_PREFIX + t;
            int state = cls.equals(target)
                    ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                    : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
            pm.setComponentEnabledSetting(
                    new ComponentName(getBridge().getContext(), cls),
                    state,
                    PackageManager.DONT_KILL_APP
            );
        }
        call.resolve();
    }

    /** Текущая включённая иконка (для восстановления состояния в UI). */
    @PluginMethod
    public void getIcon(PluginCall call) {
        PackageManager pm = getBridge().getContext().getPackageManager();
        String pkg = getBridge().getContext().getPackageName();
        for (String t : THEMES) {
            String cls = ALIAS_PREFIX + t;
            int state = pm.getComponentEnabledSetting(new ComponentName(pkg, cls));
            if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
                com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
                result.put("alias", t.toLowerCase());
                call.resolve(result);
                return;
            }
        }
        call.reject("No enabled icon alias found");
    }
}
