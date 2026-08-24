// l_frontend/types/badge.ts

export interface CustomBadgeData {
  id: number;
  name: string;
  description: string | null;
  icon_url: string | null;
  text_content: string | null;
  bg_type: string;
  bg_color: string | null;
  bg_gradient: string | null;
  bg_gradient_type: string | null;
  bg_gradient_angle: number | null;
  bg_image_url: string | null;
  bg_image_mode: string | null;
  border_color: string | null;
  border_width: number | null;
  border_style: string | null;
  border_glow: boolean;
  border_glow_intensity: number | null;
  animation_flags: string | null;
  animation_speed: string | null;
  shadow_enabled: boolean;
  shadow_blur: number | null;
  shadow_offset_x: number | null;
  shadow_offset_y: number | null;
  shadow_color: string | null;
  inner_glow_enabled: boolean;
  inner_glow_intensity: number | null;
  specular_enabled: boolean;
  metallic_enabled: boolean;
  priority: number | null;
  is_active: boolean;
  created_at: string;
}

export interface AssignmentData {
  id: number;
  user_id: number;
  badge_id: number;
  badge: CustomBadgeData | null;
  granted_by: number;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
  custom_message: string | null;
}