// =====================================================
//  Avito GPU Helper v3.0.0 — Seller Analyzer
//  Анализирует продавца на основе DOM-элементов карточки
//  товара (без доп. запросов к профилю).
//  Извлекает: имя, рейтинг, кол-во отзывов, стаж на Avito.
//  Формирует индикатор надёжности: 🟢/🟡/🔴.
// =====================================================

(function () {
  "use strict";

  // Уровни надёжности
  var RELIABILITY = {
    HIGH: "high",      // 🟢 Надёжный
    MEDIUM: "medium",  // 🟡 Средний
    LOW: "low",        // 🔴 Риски
    UNKNOWN: "unknown" // ❓ Недостаточно данных
  };

  var RELIABILITY_CONFIG = {
    high: {
      label: "Надёжный",
      icon: "🟢",
      color: "green"
    },
    medium: {
      label: "Средний",
      icon: "🟡",
      color: "yellow"
    },
    low: {
      label: "Риски",
      icon: "🔴",
      color: "red"
    },
    unknown: {
      label: "Недостаточно данных",
      icon: "❓",
      color: "gray"
    }
  };

  // Пороговые значения для оценки
  var THRESHOLDS = {
    RATING_GOOD: 4.5,        // Рейтинг ≥ 4.5 = хорошо
    RATING_BAD: 4.0,         // Рейтинг < 4.0 = плохо
    REVIEWS_GOOD: 20,        // ≥ 20 отзывов = хорошо
    REVIEWS_BAD: 5,          // < 5 отзывов = плохо
    STAGE_GOOD_MONTHS: 6,    // ≥ 6 мес на Avito = хорошо
    STAGE_BAD_MONTHS: 1      // < 1 мес = плохо
  };

  // Селекторы DOM-элементов продавца
  var SELLER_SELECTORS = {
    name: [
      '[data-marker="seller-info/name"]',
      '[data-marker="seller-name"]',
      '[data-marker*="seller"] [data-marker*="name"]',
      'a[href*="/user/"]'
    ],
    rating: [
      '[data-marker="seller-info/rating"]',
      '[data-marker="seller-rating"]',
      '[class*="seller"] [class*="rating"]',
      '[class*="rating"]'
    ],
    reviews: [
      '[data-marker="seller-info/reviews-count"]',
      '[data-marker="seller-reviews"]',
      '[class*="seller"] [class*="reviews"]',
      'a[href*="/reviews"]'
    ],
    stage: [
      '[data-marker="seller-info/registration"]',
      '[data-marker="seller-info/stage"]',
      '[class*="seller"] [class*="registration"]',
      '[class*="seller-info"]'
    ],
    link: [
      'a[href*="/user/"]'
    ]
  };

  /**
   * Анализирует продавца на основе DOM-элементов текущей карточки.
   * @returns {object} {
   *   name, rating, reviewsCount, stageMonths, stageText, profileUrl,
   *   reliability, reliabilityLabel, reliabilityIcon, reliabilityColor,
   *   factors, warnings
   * }
   */
  function analyze() {
    try {
      var name = extractName();
      var rating = extractRating();
      var reviewsCount = extractReviewsCount();
      var stageMonths = extractStageMonths();
      var stageText = extractStageText();
      var profileUrl = extractProfileUrl();

      // Если нет ни имени, ни рейтинга, ни отзывов — продавец не определён.
      if (name === null && rating === null && reviewsCount === null) {
        return buildResult({
          name: null,
          rating: null,
          reviewsCount: null,
          stageMonths: null,
          stageText: null,
          profileUrl: null,
          reliability: RELIABILITY.UNKNOWN
        });
      }

      var assessment = assessReliability(rating, reviewsCount, stageMonths);

      return buildResult({
        name: name,
        rating: rating,
        reviewsCount: reviewsCount,
        stageMonths: stageMonths,
        stageText: stageText,
        profileUrl: profileUrl,
        reliability: assessment.reliability,
        factors: assessment.factors,
        warnings: assessment.warnings
      });
    } catch (e) {
      console.error("[AGPUH] sellerAnalyzer.analyze() error:", e);
      return buildResult({
        name: null,
        rating: null,
        reviewsCount: null,
        stageMonths: null,
        stageText: null,
        profileUrl: null,
        reliability: RELIABILITY.UNKNOWN
      });
    }
  }

  // ---------------------------------------------------
  //  Извлечение данных из DOM
  // ---------------------------------------------------

  function extractName() {
    var el = findFirstElement(SELLER_SELECTORS.name);
    if (!el) return null;
    var text = (el.getAttribute("title") || el.innerText || el.textContent || "").trim();
    return text.length > 0 && text.length < 100 ? text : null;
  }

  function extractRating() {
    var el = findFirstElement(SELLER_SELECTORS.rating);
    if (!el) return null;

    // Сначала пытаемся извлечь из атрибута content
    var content = el.getAttribute("content");
    if (content) {
      var val = parseFloat(content.replace(",", "."));
      if (!isNaN(val) && val >= 0 && val <= 5) return val;
    }

    // Парсим текст: "4.8", "4,8", "★ 4.8", "Рейтинг 4.8 из 5"
    var text = (el.innerText || el.textContent || "").trim();
    var m = text.match(/(\d+[.,]?\d*)/);
    if (m) {
      var v = parseFloat(m[1].replace(",", "."));
      if (!isNaN(v) && v >= 0 && v <= 5) return v;
    }
    return null;
  }

  function extractReviewsCount() {
    var el = findFirstElement(SELLER_SELECTORS.reviews);
    if (!el) return null;

    var text = (el.innerText || el.textContent || "").trim();
    // Ищем число, возможно с разделителями разрядов
    var m = text.match(/(\d[\d\s\u00a0]*)/);
    if (m) {
      var digits = m[1].replace(/[\s\u00a0]/g, "");
      var v = parseInt(digits, 10);
      if (!isNaN(v) && v >= 0 && v < 100000) return v;
    }
    return null;
  }

  function extractStageMonths() {
    var text = extractStageText();
    if (!text) return null;

    var lowerText = text.toLowerCase();

    // Паттерны: "на авито с 2019", "с 2019 года", "2 года на авито",
    // "3 месяца", "полгода", "8 лет"
    var yearMatch = lowerText.match(/(\d{4})/);
    if (yearMatch) {
      var year = parseInt(yearMatch[1], 10);
      var currentYear = new Date().getFullYear();
      if (year >= 2000 && year <= currentYear) {
        return Math.max(0, (currentYear - year) * 12);
      }
    }

    var monthsMatch = lowerText.match(/(\d+)\s*(месяц|мес)/);
    if (monthsMatch) {
      return parseInt(monthsMatch[1], 10);
    }

    var yearsMatch = lowerText.match(/(\d+)\s*(год|лет|г\.)/);
    if (yearsMatch) {
      return parseInt(yearsMatch[1], 10) * 12;
    }

    if (lowerText.indexOf("полгода") !== -1 || lowerText.indexOf("пол года") !== -1) {
      return 6;
    }

    return null;
  }

  function extractStageText() {
    var el = findFirstElement(SELLER_SELECTORS.stage);
    if (!el) return null;
    var text = (el.innerText || el.textContent || "").trim();
    // Ищем фразу "На Авито с ..." в тексте
    var m = text.match(/на\s*авито\s*с[^\n]{0,50}/i);
    if (m) return m[0];
    return text.length > 0 && text.length < 100 ? text : null;
  }

  function extractProfileUrl() {
    var el = findFirstElement(SELLER_SELECTORS.link);
    if (!el) return null;
    var href = el.getAttribute("href");
    if (href && href.indexOf("/user/") !== -1) {
      // v3.1.0 (V-3): Validate host for absolute URLs (phishing protection)
      if (href.startsWith("http")) {
        try {
          var u = new URL(href);
          if (u.hostname !== "avito.ru" && !u.hostname.endsWith(".avito.ru")) {
            return null;  // reject non-avito URL
          }
          return href;
        } catch (e) {
          return null;
        }
      }
      return "https://www.avito.ru" + href;
    }
    return null;
  }

  function findFirstElement(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  // ---------------------------------------------------
  //  Оценка надёжности
  // ---------------------------------------------------

  /**
   * Оценивает надёжность продавца по рейтингу, отзывам и стажу.
   * Возвращает { reliability, factors, warnings }.
   */
  function assessReliability(rating, reviewsCount, stageMonths) {
    var factors = [];
    var warnings = [];
    var score = 0;  // Положительные баллы
    var riskScore = 0;  // Негативные баллы

    // Рейтинг
    if (rating !== null) {
      if (rating >= THRESHOLDS.RATING_GOOD) {
        score += 2;
        factors.push("Высокий рейтинг " + rating.toFixed(1));
      } else if (rating < THRESHOLDS.RATING_BAD) {
        riskScore += 2;
        warnings.push("Низкий рейтинг " + rating.toFixed(1));
      } else {
        factors.push("Средний рейтинг " + rating.toFixed(1));
      }
    }

    // Отзывы
    if (reviewsCount !== null) {
      if (reviewsCount >= THRESHOLDS.REVIEWS_GOOD) {
        score += 2;
        factors.push("Много отзывов (" + reviewsCount + ")");
      } else if (reviewsCount < THRESHOLDS.REVIEWS_BAD) {
        riskScore += 2;
        warnings.push("Мало отзывов (" + reviewsCount + ")");
      } else {
        factors.push("Есть отзывы (" + reviewsCount + ")");
      }
    }

    // Стаж
    if (stageMonths !== null) {
      if (stageMonths >= THRESHOLDS.STAGE_GOOD_MONTHS) {
        score += 1;
        factors.push("Давно на Avito (" + formatStage(stageMonths) + ")");
      } else if (stageMonths < THRESHOLDS.STAGE_BAD_MONTHS) {
        riskScore += 2;
        warnings.push("Новый аккаунт (" + formatStage(stageMonths) + ")");
      }
    }

    // Определяем итоговый уровень
    var reliability;
    if (riskScore >= 3) {
      reliability = RELIABILITY.LOW;
    } else if (score >= 4 && riskScore === 0) {
      reliability = RELIABILITY.HIGH;
    } else if (riskScore > 0 || score < 2) {
      reliability = RELIABILITY.MEDIUM;
    } else {
      reliability = RELIABILITY.MEDIUM;
    }

    // Если данных совсем мало — UNKNOWN
    var dataPoints = (rating !== null ? 1 : 0) + (reviewsCount !== null ? 1 : 0) + (stageMonths !== null ? 1 : 0);
    if (dataPoints === 0) {
      reliability = RELIABILITY.UNKNOWN;
    }

    return {
      reliability: reliability,
      factors: factors,
      warnings: warnings
    };
  }

  /**
   * Форматирует стаж в месяцах в человекочитаемый вид.
   */
  function formatStage(months) {
    if (months === null) return "—";
    if (months < 12) return months + " мес.";
    var years = Math.floor(months / 12);
    var remainder = months % 12;
    if (remainder === 0) {
      return years + " " + pluralize(years, "год", "года", "лет");
    }
    return years + " " + pluralize(years, "год", "года", "лет") + " " + remainder + " мес.";
  }

  function pluralize(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  // ---------------------------------------------------
  //  Сборка результата
  // ---------------------------------------------------

  function buildResult(data) {
    var config = RELIABILITY_CONFIG[data.reliability] || RELIABILITY_CONFIG.unknown;
    return {
      name: data.name,
      rating: data.rating,
      reviewsCount: data.reviewsCount,
      stageMonths: data.stageMonths,
      stageText: data.stageText,
      stageFormatted: formatStage(data.stageMonths),
      profileUrl: data.profileUrl,
      reliability: data.reliability,
      reliabilityLabel: config.label,
      reliabilityIcon: config.icon,
      reliabilityColor: config.color,
      factors: data.factors || [],
      warnings: data.warnings || []
    };
  }

  // Регистрируем модуль
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.sellerAnalyzer = {
    analyze: analyze,
    RELIABILITY: RELIABILITY,
    RELIABILITY_CONFIG: RELIABILITY_CONFIG
  };
})();
