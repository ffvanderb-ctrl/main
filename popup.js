// Site Visitor Automator — popup UI logic

const el = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

// Categories whose default is OFF get a small caution note.
const SENSITIVE = { adult: true, gambling: true };

const GROUP_LABELS = { topic: "Topics", language: "Languages / regions" };

// Render the category toggles from the shared catalog, grouped by topic/language.
function renderCategories(categories) {
  const wrap = el("categories");
  wrap.innerHTML = "";
  let lastGroup = null;
  for (const meta of CATEGORY_META) {
    const group = meta.group || "topic";
    if (group !== lastGroup) {
      const h = document.createElement("div");
      h.className = "cat-group-head";
      h.textContent = GROUP_LABELS[group] || group;
      wrap.appendChild(h);
      lastGroup = group;
    }
    const on = categories[meta.key] !== undefined ? categories[meta.key] : meta.default;
    const n = (SITE_CATEGORIES[meta.key] || []).length;
    const row = document.createElement("label");
    row.className = "cat" + (meta.default ? "" : " off-default");

    const left = document.createElement("span");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.key = meta.key;
    cb.checked = on;
    cb.addEventListener("change", () => onCategoryToggle(meta.key, cb.checked));
    const lbl = document.createElement("span");
    lbl.className = "cat-label";
    lbl.textContent = meta.label;
    left.appendChild(cb);
    left.appendChild(lbl);
    if (SENSITIVE[meta.key]) {
      const w = document.createElement("span");
      w.className = "warn";
      w.textContent = "off by default";
      left.appendChild(w);
    }

    const cnt = document.createElement("span");
    cnt.className = "cat-count";
    cnt.textContent = n;

    row.appendChild(left);
    row.appendChild(cnt);
    wrap.appendChild(row);
  }
}

// Show manual timing fields only when Automatic timing is off.
function updateAutoVisibility() {
  const auto = el("auto").checked;
  el("timing").classList.toggle("hidden", auto);
  el("autoHint").classList.toggle("hidden", !auto);
}

// --- the editable visit list (the textarea is the source of truth) ---------
function currentListUrls() {
  return el("sites").value.split("\n").map((s) => s.trim()).filter(Boolean);
}
function setListUrls(arr) {
  el("sites").value = arr.join("\n");
}
const norm = (u) => normalizeUrl(u) || u.trim();

// Toggling a category adds its sites to the list, or removes them — except any
// URL still covered by another enabled category, which stays.
function onCategoryToggle(key, checked) {
  const list = currentListUrls();
  const catUrls = categoryUrls(key);

  if (checked) {
    const present = new Set(list.map(norm));
    for (const u of catUrls) if (!present.has(u)) { list.push(u); present.add(u); }
    setListUrls(list);
  } else {
    const drop = new Set(catUrls);
    // URLs to keep because another enabled category also includes them.
    const keep = new Set();
    el("categories").querySelectorAll("input[data-key]").forEach((cb) => {
      if (cb.checked && cb.dataset.key !== key) {
        for (const u of categoryUrls(cb.dataset.key)) keep.add(u);
      }
    });
    setListUrls(list.filter((u) => !(drop.has(norm(u)) && !keep.has(norm(u)))));
  }
  updateCount();
}

function readCategories() {
  const out = {};
  el("categories").querySelectorAll("input[data-key]").forEach((cb) => {
    out[cb.dataset.key] = cb.checked;
  });
  return out;
}

function readForm() {
  return {
    categories: readCategories(),
    sites: currentListUrls(),
    autoTiming: el("auto").checked,
    dwellSeconds: Math.max(3, parseInt(el("dwell").value, 10) || 30),
    actionIntervalSeconds: Math.max(1, parseInt(el("interval").value, 10) || 3),
    scroll: el("scroll").checked,
    click: el("click").checked,
    loop: el("loop").checked,
    shuffle: el("shuffle").checked
  };
}

function fillForm(config) {
  renderCategories(config.categories || {});
  el("sites").value = (config.sites || []).join("\n");
  el("auto").checked = config.autoTiming !== false;
  el("dwell").value = config.dwellSeconds;
  el("interval").value = config.actionIntervalSeconds;
  el("scroll").checked = config.scroll;
  el("click").checked = config.click;
  el("loop").checked = config.loop;
  el("shuffle").checked = config.shuffle;
  updateAutoVisibility();
  updateCount();
}

// The visit list is exactly what's in the box (de-duplicated for the count).
function updateCount() {
  const n = new Set(currentListUrls().map(norm)).size;
  el("count").textContent = n ? `${n} sites in list` : "list is empty";
}

function renderRunState(state) {
  const running = state.runtime.running;
  el("status").textContent = running ? "Running" : "Idle";
  el("status").className = "status " + (running ? "running" : "idle");
  el("toggle").textContent = running ? "Stop" : "Start";
  el("toggle").classList.toggle("stop", running);
  el("progress").textContent = running && state.currentUrl
    ? `Site ${state.runtime.currentIndex + 1}/${state.total}: ${state.currentUrl}`
    : "";
}

function flash(text, isError) {
  const m = el("msg");
  m.textContent = text;
  m.style.color = isError ? "var(--red)" : "var(--green)";
  setTimeout(() => { m.textContent = ""; }, 2500);
}

async function refresh() {
  const state = await send({ type: "getState" });
  if (state) renderRunState(state);
  return state;
}

async function init() {
  const state = await send({ type: "getState" });
  fillForm(state.config);
  renderRunState(state);
}

el("sites").addEventListener("input", updateCount);
el("auto").addEventListener("change", updateAutoVisibility);

el("save").addEventListener("click", async () => {
  await send({ type: "saveConfig", config: readForm() });
  flash("Settings saved");
});

el("toggle").addEventListener("click", async () => {
  const state = await send({ type: "getState" });
  if (state.runtime.running) {
    await send({ type: "stop" });
    flash("Stopped");
  } else {
    await send({ type: "saveConfig", config: readForm() });
    const res = await send({ type: "start" });
    if (res && res.ok) flash("Started");
    else flash((res && res.error) || "Could not start", true);
  }
  refresh();
});

setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 1500);

init();
