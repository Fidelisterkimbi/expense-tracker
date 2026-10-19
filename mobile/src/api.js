export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export function createApi(base, getToken, expired, transport = fetch) {
  return async (path, method = "GET", body) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const token = getToken();
    try {
      const response = await transport(`${base.replace(/\/$/, "")}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body && !(body instanceof FormData)
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: body
          ? body instanceof FormData
            ? body
            : JSON.stringify(body)
          : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (token && [401, 422].includes(response.status)) await expired();
        throw new ApiError(
          data.error || data.msg || `Request failed (${response.status})`,
          response.status,
        );
      }
      return data;
    } catch (error) {
      if (error.name === "AbortError")
        throw new Error(
          "Request timed out. Check your connection and refresh before retrying a save.",
        );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
}
export function positive(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0)
    throw new Error("Enter an amount greater than zero.");
  return number;
}
export function validDate(value) {
  const date = new Date(value + "T12:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new Error("Enter a valid date as YYYY-MM-DD.");
  return value;
}
export function savingsTotals(deposits) {
  return deposits.reduce(
    (result, item) => {
      if (item.status === "successful" && item.currency in result)
        result[item.currency] += Number(item.amount);
      return result;
    },
    { NGN: 0, USD: 0 },
  );
}
