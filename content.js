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
  // The *style* varies so scroll timing looks natural — sometimes a quick flick,
  // sometimes a slow, careful read-scroll — and the per-nudge gap is randomized.
  function humanScroll(done) {
    const dir = chance(0.85) ? 1 : -1; // mostly down, sometimes back up
    const flick = chance(0.35);        // quick flick vs. slow read-scroll
    const span = flick ? rnd(0.5, 1.1) : rnd(0.2, 0.6);
    const total = dir * window.innerHeight * span;
    const chunks = flick ? irnd(3, 6) : irnd(6, 12);
    const gapLo = flick ? 25 : 70;
    const gapHi = flick ? 70 : 180;
    let n = 0;
    const doChunk = () => {
      n++;
      const frac = easeInOut(n / chunks) - easeInOut((n - 1) / chunks);
      const dy = total * frac;
      window.scrollBy(0, dy);
      // Some analytics listen for wheel events specifically.
      document.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true }));
      if (n < chunks) {
        setTimeout(doChunk, rnd(gapLo, gapHi));
      } else if (done) {
        setTimeout(done, rnd(80, 260));
      }
    };
    doChunk();
  }

  // Feed-style scrolling for social sites: faster, longer, and more continuous
  // than article reading — flicking down an infinite feed with variable speed,
  // the occasional pause to "watch" a post, and the odd scroll back up. Each
  // call randomly picks a style (flick / cruise / fling) so the rhythm is uneven.
  function feedScroll(done) {
    const dir = chance(0.92) ? 1 : -1; // feeds go down; sometimes back up a bit
    const style = Math.random();
    let span, chunks, gapLo, gapHi;
    if (style < 0.5) {          // cruise: steady medium-fast scroll
      span = rnd(0.8, 1.5); chunks = irnd(6, 12); gapLo = 18; gapHi = 55;
    } else if (style < 0.85) {  // flick: short and fast
      span = rnd(0.6, 1.2); chunks = irnd(3, 6); gapLo = 12; gapHi = 35;
    } else {                    // fling: big, very fast swipe
      span = rnd(1.6, 2.6); chunks = irnd(4, 8); gapLo = 8; gapHi = 22;
    }
    const total = dir * window.innerHeight * span;
    let n = 0;
    const doChunk = () => {
      n++;
      const frac = easeInOut(n / chunks) - easeInOut((n - 1) / chunks);
      const dy = total * frac;
      window.scrollBy(0, dy);
      document.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true }));
      if (n < chunks) {
        setTimeout(doChunk, rnd(gapLo, gapHi));
      } else if (done) {
        // Sometimes stop to "watch" a post, otherwise keep flicking quickly.
        setTimeout(done, chance(0.3) ? rnd(900, 3500) : rnd(120, 500));
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
    // interaction — not a metronome of identical actions. Returns the action
    // function plus a type tag used to pick a natural follow-up pause.
    function pickAction() {
      const r = Math.random();
      // Social/feed sites: mostly fast, continuous scrolling with the odd
      // cursor drift or click, rarely a real pause.
      if (resp.social && resp.scroll) {
        if (r < 0.75) return { fn: feedScroll, type: "feed" };
        if (r < 0.86) return { fn: wander, type: "wander" };
        if (resp.click && r < 0.95) return { fn: humanClick, type: "click" };
        return { fn: null, type: "read" };
      }
      if (resp.click && resp.scroll) {
        if (r < 0.45) return { fn: humanScroll, type: "scroll" };
        if (r < 0.65) return { fn: wander, type: "wander" };
        if (r < 0.85) return { fn: humanClick, type: "click" };
        return { fn: null, type: "read" };
      }
      if (resp.scroll) {
        if (r < 0.7) return { fn: humanScroll, type: "scroll" };
        return { fn: r < 0.9 ? wander : null, type: r < 0.9 ? "wander" : "read" };
      }
      if (resp.click) {
        if (r < 0.6) return { fn: humanClick, type: "click" };
        return { fn: r < 0.8 ? wander : null, type: r < 0.8 ? "wander" : "read" };
      }
      return { fn: null, type: "read" };
    }

    // The pause that follows an action is what really sells "human". A person
    // dwells differently after each kind of action: they read the newly-revealed
    // content after a scroll, take a beat to absorb a page after a click, barely
    // pause after idle cursor drift, and linger longest when just reading. Each
    // is randomized (Gaussian-ish) and scaled by the configured pace.
    function pauseAfter(type) {
      let lo, hi;
      switch (type) {
        case "feed":   lo = 0.15; hi = 0.7; break; // keep flicking the feed
        case "scroll": lo = 0.7; hi = 2.4; break;  // read what scrolled into view
        case "click":  lo = 1.4; hi = 3.6; break;  // absorb the result of a click
        case "wander": lo = 0.3; hi = 1.0; break;  // quick drift, keep going
        default:       lo = 1.6; hi = 4.2; break;  // "read" — the long dwell
      }
      let delay = base * (lo + gauss() * (hi - lo));
      // Occasionally a person gets distracted / lingers much longer (rarer on feeds).
      if (chance(type === "feed" ? 0.06 : 0.12)) delay += rnd(2000, 6000);
      return delay;
    }

    function step() {
      if (Date.now() >= endTime) {
        chrome.runtime.sendMessage({ type: "siteDone", index: resp.index });
        return;
      }
      const { fn, type } = pickAction();
      const next = () => setTimeout(step, pauseAfter(type));
      if (fn) fn(next);
      else next(); // idle read
    }

    // Settle first, as a person would before doing anything.
    setTimeout(step, rnd(900, 2600));
  });
})();
