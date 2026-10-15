import { NextRequest, NextResponse } from "next/server";

// Gate /api/* so remote/agent callers must present the bearer key, while the
// local web UI keeps working with no changes.
//
// (Next 16 "proxy" convention — formerly middleware.ts.)
//
// Trust model (single-user; localhost UI + cloudflared tunnel for agents):
//   - A request that arrived through the Cloudflare tunnel carries the
//     `cf-connecting-ip` header (injected by Cloudflare at the edge). An
//     attacker hitting the tunnel CANNOT strip it, so tunnel traffic is always
//     forced to authenticate.
//   - A direct request to the local Next server (your own browser on localhost)
//     has no `cf-connecting-ip` → trusted, allowed through. This is why the web
//     UI keeps working untouched.
//
// We deliberately do NOT key off x-forwarded-for: Next's dev server injects it
// on direct localhost requests too, so it can't tell local from remote.
//
// Set AGENT_REQUIRE_KEY=always to require the key on EVERY /api/* request —
// use this on a VM / behind any non-Cloudflare proxy, where the cf header
// won't be present. See AGENT_API.md.
//
// Present the key as either:
//   Authorization: Bearer <AGENT_API_KEY>
//   x-api-key: <AGENT_API_KEY>

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function presentedKey(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) return apiKey.trim();
  return null;
}

function deny(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function proxy(req: NextRequest) {
  const viaTunnel = req.headers.has("cf-connecting-ip");
  const requireAlways = process.env.AGENT_REQUIRE_KEY === "always";

  // Direct/local request (your browser on localhost) → trusted, UI works.
  if (!viaTunnel && !requireAlways) return NextResponse.next();

  const expected = process.env.AGENT_API_KEY;
  if (!expected) {
    // Fail closed: a remote caller arrived but the server has no key configured.
    return deny(
      "Agent API is not configured on the server (AGENT_API_KEY unset).",
      503,
    );
  }

  const given = presentedKey(req);
  if (!given || !timingSafeEqual(given, expected)) {
    return deny(
      "Unauthorized. Send Authorization: Bearer <AGENT_API_KEY> or x-api-key.",
      401,
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
