// Site Visitor Automator — site catalog, categories, and query generation.
//
// Shared by the popup (via <script>) and the background service worker (via
// importScripts). Sites are grouped into toggleable categories; the active
// visit list is built from whichever categories are enabled plus the user's
// own custom entries, so turning a category off removes its sites immediately.
//
// An entry is either a plain URL string, or an object:
//   { url, search }  — a search/query URL template; %s is replaced with a
//                       random decoy query (used for search engines and any
//                       chatbot that accepts a query in the URL).
//   { url, chat: true } — a chatbot where the query must be typed into the page.
//
// Adult and gambling categories are OFF by default and, like every category,
// are browse-only: the clicker never performs transactions, bets, sign-ups,
// posts, or other state-changing actions (see the guardrails in content.js).

const CATEGORY_META = [
  { key: "search",   label: "Search engines",            default: true  },
  { key: "ai",       label: "AI chatbots",               default: true  },
  { key: "social",   label: "Social media",              default: true  },
  { key: "shopping", label: "Shops & marketplaces",      default: true  },
  { key: "general",  label: "News, reference & general", default: true  },
  { key: "adult",    label: "Adult content",             default: false },
  { key: "gambling", label: "Gambling",                  default: false }
];

const SITE_CATEGORIES = {
  // -- Search engines: navigated straight to a results page for a random query.
  search: [
    { url: "https://www.google.com",     search: "https://www.google.com/search?q=%s" },
    { url: "https://www.bing.com",        search: "https://www.bing.com/search?q=%s" },
    { url: "https://duckduckgo.com",      search: "https://duckduckgo.com/?q=%s" },
    { url: "https://search.brave.com",    search: "https://search.brave.com/search?q=%s" },
    { url: "https://www.ecosia.org",      search: "https://www.ecosia.org/search?q=%s" },
    { url: "https://search.yahoo.com",    search: "https://search.yahoo.com/search?p=%s" },
    { url: "https://www.startpage.com",   search: "https://www.startpage.com/sp/search?query=%s" },
    { url: "https://www.mojeek.com",      search: "https://www.mojeek.com/search?q=%s" },
    { url: "https://www.qwant.com",       search: "https://www.qwant.com/?q=%s" },
    { url: "https://yandex.com",          search: "https://yandex.com/search/?text=%s" },
    { url: "https://www.ask.com",         search: "https://www.ask.com/web?q=%s" },
    { url: "https://searx.be",            search: "https://searx.be/search?q=%s" }
  ],

  // -- AI chatbots: query-URL where supported, otherwise typed into the page.
  ai: [
    { url: "https://www.perplexity.ai", search: "https://www.perplexity.ai/search?q=%s" },
    { url: "https://you.com",           search: "https://you.com/search?q=%s" },
    { url: "https://www.phind.com",     search: "https://www.phind.com/search?q=%s" },
    { url: "https://chatgpt.com",             chat: true },
    { url: "https://claude.ai",               chat: true },
    { url: "https://gemini.google.com",       chat: true },
    { url: "https://copilot.microsoft.com",   chat: true },
    { url: "https://chat.mistral.ai",         chat: true },
    { url: "https://poe.com",                 chat: true },
    { url: "https://huggingface.co/chat",     chat: true },
    { url: "https://pi.ai",                   chat: true },
    { url: "https://grok.com",                chat: true },
    { url: "https://chat.deepseek.com",       chat: true },
    { url: "https://character.ai",            chat: true },
    { url: "https://duck.ai",                 chat: true }
  ],

  // -- Social media / feeds (feed-style scrolling, no engagement clicks).
  social: [
    "https://www.reddit.com",
    "https://twitter.com",
    "https://x.com",
    "https://www.facebook.com",
    "https://www.instagram.com",
    "https://www.tiktok.com",
    "https://www.youtube.com",
    "https://www.pinterest.com",
    "https://www.tumblr.com",
    "https://www.linkedin.com",
    "https://www.threads.net",
    "https://bsky.app",
    "https://mastodon.social",
    "https://www.twitch.tv",
    "https://www.quora.com",
    "https://9gag.com",
    "https://imgur.com",
    "https://www.snapchat.com",
    "https://vk.com",
    "https://weibo.com",
    "https://www.douyin.com",
    "https://medium.com",
    "https://news.ycombinator.com",
    "https://www.deviantart.com",
    "https://www.flickr.com",
    "https://www.goodreads.com",
    "https://letterboxd.com",
    "https://www.last.fm"
  ],

  // -- Shops & marketplaces (browse-only, never carts/checkout/payment).
  shopping: [
    "https://www.amazon.com",
    "https://www.ebay.com",
    "https://www.walmart.com",
    "https://www.etsy.com",
    "https://www.target.com",
    "https://www.bestbuy.com",
    "https://www.aliexpress.com",
    "https://www.alibaba.com",
    "https://www.ikea.com",
    "https://www.homedepot.com",
    "https://www.lowes.com",
    "https://www.costco.com",
    "https://www.newegg.com",
    "https://www.wish.com",
    "https://www.temu.com",
    "https://www.shein.com",
    "https://www.zappos.com",
    "https://www.nike.com",
    "https://www.adidas.com",
    "https://www.hm.com",
    "https://www.zara.com",
    "https://www.uniqlo.com",
    "https://www.macys.com",
    "https://www.nordstrom.com",
    "https://www.asos.com",
    "https://www.gap.com",
    "https://www.sephora.com",
    "https://www.ulta.com",
    "https://www.wayfair.com",
    "https://www.chewy.com",
    "https://www.aboutyou.com",
    "https://www.thehut.com",
    "https://www.ssense.com",
    "https://www.farfetch.com",
    "https://www.backcountry.com",
    "https://www.rei.com",
    "https://www.overstock.com",
    "https://www.rakuten.com",
    "https://www.mercadolibre.com",
    "https://www.flipkart.com",
    "https://www.johnlewis.com",
    "https://www.argos.co.uk",
    "https://www.currys.co.uk",
    "https://www.bhphotovideo.com",
    "https://www.microcenter.com",
    "https://www.gamestop.com",
    "https://www.autozone.com",
    "https://www.wayfair.co.uk",
    "https://www.bol.com",
    "https://www.otto.de"
  ],

  // -- News, reference, tech, media, lifestyle, sports, travel, finance, edu.
  general: [
    // Reference & knowledge
    "https://www.wikipedia.org",
    "https://www.britannica.com",
    "https://www.wikihow.com",
    "https://stackoverflow.com",
    "https://www.merriam-webster.com",
    "https://dictionary.cambridge.org",
    "https://www.thesaurus.com",
    "https://www.wolframalpha.com",
    "https://archive.org",
    "https://www.gutenberg.org",
    // News & magazines
    "https://www.bbc.com",
    "https://www.cnn.com",
    "https://www.nytimes.com",
    "https://www.theguardian.com",
    "https://www.reuters.com",
    "https://apnews.com",
    "https://www.npr.org",
    "https://www.washingtonpost.com",
    "https://www.forbes.com",
    "https://www.bloomberg.com",
    "https://www.wsj.com",
    "https://www.economist.com",
    "https://time.com",
    "https://www.nationalgeographic.com",
    "https://www.aljazeera.com",
    "https://www.usatoday.com",
    "https://www.latimes.com",
    "https://www.nbcnews.com",
    "https://abcnews.go.com",
    "https://www.cbsnews.com",
    "https://www.foxnews.com",
    "https://www.politico.com",
    "https://www.axios.com",
    "https://www.vox.com",
    "https://www.newyorker.com",
    "https://www.theatlantic.com",
    "https://www.telegraph.co.uk",
    "https://www.independent.co.uk",
    "https://www.dw.com",
    "https://www.france24.com",
    "https://www.cbc.ca",
    "https://www.abc.net.au",
    // Tech & science
    "https://www.theverge.com",
    "https://techcrunch.com",
    "https://arstechnica.com",
    "https://www.wired.com",
    "https://www.engadget.com",
    "https://www.cnet.com",
    "https://www.zdnet.com",
    "https://www.tomshardware.com",
    "https://www.digitaltrends.com",
    "https://gizmodo.com",
    "https://mashable.com",
    "https://www.nature.com",
    "https://www.scientificamerican.com",
    "https://www.sciencedaily.com",
    "https://www.newscientist.com",
    "https://phys.org",
    "https://www.space.com",
    "https://www.livescience.com",
    "https://github.com",
    "https://gitlab.com",
    "https://dev.to",
    "https://hackernoon.com",
    "https://www.smashingmagazine.com",
    "https://css-tricks.com",
    "https://www.freecodecamp.org",
    "https://www.geeksforgeeks.org",
    "https://www.w3schools.com",
    // Media, video & entertainment
    "https://vimeo.com",
    "https://www.dailymotion.com",
    "https://www.imdb.com",
    "https://www.rottentomatoes.com",
    "https://www.metacritic.com",
    "https://www.spotify.com",
    "https://soundcloud.com",
    "https://bandcamp.com",
    "https://genius.com",
    "https://www.billboard.com",
    "https://pitchfork.com",
    "https://www.rollingstone.com",
    "https://variety.com",
    "https://www.hollywoodreporter.com",
    "https://ew.com",
    "https://www.polygon.com",
    "https://www.ign.com",
    "https://kotaku.com",
    "https://www.gamespot.com",
    "https://www.pcgamer.com",
    // Food & lifestyle
    "https://www.allrecipes.com",
    "https://www.foodnetwork.com",
    "https://www.epicurious.com",
    "https://www.bonappetit.com",
    "https://www.seriouseats.com",
    "https://www.delish.com",
    "https://www.healthline.com",
    "https://www.webmd.com",
    "https://www.mayoclinic.org",
    "https://www.verywellhealth.com",
    "https://www.self.com",
    "https://www.menshealth.com",
    "https://www.womenshealthmag.com",
    "https://www.vogue.com",
    "https://www.gq.com",
    "https://www.architecturaldigest.com",
    "https://www.apartmenttherapy.com",
    "https://www.hgtv.com",
    // Travel & maps
    "https://www.tripadvisor.com",
    "https://www.booking.com",
    "https://www.expedia.com",
    "https://www.airbnb.com",
    "https://www.lonelyplanet.com",
    "https://www.kayak.com",
    "https://www.skyscanner.net",
    "https://www.hotels.com",
    "https://www.google.com/maps",
    "https://www.atlasobscura.com",
    // Finance & business
    "https://www.investopedia.com",
    "https://finance.yahoo.com",
    "https://www.marketwatch.com",
    "https://www.cnbc.com",
    "https://www.nerdwallet.com",
    "https://www.morningstar.com",
    "https://www.ft.com",
    "https://www.businessinsider.com",
    "https://www.fool.com",
    "https://www.coindesk.com",
    // Sports
    "https://www.espn.com",
    "https://bleacherreport.com",
    "https://www.skysports.com",
    "https://www.bbc.com/sport",
    "https://www.nba.com",
    "https://www.nfl.com",
    "https://www.mlb.com",
    "https://www.formula1.com",
    "https://www.goal.com",
    "https://www.cbssports.com",
    // Education & learning
    "https://www.coursera.org",
    "https://www.khanacademy.org",
    "https://www.edx.org",
    "https://www.udemy.com",
    "https://www.ted.com",
    "https://www.duolingo.com",
    "https://www.udacity.com",
    "https://ocw.mit.edu",
    "https://scholar.google.com",
    "https://www.jstor.org",
    // Weather & utilities
    "https://weather.com",
    "https://www.accuweather.com",
    "https://www.wunderground.com",
    "https://www.timeanddate.com",
    // Misc popular
    "https://www.buzzfeed.com",
    "https://www.mentalfloss.com",
    "https://xkcd.com",
    "https://www.smithsonianmag.com",
    "https://www.history.com",
    "https://www.craigslist.org",
    "https://www.indeed.com",
    "https://www.glassdoor.com",
    "https://www.yelp.com",
    "https://www.zillow.com"
  ],

  // -- Adult content (OFF by default; browse-only, no sign-ups/purchases).
  adult: [
    "https://www.pornhub.com",
    "https://www.xvideos.com",
    "https://www.xnxx.com",
    "https://www.redtube.com",
    "https://www.youporn.com",
    "https://www.tube8.com",
    "https://www.xhamster.com",
    "https://spankbang.com",
    "https://www.eporner.com",
    "https://www.brazzers.com",
    "https://www.playboy.com",
    "https://onlyfans.com",
    "https://fansly.com",
    "https://www.adultfriendfinder.com",
    "https://www.literotica.com",
    "https://www.nhentai.net",
    "https://rule34.xxx",
    "https://www.manyvids.com",
    "https://stripchat.com",
    "https://chaturbate.com"
  ],

  // -- Gambling (OFF by default; browse-only, never deposits/bets/withdrawals).
  gambling: [
    "https://www.bet365.com",
    "https://www.williamhill.com",
    "https://www.ladbrokes.com",
    "https://www.paddypower.com",
    "https://www.betfair.com",
    "https://sports.coral.co.uk",
    "https://www.skybet.com",
    "https://www.888casino.com",
    "https://www.888sport.com",
    "https://www.pokerstars.com",
    "https://www.draftkings.com",
    "https://www.fanduel.com",
    "https://www.betmgm.com",
    "https://www.caesars.com/sportsbook",
    "https://www.betway.com",
    "https://www.unibet.com",
    "https://www.bwin.com",
    "https://www.partypoker.com",
    "https://www.ggpoker.com",
    "https://www.lottery.com"
  ]
};

// ---- random decoy queries --------------------------------------------------
// Composed from word banks so search-engine and chatbot queries look like the
// wide-ranging things a real person searches, without repeating.
const Q_PREFIX = [
  "how to", "what is", "best", "cheap", "why is", "when to", "where to find",
  "guide to", "tips for", "history of", "benefits of", "how does", "facts about",
  "top 10", "review of", "alternatives to", "how long does", "is it worth",
  "cost of", "learn", "explain", "difference between", "beginner's guide to"
];
const Q_TOPIC = [
  "sourdough bread", "electric cars", "home espresso", "running shoes",
  "houseplants", "tax deductions", "the roman empire", "black holes",
  "machine learning", "mechanical keyboards", "cast iron skillets",
  "hiking trails", "noise cancelling headphones", "standing desks",
  "compost bins", "solar panels", "air fryers", "board games", "fountain pens",
  "vintage cameras", "marathon training", "meditation", "budgeting",
  "language learning", "chess openings", "watercolor painting", "cold brew",
  "raised garden beds", "indoor climbing", "sleep hygiene", "intermittent fasting",
  "vinyl records", "3d printing", "home networking", "kombucha", "bonsai trees",
  "photography composition", "guitar chords", "public transit", "tide pools",
  "northern lights", "deep sea creatures", "ancient egypt", "quantum computing",
  "renewable energy", "national parks", "street food", "coffee brewing methods",
  "productivity apps", "used cars", "credit scores", "index funds",
  "mediterranean diet", "yoga for beginners", "birdwatching", "star gazing",
  "vegetable gardening", "car maintenance", "resume writing", "interview tips",
  "home workouts", "healthy recipes", "travel hacks", "budget airlines",
  "learning piano", "knitting patterns", "sustainable fashion", "electric bikes",
  "smart home devices", "password managers", "vpn services", "backpacking gear",
  "camping spots", "wildlife photography", "volcanoes", "the water cycle",
  "the stock market", "cryptocurrency basics", "world history", "greek mythology"
];
const Q_SUFFIX = [
  "", "", "for beginners", "explained", "at home", "step by step", "reviews",
  "tutorial", "ideas", "tips", "near me", "vs alternatives", "guide", "2025"
];

function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function randomQuery() {
  const p = _pick(Q_PREFIX), t = _pick(Q_TOPIC), s = _pick(Q_SUFFIX);
  const forms = [`${p} ${t}`, `${t} ${s}`, `${p} ${t} ${s}`, t, `${t} ${s}`];
  return _pick(forms).replace(/\s+/g, " ").trim();
}

// ---- expose in both service-worker and window contexts ---------------------
const _g = (typeof self !== "undefined") ? self : (typeof window !== "undefined" ? window : this);
_g.SITE_CATEGORIES = SITE_CATEGORIES;
_g.CATEGORY_META = CATEGORY_META;
_g.randomQuery = randomQuery;
