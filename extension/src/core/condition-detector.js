// =====================================================
//  Avito GPU Helper v3.0.1 — Condition Detector
//  Определяет состояние товара (новая / б/у / как новое).
//  v3.0.0: базовая реализация (DOM + описание).
//  v3.0.1: ПРИОРИТЕТ — раздел «Характеристики» Avito,
//          где указано «Состояние: Б/у» / «Новое» / «Как новое».
//          Раньше состояние искали в описании, но там продавцы
//          пишут что угодно, и состояние часто определялось
//          неверно. Теперь читаем из официального раздела
//          характеристик, fallback на описание только если
//          в характеристиках не указано.
// =====================================================

(function () {
  "use strict";

  // Стандартные значения состояния
  var CONDITION = {
    NEW: "new",            // Новое
    LIKE_NEW: "like_new",  // Как новое
    USED: "used",          // Б/У
    UNKNOWN: "unknown"     // Неизвестно
  };

  // Конфигурация отображения состояний
  var CONDITION_CONFIG = {
    new: {
      label: "Новое",
      icon: "📦",
      color: "green",
      // Множители для fair-price-engine
      averageMultiplier: 1.10,    // Новое обычно дороже рынка на 10%
      minSafeMultiplier: 0.85,    // Но не должно быть слишком дёшево
      scamThresholdMultiplier: 0.50
    },
    like_new: {
      label: "Как новое",
      icon: "✨",
      color: "blue",
      averageMultiplier: 1.00,
      minSafeMultiplier: 0.75,
      scamThresholdMultiplier: 0.42
    },
    used: {
      label: "Б/У",
      icon: "🔧",
      color: "orange",
      averageMultiplier: 0.85,    // Б/У должно быть дешевле
      minSafeMultiplier: 0.55,    // Сильное снижение безопасного порога
      scamThresholdMultiplier: 0.35
    },
    unknown: {
      label: "Не указано",
      icon: "❓",
      color: "gray",
      // Без множителей — используем дефолтные значения из БД
      averageMultiplier: 1.00,
      minSafeMultiplier: 0.75,
      scamThresholdMultiplier: 0.42
    }
  };

  // Селекторы DOM-элементов, где Авито может показывать состояние
  var CONDITION_SELECTORS = [
    '[data-marker="item-view/item-condition"]',
    '[data-marker="item-condition"]',
    '[data-marker*="condition"]',
    '[class*="condition"]'
  ];

  // Фразы для определения состояния из описания
  var NEW_PHRASES = [
    "новая",
    "новый",
    "новое",
    "в упаковке",
    "в заводской упаковке",
    "запечатан",
    "запечатанная",
    "не вскрывалась",
    "невскрытая",
    "заводская упаковка",
    "новый сток",
    "покупал для сборки, но не понадобилась"
  ];

  var LIKE_NEW_PHRASES = [
    "как новая",
    "как новое",
    "состояние нового",
    "идеальное состояние",
    "отличное состояние",
    "проверена пару раз",
    "использовалась неделю",
    "использовалась месяц",
    "проработала час",
    "вскрыта для проверки"
  ];

  var USED_PHRASES = [
    "б/у",
    "бу",
    "б.у.",
    "пользовался",
    "пользовалась",
    "с пробегом",
    "есть следы использования",
    "следы эксплуатации",
    "работало",
    "стояла в сборке",
    "около года",
    "около двух лет",
    "пара лет",
    "несколько лет",
    "майнинг"  // Явное указание майнинга = б/у
  ];

  /**
   * Определяет состояние товара на странице.
   * v3.0.1: Приоритет — раздел «Характеристики» Avito, где
   *         официально указано «Состояние: Б/у» / «Новое» / «Как новое».
   *         Fallback на DOM-маркеры и парсинг описания.
   * @returns {object} { condition, label, icon, color, source, multipliers }
   */
  function detectCondition() {
    try {
      // v3.0.1: Шаг 1 — Ищем в разделе «Характеристики» (самый надёжный источник)
      var paramsCondition = detectFromParams();
      if (paramsCondition) {
        console.log("[AGPUH Cond] Состояние из характеристик: " + paramsCondition);
        return buildResult(paramsCondition, "params");
      }

      // Шаг 2: Ищем DOM-маркер состояния от Avito (старый формат).
      var domCondition = detectFromDom();
      if (domCondition) {
        console.log("[AGPUH Cond] Состояние из DOM: " + domCondition);
        return buildResult(domCondition, "dom");
      }

      // Шаг 3: Парсим описание товара (последний fallback).
      var textCondition = detectFromText();
      if (textCondition) {
        console.log("[AGPUH Cond] Состояние из описания: " + textCondition);
        return buildResult(textCondition, "text");
      }

      // Шаг 4: Не удалось определить.
      console.log("[AGPUH Cond] Состояние: неизвестно");
      return buildResult(CONDITION.UNKNOWN, "unknown");
    } catch (e) {
      console.error("[AGPUH] detectCondition() error:", e);
      return buildResult(CONDITION.UNKNOWN, "error");
    }
  }

  /**
   * v3.0.1: Ищет состояние в разделе «Характеристики» Avito.
   * Avito показывает список: «Состояние: Б/у», «Бренд: MSI» и т.д.
   * @returns {string|null} — CONDITION.NEW | CONDITION.LIKE_NEW | CONDITION.USED | null
   */
  function detectFromParams() {
    try {
      // Селекторы для раздела характеристик
      var paramsSelectors = [
        '[data-marker="item-view/item-params"]',
        '[data-marker="item-params"]',
        '[class*="item-params"]',
        '[class*="params-list"]',
        '[class*="paramsList"]',
        '[class*="style-item-params"]',
        '[data-marker="item-view/params"]'
      ];

      var paramsEl = null;
      for (var i = 0; i < paramsSelectors.length; i++) {
        paramsEl = document.querySelector(paramsSelectors[i]);
        if (paramsEl) break;
      }

      if (!paramsEl) return null;

      var paramsText = (paramsEl.innerText || paramsEl.textContent || "").toLowerCase();
      if (!paramsText) return null;

      // Ищем строку "Состояние: ..." в характеристиках
      // Форматы: "Состояние: Б/у", "Состояние Б/у", "Состояние — Б/у"
      var conditionMatch = paramsText.match(/состояние\s*[:\-—]?\s*([^\n\r,;]{1,30})/i);
      if (conditionMatch) {
        var value = conditionMatch[1].trim();

        // Проверяем соответствие стандартным значениям Avito
        if (/новое|новая|новый/.test(value) && !/как новое/.test(value)) {
          return CONDITION.NEW;
        }
        if (/как новое|как новая/.test(value)) {
          return CONDITION.LIKE_NEW;
        }
        if (/б\/у|бу|б\.у|подержан|used/.test(value)) {
          return CONDITION.USED;
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Ищет состояние в DOM-элементах Авито (старый формат).
   */
  function detectFromDom() {
    for (var i = 0; i < CONDITION_SELECTORS.length; i++) {
      var el = document.querySelector(CONDITION_SELECTORS[i]);
      if (!el) continue;

      var text = (el.innerText || el.textContent || "").trim().toLowerCase();
      if (!text || text.length > 50) continue;  // Состояние обычно короткое

      // Проверяем соответствие стандартным значениям
      if (/новое|новая|новый/.test(text) && !/как новое/.test(text)) {
        return CONDITION.NEW;
      }
      if (/как новое|как новая/.test(text)) {
        return CONDITION.LIKE_NEW;
      }
      if (/б\/у|бу|б\.у|подержан|used/.test(text)) {
        return CONDITION.USED;
      }
    }
    return null;
  }

  /**
   * Ищет состояние в тексте описания и заголовка.
   * v3.0.1: Используется только как fallback, когда в характеристиках
   *         нет состояния (для некоторых категорий Avito не показывает его).
   */
  function detectFromText() {
    var h1 = document.querySelector("h1");
    var title = h1 ? h1.innerText : "";

    var descEl =
      document.querySelector('[data-marker="item-view/item-description"]') ||
      document.querySelector('[data-marker="item-description"]') ||
      document.querySelector('[itemProp="description"]') ||
      document.querySelector('[itemprop="description"]');

    var description = descEl ? descEl.innerText : "";
    var fullText = (title + " " + description).toLowerCase();

    // Считаем совпадения для каждого состояния
    var newScore = countPhraseMatches(fullText, NEW_PHRASES);
    var likeNewScore = countPhraseMatches(fullText, LIKE_NEW_PHRASES);
    var usedScore = countPhraseMatches(fullText, USED_PHRASES);

    // Приоритет: USED > LIKE_NEW > NEW (т.к. упоминание "б/у" важнее)
    if (usedScore > 0) return CONDITION.USED;
    if (likeNewScore > 0) return CONDITION.LIKE_NEW;
    if (newScore > 0) return CONDITION.NEW;

    return null;
  }

  /**
   * Считает количество совпадений фраз из списка в тексте.
   */
  function countPhraseMatches(text, phrases) {
    var count = 0;
    for (var i = 0; i < phrases.length; i++) {
      if (text.indexOf(phrases[i]) !== -1) {
        count++;
      }
    }
    return count;
  }

  /**
   * Строит результат с конфигурацией состояния.
   */
  function buildResult(condition, source) {
    var config = CONDITION_CONFIG[condition] || CONDITION_CONFIG.unknown;
    return {
      condition: condition,
      label: config.label,
      icon: config.icon,
      color: config.color,
      source: source,
      multipliers: {
        average: config.averageMultiplier,
        minSafe: config.minSafeMultiplier,
        scamThreshold: config.scamThresholdMultiplier
      }
    };
  }

  // Регистрируем модуль
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.conditionDetector = {
    detectCondition: detectCondition,
    CONDITION: CONDITION,
    CONDITION_CONFIG: CONDITION_CONFIG
  };
})();
