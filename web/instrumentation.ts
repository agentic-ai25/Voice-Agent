/**
 * Next.js startup hook. In dev, Next compiles API routes lazily — the very first
 * request to /api/connection-details pays a ~7s compile cost, which surfaces in
 * the widget as a slow/failed token fetch ("cold server"). We warm the route on
 * boot so the first real user request hits an already-compiled handler.
 *
 * Dev-only and Node-runtime-only; a no-op in production (Vercel pre-builds routes).
 */
export async function register() {
  if (process.env.NODE_ENV !== 'development') return;
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const port = process.env.PORT ?? '3000';
  const url = `http://127.0.0.1:${port}/api/connection-details`;

  // Fire-and-forget; retry a few times in case the HTTP server isn't listening
  // yet when register() runs.
  void (async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  })();
}
