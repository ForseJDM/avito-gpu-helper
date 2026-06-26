// =====================================================
//  Avito GPU Helper v3.0.0 — Comparison Panel
//  Создаёт блок "Аналогичные объявления" внутри виджета.
//  Показывает топ-5 похожих объявлений с ценами и ссылками.
//  Использует createElement для защиты от XSS.
// =====================================================

(function () {
  "use strict";

  var formatPrice = (window.AGPUH && window.AGPUH.priceDetector)
    ? window.AGPUH.priceDetector.formatPrice
    : function (v) { return v.toLocaleString("ru-RU") + " \u20BD"; };

  /**
   * Создаёт DOM-элемент панели аналогичных объявлений.
   * @param {object} realtimeData — результат realtimePrices.fetchAnalogs()
   * @param {number} currentPrice — цена текущего объявления (для сравнения)
   * @returns {HTMLElement|null}
   */
  function createPanel(realtimeData, currentPrice) {
    try {
      if (!realtimeData || !realtimeData.analogs || realtimeData.analogs.length === 0) {
        return createEmptyPanel(realtimeData);
      }

      var container = el("div", "agpuh-comparison");

      // Заголовок блока
      var header = el("div", "agpuh-comparison-header");
      var title = el("span", "agpuh-comparison-title");
      title.textContent = "Аналогичные объявления";
      header.appendChild(title);

      // Бейдж с количеством
      var countBadge = el("span", "agpuh-comparison-count");
      countBadge.textContent = realtimeData.count;
      header.appendChild(countBadge);

      // Индикатор "realtime"
      var liveBadge = el("span", "agpuh-comparison-live");
      liveBadge.textContent = "● live";
      liveBadge.title = "Данные получены из Avito в реальном времени";
      header.appendChild(liveBadge);

      container.appendChild(header);

      // Сводка по ценам
      if (realtimeData.averagePrice) {
        var summary = el("div", "agpuh-comparison-summary");

        var avgRow = el("div", "agpuh-comparison-summary-row");
        avgRow.appendChild(textSpan("Средняя:", "agpuh-comparison-summary-label"));
        avgRow.appendChild(textSpan(formatPrice(realtimeData.averagePrice), "agpuh-comparison-summary-value"));
        summary.appendChild(avgRow);

        var rangeRow = el("div", "agpuh-comparison-summary-row");
        rangeRow.appendChild(textSpan("Диапазон:", "agpuh-comparison-summary-label"));
        var rangeText = formatPrice(realtimeData.minPrice) + " – " + formatPrice(realtimeData.maxPrice);
        rangeRow.appendChild(textSpan(rangeText, "agpuh-comparison-summary-value"));
        summary.appendChild(rangeRow);

        // Если есть текущая цена — показываем сравнение
        if (currentPrice && currentPrice > 0) {
          var diffRow = el("div", "agpuh-comparison-summary-row");
          diffRow.appendChild(textSpan("Ваша цена:", "agpuh-comparison-summary-label"));
          var diff = currentPrice - realtimeData.averagePrice;
          var diffPct = Math.round((diff / realtimeData.averagePrice) * 100);
          var diffClass = diff < 0 ? "agpuh-comparison-diff-down" :
                          diff > 0 ? "agpuh-comparison-diff-up" : "agpuh-comparison-diff-neutral";
          var diffText = formatPrice(currentPrice) + " (" +
                        (diff < 0 ? "−" : diff > 0 ? "+" : "") +
                        Math.abs(diffPct) + "%)";
          diffRow.appendChild(textSpan(diffText, "agpuh-comparison-summary-value " + diffClass));
          summary.appendChild(diffRow);
        }

        container.appendChild(summary);
      }

      // Список объявлений
      var list = el("div", "agpuh-comparison-list");

      for (var i = 0; i < realtimeData.analogs.length; i++) {
        var analog = realtimeData.analogs[i];
        var card = createAnalogCard(analog, currentPrice);
        if (card) list.appendChild(card);
      }

      container.appendChild(list);

      // Подпись
      var footer = el("div", "agpuh-comparison-footer");
      var footerText = el("span", "agpuh-comparison-footer-text");
      if (realtimeData.fromCache) {
        footerText.textContent = "Из кэша (" + getAgeText(realtimeData.fetchedAt) + " назад)";
      } else {
        footerText.textContent = "Только что получено из Avito";
      }
      footer.appendChild(footerText);
      container.appendChild(footer);

      return container;
    } catch (e) {
      console.error("[AGPUH] createPanel error:", e);
      return null;
    }
  }

  /**
   * Создаёт карточку одного аналога.
   */
  function createAnalogCard(analog, currentPrice) {
    if (!analog || !analog.title || !analog.price) return null;

    var card = el("div", "agpuh-analog");
    if (analog.isCurrent) {
      card.classList.add("agpuh-analog-current");
    }

    // Заголовок-ссылка
    var link = el("a", "agpuh-analog-link");
    if (analog.url) {
      link.href = analog.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    link.textContent = truncate(analog.title, 60);
    link.title = analog.title;
    card.appendChild(link);

    // Цена + сравнение
    var priceRow = el("div", "agpuh-analog-price-row");

    var priceEl = el("span", "agpuh-analog-price");
    priceEl.textContent = formatPrice(analog.price);
    priceRow.appendChild(priceEl);

    // Подсветка разницы с текущей ценой
    if (currentPrice && currentPrice > 0 && !analog.isCurrent) {
      var diff = analog.price - currentPrice;
      if (diff !== 0) {
        var diffEl = el("span", "agpuh-analog-diff");
        var pct = Math.round((diff / currentPrice) * 100);
        if (diff < 0) {
          // Аналог дешевле — это плохо для покупателя
          diffEl.textContent = "−" + Math.abs(pct) + "%";
          diffEl.classList.add("agpuh-analog-diff-cheaper");
          diffEl.title = "Этот аналог дешевле на " + Math.abs(pct) + "%";
        } else {
          // Аналог дороже — текущая цена выгоднее
          diffEl.textContent = "+" + pct + "%";
          diffEl.classList.add("agpuh-analog-diff-expensive");
          diffEl.title = "Этот аналог дороже на " + pct + "%";
        }
        priceRow.appendChild(diffEl);
      }
    }

    if (analog.isCurrent) {
      var currentBadge = el("span", "agpuh-analog-current-badge");
      currentBadge.textContent = "это объявление";
      priceRow.appendChild(currentBadge);
    }

    card.appendChild(priceRow);

    // Локация (если есть)
    if (analog.location) {
      var locEl = el("div", "agpuh-analog-location");
      locEl.textContent = "📍 " + truncate(analog.location, 40);
      card.appendChild(locEl);
    }

    return card;
  }

  /**
   * Создаёт пустую панель (когда аналоги не найдены).
   * v3.0.3: Обновлены сообщения под search-cache подход.
   */
  function createEmptyPanel(realtimeData) {
    var container = el("div", "agpuh-comparison agpuh-comparison-empty");

    var header = el("div", "agpuh-comparison-header");
    var title = el("span", "agpuh-comparison-title");
    title.textContent = "Аналогичные объявления";
    header.appendChild(title);
    container.appendChild(header);

    var msg = el("div", "agpuh-comparison-empty-msg");

    // v3.0.3: Подсказка пользователю — открыть search для заполнения кэша
    if (realtimeData && (realtimeData.source === "cache-empty" || realtimeData.source === "cache-stale")) {
      msg.textContent = "Нет данных об аналогах. Откройте страницу поиска Avito по этой модели — расширение соберёт аналоги автоматически, и они появятся здесь.";
    } else if (realtimeData && realtimeData.source === "no-model") {
      msg.textContent = "Модель не определена — невозможно найти аналоги.";
    } else if (realtimeData && realtimeData.source === "no-storage") {
      msg.textContent = "Хранилище недоступно — аналоги не могут быть сохранены.";
    } else {
      msg.textContent = "Аналоги недоступны. Попробуйте открыть search-страницу по этой модели.";
    }

    container.appendChild(msg);
    return container;
  }

  // ---------------------------------------------------
  //  Утилиты
  // ---------------------------------------------------

  function el(tag, className) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    return element;
  }

  function textSpan(text, className) {
    var span = document.createElement("span");
    if (className) span.className = className;
    span.textContent = text;
    return span;
  }

  function truncate(text, maxLen) {
    if (!text) return "";
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen - 1) + "…";
  }

  function getAgeText(timestamp) {
    if (!timestamp) return "—";
    var seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return seconds + " сек.";
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + " мин.";
    var hours = Math.floor(minutes / 60);
    return hours + " ч.";
  }

  // Регистрируем модуль
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.comparisonPanel = {
    createPanel: createPanel
  };
})();
