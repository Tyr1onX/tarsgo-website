import assert from "node:assert/strict";
import test from "node:test";

import {
  communityScrollRestorationStorageKey,
  getCommunityScrollPosition,
  saveCommunityScrollPosition,
} from "./community-scroll-restoration.ts";

test("community scroll positions share React Router storage and retain other history entries", () => {
  const originalWindow = globalThis.window;
  const values = new Map([[communityScrollRestorationStorageKey, JSON.stringify({ prior: 320 })]]);
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  try {
    saveCommunityScrollPosition("detail", 1284.5);
    assert.equal(getCommunityScrollPosition("detail"), 1284.5);
    assert.equal(getCommunityScrollPosition("prior"), 320);
    assert.deepEqual(JSON.parse(values.get(communityScrollRestorationStorageKey)), { prior: 320, detail: 1284.5 });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("community scroll positions reject invalid values and tolerate blocked storage", () => {
  const originalWindow = globalThis.window;
  const values = new Map([[communityScrollRestorationStorageKey, JSON.stringify({ bad: -1, string: "8" })]]);
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };

  try {
    assert.equal(getCommunityScrollPosition("bad"), null);
    assert.equal(getCommunityScrollPosition("string"), null);
    saveCommunityScrollPosition("negative", -1);
    saveCommunityScrollPosition("nan", Number.NaN);
    assert.deepEqual(JSON.parse(values.get(communityScrollRestorationStorageKey)), { bad: -1, string: "8" });

    globalThis.window.sessionStorage.setItem = () => { throw new Error("storage blocked"); };
    assert.doesNotThrow(() => saveCommunityScrollPosition("blocked", 10));
    assert.equal(getCommunityScrollPosition("blocked"), null);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
