// =====================================================
//  Avito GPU Helper v3.0.5 - Widget Renderer
//  Создаёт и вставляет виджет с информацией о GPU,
//  оценкой цены и индикатором риска.
//  Используется createElement вместо innerHTML для защиты от XSS.
//  v2.2.0: Sticky widget, compact mode, position restore.
//  v3.0.0: Блоки продавца, состояния товара, аналогов.
//  v3.0.5: Сворачиваемые секции для продавца и аналогов.
//          По умолчанию обе секции СВЁРНУТЫ — виджет компактный.
//          Клик по заголовку секции разворачивает/сворачивает.
//          Также добавлено max-height для виджета с прокруткой body.
// =====================================================

(function () {
  "use strict";

  var formatPrice = (window.AGPUH && window.AGPUH.priceDetector)
    ? window.AGPUH.priceDetector.formatPrice
    : function (v) { return v.toLocaleString("ru-RU") + " \u20BD"; };

  // Settings cache
  var currentSettings = null;

  // Sticky state
  var stickyScrollHandler = null;

  // Listen for settings changes from popup
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (message && message.action === "settings-changed") {
        currentSettings = message.settings;
        applySettingsToWidget(message.settings);
        sendResponse({ ok: true });
      }
    });
  }

  /**
   * Загружает настройки из storage и применяет к виджету.
   */
  function loadSettings(callback) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      currentSettings = { enabled: true, compact: false, sticky: false, position: "right" };
      if (callback) callback(currentSettings);
      return;
    }
    chrome.storage.local.get(["agpuh_settings"], function (data) {
      currentSettings = data["agpuh_settings"] || { enabled: true, compact: false, sticky: false, position: "right" };
      if (callback) callback(currentSettings);
    });
  }

  /**
   * Применяет настройки к существующему виджету.
   */
  function applySettingsToWidget(settings) {
    var widget = document.getElementById("avito-gpu-helper-widget");
    if (!widget) return;

    // Enabled/disabled
    if (settings.enabled === false) {
      widget.style.display = "none";
    } else {
      widget.style.display = "";
    }

    // Compact mode
    if (settings.compact) {
      widget.classList.add("agpuh-compact");
    } else {
      widget.classList.remove("agpuh-compact");
    }

    // Sticky
    applySticky(widget, settings.sticky);
  }

  /**
   * Настраивает sticky-поведение виджета.
   */
  function applySticky(widget, isSticky) {
    // Remove previous scroll handler if any
    if (stickyScrollHandler) {
      window.removeEventListener("scroll", stickyScrollHandler, true);
      stickyScrollHandler = null;
    }

    if (!isSticky) {
      widget.classList.remove("agpuh-sticky");
      widget.style.top = "";  // Reset to drag-saved or default
      return;
    }

    // Create new scroll handler
    stickyScrollHandler = function (e) {
      var rect = widget.getBoundingClientRect();

      // When widget would scroll off screen, make it sticky at top
      if (rect.top < 10) {
        widget.classList.add("agpuh-sticky");
      } else {
        widget.classList.remove("agpuh-sticky");
      }
    };

    window.addEventListener("scroll", stickyScrollHandler, true);
  }

  /**
   * Создаёт и вставляет виджет на страницу.
   * @param {object} data
   */
  function renderWidget(data) {
    try {
      // Удаляем предыдущий виджет.
      var old = document.getElementById("avito-gpu-helper-widget");
      if (old) {
        old.remove();
        // hotfix3: Clean up drag listeners from previous widget
        if (window.AGPUH && window.AGPUH.widgetDrag && window.AGPUH.widgetDrag.cleanupListeners) {
          window.AGPUH.widgetDrag.cleanupListeners();
        }
      }

      var gpu = data.gpuResult;
      var price = data.priceResult;
      var fairPrice = data.fairPriceResult;
      var scam = data.scamResult;
      var condition = data.conditionResult;  // v3.0.0
      var seller = data.sellerResult;          // v3.0.0
      var realtime = data.realtimeResult;      // v3.0.0 (может прийти позже через updateAnalogs)

      if (!gpu) return;

      // Load settings first, then render
      loadSettings(function (settings) {
        // If widget is disabled, don't render
        if (settings.enabled === false) return;

        // Корневой элемент виджета.
        var widget = document.createElement("div");
        widget.id = "avito-gpu-helper-widget";
        widget.className = "agpuh-widget agpuh-status-" + (fairPrice ? fairPrice.color : "neutral");

        // Apply compact mode
        if (settings.compact) {
          widget.classList.add("agpuh-compact");
        }

        // --- Шапка ---
        var header = el("div", "agpuh-header");
        var logo = el("span", "agpuh-logo");
        logo.textContent = "\uD83D\uDDA5\uFE0F"; // 🖥️
        var title = el("span", "agpuh-title");
        title.textContent = "GPU Helper";
        var closeBtn = el("button", "agpuh-close");
        closeBtn.textContent = "\u00D7"; // ×
        closeBtn.title = "\u0417\u0430\u043A\u0440\u044B\u0442\u044C";
        closeBtn.setAttribute("aria-label", "\u0417\u0430\u043A\u0440\u044B\u0442\u044C");
        header.appendChild(logo);
        header.appendChild(title);
        header.appendChild(closeBtn);

        // --- Тело виджета ---
        var body = el("div", "agpuh-body");

        // Модель GPU.
        body.appendChild(row("\u041C\u043E\u0434\u0435\u043B\u044C GPU", gpu.model));

        // Объём VRAM.
        var vramRow = row("\u041E\u0431\u044A\u0451\u043C VRAM", gpu.vram + " \u0413\u0411");
        vramRow.querySelector(".agpuh-value").classList.add("agpuh-vram");
        body.appendChild(vramRow);

        // Разделитель.
        body.appendChild(el("div", "agpuh-divider"));

        // --- Блок цен ---
        if (price !== null && price > 0) {
          var priceBlock = el("div", "agpuh-price-block");

          var priceCol = el("div", "agpuh-price-col");
          var priceLabel = el("div", "agpuh-price-label");
          priceLabel.textContent = "\u0426\u0435\u043D\u0430";
          var priceValue = el("div", "agpuh-price-value");
          priceValue.textContent = formatPrice(price);
          priceCol.appendChild(priceLabel);
          priceCol.appendChild(priceValue);

          var marketCol = el("div", "agpuh-price-col");
          var marketLabel = el("div", "agpuh-price-label");
          marketLabel.textContent = "\u0420\u044B\u043D\u043E\u043A";
          var marketValue = el("div", "agpuh-price-value agpuh-market-value");
          marketValue.textContent = gpu.market ? formatPrice(gpu.market.average_price) : "\u2014";
          marketCol.appendChild(marketLabel);
          marketCol.appendChild(marketValue);

          priceBlock.appendChild(priceCol);
          priceBlock.appendChild(marketCol);
          body.appendChild(priceBlock);

          // Отклонение от рынка.
          if (fairPrice && fairPrice.deviation !== 0) {
            var deviationRow = el("div", "agpuh-deviation");
            var arrow = fairPrice.deviation < 0 ? "\u25BC" : "\u25B2";
            deviationRow.textContent = arrow + " " + fairPrice.deviationFormatted;
            deviationRow.classList.add(
              fairPrice.deviation < 0 ? "agpuh-deviation-down" : "agpuh-deviation-up"
            );
            body.appendChild(deviationRow);
          }

          // Справочно - цена за 1 ГБ VRAM.
          if (gpu.vram > 0) {
            var perGb = Math.round(price / gpu.vram);
            var perGbRow = row("\u0426\u0435\u043D\u0430 \u0437\u0430 1 \u0413\u0411 VRAM", formatPrice(perGb));
            perGbRow.querySelector(".agpuh-value").classList.add("agpuh-pergb");
            body.appendChild(perGbRow);
          }

        } else {
          // Цена не найдена - всё равно показываем рыночную цену.
          var marketOnlyBlock = el("div", "agpuh-price-block");
          var marketOnlyCol = el("div", "agpuh-price-col agpuh-price-col-wide");
          var marketOnlyLabel = el("div", "agpuh-price-label");
          marketOnlyLabel.textContent = "\u0420\u044B\u043D\u043E\u0447\u043D\u0430\u044F \u0446\u0435\u043D\u0430";
          var marketOnlyValue = el("div", "agpuh-price-value agpuh-market-value");
          marketOnlyValue.textContent = gpu.market ? formatPrice(gpu.market.average_price) : "\u2014";
          marketOnlyCol.appendChild(marketOnlyLabel);
          marketOnlyCol.appendChild(marketOnlyValue);
          marketOnlyBlock.appendChild(marketOnlyCol);
          body.appendChild(marketOnlyBlock);

          var noPrice = el("div", "agpuh-no-price");
          noPrice.textContent = "\u0426\u0435\u043D\u0430 \u043E\u0431\u044A\u044F\u0432\u043B\u0435\u043D\u0438\u044F \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430";
          body.appendChild(noPrice);
        }

        // --- v3.0.0: Блок состояния товара ---
        if (condition && condition.condition !== "unknown") {
          var condBlock = el("div", "agpuh-condition-block agpuh-condition-" + condition.color);
          var condIcon = el("span", "agpuh-condition-icon");
          condIcon.textContent = condition.icon;
          var condText = el("span", "agpuh-condition-text");
          condText.textContent = condition.label;
          condBlock.appendChild(condIcon);
          condBlock.appendChild(condText);
          body.appendChild(condBlock);
        }

        // --- v3.0.0: Блок продавца (v3.0.5: сворачиваемый) ---
        if (seller && seller.reliability !== "unknown") {
          body.appendChild(el("div", "agpuh-divider"));

          // v3.0.5: Сворачиваемая секция продавца
          var sellerSection = el("div", "agpuh-collapsible-section");
          var sellerToggle = el("div", "agpuh-section-toggle");
          var sellerToggleText = el("span", "agpuh-section-toggle-text");
          sellerToggleText.textContent = "Продавец";
          var sellerToggleIcon = el("span", "agpuh-section-toggle-icon");
          sellerToggleIcon.textContent = "▼";
          var sellerToggleBadge = el("span", "agpuh-section-toggle-badge");
          sellerToggleBadge.textContent = seller.reliabilityIcon + " " + seller.reliabilityLabel;
          sellerToggleBadge.classList.add("agpuh-reliability-" + seller.reliabilityColor);
          sellerToggle.appendChild(sellerToggleText);
          sellerToggle.appendChild(sellerToggleBadge);
          sellerToggle.appendChild(sellerToggleIcon);
          sellerSection.appendChild(sellerToggle);

          // Содержимое (скрытое по умолчанию)
          var sellerContent = el("div", "agpuh-section-content");
          sellerContent.style.display = "none";

          var sellerBlock = el("div", "agpuh-seller-block");

          // Имя продавца (если есть) + индикатор надёжности
          var sellerHeader = el("div", "agpuh-seller-header");
          var sellerIcon = el("span", "agpuh-seller-icon");
          sellerIcon.textContent = seller.reliabilityIcon;
          var sellerName = el("span", "agpuh-seller-name");
          sellerName.textContent = seller.name || "Продавец";
          if (seller.profileUrl) {
            var profileLink = el("a", "agpuh-seller-link");
            profileLink.href = seller.profileUrl;
            profileLink.target = "_blank";
            profileLink.rel = "noopener noreferrer";
            profileLink.textContent = "→";
            profileLink.title = "Открыть профиль продавца";
            sellerHeader.appendChild(sellerIcon);
            sellerHeader.appendChild(sellerName);
            sellerHeader.appendChild(profileLink);
          } else {
            sellerHeader.appendChild(sellerIcon);
            sellerHeader.appendChild(sellerName);
          }
          sellerBlock.appendChild(sellerHeader);

          // Бейдж надёжности
          var reliabilityBadge = el("div", "agpuh-seller-reliability agpuh-reliability-" + seller.reliabilityColor);
          reliabilityBadge.textContent = seller.reliabilityIcon + " " + seller.reliabilityLabel;
          sellerBlock.appendChild(reliabilityBadge);

          // Метрики продавца (рейтинг/отзывы/стаж)
          var sellerMetrics = el("div", "agpuh-seller-metrics");

          if (seller.rating !== null) {
            var ratingMetric = el("div", "agpuh-seller-metric");
            var ratingLabel = el("div", "agpuh-seller-metric-label");
            ratingLabel.textContent = "Рейтинг";
            var ratingValue = el("div", "agpuh-seller-metric-value");
            ratingValue.textContent = "★ " + seller.rating.toFixed(1);
            ratingMetric.appendChild(ratingLabel);
            ratingMetric.appendChild(ratingValue);
            sellerMetrics.appendChild(ratingMetric);
          }

          if (seller.reviewsCount !== null) {
            var reviewsMetric = el("div", "agpuh-seller-metric");
            var reviewsLabel = el("div", "agpuh-seller-metric-label");
            reviewsLabel.textContent = "Отзывов";
            var reviewsValue = el("div", "agpuh-seller-metric-value");
            reviewsValue.textContent = String(seller.reviewsCount);
            reviewsMetric.appendChild(reviewsLabel);
            reviewsMetric.appendChild(reviewsValue);
            sellerMetrics.appendChild(reviewsMetric);
          }

          if (seller.stageMonths !== null) {
            var stageMetric = el("div", "agpuh-seller-metric");
            var stageLabel = el("div", "agpuh-seller-metric-label");
            stageLabel.textContent = "На Avito";
            var stageValue = el("div", "agpuh-seller-metric-value");
            stageValue.textContent = seller.stageFormatted;
            stageMetric.appendChild(stageLabel);
            stageMetric.appendChild(stageValue);
            sellerMetrics.appendChild(stageMetric);
          }

          if (sellerMetrics.children.length > 0) {
            sellerBlock.appendChild(sellerMetrics);
          }

          // Предупреждения продавца (если есть)
          if (seller.warnings && seller.warnings.length > 0) {
            var warningsEl = el("div", "agpuh-seller-warnings");
            for (var w = 0; w < seller.warnings.length; w++) {
              var warningEl = el("div", "agpuh-seller-warning");
              warningEl.textContent = "⚠ " + seller.warnings[w];
              warningsEl.appendChild(warningEl);
            }
            sellerBlock.appendChild(warningsEl);
          }

          // v3.0.5: Оборачиваем sellerBlock в sellerContent, sellerSection
          sellerContent.appendChild(sellerBlock);
          sellerSection.appendChild(sellerContent);
          body.appendChild(sellerSection);

          // v3.0.5: Обработчик клика для сворачивания/разворачивания
          (function (toggle, content, icon) {
            toggle.addEventListener("click", function () {
              var isHidden = content.style.display === "none";
              if (isHidden) {
                content.style.display = "";
                icon.textContent = "▲";
                toggle.classList.add("agpuh-section-expanded");
              } else {
                content.style.display = "none";
                icon.textContent = "▼";
                toggle.classList.remove("agpuh-section-expanded");
              }
            });
          })(sellerToggle, sellerContent, sellerToggleIcon);
        }

        // --- v3.0.0: Плейсхолдер для аналогов (v3.0.5: сворачиваемый) ---
        // v3.0.5: Оборачиваем в сворачиваемую секцию — аналоги по умолчанию СВЁРНУТЫ,
        // чтобы виджет не занимал слишком много места.
        var analogsSection = el("div", "agpuh-collapsible-section");
        var analogsToggle = el("div", "agpuh-section-toggle");
        var analogsToggleText = el("span", "agpuh-section-toggle-text");
        analogsToggleText.textContent = "Аналоги";
        var analogsToggleBadge = el("span", "agpuh-section-toggle-badge");
        analogsToggleBadge.textContent = "⏳";
        var analogsToggleIcon = el("span", "agpuh-section-toggle-icon");
        analogsToggleIcon.textContent = "▼";
        analogsToggle.appendChild(analogsToggleText);
        analogsToggle.appendChild(analogsToggleBadge);
        analogsToggle.appendChild(analogsToggleIcon);
        analogsSection.appendChild(analogsToggle);

        // Содержимое (скрытое по умолчанию)
        var analogsContent = el("div", "agpuh-section-content");
        analogsContent.style.display = "none";

        var analogsPlaceholder = el("div", "agpuh-analogs-placeholder");
        analogsPlaceholder.id = "agpuh-analogs-container";
        var loadingEl = el("div", "agpuh-analogs-loading");
        loadingEl.textContent = "⏳ Загрузка аналогов...";
        analogsPlaceholder.appendChild(loadingEl);
        analogsContent.appendChild(analogsPlaceholder);
        analogsSection.appendChild(analogsContent);
        body.appendChild(analogsSection);

        // Если realtime уже доступен — рендерим сразу
        if (realtime && window.AGPUH && window.AGPUH.comparisonPanel) {
          var panel = window.AGPUH.comparisonPanel.createPanel(realtime, price);
          if (panel) {
            analogsPlaceholder.innerHTML = "";
            analogsPlaceholder.appendChild(panel);
            // Обновляем badge количеством аналогов
            if (realtime.count) {
              analogsToggleBadge.textContent = String(realtime.count);
            }
          }
        }

        // v3.0.5: Обработчик клика для сворачивания/разворачивания аналогов
        (function (toggle, content, icon) {
          toggle.addEventListener("click", function () {
            var isHidden = content.style.display === "none";
            if (isHidden) {
              content.style.display = "";
              icon.textContent = "▲";
              toggle.classList.add("agpuh-section-expanded");
            } else {
              content.style.display = "none";
              icon.textContent = "▼";
              toggle.classList.remove("agpuh-section-expanded");
            }
          });
        })(analogsToggle, analogsContent, analogsToggleIcon);

        // Статус-индикатор.
        if (fairPrice) {
          var statusBlock = el("div", "agpuh-status-block agpuh-status-bg-" + fairPrice.color);
          var statusIcon = el("span", "agpuh-status-icon");
          statusIcon.textContent = fairPrice.icon;
          var statusLabel = el("span", "agpuh-status-text");
          statusLabel.textContent = fairPrice.label;
          statusBlock.appendChild(statusIcon);
          statusBlock.appendChild(statusLabel);
          body.appendChild(statusBlock);

          // Рекомендация.
          if (fairPrice.recommendation) {
            var recRow = el("div", "agpuh-recommendation");
            recRow.textContent = fairPrice.recommendation;
            body.appendChild(recRow);
          }
        }

        // Разделитель перед блоком риска.
        if (scam) {
          body.appendChild(el("div", "agpuh-divider"));

          // Блок риска.
          var riskRow = el("div", "agpuh-row");
          var riskLabel = el("span", "agpuh-label");
          riskLabel.textContent = "\u0420\u0438\u0441\u043A \u0441\u043A\u0430\u043C\u0430";
          var riskValue = el("span", "agpuh-value agpuh-risk agpuh-risk-" + scam.riskLevel);
          var riskIcon = scam.riskLevel === "high" ? "\uD83D\uDD34" :
                         scam.riskLevel === "medium" ? "\uD83D\uDFE1" :
                         "\uD83D\uDFE2";
          riskValue.textContent = riskIcon + " " + scam.riskLabel;
          riskRow.appendChild(riskLabel);
          riskRow.appendChild(riskValue);
          body.appendChild(riskRow);

          // Флаги скама.
          if (scam.flags && scam.flags.length > 0) {
            var flagsContainer = el("div", "agpuh-flags");
            for (var i = 0; i < scam.flags.length; i++) {
              var flag = scam.flags[i];
              var flagEl = el("div", "agpuh-flag");
              var flagIcon = el("span", "agpuh-flag-icon");
              flagIcon.textContent = "\u26A0\uFE0F";
              var flagText = el("span", "agpuh-flag-text");
              flagText.textContent = flag.reason;
              flagEl.appendChild(flagIcon);
              flagEl.appendChild(flagText);
              flagsContainer.appendChild(flagEl);
            }
            body.appendChild(flagsContainer);
          } else {
            var noFlags = el("div", "agpuh-no-flags");
            noFlags.textContent = "\u2715 \u043F\u043E\u0434\u043E\u0437\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0445 \u043F\u0440\u0438\u0437\u043D\u0430\u043A\u043E\u0432";
            body.appendChild(noFlags);
          }
        }

        // --- Stale warning ---
        var freshness = data.freshness;
        if (freshness && freshness.isStale) {
          var staleBanner = el("div", "agpuh-stale-banner");
          var staleIcon = el("span", "agpuh-stale-icon");
          staleIcon.textContent = "\u26A0\uFE0F";
          var staleText = el("span", "agpuh-stale-text");
          var ageStr = freshness.ageHours !== null ? freshness.ageHours + " \u0447." : "";
          staleText.textContent = "\u0426\u0435\u043D\u044B \u043C\u043E\u0433\u0443\u0442 \u0431\u044B\u0442\u044C \u0443\u0441\u0442\u0430\u0440\u0435\u0432\u0448\u0438\u043C\u0438 (" + ageStr + " \u043D\u0430\u0437\u0430\u0434)";
          staleBanner.appendChild(staleIcon);
          staleBanner.appendChild(staleText);
          body.appendChild(staleBanner);
        }

        // --- Подвал ---
        var footer = el("div", "agpuh-footer");

        if (freshness && freshness.source === "remote" && freshness.updated) {
          var freshnessRow = el("div", "agpuh-freshness");
          var coverage = freshness.percentCovered > 0
            ? " (" + freshness.percentCovered + "% \u043C\u043E\u0434\u0435\u043B\u0435\u0439)"
            : "";
          freshnessRow.textContent = "\u0426\u0435\u043D\u044B \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u044B: " + freshness.updated + coverage;
          if (freshness.isStale) {
            freshnessRow.classList.add("agpuh-freshness-stale");
          }
          footer.appendChild(freshnessRow);
        }

        var footerText = el("div", "agpuh-footer-text");
        if (scam && scam.riskLevel === "high") {
          footer.classList.add("agpuh-footer-warning");
          footerText.textContent = "\u26A0\uFE0F \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0430!";
        } else {
          footerText.textContent = "\u0414\u0430\u043D\u043D\u044B\u0435 \u043C\u043E\u0433\u0443\u0442 \u0431\u044B\u0442\u044C \u043D\u0435\u0442\u043E\u0447\u043D\u044B\u043C\u0438. \u041F\u0440\u043E\u0432\u0435\u0440\u044F\u0439\u0442\u0435 \u0442\u043E\u0432\u0430\u0440 \u043F\u0435\u0440\u0435\u0434 \u043F\u043E\u043A\u0443\u043F\u043A\u043E\u0439.";
        }
        footer.appendChild(footerText);

        // Собираем виджет.
        widget.appendChild(header);
        widget.appendChild(body);
        widget.appendChild(footer);

        // Вставляем в DOM.
        document.body.appendChild(widget);

        // Восстанавливаем позицию (v2.2.0)
        if (window.AGPUH && window.AGPUH.widgetDrag && window.AGPUH.widgetDrag.restorePosition) {
          window.AGPUH.widgetDrag.restorePosition(widget, function () {
            // После восстановления позиции включаем drag
            window.AGPUH.widgetDrag.enableDrag(widget, header);
          });
        } else {
          // Fallback - just enable drag
          if (window.AGPUH && window.AGPUH.widgetDrag) {
            window.AGPUH.widgetDrag.enableDrag(widget, header);
          }
        }

        // Применяем sticky (v2.2.0)
        applySticky(widget, settings.sticky);

        // Обработчик закрытия.
        closeBtn.addEventListener("click", function () {
          widget.remove();
          // Удаляем sticky scroll handler
          if (stickyScrollHandler) {
            window.removeEventListener("scroll", stickyScrollHandler, true);
            stickyScrollHandler = null;
          }
        });
      });

    } catch (e) {
      console.error("[AGPUH] renderWidget() error:", e);
    }
  }

  // ---------------------------------------------------
  //  Утилиты для создания элементов
  // ---------------------------------------------------

  function el(tag, className) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    return element;
  }

  function row(labelText, valueText) {
    var r = el("div", "agpuh-row");
    var label = el("span", "agpuh-label");
    label.textContent = labelText;
    var value = el("span", "agpuh-value");
    value.textContent = valueText;
    r.appendChild(label);
    r.appendChild(value);
    return r;
  }

  /**
   * v3.0.0: Обновляет блок аналогичных объявлений без перерисовки всего виджета.
   * v3.0.5: Также обновляет badge с количеством аналогов в toggle.
   * Вызывается из content.js после получения realtime-цен.
   * @param {object} realtimeData — результат realtimePrices.fetchAnalogs()
   * @param {number} currentPrice — цена текущего объявления
   */
  function updateAnalogs(realtimeData, currentPrice) {
    try {
      var container = document.getElementById("agpuh-analogs-container");
      if (!container) return;

      // Очищаем плейсхолдер
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      if (!realtimeData || !window.AGPUH.comparisonPanel) {
        var msg = el("div", "agpuh-analogs-loading");
        msg.textContent = "Аналоги недоступны";
        container.appendChild(msg);
        return;
      }

      var panel = window.AGPUH.comparisonPanel.createPanel(realtimeData, currentPrice);
      if (panel) {
        container.appendChild(panel);
      }

      // v3.0.5: Обновляем badge с количеством аналогов в toggle
      var widget = document.getElementById("avito-gpu-helper-widget");
      if (widget) {
        var toggleBadge = widget.querySelector(".agpuh-collapsible-section:last-child .agpuh-section-toggle-badge");
        if (toggleBadge) {
          if (realtimeData.count && realtimeData.count > 0) {
            toggleBadge.textContent = String(realtimeData.count);
            toggleBadge.classList.add("agpuh-toggle-badge-filled");
          } else {
            toggleBadge.textContent = "∅";
            toggleBadge.classList.add("agpuh-toggle-badge-empty");
          }
        }
      }
    } catch (e) {
      console.error("[AGPUH] updateAnalogs error:", e);
    }
  }

  // Регистрируем модуль
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.widgetRenderer = {
    renderWidget: renderWidget,
    updateAnalogs: updateAnalogs
  };
})();
