// =====================================================
//  Avito GPU Helper v2.0.1 — Anti-Scam Engine
//  Анализирует объявление на признаки мошенничества
//  с помощью набора эвристик и весовой системы.
//  v2.0.1: BUG-06 — H6 не триггерится при photoCount=0
//          (нет данных, а не «нет фото»);
//          BUG-08 — H4 проверяет VRAM для моделей без variants;
//          BUG-10 — «ферма» заменена на «майнинг-ферма»;
//          BUG-14 — countPhotos возвращает -1 при невозможности
//          подсчёта; H6 различает «нет данных» и «мало фото»;
//          BUG-13 — try/catch.
// =====================================================

(function () {
  "use strict";

  // Пороги для определения уровня риска
  var RISK_THRESHOLD_HIGH = 35;
  var RISK_THRESHOLD_MEDIUM = 15;

  // ---------------------------------------------------
  //  Словари подозрительных фраз
  // ---------------------------------------------------

  // Фразы, типичные для мошеннических объявлений
  var SCAM_PHRASES = [
    // Увод с площадки
    "\u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0432 whatsapp",
    "\u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0432 telegram",
    "\u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0432 \u0432\u0430\u0446\u0430\u043F",
    "\u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0432 \u0442\u0435\u043B\u0435\u0433\u0440\u0430\u043C",
    "\u043F\u0438\u0448\u0438\u0442\u0435 \u0432 whatsapp",
    "\u043F\u0438\u0448\u0438\u0442\u0435 \u0432 telegram",
    "\u0437\u0432\u043E\u043D\u0438\u0442\u0435 \u043D\u0435 \u043F\u0438\u0448\u0438\u0442\u0435",
    // Предоплата / аванс
    "\u043F\u0440\u0435\u0434\u043E\u043F\u043B\u0430\u0442\u0430",
    "\u0430\u0432\u0430\u043D\u0441",
    "\u0437\u0430\u0434\u0430\u0442\u043E\u043A",
    "\u043F\u0435\u0440\u0435\u0448\u043B\u0438\u0442\u0435",
    "\u043F\u0435\u0440\u0435\u0432\u0435\u0434\u0438\u0442\u0435",
    // Торопливость
    "\u0441\u0440\u043E\u0447\u043D\u044B\u0439 \u0432\u044B\u043A\u0443\u043F",
    "\u0441\u0440\u043E\u0447\u043D\u043E \u0432\u044B\u043A\u0443\u043F",
    "\u0431\u044B\u0441\u0442\u0440\u0430\u044F \u0441\u0434\u0435\u043B\u043A\u0430"
  ];

  // BUG-10: «ферма» заменена на «майнинг-ферма» и «майнинговая ферма»,
  // чтобы избежать ложных срабатываний на сельскохозяйственную ферму.
  var MINING_PHRASES = [
    "\u043C\u0430\u0439\u043D\u0438\u043D\u0433",
    "\u043C\u0430\u0439\u043D\u0438\u043B",
    "\u043C\u0430\u0439\u043D\u0435\u0440",
    "\u043C\u0430\u0439\u043D\u0438\u043D\u0433-\u0444\u0435\u0440\u043C\u0430",
    "\u043C\u0430\u0439\u043D\u0438\u043D\u0433\u043E\u0432\u0430\u044F \u0444\u0435\u0440\u043C\u0430",
    "\u0434\u043E\u0431\u044B\u0447\u0430 \u043A\u0440\u0438\u043F\u0442\u043E",
    "\u043A\u0440\u0438\u043F\u0442\u043E\u0432\u0430\u043B\u044E\u0442"
  ];

  // Фразы, указывающие на «новую» карту
  var NEW_ITEM_PHRASES = [
    "\u043D\u043E\u0432\u0430\u044F",
    "\u0432 \u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0435",
    "\u043D\u0435 \u0432\u0441\u043A\u0440\u044B\u0432\u0430\u043B\u0430\u0441\u044C",
    "\u043D\u0435\u0432\u0441\u043A\u0440\u044B\u0432\u0430\u043B\u0430\u0441\u044C",
    "\u0437\u0430\u043F\u0435\u0447\u0430\u0442\u0430\u043D\u043D\u0430\u044F",
    "\u043D\u043E\u0432\u044B\u0439 \u0441\u0442\u043E\u043A"
  ];

  // ---------------------------------------------------
  //  Эвристики
  // ---------------------------------------------------

  /**
   * H1. Цена ниже скам-порога.
   * Вес: 40 баллов.
   */
  function h1_priceBelowScamThreshold(price, gpuEntry) {
    if (!gpuEntry || !gpuEntry.market) return null;
    if (price <= gpuEntry.market.scam_threshold) {
      return {
        id: "h1_price_below_scam",
        reason: "\u0426\u0435\u043D\u0430 \u043A\u0440\u0438\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043D\u0438\u0436\u0435 \u0440\u044B\u043D\u043E\u0447\u043D\u043E\u0439 \u2014 \u0445\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u043D\u044B\u0439 \u043F\u0440\u0438\u0437\u043D\u0430\u043A \u043C\u043E\u0448\u0435\u043D\u043D\u0438\u0447\u0435\u0441\u0442\u0432\u0430",
        // Цена критически ниже рыночной — характерный признак мошенничества
        weight: 40
      };
    }
    return null;
  }

  /**
   * H2. Цена значительно ниже безопасного минимума.
   * Вес: 25 баллов.
   */
  function h2_priceBelowSafeMinimum(price, gpuEntry) {
    if (!gpuEntry || !gpuEntry.market) return null;
    var threshold = gpuEntry.market.scam_threshold;
    var minSafe = gpuEntry.market.min_safe_price;

    // Между scam_threshold и 85% от min_safe_price.
    if (price > threshold && price <= minSafe * 0.85) {
      return {
        id: "h2_price_below_safe",
        reason: "\u0426\u0435\u043D\u0430 \u043F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E \u043D\u0438\u0437\u043A\u0430\u044F \u0434\u043B\u044F \u0434\u0430\u043D\u043D\u043E\u0439 \u043C\u043E\u0434\u0435\u043B\u0438",
        // Цена подозрительно низкая для данной модели
        weight: 25
      };
    }
    return null;
  }

  /**
   * H3. Подозрительные фразы в описании.
   * Вес: 15 баллов.
   */
  function h3_scamPhrases(pageText) {
    if (!pageText) return null;
    var lowerText = pageText.toLowerCase();
    var found = [];

    for (var i = 0; i < SCAM_PHRASES.length; i++) {
      if (lowerText.indexOf(SCAM_PHRASES[i]) !== -1) {
        found.push(SCAM_PHRASES[i]);
      }
    }

    if (found.length === 0) return null;

    return {
      id: "h3_scam_phrases",
      reason: "\u041E\u0431\u043D\u0430\u0440\u0443\u0436\u0435\u043D\u044B \u0444\u0440\u0430\u0437\u044B: " + found.join(", "),
      // Обнаружены фразы: ...
      weight: 15
    };
  }

  /**
   * H4. Конфликт модели и VRAM.
   * BUG-08: Теперь проверяет модели БЕЗ variants — если указанный
   * VRAM не совпадает с дефолтным, это тоже конфликт.
   * Вес: 20 баллов.
   */
  function h4_vramModelConflict(price, gpuEntry, pageText) {
    if (!gpuEntry || !pageText) return null;

    // Ищем указание VRAM в тексте.
    var vramMatch = pageText.match(/(\d{1,2})\s*(\u0433\u0431|gb|\u0433\u0431\u0430\u0439\u0442|gbyte)\b/i);
    if (!vramMatch) return null;

    var statedVram = parseInt(vramMatch[1], 10);
    if (isNaN(statedVram)) return null;

    if (gpuEntry.variants) {
      // Модель с вариантами: конфликт, если VRAM не в списке.
      if (gpuEntry.variants.indexOf(statedVram) === -1) {
        return {
          id: "h4_vram_conflict",
          reason: "\u0423\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C \u0432\u0438\u0434\u0435\u043E\u043F\u0430\u043C\u044F\u0442\u0438 (" + statedVram + " \u0413\u0411) \u043D\u0435 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u043C\u043E\u0434\u0435\u043B\u0438 \u2014 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u0430 \u043F\u043E\u0434\u043C\u0435\u043D\u0430",
          // Указанный объём видеопамяти (X ГБ) не соответствует модели — возможна подмена
          weight: 20
        };
      }
    } else {
      // BUG-08: Модель без вариантов — конфликт, если VRAM
      // не совпадает с дефолтным значением из БД.
      if (statedVram !== gpuEntry.vram) {
        return {
          id: "h4_vram_conflict",
          reason: "\u0423\u043A\u0430\u0437\u0430\u043D\u043D\u044B\u0439 \u043E\u0431\u044A\u0451\u043C \u0432\u0438\u0434\u0435\u043E\u043F\u0430\u043C\u044F\u0442\u0438 (" + statedVram + " \u0413\u0411) \u043D\u0435 \u0441\u043E\u043E\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u043C\u043E\u0434\u0435\u043B\u0438 (\u043E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F " + gpuEntry.vram + " \u0413\u0411) \u2014 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u0430 \u043F\u043E\u0434\u043C\u0435\u043D\u0430",
          // Указанный объём (X ГБ) не соответствует модели (ожидается Y ГБ) — возможна подмена
          weight: 20
        };
      }
    }

    return null;
  }

  /**
   * H5. Маркёр «Новая» при цене ниже рынка.
   * Вес: 15 баллов.
   */
  function h5_newItemBelowMarket(price, gpuEntry, pageText) {
    if (!gpuEntry || !gpuEntry.market || !pageText) return null;

    var lowerText = pageText.toLowerCase();
    var isNewItem = false;

    for (var i = 0; i < NEW_ITEM_PHRASES.length; i++) {
      if (lowerText.indexOf(NEW_ITEM_PHRASES[i]) !== -1) {
        isNewItem = true;
        break;
      }
    }

    if (!isNewItem) return null;
    if (price < gpuEntry.market.average_price * 0.9) {
      return {
        id: "h5_new_below_market",
        reason: "\u041E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u043A\u0430\u043A \u00AB\u043D\u043E\u0432\u043E\u0435\u00BB, \u043D\u043E \u0446\u0435\u043D\u0430 \u043D\u0438\u0436\u0435 \u0440\u044B\u043D\u043A\u0430 \u2014 \u043F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E",
        // Объявление как «новое», но цена ниже рынка — подозрительно
        weight: 15
      };
    }

    return null;
  }

  /**
   * H6. Недостаток фотографий.
   * BUG-06: Не триггерится при photoCount <= 0 — это значит
   * «не удалось подсчитать», а не «нет фото».
   * BUG-14: Различает «нет данных» (0 или невалидное) и
   * «мало фото» (1 фото).
   * Вес: 10 баллов.
   */
  function h6_fewPhotos(photoCount) {
    // BUG-06/14: Если photoCount <= 0 или не число —
    // не удалось подсчитать, не триггерим эвристику.
    if (typeof photoCount !== "number" || photoCount <= 0) return null;

    if (photoCount < 2) {
      return {
        id: "h6_few_photos",
        reason: "\u041C\u0430\u043B\u043E \u0444\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u0439 \u2014 \u043D\u0435\u0432\u043E\u0437\u043C\u043E\u0436\u043D\u043E \u043E\u0446\u0435\u043D\u0438\u0442\u044C \u0440\u0435\u0430\u043B\u044C\u043D\u043E\u0435 \u0441\u043E\u0441\u0442\u043E\u044F\u043D\u0438\u0435",
        // Мало фотографий — невозможно оценить реальное состояние
        weight: 10
      };
    }
    return null;
  }

  /**
   * H7. Признаки подмены модели (две разные GPU в тексте).
   * v3.0.1: ИСПРАВЛЕНИЕ — теперь H7 не срабатывает, если GPU
   *         был определён из H1 или характеристик (там Avito
   *         показывает официальную модель товара). В описании
   *         продавец может перечислять много GPU (магазин,
   *         обмен, апгрейд) — это не подмена.
   *         Проверяем только если GPU найден в описании.
   * Вес: 20 баллов.
   */
  function h7_modelSubstitution(pageText, gpuEntry) {
    var detector = window.AGPUH && window.AGPUH.gpuDetector;
    if (!detector || !detector.findAllGpuModels) return null;

    // v3.0.1: Если GPU был определён из H1/характеристик —
    // упоминания других моделей в описании НЕ считаются подменой.
    // Это магазины/перекупы, которые перечисляют весь свой ассортимент.
    if (gpuEntry && !gpuEntry.sanityChecked) {
      // Проверяем, есть ли GPU в H1 или характеристиках.
      // Если есть — значит GPU определён из надёжного источника.
      var titleText = detector.extractTitleText ? detector.extractTitleText() : "";
      var paramsText = detector.extractParamsText ? detector.extractParamsText() : "";

      // Извлекаем короткое имя модели (последние 2 слова, например "RTX 4060")
      var modelShort = gpuEntry.model.split(" ").slice(-2).join(" ");
      var modelEscaped = modelShort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var modelRegex = new RegExp(modelEscaped, "i");

      var inTitle = titleText && titleText.match(modelRegex);
      var inParams = paramsText && paramsText.match(modelRegex);

      if (inTitle || inParams) {
        // GPU найден в надёжном источнике — H7 не срабатывает
        return null;
      }
    }

    var found = detector.findAllGpuModels(pageText);
    if (found.length < 2) return null;

    // Несколько моделей — проверяем, разные ли они.
    var uniqueModels = [];
    for (var i = 0; i < found.length; i++) {
      if (uniqueModels.indexOf(found[i].model) === -1) {
        uniqueModels.push(found[i].model);
      }
    }

    if (uniqueModels.length >= 2) {
      return {
        id: "h7_model_substitution",
        reason: "\u0412 \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u0438 \u0443\u043F\u043E\u043C\u0438\u043D\u0430\u044E\u0442\u0441\u044F \u0440\u0430\u0437\u043D\u044B\u0435 \u043C\u043E\u0434\u0435\u043B\u0438 \u2014 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u0430 \u043F\u043E\u0434\u043C\u0435\u043D\u0430",
        // В объявлении упоминаются разные модели — возможна подмена
        weight: 20
      };
    }

    return null;
  }

  /**
   * H8. Указание на майнинг.
   * BUG-10: Заменено «ферма» → «майнинг-ферма», «майнинговая ферма».
   * Вес: 10 баллов.
   */
  function h8_miningUsage(pageText) {
    if (!pageText) return null;
    var lowerText = pageText.toLowerCase();

    for (var i = 0; i < MINING_PHRASES.length; i++) {
      if (lowerText.indexOf(MINING_PHRASES[i]) !== -1) {
        return {
          id: "h8_mining_usage",
          reason: "\u0412\u0438\u0434\u0435\u043E\u043A\u0430\u0440\u0442\u0430 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u043B\u0430\u0441\u044C \u0434\u043B\u044F \u043C\u0430\u0439\u043D\u0438\u043D\u0433\u0430 \u2014 \u043F\u043E\u0432\u044B\u0448\u0435\u043D\u043D\u044B\u0439 \u0438\u0437\u043D\u043E\u0441",
          // Видеокарта использовалась для майнинга — повышенный износ
          weight: 10
        };
      }
    }

    return null;
  }

  /**
   * H9. Продажа коробки/упаковки от видеокарты.
   * v3.0.2: NEW — продавцы продают пустые коробки от GPU, а расширение
   *         определяет их как видеокарты. Добавляем флаг, если в тексте
   *         есть слова «коробка», «упаковка» рядом с упоминанием GPU.
   * Вес: 50 баллов (критический — это точно не видеокарта).
   */
  function h9_boxListing(pageText) {
    if (!pageText) return null;

    var detector = window.AGPUH && window.AGPUH.gpuDetector;
    if (!detector || !detector.isBoxListing) return null;

    if (detector.isBoxListing(pageText)) {
      return {
        id: "h9_box_listing",
        reason: "\u041E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u0435 \u043F\u043E\u0445\u043E\u0436\u0435 \u043D\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0443 \u043A\u043E\u0440\u043E\u0431\u043A\u0438/\u0443\u043F\u0430\u043A\u043E\u0432\u043A\u0438, \u0430 \u043D\u0435 \u0441\u0430\u043C\u043E\u0439 \u0432\u0438\u0434\u0435\u043E\u043A\u0430\u0440\u0442\u044B",
        // Объявление похоже на продажу коробки/упаковки, а не самой видеокарты
        weight: 50
      };
    }

    return null;
  }

  // ---------------------------------------------------
  //  Основная функция анализа
  // ---------------------------------------------------

  /**
   * Анализирует объявление на признаки мошенничества.
   * @param {object} params
   *   {number}  price        — цена объявления
   *   {object}  gpuEntry     — запись из GPU БД
   *   {string}  pageText     — текст страницы
   *   {number}  photoCount   — количество фотографий
   *   {string}  priceStatus  — статус от Fair Price Engine
   * @returns {object} { riskScore, riskLevel, riskLabel, flags }
   */
  function analyze(params) {
    try {
      var price = params.price;
      var gpuEntry = params.gpuEntry;
      var pageText = params.pageText || "";
      var photoCount = params.photoCount;
      var priceStatus = params.priceStatus;

      var flags = [];
      var riskScore = 0;

      // Запускаем все эвристики.
      var heuristics = [
        h1_priceBelowScamThreshold(price, gpuEntry),
        h2_priceBelowSafeMinimum(price, gpuEntry),
        h3_scamPhrases(pageText),
        h4_vramModelConflict(price, gpuEntry, pageText),
        h5_newItemBelowMarket(price, gpuEntry, pageText),
        h6_fewPhotos(photoCount),
        h7_modelSubstitution(pageText, gpuEntry),  // v3.0.1: передаём gpuEntry
        h8_miningUsage(pageText),
        h9_boxListing(pageText)                    // v3.0.2: NEW — детект коробок
      ];

      for (var i = 0; i < heuristics.length; i++) {
        var result = heuristics[i];
        if (result) {
          flags.push(result);
          riskScore += result.weight;
        }
      }

      // Определяем уровень риска.
      var riskLevel, riskLabel;
      if (riskScore >= RISK_THRESHOLD_HIGH) {
        riskLevel = "high";
        riskLabel = "\u0412\u044B\u0441\u043E\u043A\u0438\u0439"; // Высокий
      } else if (riskScore >= RISK_THRESHOLD_MEDIUM) {
        riskLevel = "medium";
        riskLabel = "\u0421\u0440\u0435\u0434\u043D\u0438\u0439"; // Средний
      } else {
        riskLevel = "low";
        riskLabel = "\u041D\u0438\u0437\u043A\u0438\u0439"; // Низкий
      }

      return {
        riskScore: riskScore,
        riskLevel: riskLevel,
        riskLabel: riskLabel,
        flags: flags
      };
    } catch (e) {
      console.error("[AGPUH] analyze() error:", e);
      return {
        riskScore: 0,
        riskLevel: "low",
        riskLabel: "\u041D\u0438\u0437\u043A\u0438\u0439",
        flags: []
      };
    }
  }

  /**
   * Считает количество фотографий товара на странице объявления.
   * BUG-14: Возвращает -1, если не удалось подсчитать,
   * чтобы H6 не триггерилась на «нет данных».
   * @returns {number} количество фото, или -1 если не удалось подсчитать
   */
  function countPhotos() {
    try {
      // Avito хранит галерею в элементах с data-marker, начинающимся с "image-frame".
      // Пробуем и старый, и новый форматы data-marker для галереи.
      var galleryImages = document.querySelectorAll(
        '[data-marker^="image-frame"] img, ' +
        '[data-marker^="item-view/gallery"] img, ' +
        '[data-marker="gallery"] img, ' +
        '[data-marker="item-view/gallery"] img, ' +
        '.gallery-img, ' +
        '.image-frame img'
      );

      if (galleryImages.length > 0) {
        return galleryImages.length;
      }

      // Fallback: считаем все img внутри основной области объявления.
      var itemScope =
        document.querySelector('[data-marker="item"]') ||
        document.querySelector("main") ||
        document.querySelector("article");

      if (itemScope) {
        var allImgs = itemScope.querySelectorAll("img");
        var visibleCount = 0;
        for (var i = 0; i < allImgs.length; i++) {
          var rect = allImgs[i].getBoundingClientRect();
          // Учитываем только видимые изображения разумного размера.
          if (rect.width > 50 && rect.height > 50) {
            visibleCount++;
          }
        }
        // BUG-14: Если не нашли ни одного видимого изображения,
        // это скорее всего «не удалось подсчитать», а не «0 фото».
        // Возвращаем -1, чтобы H6 не сработала.
        return visibleCount > 0 ? visibleCount : -1;
      }

      // Нет scope — точно не можем подсчитать.
      return -1;
    } catch (e) {
      console.error("[AGPUH] countPhotos() error:", e);
      return -1;
    }
  }

  // Регистрируем модуль
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.antiScamEngine = {
    analyze: analyze,
    countPhotos: countPhotos
  };
})();
