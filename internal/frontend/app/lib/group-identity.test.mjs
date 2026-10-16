import assert from "node:assert/strict";
import test from "node:test";

import { resolveGroupIdentity } from "./group-identity.ts";

const groupNames = [
  ["机械组", "mechanical"],
  ["电控组", "electrical-control"],
  ["视觉组", "vision"],
  ["AI组", "ai"],
  ["运营组", "operations"],
];

test("a single explicitly assigned member group resolves to its existing official mark", () => {
  for (const [name, mark] of groupNames) {
    assert.deepEqual(
      resolveGroupIdentity({ state: "assigned", groups: [{ groupId: 1, name, role: 1 }], canSelfConfirm: false }),
      { name, mark },
    );
  }
});

test("unassigned, pending, unknown and legacy multi-group identities receive no group badge", () => {
  assert.equal(resolveGroupIdentity({ state: "unassigned", groups: [], canSelfConfirm: true }), null);
  assert.equal(resolveGroupIdentity({ state: "pending", groups: [{ groupId: 1, name: "机械组", role: 1 }], canSelfConfirm: false }), null);
  assert.equal(resolveGroupIdentity({ state: "assigned", groups: [{ groupId: 1, name: "未知组", role: 1 }], canSelfConfirm: false }), null);
  assert.equal(resolveGroupIdentity({
    state: "assigned",
    groups: [
      { groupId: 1, name: "机械组", role: 1 },
      { groupId: 2, name: "AI组", role: 1 },
    ],
    canSelfConfirm: false,
  }), null);
});
