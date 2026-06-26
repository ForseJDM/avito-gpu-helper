// =====================================================
//  Avito GPU Helper v3.0.4 - Badge Renderer
//  Scans search result cards on Avito search pages,
//  detects GPU model + price, evaluates fair price,
//  and injects a color-coded mini-badge into each card.
//  Supports infinite scroll via MutationObserver.
//
//  v3.0.1: ИСПРАВЛЕНИЕ — badges пропадали после обновления search.
//  v3.0.2: detectGpu(text, {useDom:false}) — каждая карточка
//          определяется независимо, без H1 страницы.
//  v3.0.3: NEW — Search Cache. После сканирования карточек
//          сохраняем их данные в chrome.storage.local по ключу
//          agpuh_search_cache_<model>. На product page
//          realtime-prices читает этот кэш вместо fetch —
//          никакого CAPTCHA, никаких network requests.
//  v3.0.4: ИСПРАВЛЕНИЕ — добавлены функции extractCardUrl() и
//          extractCardLocation(), которые были вызваны в scanAndInject
//          для search cache, но не были определены в этом файле
//          (в v3.0.3 они пропали после переписывания realtime-prices).
// =====================================================

(function () {
  "use strict";

  var formatPrice = (window.AGPUH && window.AGPUH.priceDetector)
    ? window.AGPUH.priceDetector.formatPrice
    : function (v) { return v.toLocaleString("ru-RU") + " \u20BD"; };

  var fairPriceEngine = window.AGPUH && window.AGPUH.fairPriceEngine;
  var gpuDetector = window.AGPUH && window.AGPUH.gpuDetector;

  // Badge status config (synced with fair-price-engine statuses)
  var BADGE_CONFIG = {
    suspiciously_cheap: {
      label: "\u0421\u043A\u0430\u043C",          // Скам
      shortLabel: "\u0421\u043A\u0430\u043C",
      color: "red",
      icon: "\uD83D\uDEA8"                           // 🚨
    },
    suspiciously_cheap_warn: {
      label: "\u041F\u043E\u0434\u043E\u0437\u0440\u0435\u043D\u0438\u0435",  // Подозрение
      shortLabel: "\u041F\u043E\u0434\u043E\u0437\u0440.",
      color: "orange",
      icon: "\u26A0\uFE0F"                           // ⚠️
    },
    great_deal: {
      label: "\u0412\u044B\u0433\u043E\u0434\u043D\u043E",  // Выгодно
      shortLabel: "\u0412\u044B\u0433\u043E\u0434\u043D\u043E",
      color: "green",
      icon: "\uD83D\uDFE2"                           // 🟢
    },
    fair: {
      label: "\u041D\u043E\u0440\u043C\u0430",      // Норма
      shortLabel: "\u041D\u043E\u0440\u043C\u0430",
      color: "blue",
      icon: "\uD83D\uDFE3"                           // 🔵
    },
    overpriced: {
      label: "\u0414\u043E\u0440\u043E\u0433\u043E",  // Дорого
      shortLabel: "\u0414\u043E\u0440\u043E\u0433\u043E",
      color: "red",
      icon: "\uD83D\uDFE5"                           // 🔴
    }
  };

  // Merged DB reference (set by content.js before init)
  var mergedDb = null;

  // v3.0.1: Track processed cards to avoid re-processing.
  // ВАЖНО: WeakSet не очищается автоматически при перезагрузке,
  // поэтому init() должен сбрасывать его.
  var processedCards = new WeakSet();

  // MutationObserver for infinite scroll
  var scrollObserver = null;

  // Settings
  var badgesEnabled = true;

  // Debounce timer
  var scanDebounce = null;

  // v3.0.1: Флаг, что init() уже был вызван — чтобы не запускать дважды
  var isInitialized = false;

  // ---------------------------------------------------
  //  Initialize badge system
  // ---------------------------------------------------

  /**
   * Initializes the badge renderer on a search page.
   * v3.0.1: Сбрасывает processedCards при каждом вызове,
   *         чтобы после обновления страницы все карточки
   *         обрабатывались заново.
   * @param {Array} db - Merged GPU database
   */
  function init(db) {
    if (!db || !db.length) return;
    if (!fairPriceEngine || !gpuDetector) return;

    mergedDb = db;

    // v3.0.1: Если уже инициализирован — переинициализируем безопасно
    if (isInitialized) {
      console.log("[AGPUH Badge] Re-initializing (after page reload or navigation).");
    }

    // v3.0.1: Сбрасываем processedCards — это критично после обновления
    // страницы, иначе уже помеченные карты не получат badge.
    processedCards = new WeakSet();

    // v3.0.1: Удаляем старые badges перед повторным сканированием
    var existingBadges = document.querySelectorAll(".agpuh-badge");
    for (var b = 0; b < existingBadges.length; b++) {
      existingBadges[b].remove();
    }

    isInitialized = true;

    // Load settings
    loadBadgeSettings(function () {
      if (!badgesEnabled) {
        console.log("[AGPUH Badge] Badges disabled in settings.");
        return;
      }

      console.log("[AGPUH Badge] Initializing. DB size: " + db.length + " models.");

      // v3.0.1: Небольшая задержка перед первым сканированием —
      // даём Avito время отрисовать карточки после reload.
      setTimeout(function () {
        scanAndInject();
        // Watch for new cards (infinite scroll / "Load more")
        startObserver();
      }, 500);
    });
  }

  /**
   * Stops badge rendering and cleans up.
   * v3.0.1: Безопасный destroy — не выбрасывает ошибки, если уже очищено.
   */
  function destroy() {
    try {
      if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
      }
      if (scanDebounce) {
        clearTimeout(scanDebounce);
        scanDebounce = null;
      }
      // Remove all existing badges
      var badges = document.querySelectorAll(".agpuh-badge");
      for (var i = 0; i < badges.length; i++) {
        badges[i].remove();
      }
      isInitialized = false;
      console.log("[AGPUH Badge] Destroyed.");
    } catch (e) {
      console.warn("[AGPUH Badge] destroy() error:", e);
    }
  }

  // ---------------------------------------------------
  //  Settings
  // ---------------------------------------------------

  function loadBadgeSettings(callback) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      badgesEnabled = true;
      if (callback) callback();
      return;
    }
    chrome.storage.local.get(["agpuh_settings"], function (data) {
      var settings = data["agpuh_settings"] || {};
      badgesEnabled = settings.badges !== false; // Default: enabled
      if (callback) callback();
    });
  }

  // ---------------------------------------------------
  //  Scan page and inject badges
  // ---------------------------------------------------

  function scanAndInject() {
    try {
      var cards = findSearchCards();
      var processed = 0;
      var badged = 0;

      // v3.0.3: Собираем данные карточек для search cache
      var cacheEntries = [];

      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];

        // Skip already processed cards
        if (processedCards.has(card)) continue;
        processedCards.add(card);

        processed++;

        var cardData = extractCardData(card);
        if (!cardData || !cardData.gpu) continue;

        var evaluation = evaluateCard(cardData);
        if (!evaluation) continue;

        injectBadge(card, evaluation);
        badged++;

        // v3.0.3: Собираем данные для кэша
        if (cardData.gpu && cardData.price) {
          cacheEntries.push({
            model: cardData.gpu.model,
            title: cardData.title,
            price: cardData.price,
            url: extractCardUrl(card),
            location: extractCardLocation(card),
            condition: null
          });
        }
      }

      if (processed > 0) {
        console.log("[AGPUH Badge] Scanned " + processed + " cards, injected " + badged + " badges.");
      }

      // v3.0.3: Сохраняем собранные карточки в search cache
      if (cacheEntries.length > 0) {
        saveToSearchCache(cacheEntries);
      }
    } catch (e) {
      console.error("[AGPUH Badge] scanAndInject error:", e);
    }
  }

  // ---------------------------------------------------
  //  v3.0.3: Search Cache
  // ---------------------------------------------------

  /**
   * v3.0.3: Сохраняет карточки в chrome.storage.local
   * по ключу agpuh_search_cache_<model>.
   * Каждая запись содержит: title, price, url, location.
   * TTL: 30 минут (после этого кэш считается устаревшим).
   */
  function saveToSearchCache(entries) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    if (!entries || entries.length === 0) return;

    try {
      var now = Date.now();
      var TTL = 30 * 60 * 1000;  // 30 минут

      // Группируем по модели GPU
      var byModel = {};
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var key = "agpuh_search_cache_" + entry.model.toLowerCase().replace(/[^a-z0-9]+/g, "_");

        if (!byModel[key]) byModel[key] = [];
        byModel[key].push(entry);
      }

      // Для каждой модели — обновляем кэш, объединяя со старыми записями
      var keysToGet = Object.keys(byModel);
      chrome.storage.local.get(keysToGet, function (data) {
        var updates = {};
        for (var k = 0; k < keysToGet.length; k++) {
          var key = keysToGet[k];
          var existing = data[key] || { entries: [], updatedAt: 0 };
          var newEntries = byModel[key];

          // Дедупликация по URL
          var seenUrls = {};
          var mergedEntries = [];

          // Сначала добавляем новые
          for (var n = 0; n < newEntries.length; n++) {
            var ne = newEntries[n];
            if (ne.url && !seenUrls[ne.url]) {
              seenUrls[ne.url] = true;
              mergedEntries.push(ne);
            }
          }

          // Затем старые (если они ещё не устарели)
          if (now - existing.updatedAt < TTL) {
            for (var e = 0; e < existing.entries.length; e++) {
              var oe = existing.entries[e];
              if (oe.url && !seenUrls[oe.url]) {
                seenUrls[oe.url] = true;
                mergedEntries.push(oe);
              }
            }
          }

          // Ограничиваем до 50 записей на модель
          if (mergedEntries.length > 50) {
            mergedEntries = mergedEntries.slice(0, 50);
          }

          updates[key] = {
            entries: mergedEntries,
            updatedAt: now,
            model: byModel[key][0].model
          };
        }

        chrome.storage.local.set(updates);
        console.log("[AGPUH Badge] Search cache updated: " + keysToGet.length + " models, " +
                    entries.length + " new entries.");
      });
    } catch (e) {
      console.warn("[AGPUH Badge] saveToSearchCache error:", e);
    }
  }

  // ---------------------------------------------------
  //  Find search result cards
  // ---------------------------------------------------

  function findSearchCards() {
    // Avito search result items
    var items = document.querySelectorAll('[data-marker="item"]');
    if (items.length > 0) return items;

    // Fallback: items in search results container
    var container =
      document.querySelector('[data-marker="catalog-serp"]') ||
      document.querySelector('[class*="items-root"]') ||
      document.querySelector('[class*="search-results"]');

    if (container) {
      return container.querySelectorAll('[itemtype*="Product"], [class*="item"]');
    }

    return [];
  }

  // ---------------------------------------------------
  //  Extract GPU model and price from a card
  // ---------------------------------------------------

  function extractCardData(card) {
    var title = extractCardTitle(card);
    var price = extractCardPrice(card);

    if (!title) return null;

    // Normalize homoglyphs (same as content.js)
    var normalizedTitle = normalizeHomoglyphs(title);

    // v3.0.2: Detect GPU model from title card ONLY.
    // Передаём {useDom:false}, чтобы detectGpu не лез в document.querySelector("h1")
    // всей search-страницы (там нет GPU, это H1 категории).
    var gpu = gpuDetector.detectGpu(normalizedTitle, { useDom: false });

    return {
      title: title,
      gpu: gpu,
      price: price
    };
  }

  /**
   * Extract title/link text from a search card.
   */
  function extractCardTitle(card) {
    // Primary: link with item-title marker
    var titleLink =
      card.querySelector('a[data-marker="item-title"]') ||
      card.querySelector('a[itemprop="url"]') ||
      card.querySelector('a[class*="title"]');

    if (titleLink) {
      return (titleLink.getAttribute("title") || titleLink.textContent || "").trim();
    }

    // Fallback: any link inside card
    var anyLink = card.querySelector("a");
    if (anyLink) {
      var text = (anyLink.getAttribute("title") || anyLink.textContent || "").trim();
      if (text.length > 5) return text;
    }

    // Last resort: h3 or similar heading
    var heading = card.querySelector("h3, h4, [class*='title']");
    if (heading) {
      return (heading.textContent || "").trim();
    }

    return null;
  }

  /**
   * Extract price from a search card.
   */
  function extractCardPrice(card) {
    // Primary: price element with data-marker
    var priceEl =
      card.querySelector('[data-marker="item-price"]') ||
      card.querySelector('[itemprop="price"]');

    if (priceEl) {
      // Try content attribute first
      var content = priceEl.getAttribute("content");
      if (content) {
        var val = parseInt(content, 10);
        if (!isNaN(val) && val > 0) return val;
      }

      // Try parsing text content
      var text = priceEl.textContent || "";
      return parsePriceText(text);
    }

    // Fallback: any element with price-like text
    var metaPrice = card.querySelector('meta[itemprop="price"]');
    if (metaPrice) {
      var metaContent = metaPrice.getAttribute("content");
      if (metaContent) {
        var metaVal = parseInt(metaContent, 10);
        if (!isNaN(metaVal) && metaVal > 0) return metaVal;
      }
    }

    return null;
  }

  /**
   * Parse price text: "12 345 ₽", "12345₽", etc.
   */
  function parsePriceText(text) {
    if (!text || typeof text !== "string") return null;

    var m = text.match(/(\d[\d\s\u00a0]*)\s*[\u20BD\u0440\u0420]/);
    if (m) {
      var digits = m[1].replace(/[\s\u00a0]/g, "");
      var value = parseInt(digits, 10);
      if (!isNaN(value) && value > 0) return value;
    }

    // Fallback: just extract digits
    var m2 = text.match(/(\d[\d\s\u00a0]{3,})/);
    if (m2) {
      var digits2 = m2[1].replace(/[\s\u00a0]/g, "");
      var value2 = parseInt(digits2, 10);
      if (!isNaN(value2) && value2 >= 500) return value2;
    }

    return null;
  }

  /**
   * v3.0.4: Extract URL from a search card (для search cache).
   * v3.1.0 (V-3): Validate absolute URLs against avito.ru host to prevent
   *               phishing links from entering search cache and analog panel.
   */
  function extractCardUrl(card) {
    var linkSelectors = [
      'a[data-marker="item-title"]',
      'a[itemprop="url"]',
      'a[href*="/tovary_dlya_kompyutera/"]',
      'a[class*="title"]',
      'a[class*="link"]'
    ];

    for (var i = 0; i < linkSelectors.length; i++) {
      var link = card.querySelector(linkSelectors[i]);
      if (link) {
        var href = link.getAttribute("href");
        if (href) {
          // v3.1.0 (V-3): For absolute URLs, validate host is avito.ru
          if (href.indexOf("http") === 0) {
            try {
              var u = new URL(href);
              if (u.hostname === "avito.ru" || u.hostname.endsWith(".avito.ru")) {
                return href;
              }
              // Non-avito absolute URL — reject (phishing protection)
              return null;
            } catch (e) {
              return null;
            }
          }
          // Относительный URL → абсолютный (всегда на avito.ru)
          return "https://www.avito.ru" + (href.charAt(0) === "/" ? "" : "/") + href;
        }
      }
    }
    return null;
  }

  /**
   * v3.0.4: Extract location from a search card (для search cache).
   */
  function extractCardLocation(card) {
    var locSelectors = [
      '[data-marker="item-address"]',
      '[class*="geo"]',
      '[class*="location"]',
      '[class*="address"]'
    ];

    for (var i = 0; i < locSelectors.length; i++) {
      var el = card.querySelector(locSelectors[i]);
      if (el) {
        var text = (el.textContent || "").trim();
        if (text && text.length > 0 && text.length < 100) return text;
      }
    }
    return null;
  }

  // ---------------------------------------------------
  //  Evaluate card against fair price engine
  // ---------------------------------------------------

  function evaluateCard(cardData) {
    if (!cardData.gpu || !cardData.price) return null;

    var evaluation = fairPriceEngine.evaluate(cardData.price, cardData.gpu);
    if (!evaluation) return null;

    var config = BADGE_CONFIG[evaluation.status] || BADGE_CONFIG.fair;

    return {
      status: evaluation.status,
      label: config.shortLabel,
      color: config.color,
      icon: config.icon,
      deviation: evaluation.deviation,
      deviationFormatted: evaluation.deviationFormatted,
      averagePrice: cardData.gpu.market ? cardData.gpu.market.average_price : null
    };
  }

  // ---------------------------------------------------
  //  Inject badge into card
  // ---------------------------------------------------

  function injectBadge(card, evaluation) {
    // Don't inject if badge already exists in this card
    var existing = card.querySelector(".agpuh-badge");
    if (existing) return;

    // Make card position:relative so badge can be position:absolute
    var cardPosition = card.style.position;
    if (!cardPosition || cardPosition === "static") {
      card.style.position = "relative";
    }

    // Create badge element
    var badge = document.createElement("div");
    badge.className = "agpuh-badge agpuh-badge-" + evaluation.color;

    // Icon
    var icon = document.createElement("span");
    icon.className = "agpuh-badge-icon";
    icon.textContent = evaluation.icon;

    // Label
    var label = document.createElement("span");
    label.className = "agpuh-badge-label";
    label.textContent = evaluation.label;

    badge.appendChild(icon);
    badge.appendChild(label);

    // Deviation tooltip
    if (evaluation.deviationFormatted) {
      badge.title = evaluation.icon + " " + evaluation.label +
        " (" + evaluation.deviationFormatted + ")";
    }

    // Insert badge into card
    card.appendChild(badge);
  }

  // ---------------------------------------------------
  //  MutationObserver for infinite scroll
  // ---------------------------------------------------

  function startObserver() {
    if (scrollObserver) return;

    scrollObserver = new MutationObserver(function (mutations) {
      // Debounce: wait 300ms after last mutation before scanning
      if (scanDebounce) clearTimeout(scanDebounce);
      scanDebounce = setTimeout(function () {
        scanAndInject();
      }, 300);
    });

    // Observe the main content area
    var target =
      document.querySelector('[data-marker="catalog-serp"]') ||
      document.querySelector("main") ||
      document.body;

    scrollObserver.observe(target, {
      childList: true,
      subtree: true
    });
  }

  // ---------------------------------------------------
  //  Homoglyphs normalization (same as content.js)
  // ---------------------------------------------------

  function normalizeHomoglyphs(text) {
    if (!text) return text;
    var map = {
      '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u041A': 'K',
      '\u041C': 'M', '\u041D': 'H', '\u041E': 'O', '\u0420': 'P',
      '\u0421': 'C', '\u0422': 'T', '\u0423': 'Y', '\u0425': 'X',
      '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0440': 'p',
      '\u0441': 'c', '\u0443': 'y', '\u0445': 'x'
    };
    var result = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      result += map[ch] || ch;
    }
    return result;
  }

  // ---------------------------------------------------
  //  Register module
  // ---------------------------------------------------

  window.AGPUH = window.AGPUH || {};
  window.AGPUH.badgeRenderer = {
    init: init,
    destroy: destroy,
    scanAndInject: scanAndInject
  };
})();
