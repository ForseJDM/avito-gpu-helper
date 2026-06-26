// =====================================================
//  Avito GPU Helper v3.0.0 - Content Script (Orchestrator)
//  v2.2.0 hotfix4: Detect product page vs search page.
//  Widget only renders on product pages, not search.
//  v2.3.0: Search page badge support.
//  v3.0.0: Pipeline расширен — добавлены conditionDetector,
//          sellerAnalyzer, realtimePrices. Виджет рендерится
//          сразу с базовой инфой, аналоги подгружаются асинхронно.
//          При статусе great_deal шлём notification через SW.
// =====================================================

(function () {
  "use strict";

  // Защита от повторного запуска при повторной инъекции content script.
  if (window.__AGPUH_V2_LOADED__) return;
  window.__AGPUH_V2_LOADED__ = true;

  // ---------------------------------------------------
  //  Ссылки на модули
  // ---------------------------------------------------

  var gpuDetector = window.AGPUH && window.AGPUH.gpuDetector;
  var priceDetector = window.AGPUH && window.AGPUH.priceDetector;
  var fairPriceEngine = window.AGPUH && window.AGPUH.fairPriceEngine;
  var antiScamEngine = window.AGPUH && window.AGPUH.antiScamEngine;
  var widgetRenderer = window.AGPUH && window.AGPUH.widgetRenderer;
  var badgeRenderer = window.AGPUH && window.AGPUH.badgeRenderer;
  var priceUpdater = window.AGPUH && window.AGPUH.priceUpdater;
  // v3.0.0 modules
  var conditionDetector = window.AGPUH && window.AGPUH.conditionDetector;
  var sellerAnalyzer = window.AGPUH && window.AGPUH.sellerAnalyzer;
  var realtimePrices = window.AGPUH && window.AGPUH.realtimePrices;

  // Если какой-то модуль не загружен - ничего не делаем.
  if (!gpuDetector || !priceDetector || !fairPriceEngine ||
      !antiScamEngine || !widgetRenderer) {
    console.warn("[AGPUH] Один или несколько модулей не загружены. Расширение не запустится.");
    return;
  }

  // ---------------------------------------------------
  //  Конфигурация polling-стратегии
  // ---------------------------------------------------

  // v3.0.1: Увеличены задержки polling — Avito рендерит SPA медленно,
  // и старые тайминги (500ms) были слишком короткими. После обновления
  // страницы DOM может быть ещё не готов.
  var POLL_DELAYS = [800, 1500, 2500, 4000];
  var MAX_POLL_ATTEMPTS = POLL_DELAYS.length;
  var PRICE_RETRY_DELAY = 2500;
  var MAX_PRICE_RETRIES = 3;

  // ---------------------------------------------------
  //  Page type detection
  //  hotfix4: Distinguish product page from search page.
  //  Widget only shows on product pages.
  // ---------------------------------------------------

  var PAGE_UNKNOWN = "unknown";
  var PAGE_PRODUCT = "product";
  var PAGE_SEARCH = "search";
  var PAGE_OTHER = "other";

  /**
   * Determines the current page type.
   * v3.0.1: Усиленное определение search-страницы.
   *         Проблема: после обновления страницы Avito перерисовывает DOM,
   *         и search-страница с одним результатом или загрузкой
   *         ошибочно определялась как PRODUCT.
   *
   * Новая стратегия (по приоритету):
   *   1. URL pattern: категория видеокарт с ?q= или slug-ASgBAg — SEARCH
   *   2. URL pattern: карточка товара (/...\d{8,}) — PRODUCT
   *   3. DOM: множественные [data-marker="item"] — SEARCH
   *   4. DOM: [data-marker="item-view/item-price"] или
   *           [data-marker="item-view/item-params"] — PRODUCT
   *   5. Если ничего не подходит — OTHER
   *
   * @returns {string} PAGE_PRODUCT | PAGE_SEARCH | PAGE_OTHER | PAGE_UNKNOWN
   */
  function detectPageType() {
    var url = window.location.href;
    var path = window.location.pathname;

    // v3.0.1: Шаг 1 — Сначала проверяем URL (самый надёжный признак).
    // Карточка товара всегда имеет ID в конце: ..._8076876185
    if (/_\d{8,}(?:\D|$)/.test(path) && !/[?&]q=/.test(url)) {
      // Если в URL есть длинный ID и нет ?q= — это карточка товара
      // (но не search page с открытым фильтром по ID)
      // Проверяем, что есть DOM-признаки карточки, чтобы избежать ложного срабатывания
      var productDomIndicators = document.querySelector(
        '[data-marker="item-view/item-price"], ' +
        '[data-marker="item-view/item-params"], ' +
        '[data-marker="item-view/item-description"], ' +
        '[itemprop="description"]'
      );
      if (productDomIndicators) {
        return PAGE_PRODUCT;
      }
    }

    // Шаг 2 — URL с категорией видеокарт или ?q= — это search
    if (/\/videokarty-ASgBAg/i.test(path) || /[?&]q=/.test(url)) {
      // Дополнительно проверяем — нет ли признаков карточки товара
      var productPriceEl0 = document.querySelector('[data-marker="item-view/item-price"]');
      if (!productPriceEl0) {
        return PAGE_SEARCH;
      }
    }

    // Шаг 3 — Множественные [data-marker="item"] в DOM — это search
    var searchItems = document.querySelectorAll('[data-marker="item"]');
    if (searchItems.length > 1) {
      return PAGE_SEARCH;
    }

    // Шаг 4 — Сильные индикаторы product page
    var productPriceEl =
      document.querySelector('[data-marker="item-view/item-price"]') ||
      document.querySelector('[data-marker="item-price"]');

    var productParamsEl =
      document.querySelector('[data-marker="item-view/item-params"]') ||
      document.querySelector('[data-marker="item-params"]') ||
      document.querySelector('[class*="item-params"]');

    var descEl =
      document.querySelector('[data-marker="item-view/item-description"]') ||
      document.querySelector('[data-marker="item-description"]') ||
      document.querySelector('[itemProp="description"]') ||
      document.querySelector('[itemprop="description"]');

    // Если есть цена + характеристики — это карточка товара
    if (productPriceEl && (productParamsEl || descEl)) {
      return PAGE_PRODUCT;
    }

    // Шаг 5 — URL-based fallback для search
    if (/\/videokarty-ASg/i.test(path)) {
      return PAGE_SEARCH;
    }

    if (/\/komplektuyuschie\//i.test(path) && !productPriceEl) {
      return PAGE_SEARCH;
    }

    // Шаг 6 — Один из индикаторов карточки товара
    if (productPriceEl || productParamsEl) {
      return PAGE_PRODUCT;
    }

    if (descEl) {
      return PAGE_PRODUCT;
    }

    return PAGE_OTHER;
  }

  // ---------------------------------------------------
  //  History storage
  // ---------------------------------------------------

  var STORAGE_KEY_HISTORY = "agpuh_view_history";
  var MAX_HISTORY_ITEMS = 50;

  /**
   * Сохраняет запись о просмотренной GPU в историю.
   */
  function saveToHistory(gpuResult, price, fairPriceResult) {
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
      if (!gpuResult || !gpuResult.model) return;

      var statusColor = "gray";
      if (fairPriceResult) {
        statusColor = fairPriceResult.color || "gray";
      }

      var entry = {
        model: gpuResult.model,
        price: (price !== null && price !== undefined) ? price : null,
        statusColor: statusColor,
        statusLabel: fairPriceResult ? fairPriceResult.label : null,
        date: Date.now(),
        url: window.location.href
      };

      chrome.storage.local.get([STORAGE_KEY_HISTORY], function (data) {
        var history = data[STORAGE_KEY_HISTORY] || [];

        var now = Date.now();
        var isDuplicate = false;
        for (var i = 0; i < history.length; i++) {
          if (history[i].model === entry.model &&
              history[i].url === entry.url &&
              (now - history[i].date) < 5 * 60 * 1000) {
            isDuplicate = true;
            break;
          }
        }

        if (isDuplicate) return;

        history.push(entry);

        if (history.length > MAX_HISTORY_ITEMS) {
          history = history.slice(history.length - MAX_HISTORY_ITEMS);
        }

        chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: history });
      });
    } catch (e) {
      // Non-critical
    }
  }

  // ---------------------------------------------------
  //  Состояние
  // ---------------------------------------------------

  var retryCount = 0;
  var lastGpuResult = null;
  var mergedDb = null;
  var freshnessInfo = null;
  var currentPageType = PAGE_UNKNOWN;

  // ---------------------------------------------------
  //  Извлечение текста страницы
  // ---------------------------------------------------

  function getPageText() {
    var h1 = document.querySelector("h1");
    var title = h1 ? h1.innerText.trim() : "";

    var descEl =
      document.querySelector('[data-marker="item-view/item-description"]') ||
      document.querySelector('[data-marker="item-description"]') ||
      document.querySelector('[itemProp="description"]') ||
      document.querySelector('[itemprop="description"]') ||
      document.querySelector('div[class*="description"]');
    var description = descEl ? descEl.innerText.trim() : "";

    var docTitle = document.title || "";

    var rawText = title + "\n" + description + "\n" + docTitle;
    return normalizeHomoglyphs(rawText);
  }

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
  //  Загрузка объединённой БД (local + remote)
  // ---------------------------------------------------

  function ensureMergedDb(callback) {
    if (mergedDb) {
      callback(mergedDb);
      return;
    }

    if (!priceUpdater) {
      mergedDb = window.AGPUH.gpuMarketDb;
      saveTotalModelsCount();
      callback(mergedDb);
      return;
    }

    priceUpdater.loadMergedDatabase(function (db) {
      mergedDb = db;

      if (db && db.length) {
        window.AGPUH.gpuMarketDb = db;
      }

      saveTotalModelsCount();

      priceUpdater.getOverallFreshness().then(function (info) {
        freshnessInfo = info;
        callback(db);
      });
    });
  }

  /**
   * Сохраняет общее количество моделей в локальной БД в storage.
   */
  function saveTotalModelsCount() {
    try {
      var total = (window.AGPUH && window.AGPUH.gpuMarketDbTotalModels)
        ? window.AGPUH.gpuMarketDbTotalModels
        : (window.AGPUH.gpuMarketDb ? window.AGPUH.gpuMarketDb.length : 0);
      if (total > 0 && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ "agpuh_total_local_models": total });
      }
    } catch (e) {
      // Non-critical
    }
  }

  // ---------------------------------------------------
  //  Главная логика (product page only)
  // ---------------------------------------------------

  function run() {
    try {
      currentPageType = detectPageType();

      // --- SEARCH PAGE: run badge renderer ---
      if (currentPageType === PAGE_SEARCH) {
        console.log("[AGPUH] Page type: search. Starting badge renderer.");
        // Remove any leftover widget from previous product page
        var oldWidget = document.getElementById("avito-gpu-helper-widget");
        if (oldWidget) oldWidget.remove();

        ensureMergedDb(function (db) {
          if (badgeRenderer) {
            badgeRenderer.init(db);
          }
        });
        return;
      }

      // --- PRODUCT PAGE: run widget ---
      if (currentPageType !== PAGE_PRODUCT) {
        console.log("[AGPUH] Page type: " + currentPageType + ". Nothing to do.");
        // Destroy badge renderer if navigating away from search
        if (badgeRenderer) badgeRenderer.destroy();
        // Remove any leftover widget
        var oldWidget2 = document.getElementById("avito-gpu-helper-widget");
        if (oldWidget2) oldWidget2.remove();
        return;
      }

      // Product page — destroy badges if present
      if (badgeRenderer) badgeRenderer.destroy();

      ensureMergedDb(function (db) {
        if (!db || !db.length) return;

        var pageText = getPageText();
        var gpu = gpuDetector.detectGpu(pageText);

        if (!gpu) return;

        lastGpuResult = gpu;

        var price = priceDetector.detectPrice();

        // v3.0.1: Sanity-check цены — если цена критически ниже average
        // для найденной модели (например, GPU определён как RTX 5070 при
        // цене 3990 ₽), пытаемся найти более подходящую модель в тексте.
        if (price && price > 0 && gpuDetector.sanityCheckPrice) {
          var checkedGpu = gpuDetector.sanityCheckPrice(gpu, price, pageText);
          if (checkedGpu && checkedGpu.model !== gpu.model) {
            console.log("[AGPUH] GPU изменён после sanity-check: " +
                        gpu.model + " → " + checkedGpu.model);
            gpu = checkedGpu;
            lastGpuResult = gpu;
          }
        }

        if (!price) {
          widgetRenderer.renderWidget({
            gpuResult: gpu,
            priceResult: null,
            fairPriceResult: null,
            scamResult: null,
            conditionResult: conditionDetector ? conditionDetector.detectCondition() : null,
            sellerResult: sellerAnalyzer ? sellerAnalyzer.analyze() : null,
            freshness: freshnessInfo
          });

          if (retryCount < MAX_PRICE_RETRIES) {
            retryCount++;
            setTimeout(run, PRICE_RETRY_DELAY);
          }
          return;
        }

        retryCount = 0;

        // v3.0.0: Определяем состояние товара и передаём в fair-price-engine
        var conditionResult = conditionDetector ? conditionDetector.detectCondition() : null;
        var fairPrice = fairPriceEngine.evaluate(price, gpu, conditionResult);

        var photoCount = antiScamEngine.countPhotos();
        var scam = antiScamEngine.analyze({
          price: price,
          gpuEntry: gpu,
          pageText: pageText,
          photoCount: photoCount,
          priceStatus: fairPrice.status
        });

        // v3.0.0: Анализируем продавца
        var sellerResult = sellerAnalyzer ? sellerAnalyzer.analyze() : null;

        // Рендерим виджет сразу (без аналогов — они придут асинхронно)
        widgetRenderer.renderWidget({
          gpuResult: gpu,
          priceResult: price,
          fairPriceResult: fairPrice,
          scamResult: scam,
          conditionResult: conditionResult,
          sellerResult: sellerResult,
          freshness: freshnessInfo
        });

        saveToHistory(gpu, price, fairPrice);

        // v3.0.0: Асинхронно загружаем аналоги и обновляем виджет
        if (realtimePrices && widgetRenderer.updateAnalogs) {
          realtimePrices.fetchAnalogs(gpu).then(function (realtimeResult) {
            // Виджет мог быть удалён — обновляем только если он ещё существует
            var widget = document.getElementById("avito-gpu-helper-widget");
            if (widget) {
              widgetRenderer.updateAnalogs(realtimeResult, price);
            }
          });
        }

        // v3.0.0: Если статус great_deal — шлём notification через SW
        if (fairPrice.status === "great_deal") {
          maybeSendNotification(gpu, price, fairPrice);
        }
      });

    } catch (e) {
      console.error("[AGPUH] run() error:", e);
    }
  }

  // ---------------------------------------------------
  //  v3.0.0: Notifications
  // ---------------------------------------------------

  var NOTIFICATION_DEBOUNCE_MS = 30 * 1000;  // 30 секунд между уведомлениями для одной модели
  var lastNotificationByModel = {};

  /**
   * v3.0.0: Отправляет notification через service worker,
   * если включена соответствующая настройка и прошло достаточно
   * времени с прошлого уведомления по этой модели.
   */
  function maybeSendNotification(gpu, price, fairPrice) {
    try {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return;

      // Проверяем настройки (нужны только если включены notifications)
      chrome.storage.local.get(["agpuh_settings"], function (data) {
        var settings = data["agpuh_settings"] || {};
        if (settings.notificationsGreatDeal !== true) return;  // По умолчанию ВЫКЛ

        // Дебаунс по модели
        var now = Date.now();
        var lastTime = lastNotificationByModel[gpu.model] || 0;
        if (now - lastTime < NOTIFICATION_DEBOUNCE_MS) return;
        lastNotificationByModel[gpu.model] = now;

        // Отправляем message в SW
        chrome.runtime.sendMessage({
          action: "show-notification",
          data: {
            model: gpu.model,
            price: price,
            deviation: fairPrice.deviation,
            deviationFormatted: fairPrice.deviationFormatted,
            url: window.location.href
          }
        }, function () {
          if (chrome.runtime.lastError) {
            // Non-critical — SW может быть недоступен
          }
        });
      });
    } catch (e) {
      // Non-critical
    }
  }

  // ---------------------------------------------------
  //  Polling-стратегия запуска
  // ---------------------------------------------------

  function scheduleRun() {
    var attempt = 0;

    function tryRun() {
      try {
        // v3.0.1: На каждой попытке проверяем тип страницы —
        // это критично для search pages, где после обновления
        // h1/price могут не сразу появиться.
        var pageType = detectPageType();
        console.log("[AGPUH] tryRun attempt " + (attempt + 1) + "/" + MAX_POLL_ATTEMPTS +
                    ", page type: " + pageType);

        // Для search page не ждём h1+price — запускаем сразу
        if (pageType === PAGE_SEARCH) {
          retryCount = 0;
          run();
          return;
        }

        // Для product page ждём h1 и price
        if (pageType === PAGE_PRODUCT) {
          var h1 = document.querySelector("h1");
          var priceEl =
            document.querySelector('[data-marker="item-view/item-price"]') ||
            document.querySelector('[data-marker="item-price"]');

          if ((!h1 || !priceEl) && attempt < MAX_POLL_ATTEMPTS) {
            attempt++;
            setTimeout(tryRun, POLL_DELAYS[attempt - 1] || 4000);
            return;
          }

          retryCount = 0;
          run();
          return;
        }

        // PAGE_OTHER или PAGE_UNKNOWN — пробуем ещё раз
        if (attempt < MAX_POLL_ATTEMPTS) {
          attempt++;
          setTimeout(tryRun, POLL_DELAYS[attempt - 1] || 4000);
          return;
        }

        // Финальная попытка — запускаем run() в любом случае
        retryCount = 0;
        run();
      } catch (e) {
        console.error("[AGPUH] tryRun() error:", e);
      }
    }

    setTimeout(tryRun, POLL_DELAYS[0]);
  }

  // ---------------------------------------------------
  //  SPA-навигация: MutationObserver с debounce
  // ---------------------------------------------------

  var lastUrl = location.href;
  var navDebounce = null;

  new MutationObserver(function () {
    clearTimeout(navDebounce);
    navDebounce = setTimeout(function () {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        mergedDb = null;
        freshnessInfo = null;
        currentPageType = PAGE_UNKNOWN;
        // Destroy badge renderer on navigation
        if (badgeRenderer) badgeRenderer.destroy();
        scheduleRun();
      }
    }, 300);
  }).observe(document, { subtree: true, childList: true });

  // ---------------------------------------------------
  //  Settings change listener (v2.2.0)
  // ---------------------------------------------------

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (message && message.action === "settings-changed") {
        sendResponse({ ok: true });
      }
    });
  }

  // ---------------------------------------------------
  //  Запуск
  // ---------------------------------------------------

  scheduleRun();
})();
