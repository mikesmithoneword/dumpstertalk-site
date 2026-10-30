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

  /* ---------- Merch store (Fourthwall Storefront API) ---------- */
  var storeNode = document.getElementById("merch-store");
  var cfg = window.DT_STORE || {};
  var API = "https://storefront-api.fourthwall.com/v1";
  var placeholderNames = ["T-Shirts", "Hoodies", "Tanks", "Hats", "Stickers", "Tote Bags"];

  function renderPlaceholder(kind) {
    storeNode.textContent = "";
    var grid = el("ul", "shop-grid");
    placeholderNames.forEach(function (name) {
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
      msg.textContent = "The store didn\u2019t load. Give it a refresh. #thiswillneverwork";
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

  function stateOf(thing) {
    var st = thing && thing.state;
    if (!st) return "";
    return String(st.type || st.state || st).toUpperCase();
  }

  function money(price) {
    if (!price || typeof price.value !== "number") return "";
    var cur = price.currency || "USD";
    try {
      return new Intl.NumberFormat("en-CA", {
        style: "currency", currency: cur, currencyDisplay: "narrowSymbol"
      }).format(price.value) + " " + cur;
    } catch (e) {
      return "$" + price.value.toFixed(2) + " " + cur;
    }
  }

  function pickImage(variant, product) {
    var list = (variant && variant.images && variant.images.length) ? variant.images : (product.images || []);
    var im = list[0];
    if (!im) return null;
    return im.url || im.transformedUrl || null;
  }

  function checkoutUrl(variantId) {
    var shop = String(cfg.shopDomain || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    return "https://" + shop + "/cart/checkout?products=" + encodeURIComponent(variantId) + ":1";
  }

  function attr(variant, key) {
    var a = variant.attributes || {};
    var v = a[key];
    if (!v) return "";
    return String(v.name || v.value || v);
  }

  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out;
  }

  function buildTile(product) {
    var variants = (product.variants || []).filter(function (v) { return v && v.id; });
    var li = el("li", "prod");
    var soldOut = stateOf(product) === "SOLD_OUT" || !variants.length;

    var figure = el("div", "prod-shot");
    var img = el("img");
    img.alt = product.name || "";
    img.loading = "lazy";
    var first = variants[0];
    var src = pickImage(first, product);
    if (src) { img.src = src; } else { img.src = "assets/img/logo-line.png"; img.className = "prod-fallback"; }
    figure.appendChild(img);
    if (soldOut) figure.appendChild(el("span", "prod-flag", "Sold out"));
    li.appendChild(figure);

    li.appendChild(el("h3", "prod-name", product.name || "Untitled"));
    var priceEl = el("p", "prod-price", money(first && first.unitPrice));
    li.appendChild(priceEl);

    var colours = uniq(variants.map(function (v) { return attr(v, "color"); }));
    var colourSel = null, sizeSel = null;

    function currentVariant() {
      var wantC = colourSel ? colourSel.value : "";
      var wantS = sizeSel ? sizeSel.value : "";
      // exact match only - never guess, or the Buy button would send the
      // wrong size to checkout when a colour/size combo does not exist
      return variants.filter(function (v) {
        return (!wantC || attr(v, "color") === wantC) && (!wantS || attr(v, "size") === wantS);
      })[0] || null;
    }

    function refresh() {
      var v = currentVariant();
      if (!v) {
        buy.removeAttribute("href");
        buy.textContent = "Unavailable";
        buy.className = "btn btn-yellow prod-buy is-off";
        buy.setAttribute("aria-disabled", "true");
        return;
      }
      var im = pickImage(v, product);
      if (im && img.getAttribute("src") !== im) { img.src = im; img.className = ""; }
      priceEl.textContent = money(v.unitPrice);
      buy.href = checkoutUrl(v.id);
      buy.textContent = "Buy";
      buy.className = "btn btn-yellow prod-buy";
      buy.removeAttribute("aria-disabled");
    }

    function makeSelect(label, values, cls) {
      var wrap = el("label", "prod-pick " + cls);
      wrap.appendChild(el("span", "prod-pick-label", label));
      var sel = document.createElement("select");
      values.forEach(function (val) {
        var o = document.createElement("option");
        o.value = val; o.textContent = val;
        sel.appendChild(o);
      });
      wrap.appendChild(sel);
      return { wrap: wrap, sel: sel };
    }

    var picks = el("div", "prod-picks");
    if (colours.length > 1) {
      var c = makeSelect("Colour", colours, "is-colour");
      colourSel = c.sel;
      picks.appendChild(c.wrap);
    }
    var sizesFor = function () {
      var wantC = colourSel ? colourSel.value : "";
      return uniq(variants.filter(function (v) {
        return !wantC || attr(v, "color") === wantC;
      }).map(function (v) { return attr(v, "size"); }));
    };
    var allSizes = sizesFor();
    if (allSizes.length > 1) {
      var sz = makeSelect("Size", allSizes, "is-size");
      sizeSel = sz.sel;
      picks.appendChild(sz.wrap);
    }
    if (picks.childNodes.length) li.appendChild(picks);

    var buy = el("a", "btn btn-yellow prod-buy", soldOut ? "Sold out" : "Buy");
    if (soldOut) {
      buy.setAttribute("aria-disabled", "true");
      buy.className += " is-off";
    } else {
      buy.href = checkoutUrl((first || {}).id);
      buy.rel = "noopener";
    }
    li.appendChild(buy);

    if (colourSel) {
      colourSel.addEventListener("change", function () {
        if (sizeSel) {
          var keep = sizeSel.value;
          sizeSel.textContent = "";
          sizesFor().forEach(function (val) {
            var o = document.createElement("option");
            o.value = val; o.textContent = val;
            if (val === keep) o.selected = true;
            sizeSel.appendChild(o);
          });
        }
        refresh();
      });
    }
    if (sizeSel) sizeSel.addEventListener("change", refresh);
    if (!soldOut) refresh();
    return li;
  }

  function renderProducts(list) {
    storeNode.textContent = "";
    var grid = el("ul", "prod-grid");
    list.forEach(function (p) { grid.appendChild(buildTile(p)); });
    storeNode.appendChild(grid);

    var msg = el("p", "shop-msg");
    msg.appendChild(document.createTextNode("Prices in US dollars. Canadian prices and shipping are shown at checkout. "));
    var a = el("a", null, "See the whole shop");
    a.href = "https://" + String(cfg.shopDomain || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    a.target = "_blank";
    a.rel = "noopener";
    msg.appendChild(a);
    msg.appendChild(document.createTextNode("."));
    storeNode.appendChild(msg);
  }

  function fetchJSON(path) {
    var join = path.indexOf("?") === -1 ? "?" : "&";
    return fetch(API + path + join + "storefront_token=" + encodeURIComponent(cfg.storefrontToken),
                 { headers: { "Accept": "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
  }

  function productsIn(slug) {
    return fetchJSON("/collections/" + encodeURIComponent(slug) + "/products?size=100")
      .then(function (d) { return (d && d.results) || []; })
      .catch(function () { return []; });   // one bad collection must not kill the grid
  }

  // Fourthwall has no "list every product" endpoint: products are only
  // reachable through collections, and even the built-in "all" collection
  // is one you curate by hand. So we read every collection and merge,
  // which means a product shows up as long as it is in at least one.
  function loadStore() {
    var wanted = cfg.collection && cfg.collection !== "all" ? [cfg.collection] : null;
    // shop-front order: shirts first, odds and ends last
    var PREF = ["tees", "t-shirts", "shirts", "hoodies", "sweatshirts", "tanks", "hats", "stickers"];
    function rank(slug) {
      var i = PREF.indexOf(String(slug).toLowerCase());
      if (i !== -1) return i;
      return slug === "all" ? 998 : 500;   // "all" last: it is the catch-all
    }

    var step = wanted
      ? Promise.resolve(wanted)
      : fetchJSON("/collections?size=100").then(function (d) {
          var slugs = ((d && d.results) || []).map(function (c) { return c.slug; }).filter(Boolean);
          slugs.sort(function (a, b) { return rank(a) - rank(b); });
          return slugs.length ? slugs : ["all"];
        });

    step
      .then(function (slugs) { return Promise.all(slugs.map(productsIn)); })
      .then(function (lists) {
        var seen = {}, list = [];
        lists.forEach(function (one) {
          one.forEach(function (p) {
            if (!p || !p.id || seen[p.id]) return;
            if (!(p.variants || []).length) return;
            seen[p.id] = 1;
            list.push(p);
          });
        });
        list.sort(function (a, b) {
          return (stateOf(a) === "SOLD_OUT" ? 1 : 0) - (stateOf(b) === "SOLD_OUT" ? 1 : 0);
        });
        if (!list.length) { renderPlaceholder(); return; }
        renderProducts(list);
      })
      .catch(function () { renderPlaceholder("error"); });
  }

  if (storeNode) {
    if (cfg.storefrontToken && cfg.shopDomain) {
      storeNode.appendChild(el("p", "shop-msg", "Dragging the merch out of the bin\u2026"));
      loadStore();
    } else {
      renderPlaceholder();
    }
  }
})();
