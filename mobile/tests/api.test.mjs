import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi, positive, validDate, savingsTotals } from "../src/api.js";
test("JSON requests use bearer authentication and preserve API prefix", async () => {
  let call;
  const api = createApi(
    "https://example.test/api/",
    () => "secret",
    () => {},
    async (url, options) => {
      call = { url, ...options };
      return { ok: true, json: async () => ({ id: 1 }) };
    },
  );
  assert.deepEqual(await api("/expenses", "POST", { amount: 5 }), { id: 1 });
  assert.equal(call.url, "https://example.test/api/expenses");
  assert.equal(call.headers.Authorization, "Bearer secret");
  assert.equal(call.body, '{"amount":5}');
});
test("expired authenticated sessions are cleared and errors retain status", async () => {
  let cleared = false;
  const api = createApi(
    "https://example.test",
    () => "expired",
    () => {
      cleared = true;
    },
    async () => ({
      ok: false,
      status: 401,
      json: async () => ({ msg: "Token has expired" }),
    }),
  );
  await assert.rejects(
    api("/profile"),
    (e) => e.status === 401 && e.message === "Token has expired",
  );
  assert.equal(cleared, true);
});
test("invalid login does not invoke session expiry", async () => {
  let expired = false;
  const api = createApi(
    "",
    () => null,
    () => {
      expired = true;
    },
    async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "Invalid email or password" }),
    }),
  );
  await assert.rejects(api("/login", "POST", {}), /Invalid email/);
  assert.equal(expired, false);
});
test("multipart uploads leave content type boundary to fetch", async () => {
  const body = new FormData();
  body.append("picture", "test");
  let headers;
  const api = createApi(
    "",
    () => "token",
    () => {},
    async (_, options) => {
      headers = options.headers;
      assert.equal(options.body, body);
      return { ok: true, json: async () => ({}) };
    },
  );
  await api("/profile/picture", "POST", body);
  assert.equal(headers["Content-Type"], undefined);
});
test("HTML errors remain readable", async () => {
  const api = createApi(
    "",
    () => null,
    () => {},
    async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw Error();
      },
    }),
  );
  await assert.rejects(api("/expenses"), /502/);
});
test("money and calendar validation reject invalid values", () => {
  for (const value of ["", "0", "-1", "Infinity", "abc"])
    assert.throws(() => positive(value));
  assert.equal(positive("12.50"), 12.5);
  for (const value of ["2026-02-29", "2026-13-01", "hello"])
    assert.throws(() => validDate(value));
  assert.equal(validDate("2028-02-29"), "2028-02-29");
});
test("savings do not mix currencies or include pending deposits", () => {
  assert.deepEqual(
    savingsTotals([
      { amount: 100, currency: "NGN", status: "successful" },
      { amount: 2, currency: "USD", status: "successful" },
      { amount: 50, currency: "NGN", status: "pending" },
    ]),
    { NGN: 100, USD: 2 },
  );
});
