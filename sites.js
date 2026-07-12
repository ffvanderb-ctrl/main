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

// group: "topic" categories are subject areas; "language" categories are
// region/language-specific site sets (opt-in). Every category can be toggled.
const CATEGORY_META = [
  { key: "search",     label: "Search engines",            default: true,  group: "topic" },
  { key: "ai",         label: "AI chatbots",               default: true,  group: "topic" },
  { key: "social",     label: "Social media",              default: true,  group: "topic" },
  { key: "shopping",   label: "Shops & marketplaces",      default: true,  group: "topic" },
  { key: "general",    label: "News, reference & general", default: true,  group: "topic" },
  { key: "video",      label: "Streaming & video",         default: true,  group: "topic" },
  { key: "gaming",     label: "Gaming",                    default: true,  group: "topic" },
  { key: "developer",  label: "Developer & tech",          default: true,  group: "topic" },
  { key: "government", label: "Government & public",       default: true,  group: "topic" },
  { key: "finance",    label: "Finance & crypto",          default: true,  group: "topic" },
  { key: "health",     label: "Health & fitness",          default: true,  group: "topic" },
  { key: "travel",     label: "Travel & food",             default: true,  group: "topic" },
  { key: "adult",      label: "Adult content",             default: false, group: "topic" },
  { key: "gambling",   label: "Gambling",                  default: false, group: "topic" },
  // Language / region-specific site sets (all opt-in).
  { key: "lang_de",    label: "German websites",           default: false, group: "language" },
  { key: "lang_fr",    label: "French websites",           default: false, group: "language" },
  { key: "lang_es",    label: "Spanish websites",          default: false, group: "language" },
  { key: "lang_it",    label: "Italian websites",          default: false, group: "language" },
  { key: "lang_nl",    label: "Dutch websites",            default: false, group: "language" },
  { key: "lang_pt",    label: "Portuguese websites",       default: false, group: "language" },
  { key: "lang_ru",    label: "Russian websites",          default: false, group: "language" },
  { key: "lang_jp",    label: "Japanese websites",         default: false, group: "language" },
  { key: "lang_cn",    label: "Chinese websites",          default: false, group: "language" },
  { key: "lang_kr",    label: "Korean websites",           default: false, group: "language" },
  { key: "lang_ar",    label: "Arabic websites",           default: false, group: "language" },
  { key: "lang_in",    label: "Indian websites",           default: false, group: "language" }
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
  ],

  // -- Streaming & video (watch-style behavior kicks in when a video is playing).
  video: [
    "https://www.youtube.com",
    "https://www.netflix.com",
    "https://www.hulu.com",
    "https://www.disneyplus.com",
    "https://www.max.com",
    "https://www.primevideo.com",
    "https://www.peacocktv.com",
    "https://www.paramountplus.com",
    "https://www.crunchyroll.com",
    "https://www.vimeo.com",
    "https://www.dailymotion.com",
    "https://www.twitch.tv",
    "https://www.ted.com/talks",
    "https://www.pbs.org",
    "https://www.apple.com/tv",
    "https://tubitv.com",
    "https://pluto.tv",
    "https://www.bbc.co.uk/iplayer",
    "https://www.rumble.com",
    "https://odysee.com"
  ],

  // -- Gaming.
  gaming: [
    "https://store.steampowered.com",
    "https://www.epicgames.com",
    "https://www.gog.com",
    "https://www.roblox.com",
    "https://www.chess.com",
    "https://lichess.org",
    "https://itch.io",
    "https://www.xbox.com",
    "https://www.playstation.com",
    "https://www.nintendo.com",
    "https://www.ea.com",
    "https://www.ubisoft.com",
    "https://www.rockstargames.com",
    "https://www.miniclip.com",
    "https://www.kongregate.com",
    "https://www.chess24.com",
    "https://boardgamegeek.com",
    "https://www.humblebundle.com",
    "https://www.gamesradar.com",
    "https://www.eurogamer.net"
  ],

  // -- Developer & tech tools.
  developer: [
    "https://developer.mozilla.org",
    "https://stackexchange.com",
    "https://www.npmjs.com",
    "https://pypi.org",
    "https://codepen.io",
    "https://replit.com",
    "https://jsfiddle.net",
    "https://www.digitalocean.com",
    "https://aws.amazon.com",
    "https://cloud.google.com",
    "https://azure.microsoft.com",
    "https://www.cloudflare.com",
    "https://hub.docker.com",
    "https://www.kaggle.com",
    "https://www.hackerrank.com",
    "https://leetcode.com",
    "https://www.codecademy.com",
    "https://css-tricks.com",
    "https://stackblitz.com",
    "https://about.gitlab.com"
  ],

  // -- Government & public institutions.
  government: [
    "https://www.usa.gov",
    "https://www.irs.gov",
    "https://www.nih.gov",
    "https://www.nasa.gov",
    "https://www.cdc.gov",
    "https://www.who.int",
    "https://www.un.org",
    "https://europa.eu",
    "https://www.gov.uk",
    "https://www.canada.ca",
    "https://www.australia.gov.au",
    "https://www.census.gov",
    "https://www.weather.gov",
    "https://www.usgs.gov",
    "https://www.noaa.gov",
    "https://www.loc.gov",
    "https://www.fda.gov",
    "https://www.worldbank.org",
    "https://www.imf.org",
    "https://www.europarl.europa.eu"
  ],

  // -- Finance & crypto (browse-only; never trades, deposits, or withdrawals).
  finance: [
    "https://www.coinbase.com",
    "https://www.binance.com",
    "https://www.kraken.com",
    "https://www.coingecko.com",
    "https://coinmarketcap.com",
    "https://www.tradingview.com",
    "https://etherscan.io",
    "https://www.blockchain.com",
    "https://www.paypal.com",
    "https://www.robinhood.com",
    "https://www.fidelity.com",
    "https://www.schwab.com",
    "https://www.vanguard.com",
    "https://www.mint.com",
    "https://www.creditkarma.com",
    "https://www.bankrate.com",
    "https://www.xe.com",
    "https://www.stripe.com",
    "https://wise.com",
    "https://www.sofi.com"
  ],

  // -- Health & fitness.
  health: [
    "https://www.myfitnesspal.com",
    "https://www.strava.com",
    "https://www.fitbit.com",
    "https://www.headspace.com",
    "https://www.calm.com",
    "https://www.nike.com/running",
    "https://www.bodybuilding.com",
    "https://www.menshealth.com",
    "https://www.womenshealthmag.com",
    "https://www.eatingwell.com",
    "https://www.nutrition.gov",
    "https://patient.info",
    "https://www.medicalnewstoday.com",
    "https://www.everydayhealth.com",
    "https://www.psychologytoday.com",
    "https://www.sleepfoundation.org",
    "https://www.runnersworld.com",
    "https://www.yogajournal.com",
    "https://www.verywellfit.com",
    "https://www.drugs.com"
  ],

  // -- Travel & food.
  travel: [
    "https://www.tripadvisor.com",
    "https://www.booking.com",
    "https://www.expedia.com",
    "https://www.airbnb.com",
    "https://www.lonelyplanet.com",
    "https://www.kayak.com",
    "https://www.skyscanner.net",
    "https://www.hotels.com",
    "https://www.agoda.com",
    "https://www.trivago.com",
    "https://www.hostelworld.com",
    "https://www.viator.com",
    "https://www.getyourguide.com",
    "https://www.opentable.com",
    "https://www.yelp.com",
    "https://www.allrecipes.com",
    "https://www.seriouseats.com",
    "https://www.bonappetit.com",
    "https://www.thespruceeats.com",
    "https://www.eater.com"
  ],

  // -- German-language / .de sites.
  lang_de: [
    "https://www.spiegel.de",
    "https://www.bild.de",
    "https://www.zeit.de",
    "https://www.faz.net",
    "https://www.sueddeutsche.de",
    "https://www.welt.de",
    "https://www.focus.de",
    "https://www.tagesschau.de",
    "https://www.heise.de",
    "https://www.chip.de",
    "https://www.otto.de",
    "https://www.zalando.de",
    "https://www.idealo.de",
    "https://www.mobile.de",
    "https://www.gmx.net",
    "https://web.de",
    "https://www.dwds.de",
    "https://www.leo.org",
    "https://www.kicker.de",
    "https://www.wetter.de"
  ],

  // -- French-language / .fr sites.
  lang_fr: [
    "https://www.lemonde.fr",
    "https://www.lefigaro.fr",
    "https://www.liberation.fr",
    "https://www.leparisien.fr",
    "https://www.lequipe.fr",
    "https://www.franceinfo.fr",
    "https://www.20minutes.fr",
    "https://www.ouest-france.fr",
    "https://www.cdiscount.com",
    "https://www.fnac.com",
    "https://www.leboncoin.fr",
    "https://www.doctissimo.fr",
    "https://www.marmiton.org",
    "https://www.allocine.fr",
    "https://www.orange.fr",
    "https://www.free.fr",
    "https://www.larousse.fr",
    "https://www.linternaute.com",
    "https://www.jeuxvideo.com",
    "https://www.meteofrance.com"
  ],

  // -- Spanish-language sites.
  lang_es: [
    "https://elpais.com",
    "https://www.elmundo.es",
    "https://www.abc.es",
    "https://www.lavanguardia.com",
    "https://www.marca.com",
    "https://as.com",
    "https://www.20minutos.es",
    "https://www.eldiario.es",
    "https://www.rtve.es",
    "https://www.elconfidencial.com",
    "https://www.mercadolibre.com.ar",
    "https://www.milanuncios.com",
    "https://www.infobae.com",
    "https://www.clarin.com",
    "https://www.eluniversal.com.mx",
    "https://www.rae.es",
    "https://www.wordreference.com",
    "https://www.recetasgratis.net",
    "https://www.filmaffinity.com",
    "https://www.eltiempo.es"
  ],

  // -- Italian-language sites.
  lang_it: [
    "https://www.corriere.it",
    "https://www.repubblica.it",
    "https://www.gazzetta.it",
    "https://www.lastampa.it",
    "https://www.ilsole24ore.com",
    "https://www.ansa.it",
    "https://www.ilfattoquotidiano.it",
    "https://www.tgcom24.mediaset.it",
    "https://www.subito.it",
    "https://www.giallozafferano.it",
    "https://www.libero.it",
    "https://www.virgilio.it",
    "https://www.meteo.it",
    "https://www.treccani.it",
    "https://www.mymovies.it",
    "https://www.calciomercato.com",
    "https://www.fanpage.it",
    "https://www.ilpost.it",
    "https://www.tuttosport.com",
    "https://www.immobiliare.it"
  ],

  // -- Dutch-language / .nl sites.
  lang_nl: [
    "https://www.nu.nl",
    "https://www.nos.nl",
    "https://www.telegraaf.nl",
    "https://www.ad.nl",
    "https://www.volkskrant.nl",
    "https://www.nrc.nl",
    "https://www.rtlnieuws.nl",
    "https://www.bol.com",
    "https://www.marktplaats.nl",
    "https://www.buienradar.nl",
    "https://www.weeronline.nl",
    "https://www.tweakers.net",
    "https://www.9292.nl",
    "https://www.funda.nl",
    "https://www.iens.nl",
    "https://www.voetbalzone.nl",
    "https://www.vandale.nl",
    "https://www.startpagina.nl",
    "https://www.dumpert.nl",
    "https://www.gaspedaal.nl"
  ],

  // -- Portuguese-language sites (Brazil & Portugal).
  lang_pt: [
    "https://www.globo.com",
    "https://www.uol.com.br",
    "https://www.folha.uol.com.br",
    "https://www.estadao.com.br",
    "https://www.terra.com.br",
    "https://www.r7.com",
    "https://www.publico.pt",
    "https://www.sapo.pt",
    "https://www.record.pt",
    "https://www.dn.pt",
    "https://www.mercadolivre.com.br",
    "https://www.olx.com.br",
    "https://www.americanas.com.br",
    "https://www.magazineluiza.com.br",
    "https://www.ge.globo.com",
    "https://www.tecmundo.com.br",
    "https://www.climatempo.com.br",
    "https://www.dicio.com.br",
    "https://www.adorocinema.com",
    "https://www.cifraclub.com.br"
  ],

  // -- Russian-language sites.
  lang_ru: [
    "https://yandex.ru",
    "https://mail.ru",
    "https://ria.ru",
    "https://www.rbc.ru",
    "https://lenta.ru",
    "https://www.kommersant.ru",
    "https://tass.ru",
    "https://www.gazeta.ru",
    "https://www.kinopoisk.ru",
    "https://www.avito.ru",
    "https://ozon.ru",
    "https://www.wildberries.ru",
    "https://sports.ru",
    "https://habr.com",
    "https://pikabu.ru",
    "https://gismeteo.ru",
    "https://www.rambler.ru",
    "https://dzen.ru",
    "https://www.championat.com",
    "https://www.rt.com"
  ],

  // -- Japanese-language sites.
  lang_jp: [
    "https://www.yahoo.co.jp",
    "https://www.nikkei.com",
    "https://www.asahi.com",
    "https://mainichi.jp",
    "https://www.yomiuri.co.jp",
    "https://www3.nhk.or.jp",
    "https://news.livedoor.com",
    "https://www.rakuten.co.jp",
    "https://www.amazon.co.jp",
    "https://kakaku.com",
    "https://www.mercari.com",
    "https://cookpad.com",
    "https://tabelog.com",
    "https://www.jorudan.co.jp",
    "https://tenki.jp",
    "https://dic.nicovideo.jp",
    "https://www.nicovideo.jp",
    "https://www.pixiv.net",
    "https://www.oricon.co.jp",
    "https://weathernews.jp"
  ],

  // -- Chinese-language sites.
  lang_cn: [
    "https://www.baidu.com",
    "https://www.qq.com",
    "https://www.sina.com.cn",
    "https://www.sohu.com",
    "https://www.163.com",
    "https://www.taobao.com",
    "https://www.jd.com",
    "https://www.tmall.com",
    "https://www.zhihu.com",
    "https://www.bilibili.com",
    "https://www.douban.com",
    "https://www.ifeng.com",
    "https://www.xinhuanet.com",
    "https://www.people.com.cn",
    "https://www.ctrip.com",
    "https://www.iqiyi.com",
    "https://www.youku.com",
    "https://www.hao123.com",
    "https://www.36kr.com",
    "https://www.csdn.net"
  ],

  // -- Korean-language sites.
  lang_kr: [
    "https://www.naver.com",
    "https://www.daum.net",
    "https://www.chosun.com",
    "https://www.donga.com",
    "https://www.joongang.co.kr",
    "https://www.hani.co.kr",
    "https://www.hankyung.com",
    "https://www.mk.co.kr",
    "https://www.coupang.com",
    "https://www.gmarket.co.kr",
    "https://www.11st.co.kr",
    "https://www.melon.com",
    "https://www.inven.co.kr",
    "https://www.dcinside.com",
    "https://www.fmkorea.com",
    "https://www.ruliweb.com",
    "https://www.yna.co.kr",
    "https://www.tistory.com",
    "https://www.wavve.com",
    "https://tv.kakao.com"
  ],

  // -- Arabic-language sites.
  lang_ar: [
    "https://www.aljazeera.net",
    "https://www.alarabiya.net",
    "https://arabic.cnn.com",
    "https://www.bbc.com/arabic",
    "https://www.youm7.com",
    "https://www.alriyadh.com",
    "https://www.alahram.org.eg",
    "https://www.skynewsarabia.com",
    "https://www.emaratalyoum.com",
    "https://www.alwatan.com.sa",
    "https://www.masrawy.com",
    "https://www.hespress.com",
    "https://www.annahar.com",
    "https://www.almasryalyoum.com",
    "https://www.souq.com",
    "https://www.noon.com",
    "https://www.mawdoo3.com",
    "https://www.kooora.com",
    "https://www.filgoal.com",
    "https://www.argeek.net"
  ],

  // -- Indian sites (English & regional).
  lang_in: [
    "https://timesofindia.indiatimes.com",
    "https://www.hindustantimes.com",
    "https://www.thehindu.com",
    "https://indianexpress.com",
    "https://www.ndtv.com",
    "https://www.indiatoday.in",
    "https://www.news18.com",
    "https://www.livemint.com",
    "https://economictimes.indiatimes.com",
    "https://www.flipkart.com",
    "https://www.myntra.com",
    "https://www.snapdeal.com",
    "https://www.cricbuzz.com",
    "https://www.espncricinfo.com",
    "https://www.bhaskar.com",
    "https://www.jagran.com",
    "https://www.moneycontrol.com",
    "https://www.zomato.com",
    "https://www.makemytrip.com",
    "https://www.rediff.com"
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

// ---- URL helpers & catalog lookup ------------------------------------------
// The visit list is a flat list of URLs the user can edit. Per-site behavior
// (search-query URLs, chatbot typing, social feed, category) is recovered by
// looking each URL up in the catalog, so a flat list keeps all its smarts.

function normalizeUrl(url) {
  const t = (url || "").trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : "https://" + t;
}

function catUrl(e) { return normalizeUrl(typeof e === "string" ? e : e.url); }

// url -> { category, search, chat } (first category in catalog order wins).
const URL_META = {};
for (const meta of CATEGORY_META) {
  for (const e of (SITE_CATEGORIES[meta.key] || [])) {
    const url = catUrl(e);
    if (url && !URL_META[url]) {
      URL_META[url] = { category: meta.key, search: (typeof e === "object" && e.search) || null, chat: typeof e === "object" && !!e.chat };
    }
  }
}

function siteMeta(url) { const u = normalizeUrl(url); return u ? (URL_META[u] || null) : null; }

// Normalized URLs belonging to a category (in catalog order).
function categoryUrls(key) {
  return (SITE_CATEGORIES[key] || []).map(catUrl).filter(Boolean);
}

// The default visit list: URLs from every default-on category, de-duplicated.
function defaultSites() {
  const seen = new Set(), out = [];
  for (const meta of CATEGORY_META) {
    if (!meta.default) continue;
    for (const u of categoryUrls(meta.key)) if (!seen.has(u)) { seen.add(u); out.push(u); }
  }
  return out;
}

// ---- expose in both service-worker and window contexts ---------------------
const _g = (typeof self !== "undefined") ? self : (typeof window !== "undefined" ? window : this);
_g.SITE_CATEGORIES = SITE_CATEGORIES;
_g.CATEGORY_META = CATEGORY_META;
_g.randomQuery = randomQuery;
_g.normalizeUrl = normalizeUrl;
_g.siteMeta = siteMeta;
_g.categoryUrls = categoryUrls;
_g.defaultSites = defaultSites;
