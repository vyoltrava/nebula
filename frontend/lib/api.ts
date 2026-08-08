export const API_URL = 'https://nebula-qqm2.onrender.com';
import { perfFetch } from "./perf";

export async function apiFetch(url: string, options?: RequestInit) {
  return perfFetch(url, options);
}