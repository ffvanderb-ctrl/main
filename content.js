// Site Visitor Automator — content script
//
// Injected into the automation tab on every load. Asks the background worker
// how long to stay and what it's allowed to do, then simulates user-like
// activity (scrolling / clicking) until its time on the page runs out.

(() => {
  // Guard against double injection on the same document.
  if (window.__siteVisitorActive) return;
  window.__siteVisitorActive = true;

  // Links/buttons whose text or href hints at something destructive or
  // account-altering are skipped, to keep the automation low-risk.
  const AVOID = /(log\s?out|sign\s?out|delete|remove|unsubscribe|deactivate|close account|purchase|checkout|pay now|confirm order)/i;

  const rand = (n) => Math.floor(Math.random() * n);
  const jitter = (ms) => ms * (0.7 + Math.random() * 0.6);

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") return false;
    if (parseFloat(style.opacity) < 0.1) return false;
    return true;
  }

  function clickCandidates() {
    const nodes = document.querySelectorAll(
      'a[href], button, [role="button"], input[type="submit"], input[type="button"], [onclick]'
    );
    const out = [];
    for (const el of nodes) {
      if (!isVisible(el)) continue;
      if (el.target === "_blank") continue; // don't spawn extra tabs
      const label = (el.innerText || el.value || el.getAttribute("aria-label") || "") + " " + (el.getAttribute("href") || "");
      if (AVOID.test(label)) continue;
      out.push(el);
    }
    return out;
  }

  function simulateClick(el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    el.dispatchEvent(new MouseEvent("mouseover", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  function doScroll() {
    const max = Math.max(0, document.body.scrollHeight - window.innerHeight);
    const target = max > 0 ? rand(max) : 0;
    window.scrollTo({ top: target, behavior: "smooth" });
  }

  function doClick() {
    const cands = clickCandidates();
    if (cands.length === 0) {
      doScroll();
      return;
    }
    simulateClick(cands[rand(cands.length)]);
  }

  chrome.runtime.sendMessage({ type: "contentInit" }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.run) return;

    const endTime = Date.now() + resp.dwellMs;
    const interval = resp.actionIntervalMs;

    const tick = () => {
      if (Date.now() >= endTime) {
        chrome.runtime.sendMessage({ type: "siteDone", index: resp.index });
        return;
      }
      const roll = Math.random();
      if (resp.click && resp.scroll) {
        roll < 0.4 ? doClick() : doScroll();
      } else if (resp.click) {
        doClick();
      } else if (resp.scroll) {
        doScroll();
      }
      setTimeout(tick, jitter(interval));
    };

    // Small initial delay so the page has a moment to settle.
    setTimeout(tick, jitter(interval));
  });
})();
