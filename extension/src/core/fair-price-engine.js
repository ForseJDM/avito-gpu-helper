// =====================================================
//  Avito GPU Helper v3.0.0 — Fair Price Engine
//  Определяет справедливость цены объявления относительно
//  рыночных данных и выдаёт статус + отклонение.
//  v2.0.1: BUG-05 — разделён статус suspiciously_cheap
//          на два уровня: red (критический) и
//          orange (предупреждение);
//          BUG-13 — try/catch.
//  v3.0.0: Поддержка состояния товара (new/like_new/used)
//          через conditionDetector — пороги адаптируются
//          множителями в зависимости от состояния.
// =====================================================

(function () {
  "use strict";

  // Статусы оценки цены
  var STATUS = {
    SUSPICIOUSLY_CHEAP: "suspiciously_cheap",           // критический (≤ scam_threshold)
    SUSPICIOUSLY_CHEAP_WARN: "suspiciously_cheap_warn",  // предупреждение (< min_safe_price)
    GREAT_DEAL: "great_deal",
    FAIR: "fair",
    OVERPRICED: "overpriced"
  };

  // Конфигурация отображения статусов
  // BUG-05: Добавлен статус suspiciously_cheap_warn с orange/⚠️.
  var STATUS_CONFIG = {
    suspiciously_cheap: {
      label: "\u041F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0434\u0451\u0448\u0435\u0432\u043E", // Подозрительно дёшево
      color: "red",
      icon: "\uD83D\uDEA8" // 🚨
    },
    suspiciously_cheap_warn: {
      label: "\u041F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u0434\u0451\u0448\u0435\u0432\u043E", // Подозрительно дёшево
      color: "orange",
      icon: "\u26A0\uFE0F" // ⚠️
    },
    great_deal: {
      label: "\u0412\u044B\u0433\u043E\u0434\u043D\u043E", // Выгодно
      color: "green",
      icon: "\uD83D\uDFE2" // 🟢
    },
    fair: {
      label: "\u041D\u043E\u0440\u043C\u0430\u043B\u044C\u043D\u043E", // Нормально
      color: "blue",
      icon: "\uD83D\uDFE3" // 🔵
    },
    overpriced: {
      label: "\u0417\u0430\u0432\u044B\u0448\u0435\u043D\u043E", // Завышено
      color: "red",
      icon: "\uD83D\uDFE5" // 🔴
    }
  };

  /**
   * Оценивает справедливость цены относительно рыночных данных.
   * v3.0.0: Поддерживает состояние товара (new/like_new/used).
   *         Если conditionResult передан, пороги адаптируются множителями.
   * @param {number} price — цена объявления (₽)
   * @param {object} gpuEntry — запись из GPU БД с полем market
   * @param {object} [conditionResult] — результат conditionDetector.detectCondition()
   *        { condition, multipliers: { average, minSafe, scamThreshold } }
   * @returns {object} { status, label, color, icon, deviation, recommendation, condition }
   */
  function evaluate(price, gpuEntry, conditionResult) {
    try {
      if (!price || !gpuEntry || !gpuEntry.market) {
        return createResult(STATUS.FAIR, 0, "\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0434\u0430\u043D\u043D\u044B\u0445 \u0434\u043B\u044F \u043E\u0446\u0435\u043D\u043A\u0438.");
        // Недостаточно данных для оценки.
      }

      var market = gpuEntry.market;
      var deviation = calcDeviation(price, market.average_price);

      // v3.0.0: Адаптируем пороги под состояние товара.
      var adjustedMarket = adjustMarketForCondition(market, conditionResult);
      var condInfo = conditionResult ? {
        condition: conditionResult.condition,
        label: conditionResult.label,
        icon: conditionResult.icon
      } : null;

      // Шаг 1: Цена ниже scam_threshold — критический скам (red, 🚨).
      if (price <= adjustedMarket.scam_threshold) {
        return createResult(
          STATUS.SUSPICIOUSLY_CHEAP,
          deviation,
          "\u0426\u0435\u043D\u0430 \u043A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0438\u0436\u0435 \u0440\u044B\u043D\u043A\u0430. \u0412\u044B\u0441\u043E\u043A\u0430\u044F \u0432\u0435\u0440\u043E\u044F\u0442\u043D\u043E\u0441\u0442\u044C \u043C\u043E\u0448\u0435\u043D\u043D\u0438\u0447\u0435\u0441\u0442\u0432\u0430."
          // Цена критически ниже рынка. Высокая вероятность мошенничества.
          , condInfo
        );
      }

      // Шаг 2: Цена ниже min_safe_price — подозрительно (orange, ⚠️).
      // BUG-05: Теперь использует отдельный статус suspiciously_cheap_warn.
      if (price < adjustedMarket.min_safe_price) {
        return createResult(
          STATUS.SUSPICIOUSLY_CHEAP_WARN,
          deviation,
          "\u0426\u0435\u043D\u0430 \u0437\u043D\u0430\u0447\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043D\u0438\u0436\u0435 \u0440\u044B\u043D\u043A\u0430. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0430 \u0438 \u0442\u043E\u0432\u0430\u0440."
          // Цена значительно ниже рынка. Проверьте продавца и товар.
          , condInfo
        );
      }

      // Шаг 3: Цена ниже adjustedAverage — выгодно.
      // v3.0.0: Используем adjustedAverage (с учётом состояния),
      //         но deviation считаем от оригинальной рыночной средней.
      if (price < adjustedMarket.average_price) {
        return createResult(
          STATUS.GREAT_DEAL,
          deviation,
          "\u0426\u0435\u043D\u0430 \u043D\u0438\u0436\u0435 \u0441\u0440\u0435\u0434\u043D\u0435\u0439 \u043F\u043E \u0440\u044B\u043D\u043A\u0443. \u0421\u0442\u043E\u0438\u0442 \u0440\u0430\u0441\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C."
          // Цена ниже средней по рынку. Стоит рассмотреть.
          , condInfo
        );
      }

      // Шаг 4: Цена выше max_fair_price — завышено.
      if (price > adjustedMarket.max_fair_price) {
        return createResult(
          STATUS.OVERPRICED,
          deviation,
          "\u0426\u0435\u043D\u0430 \u0432\u044B\u0448\u0435 \u0441\u043F\u0440\u0430\u0432\u0435\u0434\u043B\u0438\u0432\u043E\u0439. \u0415\u0441\u0442\u044C \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0434\u0435\u0448\u0435\u0432\u043B\u0435."
          // Цена выше справедливой. Есть предложения дешевле.
          , condInfo
        );
      }

      // Шаг 5: Цена в пределах нормы (average ≤ price ≤ max_fair_price).
      return createResult(
        STATUS.FAIR,
        deviation,
        "\u0426\u0435\u043D\u0430 \u0432 \u043F\u0440\u0435\u0434\u0435\u043B\u0430\u0445 \u0440\u044B\u043D\u043A\u0430. \u041C\u043E\u0436\u043D\u043E \u0442\u043E\u0440\u0433\u043E\u0432\u0430\u0442\u044C\u0441\u044F."
        // Цена в пределах рынка. Можно торговаться.
        , condInfo
      );
    } catch (e) {
      console.error("[AGPUH] evaluate() error:", e);
      return createResult(STATUS.FAIR, 0, "\u041E\u0448\u0438\u0431\u043A\u0430 \u043E\u0446\u0435\u043D\u043A\u0438.");
      // Ошибка оценки.
    }
  }

  /**
   * Вычисляет отклонение цены от средней в процентах.
   * @param {number} price
   * @param {number} average
   * @returns {number} Отклонение в % (отрицательное = дешевле)
   */
  function calcDeviation(price, average) {
    if (!average || average === 0) return 0;
    return Math.round(((price - average) / average) * 100);
  }

  /**
   * Форматирует отклонение в человекочитаемый вид.
   * @param {number} deviation — отклонение в %
   * @returns {string} например "−21% от рынка" или "+46% от рынка"
   */
  function formatDeviation(deviation) {
    if (deviation === 0) return "\u0440\u0430\u0432\u043D\u043E \u0440\u044B\u043D\u043A\u0443"; // равно рынку
    var sign = deviation > 0 ? "+" : "\u2212"; // + или −
    var absVal = Math.abs(deviation);
    var direction = deviation > 0
      ? "\u043D\u0430\u0434 \u0440\u044B\u043D\u043A\u043E\u043C"  // над рынком
      : "\u043E\u0442 \u0440\u044B\u043D\u043A\u0430";             // от рынка
    return sign + absVal + "% " + direction;
  }

  /**
   * Создаёт объект результата оценки.
   * v3.0.0: Добавлено поле condition (если передано).
   * @param {string} status
   * @param {number} deviation
   * @param {string} recommendation
   * @param {object} [conditionInfo] — информация о состоянии для результата
   * @returns {object}
   */
  function createResult(status, deviation, recommendation, conditionInfo) {
    var config = STATUS_CONFIG[status] || STATUS_CONFIG.fair;
    var result = {
      status: status,
      label: config.label,
      color: config.color,
      icon: config.icon,
      deviation: deviation,
      deviationFormatted: formatDeviation(deviation),
      recommendation: recommendation
    };
    if (conditionInfo) {
      result.condition = conditionInfo.condition;
      result.conditionLabel = conditionInfo.label;
      result.conditionIcon = conditionInfo.icon;
    }
    return result;
  }

  /**
   * v3.0.0: Адаптирует рыночные пороги под состояние товара.
   *
   * Если conditionResult не передан или состояние unknown —
   * возвращает оригинальные пороги (обратная совместимость с v2.x).
   *
   * Множители берутся из conditionDetector.CONDITION_CONFIG:
   *   - new:        average × 1.10, minSafe × 0.85, scamThreshold × 0.50
   *   - like_new:   average × 1.00, minSafe × 0.75, scamThreshold × 0.42
   *   - used:       average × 0.85, minSafe × 0.55, scamThreshold × 0.35
   *   - unknown:    без изменений (×1.00)
   *
   * @param {object} market — оригинальные пороги из БД
   * @param {object} [conditionResult] — результат conditionDetector
   * @returns {object} адаптированные пороги
   */
  function adjustMarketForCondition(market, conditionResult) {
    if (!conditionResult || !conditionResult.multipliers || conditionResult.condition === "unknown") {
      return market;
    }

    var m = conditionResult.multipliers;
    return {
      average_price: Math.round(market.average_price * m.average),
      min_safe_price: Math.round(market.min_safe_price * m.minSafe),
      max_fair_price: Math.round(market.max_fair_price * m.average),
      scam_threshold: Math.round(market.scam_threshold * m.scamThreshold)
    };
  }

  // Регистрируем модуль
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.fairPriceEngine = {
    evaluate: evaluate,
    calcDeviation: calcDeviation,
    formatDeviation: formatDeviation,
    STATUS: STATUS,
    STATUS_CONFIG: STATUS_CONFIG
  };
})();
