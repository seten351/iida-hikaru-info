import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { adminSessionCookieName } from "@/lib/admin-constants";
import { adminNoStoreHeaders } from "@/lib/admin-cache-policy";

export function proxy(request: NextRequest) {
  const enabled = process.env.ADMIN_UI_ENABLED;
  if (enabled !== "true") {
    const disabled = enabled === undefined || enabled === "false";
    return new NextResponse(disabled ? "Not Found" : "Admin unavailable", {
      status: disabled ? 404 : 503,
      headers: adminNoStoreHeaders,
    });
  }

  if (
    request.nextUrl.pathname !== "/admin/login" &&
    !request.cookies.has(adminSessionCookieName)
  ) {
    return NextResponse.redirect(new URL("/admin/login", request.url), {
      headers: adminNoStoreHeaders,
    });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(adminNoStoreHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/admin/:path*",
};
