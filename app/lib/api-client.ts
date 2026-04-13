const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") || "http://127.0.0.1:8080";

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
  return `${API_BASE_URL}${path}`;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: BodyInit | Record<string, unknown> | null;
  } = {},
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const hasBody = options.body !== undefined && options.body !== null;

  const response = await fetch(buildApiUrl(path), {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(!isFormData && hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: !hasBody
      ? undefined
      : isFormData
        ? options.body
        : JSON.stringify(options.body),
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
