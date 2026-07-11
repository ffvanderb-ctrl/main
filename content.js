// Site Visitor Automator — content script
//
// Injected into the automation tab on every load. Asks the background worker
// how long to stay and what it's allowed to do, then generates *human-like*
// activity: a virtual cursor that drifts along curved paths, momentum-based
// scrolling, reading pauses, hovering before clicks, and irregular timing.
//
// The synthetic mousemove / mouseover / wheel / scroll / click events fire in
// the page's DOM exactly where real ones would, which is what behavior-based
// trackers and analytics record — so the noise looks like a real person.

(() => {
  if (window.__siteVisitorActive) return;
  window.__siteVisitorActive = true;

  const AVOID = /(log\s?out|sign\s?out|delete|remove|unsubscribe|deactivate|close account|purchase|checkout|pay now|confirm order)/i;

  // ---- small math / random helpers ----------------------------------------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const chance = (p) => Math.random() < p;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  // Gaussian-ish delay so pauses cluster naturally instead of being uniform.
  const gauss = () => (Math.random() + Math.random() + Math.random()) / 3;

  // ---- virtual cursor state ------------------------------------------------
  let cx = rnd(window.innerWidth * 0.3, window.innerWidth * 0.7);
  let cy = rnd(window.innerHeight * 0.3, window.innerHeight * 0.7);
  let lastEl = null;

  function fire(el, type, x, y) {
    if (!el) return;
    el.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y
    }));
  }

  // Move the virtual cursor to (tx, ty) along a curved, eased path, emitting
  // realistic mousemove / mouseover / mouseout events along the way.
  function moveTo(tx, ty, done) {
    const sx = cx, sy = cy;
    const dist = Math.hypot(tx - sx, ty - sy);
    // Perpendicular control point gives the path a natural bow.
    const mx = (sx + tx) / 2, my = (sy + ty) / 2;
    const nx = -(ty - sy), ny = tx - sx;
    const nlen = Math.hypot(nx, ny) || 1;
    const bow = rnd(-0.25, 0.25) * dist;
    const ctrlX = mx + (nx / nlen) * bow;
    const ctrlY = my + (ny / nlen) * bow;
    const steps = clamp(Math.round(dist / rnd(6, 12)), 8, 40);
    let i = 0;

    const step = () => {
      i++;
      const t = easeInOut(i / steps);
      const u = 1 - t;
      // Quadratic bezier + tiny tremor.
      let x = u * u * sx + 2 * u * t * ctrlX + t * t * tx + rnd(-1, 1);
      let y = u * u * sy + 2 * u * t * ctrlY + t * t * ty + rnd(-1, 1);
      x = clamp(x, 0, window.innerWidth - 1);
      y = clamp(y, 0, window.innerHeight - 1);
      cx = x; cy = y;

      const el = document.elementFromPoint(x, y);
      if (el !== lastEl) {
        fire(lastEl, "mouseout", x, y);
        fire(el, "mouseover", x, y);
        lastEl = el;
      }
      fire(el, "mousemove", x, y);

      if (i < steps) {
        setTimeout(step, rnd(8, 22)); // ~40–120 px/s, uneven
      } else if (done) {
        done();
      }
    };
    step();
  }

  // ---- page interactions ---------------------------------------------------
  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) return false;
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || s.pointerEvents === "none") return false;
    return parseFloat(s.opacity) >= 0.1;
  }

  function clickCandidates() {
    const nodes = document.querySelectorAll(
      'a[href], button, [role="button"], input[type="submit"], input[type="button"], [onclick]'
    );
    const out = [];
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      if (el.target === "_blank") continue;
      const label = (el.innerText || el.value || el.getAttribute("aria-label") || "") +
        " " + (el.getAttribute("href") || "");
      if (AVOID.test(label)) continue;
      out.push(el);
    }
    return out;
  }

  // Scroll with momentum: several eased wheel-like nudges rather than a jump.
  function humanScroll(done) {
    const dir = chance(0.85) ? 1 : -1; // mostly down, sometimes back up
    const total = dir * rnd(window.innerHeight * 0.3, window.innerHeight * 0.9);
    const chunks = irnd(4, 9);
    let n = 0;
    const doChunk = () => {
      n++;
      const frac = easeInOut(n / chunks) - easeInOut((n - 1) / chunks);
      const dy = total * frac;
      window.scrollBy(0, dy);
      // Some analytics listen for wheel events specifically.
      document.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true }));
      if (n < chunks) {
        setTimeout(doChunk, rnd(40, 110));
      } else if (done) {
        setTimeout(done, rnd(60, 200));
      }
    };
    doChunk();
  }

  // Aimless cursor drift, like a person resting/moving the mouse while reading.
  function wander(done) {
    const tx = clamp(cx + rnd(-250, 250), 5, window.innerWidth - 5);
    const ty = clamp(cy + rnd(-200, 200), 5, window.innerHeight - 5);
    moveTo(tx, ty, done);
  }

  function humanClick(done) {
    const cands = clickCandidates();
    if (cands.length === 0) return humanScroll(done);
    const el = cands[irnd(0, cands.length - 1)];
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      const tx = clamp(r.left + r.width * rnd(0.25, 0.75), 2, window.innerWidth - 2);
      const ty = clamp(r.top + r.height * rnd(0.25, 0.75), 2, window.innerHeight - 2);
      moveTo(tx, ty, () => {
        // Hover a beat, then press.
        setTimeout(() => {
          fire(el, "mousemove", tx, ty);
          fire(el, "mousedown", tx, ty);
          setTimeout(() => {
            fire(el, "mouseup", tx, ty);
            fire(el, "click", tx, ty);
            if (done) done();
          }, rnd(60, 160));
        }, rnd(120, 400));
      });
    }, rnd(250, 600));
  }

  // ---- main loop -----------------------------------------------------------
  chrome.runtime.sendMessage({ type: "contentInit" }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.run) return;

    const endTime = Date.now() + resp.dwellMs;
    const base = resp.actionIntervalMs;

    // Choose the next thing to do, weighted to look like reading with occasional
    // interaction — not a metronome of identical clicks.
    function pickAction() {
      const r = Math.random();
      if (resp.click && resp.scroll) {
        if (r < 0.45) return humanScroll;
        if (r < 0.65) return wander;
        if (r < 0.85) return humanClick;
        return null; // idle / read
      }
      if (resp.scroll) return r < 0.7 ? humanScroll : (r < 0.9 ? wander : null);
      if (resp.click) return r < 0.6 ? humanClick : (r < 0.8 ? wander : null);
      return null;
    }

    function schedule() {
      if (Date.now() >= endTime) {
        chrome.runtime.sendMessage({ type: "siteDone", index: resp.index });
        return;
      }
      // Non-uniform gap; every so often a long "reading" pause.
      let delay = base * (0.5 + gauss() * 1.2);
      if (chance(0.15)) delay += rnd(1500, 4000);
      setTimeout(() => {
        const action = pickAction();
        if (action) action(schedule);
        else schedule(); // idle tick
      }, delay);
    }

    // Settle first, as a person would before doing anything.
    setTimeout(schedule, rnd(800, 2200));
  });
})();
