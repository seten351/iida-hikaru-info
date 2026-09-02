import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { adminSessionCookieName } from "@/lib/admin-constants";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
};

export function proxy(request: NextRequest) {
  const enabled = process.env.ADMIN_UI_ENABLED;
  if (enabled !== "true") {
    const disabled = enabled === undefined || enabled === "false";
    return new NextResponse(disabled ? "Not Found" : "Admin unavailable", {
      status: disabled ? 404 : 503,
      headers: noStoreHeaders,
    });
  }

  if (
    request.nextUrl.pathname !== "/admin/login" &&
    !request.cookies.has(adminSessionCookieName)
  ) {
    return NextResponse.redirect(new URL("/admin/login", request.url), {
      headers: noStoreHeaders,
    });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(noStoreHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/admin/:path*",
};
