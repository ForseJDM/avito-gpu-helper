// =====================================================
//  Avito GPU Helper v3.0.0 - Popup Script
//  v2.2.0 hotfix2:
//    - Force-update shows result (success/fail)
//    - Coverage: N/99 (N%)
//    - Age: precise minutes
//    - Error display when fetch fails
//    - Clickable history items
//  v3.0.0: Добавлен toggle для notifications (great_deal).
//          При первом включении запрашивает разрешение
//          chrome.notifications.
// =====================================================

(function () {
  "use strict";

  // Total models - read dynamically from storage (set by content.js)
  var TOTAL_GPU_MODELS = 0; // Will be updated from actual DB size

  // Storage keys (synced with service-worker.js)
  var STORAGE_KEY_PRICES = "agpuh_remote_prices";
  var STORAGE_KEY_UPDATED = "agpuh_remote_updated";
  var STORAGE_KEY_SETTINGS = "agpuh_settings";
  var STORAGE_KEY_HISTORY = "agpuh_view_history";
  var STORAGE_KEY_POSITION = "agpuh_widget_position";

  // Default settings
  var DEFAULT_SETTINGS = {
    enabled: true,
    compact: false,
    sticky: false,
    badges: true,
    notificationsGreatDeal: false,  // v3.0.0: по умолчанию ВЫКЛ
    position: "right"
  };

  // ---------------------------------------------------
  //  DOM references
  // ---------------------------------------------------

  var sourceValue = document.getElementById("agpuh-source-value");
  var updatedValue = document.getElementById("agpuh-updated-value");
  var coverageValue = document.getElementById("agpuh-coverage-value");
  var ageValue = document.getElementById("agpuh-age-value");
  var forceUpdateBtn = document.getElementById("agpuh-force-update");
  var enabledToggle = document.getElementById("agpuh-setting-enabled");
  var compactToggle = document.getElementById("agpuh-setting-compact");
  var stickyToggle = document.getElementById("agpuh-setting-sticky");
  var badgesToggle = document.getElementById("agpuh-setting-badges");
  var notificationsToggle = document.getElementById("agpuh-setting-notifications");  // v3.0.0
  var positionSelect = document.getElementById("agpuh-setting-position");
  var historyList = document.getElementById("agpuh-history-list");
  var historyCount = document.getElementById("agpuh-history-count");
  var clearHistoryBtn = document.getElementById("agpuh-clear-history");

  // ---------------------------------------------------
  //  Init
  // ---------------------------------------------------

  loadFreshness();
  loadSettings();
  loadHistory();

  // ---------------------------------------------------
  //  Price freshness info
  // ---------------------------------------------------

  function loadFreshness() {
    try {
      chrome.runtime.sendMessage({ action: "get-prices" }, function (response) {
        if (chrome.runtime.lastError || !response) {
          sourceValue.textContent = "Недоступно";
          return;
        }

        // Source
        sourceValue.textContent = response.prices ? "Удалённый" : "Локальный";

        // Updated date
        if (response.updated) {
          var d = new Date(response.updated);
          updatedValue.textContent = d.toLocaleDateString("ru-RU") +
            " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
        } else {
          updatedValue.textContent = "Никогда";
        }

        // Coverage: show N/total and percentage
        // Use totalLocalModels from DB (dynamic, set by content.js)
        var totalLocal = response.totalLocalModels || TOTAL_GPU_MODELS;
        if (totalLocal > 0) {
          TOTAL_GPU_MODELS = totalLocal; // Cache for later use
        }
        if (response.prices && response.totalModels) {
          var total = totalLocal > 0 ? totalLocal : response.totalModels;
          var pct = Math.round((response.totalModels / total) * 100);
          coverageValue.textContent = response.totalModels + "/" + total + " (" + pct + "%)";
        } else if (response.prices) {
          coverageValue.textContent = response.prices.length + " моделей";
        } else {
          coverageValue.textContent = "—";
        }

        // Age: show precise time
        if (response.ageMinutes !== null) {
          if (response.ageMinutes < 1) {
            ageValue.textContent = "Только что";
            ageValue.classList.add("agpuh-fresh");
          } else if (response.ageMinutes < 60) {
            ageValue.textContent = response.ageMinutes + " мин. назад";
            ageValue.classList.add("agpuh-fresh");
          } else if (response.ageHours < 24) {
            ageValue.textContent = response.ageHours + " ч. назад";
            if (response.isStale) {
              ageValue.classList.add("agpuh-stale");
            } else {
              ageValue.classList.add("agpuh-fresh");
            }
          } else {
            var days = Math.round(response.ageHours / 24);
            ageValue.textContent = days + " дн. назад";
            ageValue.classList.add("agpuh-stale");
          }
        } else {
          ageValue.textContent = "—";
        }

        // Show last fetch error if any
        if (response.lastFetchError) {
          ageValue.textContent += " (" + response.lastFetchError + ")";
          ageValue.classList.add("agpuh-stale");
          ageValue.classList.remove("agpuh-fresh");
        }
      });
    } catch (e) {
      sourceValue.textContent = "Ошибка";
    }
  }

  // ---------------------------------------------------
  //  Force update
  // ---------------------------------------------------

  forceUpdateBtn.addEventListener("click", function () {
    forceUpdateBtn.disabled = true;
    forceUpdateBtn.textContent = "Обновление...";

    chrome.runtime.sendMessage({ action: "force-update" }, function (result) {
      // Wait for storage to update, then refresh display
      setTimeout(function () {
        loadFreshness();
        forceUpdateBtn.disabled = false;

        if (result && result.updated) {
          var msg = result.entries
            ? "OK (" + result.entries + " мод.)"
            : "OK";
          forceUpdateBtn.textContent = "Обновлено! " + msg;
          setTimeout(function () {
            forceUpdateBtn.textContent = "Обновить цены";
          }, 3000);
        } else {
          var errMsg = result && result.error ? result.error : "ошибка";
          forceUpdateBtn.textContent = "Ошибка: " + errMsg;
          setTimeout(function () {
            forceUpdateBtn.textContent = "Обновить цены";
          }, 4000);
        }
      }, 1000);
    });
  });

  // ---------------------------------------------------
  //  Settings
  // ---------------------------------------------------

  function loadSettings() {
    chrome.storage.local.get([STORAGE_KEY_SETTINGS], function (data) {
      var settings = data[STORAGE_KEY_SETTINGS] || DEFAULT_SETTINGS;
      enabledToggle.checked = settings.enabled !== false;
      compactToggle.checked = !!settings.compact;
      stickyToggle.checked = !!settings.sticky;
      badgesToggle.checked = settings.badges !== false;
      notificationsToggle.checked = settings.notificationsGreatDeal === true;  // v3.0.0: по умолчанию ВЫКЛ
      positionSelect.value = settings.position || "right";
    });
  }

  function saveSettings() {
    var settings = {
      enabled: enabledToggle.checked,
      compact: compactToggle.checked,
      sticky: stickyToggle.checked,
      badges: badgesToggle.checked,
      notificationsGreatDeal: notificationsToggle.checked,  // v3.0.0
      position: positionSelect.value
    };
    chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: settings });

    // v3.0.2: Notify all tabs about settings change.
    // ВАЖНО: если активная вкладка не на avito.ru, content script не загружен,
    // и chrome.tabs.sendMessage выбросит "Receiving end does not exist".
    // Оборачиваем в try/catch + проверяем chrome.runtime.lastError.
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (chrome.runtime.lastError) {
          // Non-critical — вкладка может быть chrome:// или другой
          return;
        }
        if (tabs && tabs[0] && tabs[0].id) {
          // Проверяем, что URL — avito.ru (иначе message не нужен)
          var tabUrl = tabs[0].url || "";
          if (tabUrl.indexOf("avito.ru") === -1) {
            return;  // На этой вкладке нет content script
          }
          try {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "settings-changed",
              settings: settings
            }, function () {
              // Игнорируем ошибку — даже если content script не загружен,
              // настройки всё равно сохранены в storage и применятся при
              // следующем открытии avito.ru
              if (chrome.runtime.lastError) {
                // "Receiving end does not exist" — нормально, если content
                // script ещё не загрузился на этой вкладке
              }
            });
          } catch (e) {
            // Non-critical
          }
        }
      });
    } catch (e) {
      // Ignore — настройки сохранены в storage
    }
  }

  // v3.0.0: При включении notifications — запрашиваем разрешение
  notificationsToggle.addEventListener("change", function () {
    if (notificationsToggle.checked) {
      // Запрашиваем разрешение на notifications
      try {
        chrome.permissions.request(
          { permissions: ["notifications"] },
          function (granted) {
            if (!granted) {
              // Если разрешение не дано — откатываем toggle
              notificationsToggle.checked = false;
              saveSettings();
              return;
            }
            // Сохраняем настройки
            saveSettings();

            // Показываем тестовое уведомление
            try {
              chrome.runtime.sendMessage({
                action: "show-notification",
                data: {
                  model: "Тестовое уведомление",
                  price: 0,
                  deviationFormatted: "",
                  url: ""
                }
              }, function () {
                if (chrome.runtime.lastError) {
                  // Non-critical
                }
              });
            } catch (e) {
              // Non-critical
            }
          }
        );
      } catch (e) {
        // Если chrome.permissions недоступен — просто сохраняем настройку
        saveSettings();
      }
    } else {
      saveSettings();
    }
  });

  enabledToggle.addEventListener("change", saveSettings);
  compactToggle.addEventListener("change", saveSettings);
  stickyToggle.addEventListener("change", saveSettings);
  badgesToggle.addEventListener("change", saveSettings);
  positionSelect.addEventListener("change", saveSettings);

  // ---------------------------------------------------
  //  History
  // ---------------------------------------------------

  function loadHistory() {
    chrome.storage.local.get([STORAGE_KEY_HISTORY], function (data) {
      var history = data[STORAGE_KEY_HISTORY] || [];
      historyCount.textContent = history.length;
      renderHistory(history);
    });
  }

  function renderHistory(history) {
    // Safe cleanup: remove children instead of innerHTML
    while (historyList.firstChild) {
      historyList.removeChild(historyList.firstChild);
    }

    if (!history || history.length === 0) {
      var empty = document.createElement("div");
      empty.className = "agpuh-popup-history-empty";
      empty.textContent = "Пока нет просмотренных GPU";
      historyList.appendChild(empty);
      return;
    }

    // Show most recent first
    var items = history.slice().reverse();

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var row = document.createElement("div");
      row.className = "agpuh-popup-history-item";

      // Make clickable if URL exists
      if (item.url) {
        row.classList.add("agpuh-popup-history-clickable");
        row.title = item.url;
        row.setAttribute("data-url", item.url);
        row.addEventListener("click", function (e) {
          var url = this.getAttribute("data-url");
          if (url) {
            chrome.tabs.create({ url: url });
          }
        });
      }

      // Color dot based on price status
      var dot = document.createElement("span");
      dot.className = "agpuh-popup-history-dot";
      var statusColor = item.statusColor || "gray";
      dot.classList.add("agpuh-popup-history-dot-" + statusColor);
      row.appendChild(dot);

      // Info: model + date
      var info = document.createElement("div");
      info.className = "agpuh-popup-history-info";

      var model = document.createElement("div");
      model.className = "agpuh-popup-history-model";
      model.textContent = item.model || "Неизвестно";

      var meta = document.createElement("div");
      meta.className = "agpuh-popup-history-meta";
      meta.textContent = formatDate(item.date);

      info.appendChild(model);
      info.appendChild(meta);
      row.appendChild(info);

      // Price
      if (item.price) {
        var priceEl = document.createElement("div");
        priceEl.className = "agpuh-popup-history-price";
        priceEl.textContent = formatPrice(item.price);
        row.appendChild(priceEl);
      }

      historyList.appendChild(row);
    }
  }

  function formatDate(timestamp) {
    if (!timestamp) return "";
    var d = new Date(timestamp);
    return d.toLocaleDateString("ru-RU") + " " +
      d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function formatPrice(value) {
    return value.toLocaleString("ru-RU") + " \u20BD";
  }

  // Clear history
  clearHistoryBtn.addEventListener("click", function () {
    chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: [] }, function () {
      historyCount.textContent = "0";
      renderHistory([]);
    });
  });

})();
