// =====================================================
//  Avito GPU Helper v3.0.3 — Realtime Prices
//  Получает аналогичные объявления из SEARCH CACHE
//  (заполняется badge-renderer на search-страницах).
//
//  v3.0.0: fetch из content script — Avito возвращал CAPTCHA.
//  v3.0.1: Убраны заголовки, но CAPTCHA осталась.
//  v3.0.2: chrome.scripting.executeScript в MAIN WORLD —
//          всё равно CAPTCHA (341 КБ вместо 1-2 МБ).
//  v3.0.3: КОРЕННОЕ РЕШЕНИЕ — вообще отказались от fetch.
//          Когда пользователь browsing search-страницы,
//          badge-renderer уже парсит карточки и сохраняет
//          их в chrome.storage.local по ключу
//          agpuh_search_cache_<model>.
//          На product page мы просто читаем этот кэш —
//          никаких network requests, никакого CAPTCHA.
//
//  Преимущества:
//    - 0 network requests → 0 CAPTCHA
//    - Данные свежие (пользователь только что видел их на search)
//    - Работает даже без интернета (после первого просмотра search)
//
//  Ограничения:
//    - Если пользователь открыл product page напрямую (без search),
//      кэш будет пустым — покажем «аналоги недоступны»
//    - Кэш TTL: 30 минут
// =====================================================

(function () {
  "use strict";

  // TTL кэша (30 минут) — синхронизировано с badge-renderer
  var CACHE_TTL_MS = 30 * 60 * 1000;

  // Максимальное количество аналогов для возврата
  var MAX_ANALOGS = 5;

  /**
   * Получает список аналогичных объявлений для GPU из search cache.
   * v3.0.3: Никакого fetch — только чтение из chrome.storage.local.
   *
   * @param {object} gpuResult — результат gpuDetector.detectGpu()
   * @param {object} [options] — { forceRefresh: boolean } (игнорируется в v3.0.3)
   * @returns {Promise<object>} {
   *   analogs: [{ title, price, url, location, condition, isCurrent }],
   *   averagePrice, minPrice, maxPrice, count, source, fetchedAt, fromCache
   * }
   */
  function fetchAnalogs(gpuResult, options) {
    options = options || {};

    return new Promise(function (resolve) {
      try {
        if (!gpuResult || !gpuResult.model) {
          resolve(buildEmptyResult("no-model"));
          return;
        }

        var cacheKey = buildCacheKey(gpuResult.model);

        if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
          console.warn("[AGPUH Realtime] chrome.storage unavailable");
          resolve(buildEmptyResult("no-storage"));
          return;
        }

        chrome.storage.local.get([cacheKey], function (data) {
          var cached = data[cacheKey];

          if (!cached || !cached.entries || cached.entries.length === 0) {
            console.log("[AGPUH Realtime] Search cache пустой для " + gpuResult.model);
            resolve(buildEmptyResult("cache-empty"));
            return;
          }

          // Проверяем TTL
          var ageMs = Date.now() - (cached.updatedAt || 0);
          if (ageMs > CACHE_TTL_MS) {
            console.log("[AGPUH Realtime] Search cache устарел (" +
                        Math.round(ageMs / 60000) + " мин) для " + gpuResult.model);
            resolve(buildEmptyResult("cache-stale"));
            return;
          }

          console.log("[AGPUH Realtime] Найдено " + cached.entries.length +
                      " аналогов в кэше для " + gpuResult.model + " (возраст: " +
                      Math.round(ageMs / 60000) + " мин)");

          // Преобразуем entries из кэша в формат analogs
          var analogs = cached.entries.map(function (entry) {
            return {
              title: entry.title,
              price: entry.price,
              url: entry.url,
              location: entry.location,
              condition: entry.condition || null,
              isCurrent: false  // помечается позже через markCurrentListing
            };
          }).filter(function (a) {
            return a.title && a.price && a.price > 0;
          });

          if (analogs.length === 0) {
            resolve(buildEmptyResult("cache-empty"));
            return;
          }

          // Считаем агрегаты
          var prices = analogs.map(function (a) { return a.price; }).filter(function (p) { return p > 0; });
          var stats = {
            averagePrice: prices.length > 0 ? Math.round(prices.reduce(function (s, p) { return s + p; }, 0) / prices.length) : null,
            minPrice: prices.length > 0 ? Math.min.apply(null, prices) : null,
            maxPrice: prices.length > 0 ? Math.max.apply(null, prices) : null,
            count: analogs.length
          };

          var result = {
            analogs: analogs.slice(0, MAX_ANALOGS),
            averagePrice: stats.averagePrice,
            minPrice: stats.minPrice,
            maxPrice: stats.maxPrice,
            count: stats.count,
            source: "search-cache",
            fetchedAt: cached.updatedAt,
            fromCache: true
          };

          // Помечаем текущее объявление
          markCurrentListing(result.analogs);

          resolve(result);
        });
      } catch (e) {
        console.error("[AGPUH Realtime] fetchAnalogs error:", e);
        resolve(buildEmptyResult("error"));
      }
    });
  }

  // ---------------------------------------------------
  //  Утилиты
  // ---------------------------------------------------

  function buildCacheKey(modelName) {
    return "agpuh_search_cache_" + modelName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }

  /**
   * Помечает текущее объявление среди аналогов (если оно там есть).
   */
  function markCurrentListing(analogs) {
    var currentUrl = window.location.href;

    for (var i = 0; i < analogs.length; i++) {
      var analog = analogs[i];
      if (!analog.url) continue;

      var analogId = extractListingId(analog.url);
      var currentId = extractListingId(currentUrl);

      if (analogId && currentId && analogId === currentId) {
        analog.isCurrent = true;
      }
    }
  }

  function extractListingId(url) {
    if (!url) return null;
    var m = url.match(/(\d{8,})(?:\D|$)/);
    return m ? m[1] : null;
  }

  function buildEmptyResult(reason) {
    return {
      analogs: [],
      averagePrice: null,
      minPrice: null,
      maxPrice: null,
      count: 0,
      source: reason,
      fetchedAt: Date.now(),
      fromCache: false
    };
  }

  // Регистрируем модуль
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.realtimePrices = {
    fetchAnalogs: fetchAnalogs,
    buildCacheKey: buildCacheKey,
    CACHE_TTL_MS: CACHE_TTL_MS,
    MAX_ANALOGS: MAX_ANALOGS
  };
})();
