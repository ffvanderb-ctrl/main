// Site Visitor Automator — popup UI logic

const el = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

// Categories whose default is OFF get a small caution note.
const SENSITIVE = { adult: true, gambling: true };

// Render the category toggles from the shared catalog.
function renderCategories(categories) {
  const wrap = el("categories");
  wrap.innerHTML = "";
  for (const meta of CATEGORY_META) {
    const on = categories[meta.key] !== undefined ? categories[meta.key] : meta.default;
    const n = (SITE_CATEGORIES[meta.key] || []).length;
    const row = document.createElement("label");
    row.className = "cat" + (meta.default ? "" : " off-default");

    const left = document.createElement("span");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.key = meta.key;
    cb.checked = on;
    cb.addEventListener("change", () => { updateCount(); });
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
    customSites: el("sites").value.split("\n").map((s) => s.trim()).filter(Boolean),
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
  el("sites").value = (config.customSites || []).join("\n");
  el("dwell").value = config.dwellSeconds;
  el("interval").value = config.actionIntervalSeconds;
  el("scroll").checked = config.scroll;
  el("click").checked = config.click;
  el("loop").checked = config.loop;
  el("shuffle").checked = config.shuffle;
  updateCount();
}

// Count the de-duplicated active list from the current form selections.
function updateCount() {
  const cats = readCategories();
  const seen = new Set();
  for (const meta of CATEGORY_META) {
    if (!cats[meta.key]) continue;
    for (const e of (SITE_CATEGORIES[meta.key] || [])) {
      const u = (typeof e === "string" ? e : e.url).toLowerCase();
      seen.add(u);
    }
  }
  el("sites").value.split("\n").map((s) => s.trim()).filter(Boolean)
    .forEach((s) => seen.add(s.toLowerCase()));
  const n = seen.size;
  el("count").textContent = n ? `${n} sites active` : "no sites selected";
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
