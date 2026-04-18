import type { ApiEnvelope } from "~/lib/api-client";
import { ApiError, buildApiUrl } from "~/lib/api-client";
import type { AuthUser } from "~/lib/auth-client";

export async function fetchCurrentUserFromRequest(request: Request): Promise<AuthUser> {
  const headers = new Headers({
    Accept: "application/json",
  });

  if (typeof window === "undefined") {
    const cookie = request.headers.get("cookie");
    if (cookie) {
      headers.set("Cookie", cookie);
    }
  }

  const response = await fetch(buildApiUrl("/api/me"), {
    method: "GET",
    credentials: "include",
    headers,
  });

  let payload: ApiEnvelope<{ user: AuthUser }> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<{ user: AuthUser }>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.code >= 400) {
    throw new ApiError(
      payload?.message ?? "请求失败，请稍后重试",
      payload?.code ?? response.status,
    );
  }

  return payload.data.user;
}

export async function fetchOptionalCurrentUserFromRequest(request: Request): Promise<AuthUser | null> {
  try {
    return await fetchCurrentUserFromRequest(request);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}
