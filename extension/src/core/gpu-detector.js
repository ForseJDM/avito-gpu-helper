// =====================================================
//  Avito GPU Helper v3.0.2 — GPU Detector
//  Определяет модель GPU и объём VRAM по тексту страницы.
//  v2.0.1: BUG-04 — сужены негативные контексты;
//          BUG-09 — убран «диск» из otherMarkers;
//          BUG-13 — try/catch.
//  v3.0.1: Приоритет H1 → Характеристики → Описание.
//          Sanity-check цены.
//  v3.0.2: ИСПРАВЛЕНИЕ — добавлен параметр useDom (по умолчанию true).
//          Для search cards нужно вызывать detectGpu(text, {useDom:false}),
//          иначе detectGpu берёт H1 всей search-страницы, а не title карточки.
//          Также добавлен детект «коробок» — если в title слова «коробка»,
//          «упаковка», «пустая» — НЕ определяем как GPU (H9 в anti-scam).
// =====================================================

(function () {
  "use strict";

  // BUG-04: Суженный список негативных контекстов.
  // Убраны слова, которые часто встречаются в легитимных
  // объявлениях о видеокартах: «сборка», «ноутбук», «кулер»,
  // «корпус», «вентилятор», «радиатор», «готовый пк» и т.п.
  // Оставлены только маркеры, ОДНОЗНАЧНО указывающие на
  // другой товар (не видеокарту).
  var NEGATIVE_CONTEXTS = [
    "блок питания", "бп ", "бп,", "бп.",
    "мышь", "коврик",
    "материнская плата", "матплата",
    "процессор", "оперативная память", "оперативку",
    "жёсткий диск", "жесткий диск", "ssd", "hdd",
    "наушники", "колонки", "звуковая карта",
    "подходит для", "рекомендуется для", "совместима с"
  ];

  // Regex для извлечения объёма VRAM из текста.
  // Ищет фразы вида "12 ГБ", "12ГБ", "12 GB", "12GB", "12 гб".
  var VRAM_REGEX = /(\d{1,2})\s*(гб|gb|гбайт|gbyte)\b/i;

  // Размер контекстного окна (символы до и после match) для поиска VRAM.
  var CONTEXT_RADIUS = 150;

  /**
   * Основная функция определения GPU.
   * v3.0.1: Приоритет источников — H1 → раздел «Характеристики» → описание.
   * v3.0.2: Добавлен параметр options.useDom (по умолчанию true).
   *         Для search cards нужно вызывать detectGpu(text, {useDom:false}),
   *         иначе detectGpu берёт H1 всей search-страницы.
   *         Также добавлен детект «коробок» — если в title слова «коробка»,
   *         «упаковка», «пустая» — возвращаем null.
   *
   * @param {string} pageText — текст страницы (заголовок + описание + title)
   * @param {object} [options] — { useDom: boolean } — использовать DOM (H1/params)
   * @returns {object|null} { model, vram, market, source } или null
   */
  function detectGpu(pageText, options) {
    try {
      options = options || {};
      var useDom = options.useDom !== false;  // по умолчанию true

      if (!pageText || typeof pageText !== "string") return null;

      var db = window.AGPUH && window.AGPUH.gpuMarketDb;
      if (!db || !db.length) return null;

      // v3.0.2: Детект «коробок» — если в тексте есть слова «коробка»,
      // «упаковка», «пустая» рядом с моделью GPU — это не видеокарта.
      if (isBoxListing(pageText)) {
        console.log("[AGPUH GPU] Обнаружена коробка/упаковка, GPU не определяется");
        return null;
      }

      // v3.0.1: Шаг 1 — Ищем в заголовке H1 (только если useDom=true)
      if (useDom) {
        var titleText = extractTitleText();
        if (titleText) {
          var titleGpu = findFirstMatch(titleText, db);
          if (titleGpu) {
            console.log("[AGPUH GPU] Модель из заголовка: " + titleGpu.model);
            return titleGpu;
          }
        }

        // v3.0.1: Шаг 2 — Ищем в разделе «Характеристики»
        var paramsText = extractParamsText();
        if (paramsText) {
          var paramsGpu = findFirstMatch(paramsText, db);
          if (paramsGpu) {
            console.log("[AGPUH GPU] Модель из характеристик: " + paramsGpu.model);
            return paramsGpu;
          }
        }
      }

      // v3.0.1: Шаг 3 — Fallback на переданный текст (с негативными контекстами)
      var fullGpu = findFirstMatch(pageText, db, true);
      if (fullGpu) {
        console.log("[AGPUH GPU] Модель из описания: " + fullGpu.model);
        return fullGpu;
      }

      return null;
    } catch (e) {
      console.error("[AGPUH] detectGpu() error:", e);
      return null;
    }
  }

  /**
   * v3.0.2: Проверяет, является ли объявление продажей коробки/упаковки
   * от видеокарты, а не самой видеокартой.
   * @param {string} text — текст для проверки
   * @returns {boolean} true, если это коробка (не видеокарта)
   */
  function isBoxListing(text) {
    if (!text) return false;
    var lowerText = text.toLowerCase();

    // Слова, указывающие на коробку/упаковку (а не сам товар)
    var boxPhrases = [
      "коробка от",
      "коробка для",
      "коробка под",
      "упаковка от",
      "упаковка для",
      "пустая коробка",
      "только коробка",
      "в наличии только коробка",
      "box от",
      "тара от",
      "родная упаковка"
    ];

    for (var i = 0; i < boxPhrases.length; i++) {
      if (lowerText.indexOf(boxPhrases[i]) !== -1) {
        return true;
      }
    }

    return false;
  }

  /**
   * v3.0.1: Извлекает текст заголовка H1.
   * @returns {string}
   */
  function extractTitleText() {
    try {
      var h1 = document.querySelector("h1");
      if (!h1) return "";
      var text = (h1.innerText || h1.textContent || "").trim();
      return normalizeHomoglyphs(text);
    } catch (e) {
      return "";
    }
  }

  /**
   * v3.0.1: Извлекает текст раздела «Характеристики» Avito.
   * Avito использует разные селекторы — пробуем все.
   * @returns {string}
   */
  function extractParamsText() {
    try {
      // Селекторы для раздела характеристик (пробуем по приоритету)
      var paramsSelectors = [
        '[data-marker="item-view/item-params"]',
        '[data-marker="item-params"]',
        '[class*="item-params"]',
        '[class*="params-list"]',
        '[class*="paramsList"]',
        // Новый формат Avito (2024+)
        '[class*="style-item-params"]',
        '[data-marker="item-view/params"]'
      ];

      for (var i = 0; i < paramsSelectors.length; i++) {
        var el = document.querySelector(paramsSelectors[i]);
        if (el) {
          var text = (el.innerText || el.textContent || "").trim();
          if (text.length > 0 && text.length < 5000) {
            return normalizeHomoglyphs(text);
          }
        }
      }
      return "";
    } catch (e) {
      return "";
    }
  }

  /**
   * v3.0.1: Ищет первое совпадение GPU в тексте по БД.
   * @param {string} text — текст для поиска
   * @param {Array} db — база GPU
   * @param {boolean} checkNegative — проверять негативные контексты
   * @returns {object|null} { model, vram, market } или null
   */
  function findFirstMatch(text, db, checkNegative) {
    if (!text) return null;

    for (var i = 0; i < db.length; i++) {
      var entry = db[i];
      var match = text.match(entry.pattern);
      if (!match) continue;

      if (checkNegative && isNegativeContext(text, match.index)) continue;

      var vram = resolveVram(text, match.index, entry);

      return {
        model: entry.model,
        vram: vram,
        market: entry.market
      };
    }
    return null;
  }

  /**
   * v3.0.1: Sanity-check — если цена критически ниже average_price
   * для найденной модели, пытаемся найти более дешёвую модель в тексте.
   *
   * Сценарий: продавец перечисляет в описании много GPU, включая дорогие.
   * Если в H1/характеристиках не нашли, а в описании нашли RTX 5070
   * при цене 3990 ₽ — это явно не 5070. Пробуем найти GTX 1050 Ti и т.п.
   *
   * @param {object} gpuResult — результат detectGpu()
   * @param {number} price — цена объявления
   * @param {string} pageText — полный текст страницы
   * @returns {object} gpuResult (возможно, изменённый)
   */
  function sanityCheckPrice(gpuResult, price, pageText) {
    try {
      if (!gpuResult || !gpuResult.market || !price || price <= 0) {
        return gpuResult;
      }

      var avg = gpuResult.market.average_price;
      // Если цена больше 30% от average — это разумно, оставляем как есть
      if (price >= avg * 0.30) {
        return gpuResult;
      }

      console.warn("[AGPUH GPU] Sanity check: цена " + price + " << average " + avg +
                   " для " + gpuResult.model + ". Ищем более дешёвую модель.");

      var db = window.AGPUH && window.AGPUH.gpuMarketDb;
      if (!db || !db.length) return gpuResult;

      // Ищем все GPU в тексте, у которых average_price ближе к цене объявления
      var candidates = [];
      for (var i = 0; i < db.length; i++) {
        var entry = db[i];
        var match = pageText.match(entry.pattern);
        if (!match) continue;
        if (isNegativeContext(pageText, match.index)) continue;

        var candidateAvg = entry.market.average_price;
        // Подходят модели, у которых цена попадает в диапазон
        // 0.3×avg ≤ price ≤ 2×avg
        if (price >= candidateAvg * 0.3 && price <= candidateAvg * 2) {
          candidates.push({
            entry: entry,
            matchIndex: match.index,
            // Близость цены к average — чем меньше разница, тем лучше
            distance: Math.abs(price - candidateAvg) / candidateAvg
          });
        }
      }

      if (candidates.length === 0) {
        console.warn("[AGPUH GPU] Sanity check: альтернативы не найдены. Оставляем " + gpuResult.model);
        return gpuResult;
      }

      // Сортируем по близости цены к average
      candidates.sort(function (a, b) {
        return a.distance - b.distance;
      });

      var best = candidates[0].entry;
      console.log("[AGPUH GPU] Sanity check: выбрана более подходящая модель: " +
                  best.model + " (avg=" + best.market.average_price + ")");

      var vram = resolveVram(pageText, candidates[0].matchIndex, best);
      return {
        model: best.model,
        vram: vram,
        market: best.market,
        sanityChecked: true
      };
    } catch (e) {
      console.error("[AGPUH] sanityCheckPrice error:", e);
      return gpuResult;
    }
  }

  /**
   * v3.0.1: Нормализация гомоглифов (вынесена из content.js).
   */
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

  /**
   * Проверяет, находится ли упоминание GPU в негативном контексте
   * (объявление не о видеокарте, а о совместимом с ней товаре).
   * @param {string} text — полный текст страницы
   * @param {number} matchIndex — позиция найденного совпадения GPU
   * @returns {boolean}
   */
  function isNegativeContext(text, matchIndex) {
    // Берём окно в 300 символов вокруг совпадения для проверки контекста.
    var start = Math.max(0, matchIndex - 150);
    var end = Math.min(text.length, matchIndex + 150);
    var context = text.substring(start, end).toLowerCase();

    for (var i = 0; i < NEGATIVE_CONTEXTS.length; i++) {
      if (context.indexOf(NEGATIVE_CONTEXTS[i].toLowerCase()) !== -1) {
        return true;
      }
    }
    return false;
  }

  /**
   * Определяет объём VRAM, используя контекстный подход.
   * Сначала ищет VRAM в окрестности найденной модели GPU,
   * затем — во всём тексте как fallback (но с дополнительными проверками).
   * @param {string} text — полный текст страницы
   * @param {number} matchIndex — позиция совпадения модели GPU
   * @param {object} entry — запись из GPU_MARKET_DB
   * @returns {number} объём VRAM в ГБ
   */
  function resolveVram(text, matchIndex, entry) {
    var defaultVram = entry.vram;

    // Шаг 1: Ищем VRAM в контекстном окне вокруг найденной модели.
    var contextStart = Math.max(0, matchIndex - CONTEXT_RADIUS);
    var contextEnd = Math.min(text.length, matchIndex + CONTEXT_RADIUS);
    var localContext = text.substring(contextStart, contextEnd);

    var localVramMatch = localContext.match(VRAM_REGEX);
    if (localVramMatch) {
      var localVram = parseInt(localVramMatch[1], 10);
      if (isValidVram(localVram, entry)) {
        return localVram;
      }
    }

    // Шаг 2: Fallback — ищем VRAM по всему тексту, но фильтруем
    // совпадения, которые явно относятся к другим компонентам.
    var globalMatches = findAllVramMatches(text);
    for (var i = 0; i < globalMatches.length; i++) {
      var candidate = globalMatches[i];
      // Пропускаем, если рядом с этим совпадением есть маркеры
      // других компонентов (RAM, SSD, HDD).
      if (isVramNearOtherComponent(text, candidate.index)) continue;
      if (isValidVram(candidate.value, entry)) {
        return candidate.value;
      }
    }

    return defaultVram;
  }

  /**
   * Находит все совпадения VRAM-regex в тексте.
   * @param {string} text
   * @returns {Array<{index: number, value: number}>}
   */
  function findAllVramMatches(text) {
    var results = [];
    var regex = new RegExp(VRAM_REGEX.source, "gi");
    var m;
    while ((m = regex.exec(text)) !== null) {
      results.push({
        index: m.index,
        value: parseInt(m[1], 10)
      });
    }
    return results;
  }

  /**
   * Проверяет, находится ли указание объёма рядом с маркером
   * другого компонента (RAM, SSD, HDD и т.п.).
   * BUG-09: Убран маркер «диск» — он совпадает с «дискретная»
   * и другими легитимными контекстами GPU.
   * @param {string} text — полный текст
   * @param {number} vramIndex — позиция совпадения VRAM
   * @returns {boolean}
   */
  function isVramNearOtherComponent(text, vramIndex) {
    var windowSize = 40;
    var start = Math.max(0, vramIndex - windowSize);
    var end = Math.min(text.length, vramIndex + windowSize);
    var window = text.substring(start, end).toLowerCase();

    // BUG-09: «диск» убран — слишком широкий (совпадает с «дискретная»).
    var otherMarkers = [
      "ram", "оператив", "память компьютера", "ddr",
      "ssd", "hdd", "жёстк", "жестк", "накопител",
      "drive"
    ];

    for (var i = 0; i < otherMarkers.length; i++) {
      if (window.indexOf(otherMarkers[i].toLowerCase()) !== -1) {
        return true;
      }
    }
    return false;
  }

  /**
   * Проверяет, является ли указанный объём VRAM допустимым
   * для данной модели GPU.
   * @param {number} vram — проверяемый объём
   * @param {object} entry — запись из БД
   * @returns {boolean}
   */
  function isValidVram(vram, entry) {
    if (isNaN(vram) || vram <= 0 || vram > 48) return false;
    if (entry.variants) {
      return entry.variants.indexOf(vram) !== -1;
    }
    // Для моделей без variants: доверяем, если значение разумно
    // и находится в типичном диапазоне (1-32 ГБ).
    return vram >= 1 && vram <= 32;
  }

  /**
   * Ищет все упоминания GPU-моделей в тексте.
   * Используется anti-scam-engine для H7 (признаки подмены модели).
   * @param {string} pageText
   * @returns {Array<{model: string, index: number}>}
   */
  function findAllGpuModels(pageText) {
    if (!pageText || typeof pageText !== "string") return [];

    var db = window.AGPUH && window.AGPUH.gpuMarketDb;
    if (!db || !db.length) return [];

    var found = [];
    for (var i = 0; i < db.length; i++) {
      var entry = db[i];
      var match = pageText.match(entry.pattern);
      if (match) {
        found.push({
          model: entry.model,
          index: match.index
        });
      }
    }
    return found;
  }

  // Регистрируем модуль
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.gpuDetector = {
    detectGpu: detectGpu,
    findAllGpuModels: findAllGpuModels,
    sanityCheckPrice: sanityCheckPrice,        // v3.0.1
    extractParamsText: extractParamsText,      // v3.0.1
    extractTitleText: extractTitleText,         // v3.0.1
    isBoxListing: isBoxListing                  // v3.0.2
  };
})();
