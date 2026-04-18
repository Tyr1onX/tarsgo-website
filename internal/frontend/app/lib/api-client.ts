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

export function buildApiUrl(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

type ApiRequestBody = BodyInit | object | null;

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: ApiRequestBody;
  } = {},
): Promise<T> {
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
      ...(!isFormData && hasBody && !isNativeRequestBody(bodySource) ? { "Content-Type": "application/json" } : {}),
    },
    body: requestBody,
  });

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.code >= 400) {
    throw new ApiError(
      payload?.message ?? "请求失败，请稍后重试",
      payload?.code ?? response.status,
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
