// Site Visitor Automator — popup UI logic

const el = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

function readForm() {
  return {
    sites: el("sites").value.split("\n").map((s) => s.trim()).filter(Boolean),
    dwellSeconds: Math.max(3, parseInt(el("dwell").value, 10) || 30),
    actionIntervalSeconds: Math.max(1, parseInt(el("interval").value, 10) || 3),
    scroll: el("scroll").checked,
    click: el("click").checked,
    loop: el("loop").checked,
    shuffle: el("shuffle").checked
  };
}

function fillForm(config) {
  el("sites").value = (config.sites || []).join("\n");
  el("dwell").value = config.dwellSeconds;
  el("interval").value = config.actionIntervalSeconds;
  el("scroll").checked = config.scroll;
  el("click").checked = config.click;
  el("loop").checked = config.loop;
  el("shuffle").checked = config.shuffle;
  updateCount();
}

function updateCount() {
  const n = el("sites").value.split("\n").map((s) => s.trim()).filter(Boolean).length;
  el("count").textContent = n ? `${n} site${n === 1 ? "" : "s"} in list` : "";
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderRunState(state) {
  const running = state.runtime.running;
  const statusEl = el("status");
  const toggleEl = el("toggle");

  statusEl.textContent = running ? "Running" : "Idle";
  statusEl.className = "status " + (running ? "running" : "idle");
  toggleEl.textContent = running ? "Stop" : "Start";
  toggleEl.classList.toggle("stop", running);

  if (running && state.currentUrl) {
    el("progress").textContent = `Site ${state.runtime.currentIndex + 1}/${state.total}: ${state.currentUrl}`;
  } else {
    el("progress").textContent = "";
  }
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

el("loadPopular").addEventListener("click", () => {
  // Merge the built-in list with anything already there, de-duplicated,
  // in shuffled order so the browsing pattern isn't predictable.
  const existing = el("sites").value.split("\n").map((s) => s.trim()).filter(Boolean);
  const merged = Array.from(new Set([...existing, ...POPULAR_SITES]));
  el("sites").value = shuffle(merged).join("\n");
  updateCount();
  flash(`Loaded ${POPULAR_SITES.length} popular sites`);
});

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
    // Persist the current form before starting so the run uses it.
    await send({ type: "saveConfig", config: readForm() });
    const res = await send({ type: "start" });
    if (res && res.ok) {
      flash("Started");
    } else {
      flash((res && res.error) || "Could not start", true);
    }
  }
  refresh();
});

// Keep the popup's progress line live while it's open.
setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 1500);

init();
