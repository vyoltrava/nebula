// lib/apiUrl.ts — единый источник адреса API (без циклических импортов)
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
