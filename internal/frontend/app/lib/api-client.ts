export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let authSessionVersion: (() => number) | null = null;
let unauthorizedRequestHandler: ((sessionVersion: number, status: number, message: string) => void) | null = null;

export function registerApiAuthLifecycle(input: {
  getSessionVersion: () => number;
  onUnauthorized: (sessionVersion: number, status: number, message: string) => void;
}) {
  authSessionVersion = input.getSessionVersion;
  unauthorizedRequestHandler = input.onUnauthorized;
}

export function buildApiUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

type ApiRequestBody = BodyInit | object | null;

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: ApiRequestBody;
    cache?: RequestCache;
    signal?: AbortSignal;
    accountAction?: boolean;
  } = {},
): Promise<T> {
  const requestSessionVersion = authSessionVersion?.() ?? -1;
  const bodySource = options.body ?? null;
  const isFormData = bodySource instanceof FormData;
  const hasBody = bodySource !== null;
  const requestBody = !hasBody
    ? undefined
    : isNativeRequestBody(bodySource)
      ? bodySource
      : JSON.stringify(bodySource);

  const response = await fetch(buildApiUrl(path), {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.accountAction ? { "X-Tarsgo-Account-Action": "1" } : {}),
      ...(!isFormData && hasBody && !isNativeRequestBody(bodySource) ? { "Content-Type": "application/json" } : {}),
    },
    body: requestBody,
    cache: options.cache,
    signal: options.signal,
  });

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.code >= 400) {
    const status = payload?.code ?? response.status;
    const message = payload?.message ?? "请求失败，请稍后重试";
    const isCredentialFlow = /^\/(?:api\/)?(?:login|register|password-reset|bootstrap)(?:\/|$)/.test(path);
    const isCurrentUserLookup = buildApiUrl(path) === "/api/me" && (options.method ?? "GET").toUpperCase() === "GET";
    if (!isCredentialFlow && !isCurrentUserLookup && (status === 401 || (status === 403 && message === "账号已停用"))) {
      unauthorizedRequestHandler?.(requestSessionVersion, status, message);
    }
    throw new ApiError(
      message,
      status,
    );
  }

  return payload.data;
}

function isNativeRequestBody(value: ApiRequestBody): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}
