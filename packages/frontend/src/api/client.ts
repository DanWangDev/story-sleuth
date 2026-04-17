/**
 * Thin fetch wrapper. Always sends credentials (session cookie), parses
 * JSON, and throws a typed `ApiError` on non-2xx so callers can branch
 * on status without re-reading the response.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static async fromResponse(res: Response): Promise<ApiError> {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON body */
    }
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `HTTP ${res.status}`;
    return new ApiError(res.status, body, message);
  }

  /** True when the server wants the user to re-authenticate. */
  get is_unauthorized(): boolean {
    return this.status === 401;
  }
}

export interface FetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Low-level JSON fetcher. Callers should prefer the typed helpers in
 * sessions.ts / auth.ts rather than importing this directly.
 */
export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.body
      ? { "Content-Type": "application/json" }
      : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  if (!res.ok) {
    throw await ApiError.fromResponse(res);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
