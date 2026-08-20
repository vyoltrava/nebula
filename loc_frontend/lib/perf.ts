export async function perfFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const start = performance.now();

  const res = await fetch(url, options);

  const totalMs = Math.round(performance.now() - start);
  const serverMs = res.headers.get("x-process-time-ms");

  if (totalMs > 500) {
    console.warn(
      `[PERF] ${options.method ?? "GET"} ${url} | total=${totalMs}ms | server=${
        serverMs ?? "?"
      }ms`
    );
  }

  return res;
}