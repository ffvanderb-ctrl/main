# Site Visitor Automator

A Chrome extension (Manifest V3) that visits a list of websites you configure.
When turned on, it opens a tab, spends a set amount of time on each site
interacting with it like a user — scrolling and clicking around different parts
of the page — then moves on to the next site in your list.

## Features

- **Editable site list** — enter one URL per line; add, remove, or reorder any time.
- **Adjustable dwell time** — how many seconds to spend on each site.
- **Adjustable action pace** — how often it scrolls/clicks while on a page.
- **Toggle behaviors** — enable/disable scrolling and clicking independently.
- **Loop mode** — repeat the whole list continuously, or run through once and stop.
- **Start/Stop** from the toolbar popup, with live progress.

## Install (load unpacked)

1. Download or clone this folder to your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
5. The extension icon appears in your toolbar. Click it to open the popup.

## Usage

1. Click the toolbar icon.
2. Enter your websites (one per line). `https://` is added automatically if omitted.
3. Set **Seconds per site** and **Action every (sec)**.
4. Check the behaviors you want (Scroll / Click / Loop).
5. Click **Save**, then **Start**. A tab opens and begins visiting each site.
6. Click **Stop** any time, or close the automation tab to end the run.

## How it works

- `background.js` (service worker) drives the run: it opens one tab, walks
  through your list, and tracks a per-site deadline so timing survives page
  navigations and the worker going idle.
- `content.js` is injected into each loaded page and performs the interaction
  (scrolling, and clicking visible links/buttons), reporting back when its time
  on the page is up.
- Settings and run state are stored with `chrome.storage.local`.

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
