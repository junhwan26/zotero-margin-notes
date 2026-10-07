(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MarginNotesLayout = api;
// loadSubScript supplies its target object as `this`; globalThis can be the
// bootstrap global instead and would hide this export from the next script.
})(this, function () {
  "use strict";

  const SIDES = ["left", "right"];
  const BADGE_HEIGHT = 30;
  const EPSILON = 0.000001;

  function finite(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function rectangle(value) {
    return value && ["left", "right", "top", "bottom"].every(key => finite(value[key]))
      && value.right > value.left && value.bottom > value.top
      && finite(value.right - value.left) && finite(value.bottom - value.top);
  }

  function option(value, fallback, minimum) {
    return finite(value) && value >= minimum ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function compareNotes(a, b) {
    return a.anchorY - b.anchorY || a.anchorX - b.anchorX || a.index - b.index;
  }

  // Each lane stays outside every neighboring page for its whole visible height.
  // This conservative boundary also handles facing-page mode without obscuring text.
  function makeLanes(page, bounds, obstacles, minWidth, maxWidth, gap, padding) {
    const top = Math.max(page.top, bounds.top + padding);
    const bottom = Math.min(page.bottom, bounds.bottom - padding);
    const lanes = { left: null, right: null };
    if (bottom <= top) return lanes;

    for (const side of SIDES) {
      let left = side === "left" ? bounds.left + padding
        : Math.max(bounds.left + padding, page.right + gap);
      let right = side === "left" ? Math.min(bounds.right - padding, page.left - gap)
        : bounds.right - padding;
      for (const obstacle of obstacles) {
        if (!rectangle(obstacle) || obstacle.top >= bottom || obstacle.bottom <= top
          || obstacle.right <= left || obstacle.left >= right) continue;
        if (side === "left") left = Math.max(left, obstacle.right + gap);
        else right = Math.min(right, obstacle.left - gap);
      }
      const width = Math.min(maxWidth, right - left);
      if (!finite(width) || width < minWidth) continue;
      lanes[side] = { x: side === "left" ? right - width : left, width, top, bottom };
    }
    return lanes;
  }

  // Isotonic packing minimizes squared distance to the highlight anchors. Unlike
  // a forward-only stack, a dense group near the bottom can move upward to fit.
  function pack(notes, lane, gap) {
    if (!notes.length) return { positions: [], displacement: 0, usedHeight: 0 };
    const sorted = notes.slice().sort(compareNotes);
    const usedHeight = sorted.reduce((total, note) => total + note.height, 0)
      + gap * (sorted.length - 1);
    if (!finite(usedHeight) || usedHeight > lane.bottom - lane.top + EPSILON) return null;

    const maximum = Math.max(lane.top, lane.bottom - usedHeight);
    const blocks = [];
    const offsets = [];
    let offset = 0;
    for (let i = 0; i < sorted.length; i++) {
      offsets.push(offset);
      const ideal = clamp(sorted[i].anchorY - 18, lane.top, lane.bottom - sorted[i].height);
      blocks.push({ first: i, last: i, mean: ideal - offset, count: 1 });
      while (blocks.length > 1 && blocks[blocks.length - 2].mean > blocks[blocks.length - 1].mean) {
        const right = blocks.pop();
        const left = blocks.pop();
        const count = left.count + right.count;
        blocks.push({
          first: left.first, last: right.last, count,
          mean: left.mean + (right.mean - left.mean) * right.count / count,
        });
      }
      offset += sorted[i].height + gap;
    }

    const positions = [];
    let displacement = 0;
    for (const block of blocks) {
      const base = clamp(block.mean, lane.top, maximum);
      for (let i = block.first; i <= block.last; i++) {
        const note = sorted[i];
        const y = base + offsets[i];
        positions.push({ note, y });
        const ideal = clamp(note.anchorY - 18, lane.top, lane.bottom - note.height);
        displacement += Math.abs(y - ideal);
      }
    }
    return { positions, displacement, usedHeight };
  }

  function distribute(notes, lanes, page, gap) {
    const groups = { left: [], right: [] };
    const packed = {
      left: { positions: [], displacement: 0, usedHeight: 0 },
      right: { positions: [], displacement: 0, usedHeight: 0 },
    };
    for (const note of notes) {
      if (!note.valid) continue;
      let best = null;
      for (const side of SIDES) {
        if (!lanes[side]) continue;
        const candidate = pack(groups[side].concat(note), lanes[side], gap);
        if (!candidate) continue;
        const anchorX = clamp(note.anchorX, page.left, page.right);
        const distance = side === "left" ? anchorX - page.left : page.right - anchorX;
        const score = distance
          + 1.5 * (candidate.displacement - packed[side].displacement)
          + 0.2 * candidate.usedHeight;
        if (!best || score < best.score - EPSILON) best = { side, score, candidate };
      }
      if (best) {
        groups[best.side].push(note);
        packed[best.side] = best.candidate;
      }
    }

    const placements = [];
    let score = 0;
    for (const side of SIDES) {
      score += packed[side].displacement;
      for (const { note, y } of packed[side].positions) {
        placements.push({
          id: note.id, side, x: lanes[side].x, y, width: lanes[side].width,
          height: note.height, index: note.index,
        });
        score += side === "left" ? Math.abs(note.anchorX - page.left)
          : Math.abs(page.right - note.anchorX);
      }
    }
    placements.sort((a, b) => a.index - b.index);
    return { placements, score };
  }

  function layoutPage(options) {
    options = options || {};
    const original = Array.isArray(options.notes) ? options.notes : [];
    const empty = { placements: [], hidden: original.map(note => note && note.id),
      lanes: { left: null, right: null }, overflow: null };
    if (!rectangle(options.page) || !rectangle(options.bounds)) return empty;

    const minWidth = option(options.minWidth, 144, 1);
    const maxWidth = Math.max(minWidth, option(options.maxWidth, 216, 1));
    const gap = option(options.gap, 12, 0);
    const padding = option(options.padding, 8, 0);
    const page = options.page;
    const notes = original.map((note, index) => ({
      id: note && note.id, index,
      anchorX: note && note.anchorX, anchorY: note && note.anchorY,
      height: note && note.height,
      valid: !!note && finite(note.anchorX) && finite(note.anchorY)
        && finite(note.height) && note.height > 0,
    })).sort((a, b) => a.valid && b.valid ? compareNotes(a, b) : Number(b.valid) - Number(a.valid));
    const lanes = makeLanes(page, options.bounds,
      Array.isArray(options.obstacles) ? options.obstacles : [], minWidth, maxWidth, gap, padding);
    let result = distribute(notes, lanes, page, gap);
    let overflow = null;

    if (result.placements.length < notes.length) {
      let best = null;
      // Try both badge locations, preserving as many comments as possible.
      for (const side of ["right", "left"]) {
        const lane = lanes[side];
        if (!lane || lane.bottom - lane.top < BADGE_HEIGHT) continue;
        const badge = { x: lane.x, y: lane.bottom - BADGE_HEIGHT,
          width: lane.width, height: BADGE_HEIGHT };
        const reserved = { ...lanes, [side]: { ...lane, bottom: badge.y - gap } };
        const candidate = distribute(notes, reserved, page, gap);
        if (!best || candidate.placements.length > best.result.placements.length
          || (candidate.placements.length === best.result.placements.length
            && candidate.score < best.result.score - EPSILON)) {
          best = { result: candidate, badge };
        }
      }
      if (best) {
        result = best.result;
        overflow = best.badge;
      }
    }

    const visible = new Set(result.placements.map(placement => placement.index));
    return {
      placements: result.placements.map(({ index, ...placement }) => placement),
      hidden: original.filter((note, index) => !visible.has(index)).map(note => note && note.id),
      lanes, overflow,
    };
  }

  return { layoutPage };
});
