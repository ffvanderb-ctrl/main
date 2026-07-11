# Site Visitor Automator

A Chrome extension (Manifest V3) that generates **decoy browsing traffic** for
privacy. When turned on, it opens a tab and visits a list of websites you
configure, spending time on each while behaving like a real person — moving the
cursor along curved paths, scrolling with momentum, pausing to "read," and
occasionally clicking around — then moves on to the next site.

The idea is the same one behind privacy tools like *TrackMeNot* and *AdNauseam*:
by mixing a broad stream of realistic, wide-ranging activity in with your real
browsing, you make it harder for trackers, analytics, and other third parties to
build an accurate profile of what you actually do.

## Features

- **100+ built-in popular sites** — one click loads a broad, varied set (search,
  news, shopping, reference, media, finance, travel, and more) in random order.
- **Editable site list** — enter one URL per line; add, remove, or reorder any time.
- **Human-like behavior** — curved cursor movement with mouse events, momentum
  scrolling (and occasional scroll-ups), reading pauses, hover-before-click, and
  irregular, non-uniform timing.
- **Randomized visit order** — shuffle the list so the pattern isn't predictable;
  reshuffles on every loop.
- **Varied dwell time** — each site gets a randomized amount of time (±40% of your
  baseline) instead of an identical interval.
- **Adjustable pace** — set the baseline seconds per site and how often it acts.
- **Toggle behaviors** — enable/disable scrolling and clicking independently.
- **Loop mode** — repeat continuously, or run through once and stop.
- **Start/Stop** from the toolbar popup, with live progress.

## Install (load unpacked)

1. Download or clone this folder to your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
5. The extension icon appears in your toolbar. Click it to open the popup.

## Usage

1. Click the toolbar icon.
2. Click **Load 100+ popular sites**, and/or add your own (one per line;
   `https://` is added automatically if omitted).
3. Set **Seconds per site** and **Action every (sec)**.
4. Check the behaviors you want (Scroll / Click / Loop / Randomize visit order).
   For continuous privacy noise, enable **Loop forever** and **Randomize visit order**.
5. Click **Save**, then **Start**. A tab opens and begins visiting each site.
6. Click **Stop** any time, or close the automation tab to end the run.

## How it works

- `background.js` (service worker) drives the run: it opens one tab, walks
  through your list, and tracks a per-site deadline so timing survives page
  navigations and the worker going idle.
- `content.js` is injected into each loaded page and drives a virtual cursor,
  scrolling, and clicking, firing the same DOM events (`mousemove`, `mouseover`,
  `wheel`, `scroll`, `click`) that real interaction produces — which is what
  behavior-based trackers actually record. It reports back when its time is up.
- `sites.js` holds the built-in list of 100+ popular websites.
- Settings and run state are stored with `chrome.storage.local`.

## Effectiveness & limitations

This raises the noise floor for **behavioral** and **history/interest** profiling,
but it is not anonymity. It does not hide your IP address, and it won't defeat
trackers that key off login state, device fingerprinting, or network-level
observation. Treat it as one layer among others (a tracker-blocking extension, a
VPN/Tor, private windows), not a replacement for them. Decoy traffic still comes
from your device/IP, so the visited sites do see requests from you.

## Notes & safety

- To reduce the risk of unwanted actions, the clicker skips links/buttons whose
  text suggests something destructive or account-altering (log out, delete,
  unsubscribe, checkout/pay, etc.) and won't open new tabs (`target="_blank"`).
- Some pages can't be scripted by extensions (e.g. `chrome://` pages, the Chrome
  Web Store, some PDF viewers); the extension skips past those automatically.
- Only use this on sites you're allowed to automate. Automated clicking may
  violate some sites' terms of service — you're responsible for how you use it.

## Files

```
manifest.json     Extension manifest (MV3)
background.js     Orchestration / service worker
content.js        In-page interaction
popup.html/.css/.js   Toolbar popup UI
icons/            Toolbar icons
```
