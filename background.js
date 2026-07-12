// Site Visitor Automator — background service worker (MV3)
//
// Orchestrates automated visits: opens a dedicated tab, navigates through the
// active list, and (re)injects the content script that performs the on-page
// interaction. Timing is authoritative here (deadline-based) so the run
// survives service-worker restarts and in-page navigations.
//
// The active list is built from whichever site CATEGORIES are enabled plus the
// user's custom entries — toggling a category off removes its sites at once.

importScripts("sites.js"); // provides SITE_CATEGORIES, CATEGORY_META, randomQuery

function defaultCategories() {
  const o = {};
  for (const m of CATEGORY_META) o[m.key] = m.default;
  return o;
}

const DEFAULT_CONFIG = {
  categories: defaultCategories(), // checkbox state, used to add/remove in bulk
  sites: defaultSites(),     // the editable visit list (authoritative for the run)
  autoTiming: true,          // pick natural timing automatically (hides manual fields)
  dwellSeconds: 30,          // manual baseline time per site (used when autoTiming off)
  actionIntervalSeconds: 3,  // manual seconds between actions (used when autoTiming off)
  loop: false,               // restart from the top after the last site
  scroll: true,              // allow scrolling
  click: true,               // allow clicking elements
  shuffle: false             // randomize the order sites are visited
};

// Baselines used when Automatic timing is on — the randomization layers on top.
const AUTO_DWELL_SECONDS = 45;
const AUTO_INTERVAL_SECONDS = 3;

function baseDwellSeconds(config) {
  return config.autoTiming ? AUTO_DWELL_SECONDS : Math.max(3, config.dwellSeconds || 30);
}
function baseIntervalMs(config) {
  const s = config.autoTiming ? AUTO_INTERVAL_SECONDS : Math.max(1, config.actionIntervalSeconds || 3);
  return Math.max(500, s * 1000);
}

const DEFAULT_RUNTIME = {
  running: false,
  tabId: null,
  currentIndex: 0,
  siteDeadline: 0,
  order: []                  // the actual visit order for this run (entry objects)
};

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build the de-duplicated run list from config.sites (the editable URL list).
// Each URL's behavior (search query, chatbot typing, social, video) is recovered
// from the catalog; URLs not in the catalog are visited as plain "custom" sites.
function buildEntries(config) {
  const seen = new Set();
  const out = [];
  for (const raw of (config.sites || [])) {
    const url = normalizeUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const m = siteMeta(url);
    out.push({
      url,
      category: m ? m.category : "custom",
      search: m ? m.search : null,
      chat: m ? !!m.chat : false
    });
  }
  return out;
}

function buildOrder(config) {
  const entries = buildEntries(config);
  return config.shuffle ? shuffleArray(entries) : entries;
}

// The URL to actually navigate to. Search/chatbot-URL entries get a fresh random
// query each visit; everything else is visited directly.
function entryNavUrl(entry) {
  if (entry && entry.search) {
    return entry.search.replace("%s", encodeURIComponent(randomQuery()));
  }
  return entry.url;
}

function isSocialEntry(entry) {
  return !!entry && entry.category === "social";
}

// Vary the dwell per site so visits don't all last the same — real browsing is
// very uneven. Draw from a mixture (most normal, some quick glances, a few long
// reads); social/feed sites linger much longer, as people doom-scroll.
function nextDeadline(config, entry) {
  const r = Math.random();
  let factor;
  if (r < 0.2) {
    factor = 0.25 + Math.random() * 0.35;   // quick glance: 25%–60%
  } else if (r < 0.8) {
    factor = 0.7 + Math.random() * 0.7;     // normal: 70%–140%
  } else {
    factor = 1.5 + Math.random() * 1.3;     // long read: 150%–280%
  }
  if (isSocialEntry(entry)) factor *= 1.8 + Math.random() * 1.7; // 1.8x–3.5x longer
  const ms = baseDwellSeconds(config) * 1000 * factor;
  return Date.now() + Math.max(4000, ms);
}

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  const merged = { ...DEFAULT_CONFIG, ...(config || {}) };
  // Migrate the older category+customSites model into a flat `sites` list.
  if (config && !Array.isArray(config.sites)) {
    const cats = { ...defaultCategories(), ...(config.categories || {}) };
    const seen = new Set(), list = [];
    for (const meta of CATEGORY_META) {
      if (!cats[meta.key]) continue;
      for (const u of categoryUrls(meta.key)) if (!seen.has(u)) { seen.add(u); list.push(u); }
    }
    for (const c of (config.customSites || [])) {
      const u = normalizeUrl(c);
      if (u && !seen.has(u)) { seen.add(u); list.push(u); }
    }
    merged.sites = list.length ? list : defaultSites();
  }
  return merged;
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
  if (order.length === 0) return { ok: false, error: "No sites selected. Enable a category or add sites." };

  const deadline = nextDeadline(config, order[0]);
  const tab = await chrome.tabs.create({ url: entryNavUrl(order[0]), active: true });
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
      if (config.shuffle) order = shuffleArray(order);
    } else {
      await stop();
      return;
    }
  }

  const deadline = nextDeadline(config, order[next]);
  await setRuntime({ currentIndex: next, siteDeadline: deadline, order });
  await scheduleSafetyAlarm(deadline);
  try {
    await chrome.tabs.update(rt.tabId, { url: entryNavUrl(order[next]) });
  } catch (e) {
    await stop();
  }
}

// --- Content-script injection ----------------------------------------------

async function injectInto(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch (e) {
    // Some pages (chrome://, web store, PDFs, blocked sites) can't be scripted.
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
  if (rt.running && tabId === rt.tabId) await stop();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "advance") return;
  const rt = await getRuntime();
  if (rt.running && Date.now() >= rt.siteDeadline) await advanceSite();
});

// --- Messaging -------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case "getState": {
        const [config, runtime] = await Promise.all([getConfig(), getRuntime()]);
        const order = runtime.running && runtime.order && runtime.order.length
          ? runtime.order
          : buildOrder(config);
        const current = runtime.running ? order[runtime.currentIndex] : null;
        sendResponse({
          config,
          runtime,
          currentUrl: current ? current.url : null,
          total: order.length
        });
        break;
      }
      case "saveConfig": {
        const merged = { ...DEFAULT_CONFIG, ...msg.config };
        await chrome.storage.local.set({ config: merged });
        // Report how many sites the new config yields, for the popup.
        sendResponse({ ok: true, total: buildEntries(merged).length });
        break;
      }
      case "start":
        sendResponse(await start());
        break;
      case "stop":
        sendResponse(await stop());
        break;
      case "contentInit": {
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
        const entry = rt.order[rt.currentIndex] || {};
        sendResponse({
          run: true,
          index: rt.currentIndex,
          dwellMs: remaining,
          actionIntervalMs: baseIntervalMs(config),
          scroll: config.scroll,
          click: config.click,
          category: entry.category || "custom",
          social: isSocialEntry(entry),
          // On typed-chatbot pages, hand over a query to enter and suppress
          // link-clicking so it doesn't wander off the chat.
          chatbot: !!entry.chat,
          query: entry.chat ? randomQuery() : null
        });
        break;
      }
      case "watchVideo": {
        // The page found a playing video — extend this site's deadline so it
        // "watches" for a while, like a real viewer. Applied once per page.
        const rt = await getRuntime();
        if (!rt.running || !sender.tab || sender.tab.id !== rt.tabId) {
          sendResponse({ ok: false });
          break;
        }
        const now = Date.now();
        const watchMs = 30000 + Math.random() * 150000; // watch 0.5–3 min
        const newDeadline = Math.max(rt.siteDeadline, now + watchMs);
        await setRuntime({ siteDeadline: newDeadline });
        await scheduleSafetyAlarm(newDeadline);
        sendResponse({ ok: true, dwellMs: newDeadline - now });
        break;
      }
      case "siteDone": {
        const rt = await getRuntime();
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
  return true;
});
