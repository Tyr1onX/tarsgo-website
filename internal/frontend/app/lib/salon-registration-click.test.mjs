import assert from "node:assert/strict";
import test from "node:test";
import { trackSalonRegistrationClick } from "./salon-registration-click.ts";

test("registration counting posts once without waiting for the request", (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", (...args) => {
    calls.push(args);
    return new Promise(() => {});
  });
  assert.equal(trackSalonRegistrationClick(7), undefined);
  assert.deepEqual(calls, [["/api/ai-salon/events/7/registration-click", {
    method: "POST", credentials: "same-origin", keepalive: true,
  }]]);
});

test("network failures do not escape the click handler", async (t) => {
  t.mock.method(globalThis, "fetch", () => Promise.reject(new Error("offline")));
  assert.doesNotThrow(() => trackSalonRegistrationClick(7));
  await new Promise(resolve => setImmediate(resolve));
});

test("a synchronous tracking failure cannot cancel the registration link", (t) => {
  t.mock.method(globalThis, "fetch", () => { throw new Error("unavailable"); });
  assert.doesNotThrow(() => trackSalonRegistrationClick(7));
});
