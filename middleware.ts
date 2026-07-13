import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

function redirectWithCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  const isDashboard = pathname.startsWith("/dashboard");

  if (!user && isDashboard) {
    return redirectWithCookies(request, response, "/login");
  }

  if (!user) {
    return response;
  }

  const isAdmin = user.app_metadata.role === "admin";

  if (isLogin) {
    return redirectWithCookies(
      request,
      response,
      isAdmin ? "/dashboard/admin" : "/dashboard/alumno",
    );
  }

  if (pathname.startsWith("/dashboard/admin") && !isAdmin) {
    return redirectWithCookies(request, response, "/dashboard/alumno");
  }

  if (pathname.startsWith("/dashboard/alumno") && isAdmin) {
    return redirectWithCookies(request, response, "/dashboard/admin");
  }

  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/login", "/dashboard/:path*"],
};
