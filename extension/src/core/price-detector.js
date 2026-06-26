// =====================================================
//  Avito GPU Helper v2.0.2 — Price Detector
//  Извлекает цену объявления со страницы Avito.
//  v2.0.2: CRITICAL — Авито переименовал data-marker:
//          "item-price" → "item-view/item-price"
//          Добавлены оба селектора (старый и новый).
//          itemProp (camelCase от React) вместо itemprop.
// =====================================================

(function () {
  "use strict";

  // Все известные селекторы для элемента цены, в порядке приоритета.
  // Авито меняет их между версиями — пробуем все.
  var PRICE_SELECTORS = [
    '[data-marker="item-view/item-price"]',   // Актуальный (2025+)
    '[data-marker="item-price"]',              // Старый формат
    '[itemProp="price"]',                      // React camelCase
    '[itemprop="price"]'                       // Стандартный HTML
  ];

  /**
   * Основная функция определения цены.
   * @returns {number|null} Цена в рублях или null
   */
  function detectPrice() {
    try {
      // Шаг 1: Пробуем все известные селекторы цены.
      for (var s = 0; s < PRICE_SELECTORS.length; s++) {
        var priceEl = document.querySelector(PRICE_SELECTORS[s]);
        if (priceEl) {
          // Атрибут content содержит чистое числовое значение.
          var content = priceEl.getAttribute("content");
          if (content) {
            var value = parseInt(content, 10);
            if (!isNaN(value) && value > 0) return value;
          }

          // Если content нет — парсим innerText.
          var text = priceEl.innerText || "";
          var parsed = parsePriceText(text);
          if (parsed) return parsed;
        }
      }

      // Шаг 2: Fallback — ищем цену в области объявления.
      return fallbackPriceSearch();
    } catch (e) {
      console.error("[AGPUH] detectPrice() error:", e);
      return null;
    }
  }

  /**
   * Парсит текстовое представление цены.
   * Поддерживает форматы: "12 345 ₽", "12345₽", "12 345 руб.",
   * "12 345 рублей", "12 345 руб" и т.п.
   * @param {string} text — текст, содержащий цену
   * @returns {number|null}
   */
  function parsePriceText(text) {
    if (!text || typeof text !== "string") return null;

    // Вариант 1: число + знак ₽ — самый точный паттерн.
    var m1 = text.match(/(\d[\d\s\u00a0]*)\s*₽/);
    if (m1) {
      var digits1 = m1[1].replace(/[\s\u00a0]/g, "");
      var value1 = parseInt(digits1, 10);
      if (!isNaN(value1) && value1 > 0) return value1;
    }

    // Вариант 2: число + «руб» как отдельное слово (с границей).
    var m2 = text.match(/(\d[\d\s\u00a0]*)\s*руб(?:лей|ля|ль)?\.?\b/i);
    if (m2) {
      var digits2 = m2[1].replace(/[\s\u00a0]/g, "");
      var value2 = parseInt(digits2, 10);
      if (!isNaN(value2) && value2 > 0) return value2;
    }

    return null;
  }

  /**
   * Резервный поиск цены — ограниченная область.
   * @returns {number|null}
   */
  function fallbackPriceSearch() {
    // Ограничиваем область поиска — контейнер объявления или main.
    var scope =
      document.querySelector('[data-marker="item-view/item-price-container"]') ||
      document.querySelector('[data-marker="item"]') ||
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.body;

    // Ищем элементы, которые могут содержать цену.
    var candidates = scope.querySelectorAll("span, div, p");
    var results = [];

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var t = (el.innerText || "").trim();

      if (t.length === 0 || t.length > 50) continue;

      // Быстрая проверка: должен быть знак ₽ или слово «руб».
      if (!/₽|руб/i.test(t)) continue;

      var parsed = parsePriceText(t);
      if (parsed && parsed >= 500) {
        var rect = el.getBoundingClientRect();
        results.push({
          price: parsed,
          top: rect.top
        });
      }

      if (results.length >= 5) break;
    }

    if (results.length === 0) return null;

    results.sort(function (a, b) {
      return a.top - b.top;
    });

    return results[0].price;
  }

  /**
   * Форматирует цену в рублёвый вид с разделителями.
   * @param {number} value
   * @returns {string}
   */
  function formatPrice(value) {
    if (typeof value !== "number" || isNaN(value)) return "\u2014";
    return value.toLocaleString("ru-RU") + " \u20BD";
  }

  // Регистрируем модуль
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.priceDetector = {
    detectPrice: detectPrice,
    formatPrice: formatPrice,
    parsePriceText: parsePriceText
  };
})();
