import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSmoothStudyPath,
  findNearestStudyString,
  getSmoothCurveSegments,
  getStudyLayout,
  getStudyNeckPoints,
  getSweepStringIndices,
  STUDY_YEARS,
} from "./time-harp-study-model.ts";

test("三种形态均使用 2018–2026 九个时间坐标且弦长端点固定", () => {
  assert.deepEqual(STUDY_YEARS, [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);

  for (const form of ["literal", "abstract", "array"]) {
    const strings = getStudyLayout(form, "artistic");
    assert.equal(strings.length, 9);
    assert.deepEqual(strings.map((string) => string.year), STUDY_YEARS);
    assert.ok(strings.every((string) => string.startY < string.endY && string.endY === 830));
  }
});

test("递增、递减与错位艺术曲线分别呈现预期弦长次序", () => {
  const lengths = (arrangement) => getStudyLayout("abstract", arrangement).map((string) => string.length);
  const ascending = lengths("ascending");
  const descending = lengths("descending");
  const artistic = lengths("artistic");

  assert.ok(ascending.every((length, index) => index === 0 || length > ascending[index - 1]));
  assert.ok(descending.every((length, index) => index === 0 || length < descending[index - 1]));
  assert.ok(artistic.some((length, index) => index > 0 && length < artistic[index - 1]));
  assert.ok(artistic.some((length, index) => index > 0 && length > artistic[index - 1]));
});

test("三种造型具有不同的弦间距关系，同时保留相同年份与弦长", () => {
  const literal = getStudyLayout("literal", "artistic");
  const abstract = getStudyLayout("abstract", "artistic");
  const array = getStudyLayout("array", "artistic");
  const gaps = (strings) => strings.slice(1).map((string, index) => string.x - strings[index].x);

  assert.ok(gaps(literal).every((gap) => gap === gaps(literal)[0]));
  assert.ok(new Set(gaps(abstract)).size > 1);
  assert.ok(new Set(gaps(array)).size > 1);
  assert.deepEqual(abstract.map((string) => string.year), literal.map((string) => string.year));
  assert.deepEqual(abstract.map((string) => string.length), literal.map((string) => string.length));
  assert.notDeepEqual(abstract.map((string) => string.x), array.map((string) => string.x));
});

test("44px 实际命中宽度按最近琴弦判定，区外触点不会触发", () => {
  const strings = getStudyLayout("literal", "ascending");
  const xFor = (index, width = 320, left = 0) => left + strings[index].x / 1000 * width;

  assert.equal(findNearestStudyString(strings, xFor(4), 0, 320), 4);
  assert.equal(findNearestStudyString(strings, xFor(4) + 21, 0, 320), 5);
  assert.equal(findNearestStudyString(strings, xFor(0) - 23, 0, 320), null);
  assert.equal(findNearestStudyString(strings, xFor(4, 1200, 120), 120, 1200), 4);
  assert.equal(findNearestStudyString(strings, xFor(4, 390), 0, 390), 4);
});

test("扫弦顺序覆盖中间琴弦并以最后触发的有效弦收束", () => {
  assert.deepEqual(getSweepStringIndices(1, 6, 9), [2, 3, 4, 5, 6]);
  assert.deepEqual(getSweepStringIndices(7, 2, 9), [6, 5, 4, 3, 2]);
  assert.deepEqual(getSweepStringIndices(4, 4, 9), []);
  assert.deepEqual(getSweepStringIndices(0, 9, 9), []);
});

test("抽象琴颈使用端点一致、连接切线连续的平滑三次曲线", () => {
  const points = getStudyNeckPoints(getStudyLayout("abstract", "artistic"));
  const segments = getSmoothCurveSegments(points);
  const path = buildSmoothStudyPath(points);

  assert.equal(segments.length, points.length - 1);
  assert.match(path, /^M /);
  assert.ok(path.endsWith(`${points.at(-1).x.toFixed(2)} ${points.at(-1).y.toFixed(2)}`));
  assert.doesNotMatch(path, /NaN|Infinity/);

  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    const incoming = { x: current.to.x - current.control2.x, y: current.to.y - current.control2.y };
    const outgoing = { x: next.control1.x - next.from.x, y: next.control1.y - next.from.y };
    assert.ok(Math.abs(incoming.x - outgoing.x) < 1e-8);
    assert.ok(Math.abs(incoming.y - outgoing.y) < 1e-8);
  }
});
