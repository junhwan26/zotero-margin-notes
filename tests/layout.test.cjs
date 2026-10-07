"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { layoutPage } = require("../src/layout.js");

const page = { left: 260, right: 860, top: 20, bottom: 920 };
const bounds = { left: 0, right: 1120, top: 0, bottom: 940 };
const note = (id, anchorX, anchorY, height = 80) => ({ id, anchorX, anchorY, height });
const overlaps = (a, b) => a.x < b.x + b.width - 0.00001
  && a.x + a.width > b.x + 0.00001 && a.y < b.y + b.height - 0.00001
  && a.y + a.height > b.y + 0.00001;

function verify(result, input) {
  const all = result.placements.map(item => item.id).concat(result.hidden).sort();
  assert.deepEqual(all, input.notes.map(item => item.id).sort(), "every note is visible or hidden exactly once");
  const boxes = result.placements.concat(result.overflow ? [result.overflow] : []);
  for (const box of boxes) {
    for (const property of ["x", "y", "width", "height"]) assert.ok(Number.isFinite(box[property]));
    assert.ok(box.width >= (input.minWidth || 144));
    assert.ok(box.x >= input.bounds.left - 0.00001);
    assert.ok(box.x + box.width <= input.bounds.right + 0.00001);
    assert.ok(box.y >= Math.max(input.page.top, input.bounds.top) - 0.00001);
    assert.ok(box.y + box.height <= Math.min(input.page.bottom, input.bounds.bottom) + 0.00001);
    for (const obstacle of [input.page].concat(input.obstacles || [])) {
      assert.ok(!overlaps(box, { x: obstacle.left, y: obstacle.top,
        width: obstacle.right - obstacle.left, height: obstacle.bottom - obstacle.top }), "note avoids PDF page");
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), "cards and badge never collide");
  }
}

test("two-column highlights choose their nearest outer margin", () => {
  const input = { page, bounds, notes: [note("left", 320, 160), note("right", 800, 160)] };
  const result = layoutPage(input);
  assert.deepEqual(result.placements.map(item => item.side), ["left", "right"]);
  assert.equal(result.overflow, null);
  verify(result, input);
});

test("comments use the available side even when their highlights prefer the other side", () => {
  const input = { page, bounds: { ...bounds, left: 200 }, notes: [note("a", 280, 100), note("b", 300, 260)] };
  const result = layoutPage(input);
  assert.equal(result.lanes.left, null);
  assert.ok(result.placements.every(item => item.side === "right"));
  verify(result, input);
});

test("a narrow viewport hides notes without shrinking them over the PDF", () => {
  const input = { page, bounds: { ...bounds, left: 150, right: 980 }, notes: [note("a", 350, 100)] };
  const result = layoutPage(input);
  assert.deepEqual(result.hidden, ["a"]);
  assert.deepEqual(result.lanes, { left: null, right: null });
  assert.equal(result.overflow, null);
  verify(result, input);
});

test("dense notes rebalance, stack without overlap, and reserve room for hidden-count badge", () => {
  const input = { page, bounds: { ...bounds, bottom: 470 },
    notes: Array.from({ length: 18 }, (_, i) => note(`note-${i}`, 300, 200 + i)) };
  const result = layoutPage(input);
  assert.ok(result.placements.some(item => item.side === "left"));
  assert.ok(result.placements.some(item => item.side === "right"));
  assert.ok(result.hidden.length > 0);
  assert.equal(result.overflow.height, 30);
  verify(result, input);
});

test("packing moves a bottom cluster upward instead of unnecessarily hiding comments", () => {
  const input = { page, bounds: { ...bounds, left: 200 },
    notes: Array.from({ length: 7 }, (_, i) => note(`note-${i}`, 800, 900 + i)) };
  const result = layoutPage(input);
  assert.equal(result.placements.length, 7);
  assert.equal(result.hidden.length, 0);
  assert.equal(result.overflow, null);
  verify(result, input);
});

test("anchors outside the viewport clamp to the visible part of a partly scrolled page", () => {
  const input = { page: { ...page, top: -500, bottom: 440 }, bounds,
    notes: [note("top", 300, -400), note("bottom", 810, 700)] };
  const result = layoutPage(input);
  assert.equal(result.placements[0].y, 8);
  assert.equal(result.placements[1].y, 360);
  verify(result, input);
});

test("facing PDF pages block a margin lane that would cover the neighboring page", () => {
  const input = { page, bounds: { ...bounds, right: 1700 },
    obstacles: [{ left: 880, right: 1480, top: 20, bottom: 920 }],
    notes: [note("right-column", 810, 240)] };
  const result = layoutPage(input);
  assert.equal(result.lanes.right, null);
  assert.equal(result.placements[0].side, "left");
  verify(result, input);
});

test("an ample facing-page gutter remains usable without crossing the neighboring page", () => {
  const input = { page, bounds: { ...bounds, right: 1800 },
    obstacles: [{ left: 1080, right: 1680, top: 20, bottom: 920 }],
    notes: [note("right-column", 810, 240)] };
  const result = layoutPage(input);
  assert.equal(result.placements[0].side, "right");
  assert.ok(result.placements[0].x + result.placements[0].width <= 1080 - 12);
  verify(result, input);
});

test("shared facing-page gutters respect cards and badges already placed for the preceding page", () => {
  const viewport = { left: 0, right: 1560, top: 0, bottom: 1000 };
  const firstPage = { left: 170, right: 670, top: 0, bottom: 1000 };
  const secondPage = { left: 890, right: 1390, top: 0, bottom: 1000 };
  const firstInput = { page: firstPage, bounds: viewport, obstacles: [secondPage],
    notes: [note("first-page", 620, 200)] };
  const firstResult = layoutPage(firstInput);
  assert.equal(firstResult.placements[0].side, "right", "first note occupies the shared gutter");
  const firstBoxes = firstResult.placements.concat(firstResult.overflow ? [firstResult.overflow] : []);
  const occupied = firstBoxes.map(box => ({ left: box.x, right: box.x + box.width,
    top: box.y, bottom: box.y + box.height }));
  const secondInput = { page: secondPage, bounds: viewport, obstacles: [firstPage, ...occupied],
    notes: [note("second-page", 940, 200)] };
  const secondResult = layoutPage(secondInput);
  verify(firstResult, firstInput);
  verify(secondResult, secondInput);
  assert.ok(secondResult.placements.every(placement => placement.side === "right"),
    "the later note uses its alternative margin or remains hidden");
  const secondBoxes = secondResult.placements.concat(secondResult.overflow ? [secondResult.overflow] : []);
  for (const firstBox of firstBoxes) {
    for (const secondBox of secondBoxes) assert.ok(!overlaps(firstBox, secondBox), "notes on separate pages never collide");
  }
});

test("vertically separate neighboring pages do not block the margins", () => {
  const input = { page, bounds, obstacles: [{ left: 870, right: 1110, top: 940, bottom: 1800 }],
    notes: [note("a", 820, 300)] };
  const result = layoutPage(input);
  assert.equal(result.placements[0].side, "right");
  verify(result, input);
});

test("horizontally scrolled pages never send note cards beyond viewport bounds", () => {
  for (const shifted of [{ left: -700, right: -100 }, { left: 1300, right: 1900 },
    { left: -100, right: 500 }, { left: 700, right: 1300 }]) {
    const input = { page: { ...page, ...shifted }, bounds,
      notes: [note("a", (shifted.left + shifted.right) / 2, 250)] };
    const result = layoutPage(input);
    verify(result, input);
  }
});

test("a short visible page slice keeps the overflow badge within that slice", () => {
  const input = { page: { ...page, top: -850, bottom: 50 }, bounds,
    notes: [note("a", 300, 0), note("b", 810, 10)] };
  const result = layoutPage(input);
  assert.equal(result.placements.length, 0);
  assert.ok(result.overflow);
  verify(result, input);
  const tiny = layoutPage({ ...input, page: { ...input.page, bottom: 25 } });
  assert.equal(tiny.overflow, null);
  assert.deepEqual(tiny.hidden, ["a", "b"]);
});

test("invalid coordinates are never emitted and unplaceable IDs are retained", () => {
  const input = { page, bounds, notes: [note("valid", 320, 240), note("nan", NaN, 200),
    note("infinite", 350, Infinity), note("negative", 350, 300, -1), note("too-tall", 350, 400, 9000)] };
  const result = layoutPage(input);
  assert.deepEqual(result.hidden, ["nan", "infinite", "negative", "too-tall"]);
  assert.ok(result.overflow);
  verify(result, input);
  assert.deepEqual(layoutPage({ ...input, page: { ...page, left: NaN } }).hidden,
    input.notes.map(item => item.id));
});

test("layout is deterministic and does not mutate frozen inputs", () => {
  const input = Object.freeze({ page: Object.freeze({ ...page }), bounds: Object.freeze({ ...bounds }),
    obstacles: Object.freeze([]), notes: Object.freeze([Object.freeze(note("a", 350, 330)),
      Object.freeze(note("b", 720, 330))]) });
  const before = JSON.stringify(input);
  assert.deepEqual(layoutPage(input), layoutPage(input));
  assert.equal(JSON.stringify(input), before);
});

test("seeded random layouts preserve visibility, geometry and collision invariants", () => {
  let seed = 429;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  for (let iteration = 0; iteration < 200; iteration++) {
    const leftSpace = 60 + random() * 280;
    const rightSpace = 60 + random() * 280;
    const width = 300 + random() * 700;
    const top = -200 + random() * 250;
    const input = {
      page: { left: leftSpace, right: leftSpace + width, top, bottom: top + 300 + random() * 900 },
      bounds: { left: 0, right: leftSpace + width + rightSpace, top: 0, bottom: 300 + random() * 700 },
      notes: Array.from({ length: Math.floor(random() * 35) }, (_, i) => note(`note-${i}`,
        leftSpace + random() * width, -100 + random() * 1300, 30 + random() * 160)),
    };
    const result = layoutPage(input);
    verify(result, input);
    assert.deepEqual(result, layoutPage(input));
  }
});
