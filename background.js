// Site Visitor Automator — background service worker (MV3)
//
// Orchestrates automated visits: opens a dedicated tab, navigates through the
// configured list of sites, and (re)injects the content script that performs
// the on-page interaction. Timing is authoritative here (deadline-based) so the
// run survives service-worker restarts and in-page navigations.

const DEFAULT_CONFIG = {
  sites: [
    "https://example.com",
    "https://www.wikipedia.org"
  ],
  dwellSeconds: 30,          // baseline time to spend on each site (varied ±40%)
  actionIntervalSeconds: 3,  // seconds between on-page actions
  loop: false,               // restart from the top after the last site
  scroll: true,              // allow scrolling
  click: true,               // allow clicking elements
  shuffle: false             // randomize the order sites are visited
};

const DEFAULT_RUNTIME = {
  running: false,
  tabId: null,
  currentIndex: 0,
  siteDeadline: 0,
  order: []                  // the actual visit order for this run
};

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Vary the dwell time per site so visits don't all last exactly the same —
// real browsing is uneven.
function nextDeadline(config) {
  const factor = 0.6 + Math.random() * 0.8; // 60%–140% of the baseline
  return Date.now() + config.dwellSeconds * 1000 * factor;
}

function buildOrder(config) {
  const sites = (config.sites || []).map(normalizeUrl).filter(Boolean);
  return config.shuffle ? shuffleArray(sites) : sites;
}

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  return { ...DEFAULT_CONFIG, ...(config || {}) };
}

async function getRuntime() {
  const { runtime } = await chrome.storage.local.get("runtime");
  return { ...DEFAULT_RUNTIME, ...(runtime || {}) };
}

async function setRuntime(patch) {
  const runtime = { ...(await getRuntime()), ...patch };
  await chrome.storage.local.set({ runtime });
  return runtime;
}

function normalizeUrl(url) {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "https://" + trimmed;
}

async function scheduleSafetyAlarm(deadline) {
  await chrome.alarms.clear("advance");
  // Alarms are coarse (~30s min) — this is only a fallback in case the content
  // script never reports back (e.g. an un-injectable page).
  chrome.alarms.create("advance", { when: deadline + 1000 });
}

// --- Run control -----------------------------------------------------------

async function start() {
  const config = await getConfig();
  const order = buildOrder(config);
  if (order.length === 0) return { ok: false, error: "No valid sites configured." };

  const deadline = nextDeadline(config);
  const tab = await chrome.tabs.create({ url: order[0], active: true });
  await setRuntime({
    running: true,
    tabId: tab.id,
    currentIndex: 0,
    siteDeadline: deadline,
    order
  });
  await scheduleSafetyAlarm(deadline);
  return { ok: true };
}

async function stop() {
  await chrome.alarms.clear("advance");
  await setRuntime({ running: false, tabId: null, siteDeadline: 0 });
  return { ok: true };
}

async function advanceSite() {
  const rt = await getRuntime();
  if (!rt.running) return;
  const config = await getConfig();
  let order = rt.order && rt.order.length ? rt.order : buildOrder(config);

  let next = rt.currentIndex + 1;
  if (next >= order.length) {
    if (config.loop) {
      next = 0;
      // Reshuffle each cycle so repeated loops don't repeat the same pattern.
      if (config.shuffle) order = shuffleArray(order);
    } else {
      await stop();
      return;
    }
  }

  const deadline = nextDeadline(config);
  await setRuntime({ currentIndex: next, siteDeadline: deadline, order });
  await scheduleSafetyAlarm(deadline);
  try {
    await chrome.tabs.update(rt.tabId, { url: order[next] });
  } catch (e) {
    // Tab is gone — stop the run.
    await stop();
  }
}

// --- Content-script injection ----------------------------------------------

async function injectInto(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (e) {
    // Some pages (chrome://, web store, PDFs, blocked sites) can't be scripted.
    // Skip on to the next site rather than getting stuck.
    console.warn("Injection failed, advancing:", e && e.message);
    await advanceSite();
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const rt = await getRuntime();
  if (!rt.running || tabId !== rt.tabId) return;
  injectInto(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const rt = await getRuntime();
  if (rt.running && tabId === rt.tabId) {
    await stop();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "advance") return;
  const rt = await getRuntime();
  if (rt.running && Date.now() >= rt.siteDeadline) {
    await advanceSite();
  }
});

// --- Messaging -------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case "getState": {
        const [config, runtime] = await Promise.all([getConfig(), getRuntime()]);
        const order = runtime.running && runtime.order && runtime.order.length
          ? runtime.order
          : (config.sites || []).map(normalizeUrl).filter(Boolean);
        sendResponse({
          config,
          runtime,
          currentUrl: runtime.running ? order[runtime.currentIndex] || null : null,
          total: order.length
        });
        break;
      }
      case "saveConfig": {
        await chrome.storage.local.set({ config: { ...DEFAULT_CONFIG, ...msg.config } });
        sendResponse({ ok: true });
        break;
      }
      case "start": {
        sendResponse(await start());
        break;
      }
      case "stop": {
        sendResponse(await stop());
        break;
      }
      case "contentInit": {
        // A freshly-loaded page asks what to do.
        const rt = await getRuntime();
        if (!rt.running || !sender.tab || sender.tab.id !== rt.tabId) {
          sendResponse({ run: false });
          break;
        }
        const remaining = rt.siteDeadline - Date.now();
        if (remaining <= 0) {
          sendResponse({ run: false });
          advanceSite();
          break;
        }
        const config = await getConfig();
        sendResponse({
          run: true,
          index: rt.currentIndex,
          dwellMs: remaining,
          actionIntervalMs: Math.max(500, config.actionIntervalSeconds * 1000),
          scroll: config.scroll,
          click: config.click
        });
        break;
      }
      case "siteDone": {
        const rt = await getRuntime();
        // Guard against a stale page reporting after we already moved on.
        if (rt.running && sender.tab && sender.tab.id === rt.tabId && msg.index === rt.currentIndex) {
          advanceSite();
        }
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // keep the message channel open for the async response
});
