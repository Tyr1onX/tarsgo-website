import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_PAGE_TRANSITION_DURATION_MS,
  PUBLIC_PAGE_TRANSITION_OFFSET_PX,
  startPublicPageTransition,
} from "./public-page-transition.ts";

test("public page transitions use a brief five-pixel fade-up", () => {
  let animationCall;
  const animation = { cancel() {} };
  const target = {
    animate(frames, options) {
      animationCall = { frames, options };
      return animation;
    },
  };

  assert.equal(startPublicPageTransition(target, false), animation);
  assert.deepEqual(animationCall.frames, [
    { opacity: 0, transform: "translate3d(0, 5px, 0)" },
    { opacity: 1, transform: "translate3d(0, 0, 0)" },
  ]);
  assert.equal(animationCall.options.duration, 200);
  assert.equal(PUBLIC_PAGE_TRANSITION_DURATION_MS, 200);
  assert.equal(PUBLIC_PAGE_TRANSITION_OFFSET_PX, 5);
});

test("reduced motion skips the public page animation entirely", () => {
  let animated = false;
  const target = { animate() { animated = true; return { cancel() {} }; } };

  assert.equal(startPublicPageTransition(target, true), null);
  assert.equal(animated, false);
});
