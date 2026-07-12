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

- **300+ built-in sites, grouped into categories** — Search engines, AI chatbots,
  Social media, Shops & marketplaces, News/reference/general, plus Adult content
  and Gambling (both **off by default**). Toggle a category on/off in the popup;
  turning one **off removes its sites from the active list** immediately.
- **Random decoy searches** — on search engines it visits a real results page for
  a randomly generated query, and on AI chatbots it types and submits a random
  query — the *TrackMeNot* technique, which pollutes your search/interest profile.
- **Add your own sites** — a custom box adds extra URLs on top of the selected
  categories (one per line).
- **Browse-only, by design** — the clicker never performs state-changing actions:
  no commenting/posting/saving/liking/following on social, no add-to-cart /
  checkout / payment on shops, no bets/deposits on gambling sites, no sign-ups.
- **Human-like behavior** — curved cursor movement with mouse events, momentum
  scrolling (quick flicks vs. slow read-scrolls, occasional scroll-ups), reading
  pauses, and hover-before-click.
- **Feed-aware on social sites** — on recognized social/feed sites (Reddit, X,
  Facebook, Instagram, TikTok, YouTube, etc.) it lingers much longer and switches
  to fast, continuous, variable-speed feed scrolling (cruise / flick / fling)
  with the occasional pause to "watch" a post — the way people actually scroll a feed.
- **Fully randomized timing** — the gap between actions is drawn from a
  Gaussian-ish distribution *and* differs by what just happened: a person reads
  longer after a click than after a quick cursor drift. Nothing is on a fixed
  interval.
- **Varied dwell time** — each site's visit length is drawn from a mixture (most
  normal, some quick glances, a few long reads), so no two visits match.
- **Randomized visit order** — shuffle the list so the pattern isn't predictable;
  reshuffles on every loop.
- **Adjustable pace** — set the baseline seconds per site and how often it acts;
  the extension randomizes around those baselines.
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
2. Under **Site categories**, tick the categories you want (Search engines and AI
   chatbots enabled = random decoy searches). Adult/Gambling are off unless you
   opt in. Optionally add extra URLs in the custom box. The counter shows how many
   sites are active.
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
  It also enforces the browse-only guardrails and types decoy queries into chatbots.
- `sites.js` holds the 300+ site catalog (grouped by category), the search/chatbot
  query-URL templates, and the random query generator. Shared by the popup and the
  service worker.
- The active visit list = enabled categories + your custom sites, de-duplicated.
- Settings and run state are stored with `chrome.storage.local`.

## Effectiveness & limitations

This raises the noise floor for **behavioral** and **history/interest** profiling,
but it is not anonymity. It does not hide your IP address, and it won't defeat
trackers that key off login state, device fingerprinting, or network-level
observation. Treat it as one layer among others (a tracker-blocking extension, a
VPN/Tor, private windows), not a replacement for them. Decoy traffic still comes
from your device/IP, so the visited sites do see requests from you.

## Notes & safety

- **Browse-only guardrails.** The clicker skips any link/button whose text or href
  suggests a state-changing or transactional action — log out, delete, sign up,
  comment/post/reply, save/bookmark, like/follow/subscribe, share, add to
  cart/basket, buy, checkout, payment, place order, and bet/wager/deposit/withdraw
  — and never opens new tabs (`target="_blank"`). It also never types into page
  fields except the main input on a flagged AI-chatbot page (for the decoy query).
- **Adult & gambling are opt-in.** Both categories are off by default; enable them
  only if you want that traffic in the mix. They are browse-only like everything else.
- **Chatbot searches need a login.** Chatbots that require you to be signed in will
  only produce a real query if you're already logged in to that tab's session;
  otherwise the visit still generates traffic but may not submit.
- Some pages can't be scripted by extensions (e.g. `chrome://` pages, the Chrome
  Web Store, some PDF viewers); the extension skips past those automatically.
- Only use this on sites you're allowed to automate. Automated browsing may
  violate some sites' terms of service — you're responsible for how you use it.

## Files

```
manifest.json     Extension manifest (MV3)
background.js     Orchestration / service worker
content.js        In-page interaction, guardrails, chatbot typing
sites.js          300+ site catalog, categories, query generator
popup.html/.css/.js   Toolbar popup UI
icons/            Toolbar icons
```
