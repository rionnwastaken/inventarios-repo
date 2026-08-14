export type ApiResponse<T> =
  | { success: true; status: number; data: T }
  | { success: false; status: number; error: any };

export async function sendRequest<T>(
  uri: string,
  method: "GET" | "POST",
  payload?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  try {
    const isGet = method === "GET";
    let url = uri;
    const options: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };

    if (payload !== undefined && payload !== null) {
      // 🛡️ RUNTIME GUARD: Block raw strings or non-objects before fetching
      if (typeof payload !== "object" || Array.isArray(payload)) {
        throw new TypeError(
          `Payload must be a key-value object (e.g. { color_name: "..." }). Received ${typeof payload}: ${JSON.stringify(payload)}`
        );
      }

      if (isGet) {
        const params = new URLSearchParams(
          Object.entries(payload).reduce((acc, [k, v]) => ({ ...acc, [k]: String(v) }), {})
        );
        url = `${uri}?${params.toString()}`;
      } else {
        options.body = JSON.stringify(payload);
      }
    }

    console.log("Sending options ")
    console.log(options)

    const res = await fetch(url, options);
    const data = await res.json().catch(() => null);


    if (res.status === 400 || res.status === 422) {
      console.log("Validation error:", data);
      return { success: false, status: res.status, error: data };
    }

    if (!res.ok) {
      console.log("Request failed with status:", res.status);
      return { success: false, status: res.status, error: data || "Request failed" };
    }

    console.log("Success:", data);
    return { success: true, status: res.status, data };
  } catch (error) {
    console.error("Network or unexpected error:", error);
    return { success: false, status: 0, error };
  }
}
