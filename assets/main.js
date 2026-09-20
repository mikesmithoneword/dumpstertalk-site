/* Dumpster Talk - site behaviour. No frameworks, no build step.

   Episodes: the page shows the episode list baked into data/episodes.js straight away,
   then asks Apple Podcasts for the live list. Anything new that Apple knows about
   (a freshly released episode) is added automatically. */
(function () {
  "use strict";

  var SHOW_ID = "6254949841eb830014151378";          // Acast show id
  var APPLE_ID = "1402693187";                        // Apple Podcasts show id
  var ACAST_SHOW_URL = "https://shows.acast.com/dumpstertalk";
  var LOOKUP_URL = "https://itunes.apple.com/lookup?id=" + APPLE_ID + "&entity=podcastEpisode&limit=200";
  var CACHE_KEY = "dt_apple_eps_v1";
  var CACHE_MS = 60 * 60 * 1000;
  var PAGE_SIZE = 6;
  // Player styling from the Acast embed builder. Kept here so that swapping to a
  // single episode looks the same as the feed player in index.html.
  var EMBED_STYLE = "accentColor=161616&bgColor=ffcc0b&secondaryColor=161616&font-family=Barlow%20Condensed&font-src=https%3A%2F%2Ffonts.googleapis.com%2Fcss%3Ffamily%3DBarlow%2BCondensed&subscribe=false";

  /* ---------- Mobile nav ---------- */
  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  if (header && toggle) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    header.querySelectorAll(".site-nav a").forEach(function (a) {
      a.addEventListener("click", function () {
        header.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  document.querySelectorAll("[data-year]").forEach(function (n) {
    n.textContent = new Date().getFullYear();
  });

  /* ---------- Helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fmtDate(iso) {
    var d = new Date(iso + "T12:00:00");
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtDur(sec) {
    if (!sec) return "";
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var pad = function (x) { return (x < 10 ? "0" : "") + x; };
    return h ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }

  function stripHtml(s) {
    var d = document.createElement("div");
    d.innerHTML = String(s || "");
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }

  function clip(s, max) {
    if (s.length <= max) return s;
    var cut = s.slice(0, max);
    cut = cut.slice(0, Math.max(cut.lastIndexOf(" "), 40));
    return cut.replace(/[\s.,;:!?-]+$/, "") + "…";
  }

  /* ---------- Links for each episode ---------- */
  function appleLink(ep) {
    return ep.appleUrl || ("https://podcasts.apple.com/us/podcast/dumpster-talk/id" + APPLE_ID + (ep.apple ? "?i=" + ep.apple : ""));
  }
  function spotifyLink(ep) {
    if (ep.spotify) return "https://open.spotify.com/episode/" + ep.spotify;
    // Brand-new episode we have no Spotify id for yet: land on a Spotify search for it.
    return "https://open.spotify.com/search/" + encodeURIComponent("Dumpster Talk " + ep.title) + "/episodes";
  }
  function acastLink(ep) {
    return ep.acast ? ACAST_SHOW_URL + "/episodes/" + (ep.alias || ep.acast) : ACAST_SHOW_URL;
  }

  /* ---------- Player ---------- */
  var player = document.getElementById("player");
  var playerReset = document.getElementById("player-reset");
  var FEED_SRC = player ? player.getAttribute("src") : "";

  function playEpisode(ep) {
    if (!player || !ep.acast) return;
    player.src = "https://embed.acast.com/" + SHOW_ID + "/" + ep.acast + "?" + EMBED_STYLE;
    player.height = 190;
    if (playerReset) playerReset.hidden = false;
    var target = document.getElementById("listen");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (playerReset) {
    playerReset.addEventListener("click", function () {
      player.src = FEED_SRC;
      player.height = 360;
      playerReset.hidden = true;
    });
  }

  /* ---------- Episode data ---------- */
  var baked = (window.DT_EPISODES || []).slice();
  var episodes = sortEpisodes(baked);
  var shown = PAGE_SIZE;
  var query = "";

  function sortEpisodes(list) {
    return list.slice().sort(function (a, b) {
      var d = (b.date || "").localeCompare(a.date || "");
      return d || ((b.n || 0) - (a.n || 0));
    });
  }

  // Turn one record from Apple's lookup into our episode shape.
  function fromApple(it) {
    var title = String(it.trackName || "").trim();
    var n = null;
    var m = title.match(/^(?:Episode\s+)?(\d{1,3})\s*[-–—:.]\s*(.+)$/i);
    if (m) { n = parseInt(m[1], 10); title = m[2].trim(); }
    var guid = String(it.episodeGuid || "");
    var url = String(it.trackViewUrl || "").replace(/&uo=\d+/, "");
    return {
      n: n,
      title: title,
      date: String(it.releaseDate || "").slice(0, 10),
      dur: Math.round((it.trackTimeMillis || 0) / 1000),
      desc: clip(stripHtml(it.shortDescription || it.description || ""), 170),
      explicit: it.contentAdvisoryRating === "Explicit",
      apple: String(it.trackId),
      appleUrl: /^https:\/\/podcasts\.apple\.com\//.test(url) ? url : "",
      acast: /^[0-9a-f]{24}$/i.test(guid) ? guid : null
    };
  }

  function mergeLive(live) {
    var byApple = {}, seen = {}, out = [];
    baked.forEach(function (b) { byApple[b.apple] = b; });
    live.forEach(function (l) {
      var b = byApple[l.apple];
      seen[l.apple] = true;
      if (!b) { out.push(l); return; }
      var m = {};
      Object.keys(b).forEach(function (k) { m[k] = b[k]; });
      m.title = l.title || b.title;
      m.date = l.date || b.date;
      m.dur = l.dur || b.dur;
      m.desc = l.desc || b.desc;
      m.explicit = l.explicit;
      m.appleUrl = l.appleUrl;
      if (b.n == null) m.n = l.n;
      out.push(m);
    });
    baked.forEach(function (b) { if (!seen[b.apple]) out.push(b); });
    return sortEpisodes(out);
  }

  function readCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (c && c.items && c.items.length && Date.now() - c.t < CACHE_MS) return c.items;
    } catch (e) { /* storage blocked: fine */ }
    return null;
  }
  function writeCache(items) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items: items })); } catch (e) { /* ignore */ }
  }

  function loadLive(done) {
    var cached = readCache();
    if (cached) { done(cached); return; }
    if (!window.fetch) return;
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    fetch(LOOKUP_URL, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        clearTimeout(timer);
        var items = (data.results || [])
          .filter(function (r) { return r.kind === "podcast-episode" && r.trackId; })
          .map(fromApple);
        if (items.length) { writeCache(items); done(items); }
      })
      .catch(function () { clearTimeout(timer); /* keep the baked list */ });
  }

  /* ---------- Rendering ---------- */
  var listEl = document.getElementById("ep-list");
  var moreBtn = document.getElementById("ep-more");
  var searchEl = document.getElementById("ep-search");

  function matches(ep) {
    if (!query) return true;
    var hay = (ep.title + " " + (ep.desc || "") + " #" + (ep.n || "bonus")).toLowerCase();
    return hay.indexOf(query) !== -1;
  }

  function extLink(cls, text, href) {
    var a = el("a", cls, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function buildActions(ep, node) {
    if (ep.acast) {
      var play = el("button", "ep-btn play", "Play here");
      play.type = "button";
      play.addEventListener("click", function () { playEpisode(ep); });
      node.appendChild(play);
    }
    node.appendChild(extLink("ep-btn apple", "Apple Podcasts", appleLink(ep)));
    node.appendChild(extLink("ep-btn spotify", "Spotify", spotifyLink(ep)));
    node.appendChild(extLink("ep-btn acast", "Acast", acastLink(ep)));
  }

  function metaLine(ep, node) {
    var bits = [fmtDate(ep.date), fmtDur(ep.dur)].filter(Boolean);
    node.textContent = "";
    if (bits.length) node.appendChild(el("span", null, bits.join("  ·  ")));
    if (ep.explicit) node.appendChild(el("span", "tag-explicit", "Explicit"));
  }

  function renderEpisode(ep) {
    var li = el("li", "ep");
    li.appendChild(el("div", "ep-num" + (ep.n ? "" : " bonus"), ep.n ? "#" + ep.n : "NEW"));
    var body = el("div", "ep-body");
    body.appendChild(el("h3", "ep-title", ep.title));
    var meta = el("p", "ep-meta");
    metaLine(ep, meta);
    body.appendChild(meta);
    if (ep.desc) body.appendChild(el("p", "ep-desc", ep.desc));
    var actions = el("div", "ep-actions");
    buildActions(ep, actions);
    body.appendChild(actions);
    li.appendChild(body);
    return li;
  }

  function renderLatest() {
    var box = document.getElementById("latest");
    if (!box || !episodes.length) return;
    var ep = episodes[0];
    document.getElementById("latest-title").textContent = (ep.n ? "#" + ep.n + "  " : "") + ep.title;
    metaLine(ep, document.getElementById("latest-meta"));
    var actions = document.getElementById("latest-actions");
    actions.textContent = "";
    buildActions(ep, actions);
    box.hidden = false;
  }

  // The show numbers its episodes, and #14 was never released, so the highest
  // episode number is the honest headline figure - and it goes up on its own
  // as new episodes appear.
  function epCount() {
    var max = 0;
    episodes.forEach(function (e) { if (e.n && e.n > max) max = e.n; });
    return max || episodes.length;
  }

  function renderEpisodes() {
    document.querySelectorAll("[data-ep-count]").forEach(function (n) { n.textContent = epCount(); });
    renderLatest();
    if (!listEl) return;
    var filtered = episodes.filter(matches);
    listEl.textContent = "";
    if (!filtered.length) {
      listEl.appendChild(el("li", "ep-empty", query ? "Nothing matches that search." : "No episodes yet."));
      if (moreBtn) moreBtn.hidden = true;
      return;
    }
    var limit = query ? filtered.length : shown;
    filtered.slice(0, limit).forEach(function (ep) { listEl.appendChild(renderEpisode(ep)); });
    if (moreBtn) moreBtn.hidden = !!query || filtered.length <= limit;
  }

  if (moreBtn) {
    moreBtn.addEventListener("click", function () {
      shown += PAGE_SIZE;
      renderEpisodes();
    });
  }
  if (searchEl) {
    searchEl.addEventListener("input", function () {
      query = searchEl.value.trim().toLowerCase();
      renderEpisodes();
    });
  }

  renderEpisodes();
  loadLive(function (live) {
    episodes = mergeLive(live);
    renderEpisodes();
  });

  /* ---------- Pitch-an-idea form ----------
     Posts to Web3Forms, which emails the submission to the address the
     access key belongs to. No key set? Show a plain mailto note instead,
     so the section is never a dead end. */
  var pitchForm = document.getElementById("pitch-form");
  if (pitchForm) {
    var cfg2 = window.DT_FORM || {};
    var email = cfg2.fallbackEmail || "info@dumpstertalk.com";
    var msgEl = document.getElementById("pf-message");
    var countEl = document.getElementById("pf-count");
    var statusEl = document.getElementById("pf-status");
    var submitBtn = document.getElementById("pf-submit");
    var MAX = 500;

    function mailtoLink(text) {
      var a = el("a", null, text);
      a.href = "mailto:" + email;
      return a;
    }

    if (!cfg2.accessKey) {
      var note = el("p", "pitch-note");
      note.appendChild(document.createTextNode("The idea form isn’t switched on yet. In the meantime, email your idea to "));
      note.appendChild(mailtoLink(email));
      note.appendChild(document.createTextNode(" and say which segment it’s for."));
      pitchForm.parentNode.replaceChild(note, pitchForm);
    } else {
      // live character counter
      function updateCount() {
        var n = msgEl.value.length;
        countEl.textContent = n + " / " + MAX;
        countEl.className = "counter" + (n >= MAX ? " over" : "");
      }
      msgEl.addEventListener("input", updateCount);
      updateCount();

      function setStatus(text, kind) {
        statusEl.textContent = text || "";
        statusEl.className = "pitch-status" + (kind ? " " + kind : "");
      }

      function firstProblem() {
        var f = pitchForm;
        if (!f.name.value.trim()) return [f.name, "Add your name so we know who to blame."];
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.value.trim())) return [f.email, "That email address doesn’t look right."];
        if (!f.segment.value) return [f.segment, "Pick which segment this is for."];
        if (!f.message.value.trim()) return [f.message, "Tell us the idea."];
        return null;
      }

      pitchForm.addEventListener("submit", function (e) {
        e.preventDefault();
        pitchForm.querySelectorAll(".invalid").forEach(function (n) { n.classList.remove("invalid"); });

        var problem = firstProblem();
        if (problem) {
          problem[0].classList.add("invalid");
          problem[0].focus();
          setStatus(problem[1], "bad");
          return;
        }

        var data = {
          access_key: cfg2.accessKey,
          subject: "Dumpster Talk idea: " + pitchForm.segment.value,
          from_name: "Dumpster Talk website",
          name: pitchForm.name.value.trim(),
          email: pitchForm.email.value.trim(),
          segment: pitchForm.segment.value,
          message: pitchForm.message.value.trim(),
          botcheck: pitchForm.botcheck.checked ? "true" : ""
        };

        submitBtn.disabled = true;
        setStatus("Sending…", null);

        fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(data)
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
          .then(function (res) {
            submitBtn.disabled = false;
            if (res.ok) {
              pitchForm.reset();
              updateCount();
              setStatus("Got it. If it’s any good you might hear it on the show.", "ok");
            } else {
              throw new Error((res.body && res.body.message) || "failed");
            }
          })
          .catch(function () {
            submitBtn.disabled = false;
            setStatus("", "bad");
            statusEl.appendChild(document.createTextNode("That didn’t send. Try again, or email it to "));
            statusEl.appendChild(mailtoLink(email));
            statusEl.appendChild(document.createTextNode("."));
          });
      });
    }
  }

  /* ---------- Merch store ---------- */
  var storeNode = document.getElementById("merch-store");
  var cfg = window.DT_STORE || {};
  var products = ["T-Shirts", "Hoodies", "Stickers", "Mugs", "Hats", "Tote Bags"];

  function renderPlaceholder(kind) {
    storeNode.textContent = "";
    var grid = el("ul", "shop-grid");
    products.forEach(function (name) {
      var li = el("li", "shop-tile");
      var img = el("img");
      img.src = "assets/img/logo-line.png";
      img.alt = "";
      img.loading = "lazy";
      li.appendChild(img);
      li.appendChild(el("h3", null, name));
      li.appendChild(el("span", "shop-tag", "Drop incoming"));
      grid.appendChild(li);
    });
    storeNode.appendChild(grid);
    var msg = el("p", "shop-msg");
    if (kind === "error") {
      msg.textContent = "The store didn’t load. Give it a refresh. #thiswillneverwork";
    } else {
      msg.appendChild(document.createTextNode("The shop is still being built out of scrap. Follow "));
      var a = el("a", null, "@dumpstertalk");
      a.href = "https://www.instagram.com/dumpstertalk";
      a.target = "_blank";
      a.rel = "noopener";
      msg.appendChild(a);
      msg.appendChild(document.createTextNode(" on Instagram to catch the drop."));
    }
    storeNode.appendChild(msg);
  }

  function loadStore() {
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js";
    s.onerror = function () { renderPlaceholder("error"); };
    s.onload = function () {
      try {
        var clientOpts = { domain: cfg.domain };
        if (cfg.storefrontAccessToken) {
          clientOpts.storefrontAccessToken = cfg.storefrontAccessToken;
        } else {
          // Older-style embed codes use apiKey + appId instead
          clientOpts.apiKey = cfg.apiKey;
          clientOpts.appId = cfg.appId || "6";
        }
        var client = window.ShopifyBuy.buildClient(clientOpts);
        window.ShopifyBuy.UI.onReady(client).then(function (ui) {
          storeNode.textContent = "";
          var yellow = "#ffcc0b", ink = "#16140f", white = "#ffffff";
          var head = "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif";
          var btn = {
            "font-family": head,
            "font-weight": "700",
            "text-transform": "uppercase",
            "letter-spacing": ".05em",
            "font-size": "18px",
            "background-color": yellow,
            "color": ink,
            "border-radius": "0",
            "border": "3px solid " + yellow,
            ":hover": { "background-color": white, "color": ink, "border-color": white },
            ":focus": { "background-color": white, "color": ink, "border-color": white }
          };
          ui.createComponent(cfg.componentType === "product" ? "product" : "collection", {
            id: cfg.collectionId,
            node: storeNode,
            moneyFormat: cfg.moneyFormat || "%24%7B%7Bamount%7D%7D",
            options: {
              product: {
                styles: {
                  product: { "@media (min-width: 601px)": { "max-width": "calc(33.333% - 20px)", "margin-left": "20px", "margin-bottom": "40px" } },
                  title: { "font-family": head, "text-transform": "uppercase", "color": white, "font-size": "26px", "font-weight": "700" },
                  price: { "font-family": head, "font-size": "22px", "color": yellow },
                  compareAt: { "color": "#b9b4a6" },
                  button: btn
                },
                text: { button: "Add to cart" }
              },
              productSet: { styles: { products: { "@media (min-width: 601px)": { "margin-left": "-20px" } } } },
              modalProduct: {
                styles: {
                  button: btn,
                  title: { "font-family": head, "text-transform": "uppercase", "font-weight": "700" }
                }
              },
              cart: {
                styles: {
                  button: btn,
                  title: { "font-family": head, "text-transform": "uppercase", "font-weight": "700" }
                },
                text: { total: "Subtotal", button: "Checkout" }
              },
              toggle: { styles: { toggle: { "background-color": yellow, "color": ink, ":hover": { "background-color": white } } } }
            }
          });
        });
      } catch (e) {
        renderPlaceholder("error");
      }
    };
    document.head.appendChild(s);
  }

  if (storeNode) {
    var configured = cfg.domain && (cfg.storefrontAccessToken || cfg.apiKey) && cfg.collectionId;
    if (configured) {
      storeNode.textContent = "Dragging the merch out of the bin…";
      loadStore();
    } else {
      renderPlaceholder();
    }
  }
})();
