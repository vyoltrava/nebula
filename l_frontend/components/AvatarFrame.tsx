"use client";
import { ReactNode } from "react";

// --- Custom Badge Types ---
interface CustomBadgeConfig {
  name: string;
  description?: string;
  icon_url?: string;
  text_content?: string;
  bg_type: "solid" | "gradient" | "image";
  bg_color?: string;
  bg_gradient?: string;
  bg_gradient_type?: "linear" | "radial";
  bg_gradient_angle?: number;
  bg_image_url?: string;
  bg_image_mode?: "cover" | "contain" | "tile";
  border_color?: string;
  border_width?: number;
  border_style?: "solid" | "dashed" | "dotted";
  border_glow: boolean;
  border_glow_intensity?: number;
  animation_flags?: string[]; // e.g., ["perimeter_wave", "pulse_glow"]
  animation_speed?: "slow" | "normal" | "fast";
  shadow_enabled: boolean;
  shadow_blur?: number;
  shadow_offset_x?: number;
  shadow_offset_y?: number;
  shadow_color?: string;
  inner_glow_enabled: boolean;
  inner_glow_intensity?: number;
  specular_enabled: boolean;
  metallic_enabled: boolean;
  priority?: number;
}

interface CustomBadgeData {
  id: number;
  name: string;
  icon_url?: string;
  text_content?: string;
  badge_config: string; // JSON string of CustomBadgeConfig
  created_at: string;
}

interface CustomBadgeAssignmentData {
  id: number;
  user_id: number;
  badge_id: number;
  granted_by: number;
  granted_at: string;
  expires_at?: string;
  is_active: boolean;
  custom_message?: string;
  override_priority: boolean;
  badge: CustomBadgeData;
}

// === HELPER FUNCTIONS FOR BADGE STYLES ===
const getBorderStyle = (config: CustomBadgeConfig) => {
  if (!config.border_width || config.border_width === 0) return {};
  return {
    border: `${config.border_width}px ${config.border_style || 'solid'} ${config.border_color || 'transparent'}`,
    ...(config.border_glow && {
      filter: `drop-shadow(0 0 ${config.border_glow_intensity || 4}px ${config.border_color || 'transparent'})`
    })
  };
};

const getBackgroundStyle = (config: CustomBadgeConfig) => {
  if (config.bg_type === 'solid' && config.bg_color) {
    return { backgroundColor: config.bg_color };
  }
  if (config.bg_type === 'gradient' && config.bg_gradient) {
    return { backgroundImage: config.bg_gradient };
  }
  if (config.bg_type === 'image' && config.bg_image_url) {
    return {
      backgroundImage: `url(${config.bg_image_url})`,
      backgroundSize: config.bg_image_mode || 'cover',
      backgroundRepeat: config.bg_image_mode === 'tile' ? 'repeat' : 'no-repeat',
      backgroundPosition: 'center',
    };
  }
  return {};
};

const getAnimationClasses = (config: CustomBadgeConfig) => {
  const classes: string[] = [];
  if (config.animation_flags) {
    config.animation_flags.forEach(flag => {
      switch (flag) {
        case 'perimeter_wave':
          classes.push(config.animation_speed === 'slow' ? 'animate-perimeter-wave-slow' : 'animate-perimeter-wave');
          break;
        case 'pulse_glow':
          classes.push('animate-pulse-glow');
          break;
        case 'shimmer':
          classes.push('animate-shimmer');
          break;
        case 'blink':
          classes.push('animate-blink');
          break;
        case 'rotate_icon':
          classes.push('animate-rotate-icon');
          break;
        case 'float':
          classes.push('animate-float');
          break;
        // Add other animations here
      }
    });
  }
  return classes.join(' ');
};


// === РЕНДЕР КАСTOMНОЙ ПЛАШКИ (NEW) ===
function CustomBadgeRenderer({ badgeData, size }: { badgeData: CustomBadgeData; size: number }) {
  let config: CustomBadgeConfig;
  try {
    config = JSON.parse(badgeData.badge_config);
  } catch (e) {
    console.error("Failed to parse custom badge config:", e);
    return null;
  }

  const badgeStyle = {
    ...getBorderStyle(config),
    ...getBackgroundStyle(config),
    ...(config.shadow_enabled && config.shadow_color && {
      boxShadow: `${config.shadow_offset_x || 0}px ${config.shadow_offset_y || 0}px ${config.shadow_blur || 10}px ${config.shadow_color}`
    }),
    ...(config.inner_glow_enabled && config.inner_glow_intensity && {
      // Inner glow will be more complex, might need a pseudo-element or separate div
    }),
    ...(config.metallic_enabled && {
      // Metallic effect will also be complex, likely requires specific background/filter
    })
  };

  const animationClasses = getAnimationClasses(config);

  return (
    <div className={`relative inline-block rounded-xl overflow-hidden`} style={{ width: size, height: size, ...badgeStyle }}>
      {/* Background and border are handled by badgeStyle */}
      {config.icon_url && (
        <img src={config.icon_url} alt={config.name} className={`absolute inset-0 object-contain w-full h-full ${animationClasses}`} />
      )}
      {config.text_content && (
        <span className={`absolute inset-0 flex items-center justify-center text-white text-sm font-bold p-1 ${animationClasses}`}>
          {config.text_content}
        </span>
      )}
      {/* Other effects like inner glow, specular, metallic will need dedicated elements/styles */}
    </div>
  );
}


interface AvatarFrameProps {
  children: ReactNode;
  user: any;
  size?: number;
  availableBadges?: any[];
  canEditBadge?: boolean;
  onBadgeClick?: () => void;
}

export function AvatarFrame({ children, user, size = 128, availableBadges = [], canEditBadge = false, onBadgeClick }: AvatarFrameProps) {
  if (!user) return <>{children}</>;

  const level = user.level ?? (user.username === "trelod" ? 11 : user.is_admin ? 10 : user.is_moderator ? 9 : user.role?.level ?? 1);

  // --- NEW: Custom Badge Assignment Logic ---
  const activeCustomBadgeAssignment: CustomBadgeAssignmentData | undefined = user.active_custom_badge_assignment;
  
  // Check if current date is past expires_at
  const isExpired = activeCustomBadgeAssignment && activeCustomBadgeAssignment.expires_at ? new Date(activeCustomBadgeAssignment.expires_at) < new Date() : false;

  const showCustomBadge = activeCustomBadgeAssignment && activeCustomBadgeAssignment.is_active && !isExpired && activeCustomBadgeAssignment.override_priority;

  let userBadge = !showCustomBadge ? (
                    // Old custom_badge_url should be deprecated in favor of CustomBadgeAssignment
                    (user.custom_badge_url ? {
                      id: -1,
                      icon_url: user.custom_badge_url,
                      glow_color: "#8b5cf6",
                      enable_ring: true,
                      enable_glow: true,
                      name: "Custom Badge"
                    } : null) ||
                    availableBadges.find((b: any) => b.id === user.selected_badge_id) || 
                    availableBadges.find((b: any) => b.user_id === user.id) ||
                    availableBadges.find((b: any) => b.role_id === user.role?.id)
                  ) : null;

  // Virtual badge for Level 10 (Founder), if not found in the list
  if (!userBadge && level === 10 && !showCustomBadge) {
     userBadge = {
         id: 999,
         icon_url: "/hello-kitty.png",
         glow_color: "#ffffff",
         enable_ring: true,
         enable_glow: true,
         name: "Founder"
     };
  }

  const glowColor = userBadge?.glow_color || user.role?.color || "#8b5cf6";
  const showRing = userBadge?.enable_ring || (level >= 6 && level <= 9) || level === 11;

  return (
    <div className="relative inline-block">
      
      {showCustomBadge ? (
        // Render the new custom badge
        <CustomBadgeRenderer badgeData={activeCustomBadgeAssignment!.badge} size={size} />
      ) : (
        // Render existing badges/rings
        <>
          {/* === РЕНДЕРИНГ ЭФФЕКТОВ И АВАТАРКИ === */}
          {showRing ? (
            <PerimeterWave 
                color={glowColor} 
                speed={level === 10 ? "slow" : "normal"}
                extraDecorations={
                    level === 9 ? (
                        <>
                          <span className="absolute top-1.5 left-1.5 text-[10px] font-mono text-blue-400 animate-pulse">&lt;/&gt;</span>
                          <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono text-blue-300 animate-pulse">{`{ }`}</span>
                        </>
                    ) : level === 11 ? (
                        <>
                            <span className="absolute top-1.5 left-1.5 text-[9px] font-mono text-green-400 font-bold">01</span>
                            <span className="absolute top-1.5 right-1.5 text-[9px] font-mono text-green-300 font-bold">10</span>
                        </>
                    ) : null
                }
            >
              {children}
            </PerimeterWave>
          ) : (
            <div className="relative z-10 rounded-xl overflow-hidden">
              {children}
            </div>
          )}

          {/* === ЗНАЧОК (БЕЗ ФОНА И ОБВОДКИ, ТОЛЬКО СВЕЧЕНИЕ ПОД КОНТУР) === */}
          {userBadge && (
            <div 
              className="absolute z-30 select-none"
              style={{ top: '-10px', left: '-10px' }} // Чуть ближе к углу, так как убрали рамку
            >
              <div 
                className={`relative flex items-center justify-center p-1 ${
                  canEditBadge ? 'pointer-events-auto cursor-pointer hover:scale-110 transition-transform' : 'pointer-events-none'
                }`}
                onClick={canEditBadge ? onBadgeClick : undefined}
                title={canEditBadge ? "Нажми, чтобы сменить значок" : userBadge.name}
              >
                {/* Свечение строго под иконкой */}
                {userBadge.enable_glow && (
                  <div 
                    className="absolute inset-0 rounded-md"
                    style={{
                      background: `radial-gradient(circle, ${glowColor} 0%, ${glowColor}50 60%, transparent 80%)`,
                      filter: `blur(6px)`,
                      transform: `scale(1.3)`,
                      zIndex: -1, // Ensure it's behind the icon
                    }}
                  />
                )}
                
                {/* Сама иконка без рамок и фона */}
                <img
                  src={userBadge.icon_url}
                  alt={userBadge.name || "Badge"}
                  className="w-8 h-8 object-contain drop-shadow-md"
                  draggable={false}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}