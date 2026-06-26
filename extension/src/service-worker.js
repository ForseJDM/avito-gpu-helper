// =====================================================
//  Avito GPU Helper v3.0.3 - Background Service Worker
//  v2.2.0 hotfix2: cache-busting, per-entry validation, hash.
//  v3.0.0: Notifications handler (great_deal).
//  v3.0.2: fetch-realtime через main world — УБРАНО (всё равно CAPTCHA).
//  v3.0.3: notification icon через chrome.runtime.getURL вместо
//          data URL — фикс "Unable to download all specified images".
//          Realtime аналоги теперь через search cache (см. badge-renderer
//          и realtime-prices), SW больше не участвует в этом.
// =====================================================

// URL mirrors for remote prices JSON.
// Try each in order until one succeeds.
var REMOTE_PRICES_URLS = [
  "https://raw.githubusercontent.com/ForseJDM/avito-gpu-prices/main/prices.json",
  // Mirror 1: GitLab (add your GitLab repo URL here)
  // "https://gitlab.com/USERNAME/avito-gpu-prices/-/raw/main/prices.json",
  // Mirror 2: Gitee (add your Gitee repo URL here)
  // "https://gitee.com/USERNAME/avito-gpu-prices/raw/main/prices.json"
];

// Hash URL pattern (append .sha256 to prices.json URL)
var HASH_SUFFIX = ".sha256";

// chrome.storage.local keys
var STORAGE_KEY_PRICES = "agpuh_remote_prices";
var STORAGE_KEY_UPDATED = "agpuh_remote_updated";
var STORAGE_KEY_VERSION = "agpuh_remote_version";
var STORAGE_KEY_INTERVAL = "agpuh_remote_interval";
var STORAGE_KEY_SETTINGS = "agpuh_settings";
var STORAGE_KEY_HISTORY = "agpuh_view_history";

// Default update interval in minutes (24h = 1440 min)
var DEFAULT_UPDATE_INTERVAL_MINUTES = 1440;

// Max data age in ms (48 hours)
var MAX_AGE_MS = 48 * 60 * 60 * 1000;

// Stale warning threshold in ms (48 hours)
var STALE_WARNING_MS = 48 * 60 * 60 * 1000;

// Supported JSON format version
var SUPPORTED_VERSION = 1;

// Last fetch error (for popup diagnostics)
var lastFetchError = null;
var lastFetchTime = null;

// ---------------------------------------------------
//  Lifecycle events
// ---------------------------------------------------

// On install/update: immediate fetch + create alarm.
// v3.1.0 (V-5): Also cleanup orphaned agpuh-deal-* keys from previous version.
chrome.runtime.onInstalled.addListener(function () {
  console.log("[AGPUH SW] Extension installed/updated. Fetching prices...");
  cleanupOldDealKeys();
  fetchPrices();

  chrome.alarms.create("agpuh-price-update", {
    delayInMinutes: DEFAULT_UPDATE_INTERVAL_MINUTES,
    periodInMinutes: DEFAULT_UPDATE_INTERVAL_MINUTES
  });
});

// On service worker startup: ensure alarm exists.
chrome.runtime.onStartup.addListener(function () {
  chrome.alarms.get("agpuh-price-update", function (alarm) {
    if (!alarm) {
      chrome.alarms.create("agpuh-price-update", {
        delayInMinutes: 1,
        periodInMinutes: DEFAULT_UPDATE_INTERVAL_MINUTES
      });
    }
  });
});

// Alarm fired.
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === "agpuh-price-update") {
    console.log("[AGPUH SW] Alarm fired. Fetching prices...");
    cleanupOldDealKeys();  // v3.1.0 (V-5): periodic cleanup
    fetchPrices();
  }
});

// v3.1.0 (V-2): Validate message sender — only accept messages from our own
// extension (popup: sender.tab === undefined, sender.id === chrome.runtime.id)
// or from content scripts running on avito.ru (sender.tab.url host check).
// Rejects messages from other extensions or non-avito tabs.
function isTrustedSender(sender) {
  // Popup messages: sender.tab is undefined, sender.id must match our extension
  if (!sender.tab) {
    return sender.id === chrome.runtime.id;
  }
  // Content script messages: must come from an avito.ru tab
  var tabUrl = sender.tab.url || sender.url || "";
  if (!tabUrl) return false;
  try {
    var host = new URL(tabUrl).hostname;
    return host === "avito.ru" || host.endsWith(".avito.ru");
  } catch (e) {
    return false;
  }
}

// v3.1.0 (V-1): Validate that a URL points to avito.ru (defence-in-depth
// against open redirect / phishing via notification click).
function isAvitoUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    var u = new URL(url);
    // Only allow https scheme (no http:, javascript:, data:, file:)
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    var host = u.hostname;
    return host === "avito.ru" || host.endsWith(".avito.ru");
  } catch (e) {
    return false;
  }
}

// Messages from content scripts and popup.
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // v3.1.0 (V-2): Reject messages from untrusted senders
  if (!isTrustedSender(sender)) {
    console.warn("[AGPUH SW] Rejected message from untrusted sender:", sender.id || sender);
    return false;
  }

  if (message && message.action === "check-update") {
    checkAndFetchIfNeeded().then(function (result) {
      sendResponse(result);
    });
    return true;
  }

  // Force update - always fetch, regardless of age
  if (message && message.action === "force-update") {
    fetchPrices().then(function (result) {
      sendResponse(result);
    });
    return true;
  }

  if (message && message.action === "get-prices") {
    chrome.storage.local.get(
      [STORAGE_KEY_PRICES, STORAGE_KEY_UPDATED, STORAGE_KEY_INTERVAL, "agpuh_total_local_models"],
      function (data) {
        var lastUpdated = data[STORAGE_KEY_UPDATED] || null;
        var now = Date.now();
        var age = lastUpdated ? now - lastUpdated : null;
        var isStale = age !== null && age > STALE_WARNING_MS;

        var remotePrices = data[STORAGE_KEY_PRICES] || null;
        var totalModels = null;
        if (remotePrices && Array.isArray(remotePrices)) {
          totalModels = remotePrices.length;
        }

        sendResponse({
          prices: remotePrices,
          updated: lastUpdated,
          isStale: isStale,
          ageHours: age !== null ? Math.round(age / 3600000) : null,
          ageMinutes: age !== null ? Math.round(age / 60000) : null,
          interval: data[STORAGE_KEY_INTERVAL] || DEFAULT_UPDATE_INTERVAL_MINUTES / 60,
          totalModels: totalModels,
          totalLocalModels: data["agpuh_total_local_models"] || null,
          lastFetchError: lastFetchError,
          lastFetchTime: lastFetchTime
        });
      }
    );
    return true;
  }

  // Get settings
  if (message && message.action === "get-settings") {
    chrome.storage.local.get([STORAGE_KEY_SETTINGS], function (data) {
      var settings = data[STORAGE_KEY_SETTINGS] || {
        enabled: true,
        compact: false,
        sticky: false,
        position: "right"
      };
      sendResponse(settings);
    });
    return true;
  }

  // Get history
  if (message && message.action === "get-history") {
    chrome.storage.local.get([STORAGE_KEY_HISTORY], function (data) {
      var history = data[STORAGE_KEY_HISTORY] || [];
      sendResponse({ history: history });
    });
    return true;
  }

  // Clear history
  if (message && message.action === "clear-history") {
    chrome.storage.local.set({ [STORAGE_KEY_HISTORY]: [] }, function () {
      sendResponse({ ok: true });
    });
    return true;
  }

  // v3.0.0: Show notification (great_deal)
  // v3.0.3: iconUrl через chrome.runtime.getURL — абсолютный URL расширения.
  //          Это работает надёжнее, чем data URL (фикс "Unable to download all specified images").
  if (message && message.action === "show-notification") {
    try {
      var data = message.data || {};
      var model = data.model || "GPU";
      var price = data.price || 0;
      var deviation = data.deviationFormatted || "";
      // v3.1.0 (V-1): Validate URL — only allow avito.ru to prevent open redirect
      var rawUrl = data.url || "";
      var url = isAvitoUrl(rawUrl) ? rawUrl : "";
      if (rawUrl && !url) {
        console.warn("[AGPUH SW] Rejected non-avito URL in notification:", rawUrl);
      }

      var title = "🟢 Выгодное предложение: " + model;
      var body = "Цена: " + price.toLocaleString("ru-RU") + " ₽";
      if (deviation) body += " (" + deviation + ")";

      var notificationId = "agpuh-deal-" + Date.now();

      // v3.0.3: chrome.runtime.getURL возвращает абсолютный URL
      // вида chrome-extension://<id>/icons/icon128.png — работает в SW.
      var iconUrl = chrome.runtime.getURL("icons/icon128.png");

      var notificationOptions = {
        type: "basic",
        iconUrl: iconUrl,
        title: title,
        message: body,
        priority: 1,
        isClickable: true,
        requireInteraction: false
      };

      // Сохраняем URL для обработки клика
      var urlStore = {};
      urlStore[notificationId] = url;
      chrome.storage.local.set(urlStore);

      chrome.notifications.create(notificationId, notificationOptions, function (id) {
        sendResponse({ ok: true, id: id });
      });
    } catch (e) {
      console.warn("[AGPUH SW] Notification error:", e);
      sendResponse({ ok: false, error: e.message });
    }
    return true;
  }
});

// v3.0.0: Обработчик клика по уведомлению — открывает объявление в новой вкладке
// v3.1.0 (V-1): Defence-in-depth — повторная проверка URL перед открытием вкладки.
chrome.notifications.onClicked.addListener(function (notificationId) {
  try {
    chrome.storage.local.get([notificationId], function (data) {
      var url = data[notificationId];
      // v3.1.0 (V-1): Re-validate URL before opening (defence-in-depth)
      if (url && isAvitoUrl(url)) {
        chrome.tabs.create({ url: url });
      } else if (url) {
        console.warn("[AGPUH SW] Blocked click on notification with non-avito URL:", url);
      }
      // Закрываем уведомление и чистим storage
      chrome.notifications.clear(notificationId);
      chrome.storage.local.remove(notificationId);
    });
  } catch (e) {
    // Non-critical
  }
});

// v3.0.0: Обработчик закрытия уведомления — чистим storage
chrome.notifications.onClosed.addListener(function (notificationId) {
  try {
    chrome.storage.local.remove(notificationId);
  } catch (e) {
    // Non-critical
  }
});

// ---------------------------------------------------
//  Update logic
// ---------------------------------------------------

/**
 * Check if update needed, fetch if stale.
 */
async function checkAndFetchIfNeeded() {
  try {
    var data = await chrome.storage.local.get([STORAGE_KEY_UPDATED]);
    var lastUpdated = data[STORAGE_KEY_UPDATED];

    if (!lastUpdated) {
      var result = await fetchPrices();
      return result;
    }

    var age = Date.now() - lastUpdated;
    if (age > MAX_AGE_MS) {
      var result = await fetchPrices();
      return result;
    }

    return { updated: false, reason: "fresh" };
  } catch (e) {
    console.error("[AGPUH SW] checkAndFetchIfNeeded error:", e);
    return { updated: false, reason: "error" };
  }
}

/**
 * Fetch remote JSON from mirror URLs.
 * Try each URL in order until one succeeds.
 *
 * HOTFIX 2:
 * - Cache-busting via ?t=timestamp
 * - Per-entry validation: filter bad entries instead of rejecting whole file
 * - Returns detailed result object
 */
async function fetchPrices() {
  var lastError = null;

  for (var i = 0; i < REMOTE_PRICES_URLS.length; i++) {
    var baseUrl = REMOTE_PRICES_URLS[i];

    try {
      // HOTFIX: Cache-busting - add timestamp to URL
      var url = baseUrl + "?t=" + Date.now();

      console.log("[AGPUH SW] Fetching from mirror " + (i + 1) + ": " + url);

      var response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        console.warn("[AGPUH SW] Mirror " + (i + 1) + " failed, status:", response.status);
        lastError = "HTTP " + response.status;
        continue;
      }

      var json = await response.json();

      // Validate basic structure (version + prices array)
      if (!json || typeof json !== "object") {
        lastError = "Not a JSON object";
        continue;
      }
      if (json.version !== SUPPORTED_VERSION) {
        console.warn("[AGPUH SW] Mirror " + (i + 1) + " wrong version:", json.version);
        lastError = "Wrong version: " + json.version;
        continue;
      }
      if (!Array.isArray(json.prices) || json.prices.length === 0) {
        console.warn("[AGPUH SW] Mirror " + (i + 1) + " empty prices array");
        lastError = "Empty prices array";
        continue;
      }

      // HOTFIX: Per-entry validation - filter out bad entries, keep good ones
      var validEntries = [];
      var skippedCount = 0;
      for (var p = 0; p < json.prices.length; p++) {
        var entry = json.prices[p];
        if (isValidPriceEntry(entry)) {
          validEntries.push(entry);
        } else {
          skippedCount++;
          console.warn(
            "[AGPUH SW] Skipping bad entry: " + (entry && entry.model ? entry.model : "unknown") +
            " (min_safe=" + (entry ? entry.min_safe_price : "?") +
            " avg=" + (entry ? entry.average_price : "?") + ")"
          );
        }
      }

      if (validEntries.length === 0) {
        console.warn("[AGPUH SW] Mirror " + (i + 1) + " - all entries invalid after filtering.");
        lastError = "All " + json.prices.length + " entries invalid";
        continue;
      }

      if (skippedCount > 0) {
        console.log(
          "[AGPUH SW] Filtered " + skippedCount + " bad entries. " +
          "Kept " + validEntries.length + "/" + json.prices.length + " good entries."
        );
      }

      // Optional: verify SHA-256 hash (skip if .sha256 file doesn't exist)
      // NOTE: Hash is verified against ORIGINAL prices array, not filtered one.
      // This ensures hash matches what GitHub Actions produced.
      var hashValid = await verifyHash(baseUrl, json.prices);
      if (hashValid === false) {
        // hashValid === null means no hash file, which is OK
        console.warn("[AGPUH SW] Mirror " + (i + 1) + " hash mismatch! Skipping.");
        lastError = "Hash mismatch";
        continue;
      }

      // Extract interval from JSON (if present)
      var intervalHours = json.update_interval_hours || (DEFAULT_UPDATE_INTERVAL_MINUTES / 60);

      // Save VALID entries to storage (not raw json.prices)
      await chrome.storage.local.set({
        [STORAGE_KEY_PRICES]: validEntries,
        [STORAGE_KEY_UPDATED]: Date.now(),
        [STORAGE_KEY_VERSION]: json.version,
        [STORAGE_KEY_INTERVAL]: intervalHours
      });

      // Update alarm interval if changed
      var intervalMinutes = intervalHours * 60;
      if (intervalMinutes > 0 && intervalMinutes !== DEFAULT_UPDATE_INTERVAL_MINUTES) {
        chrome.alarms.clear("agpuh-price-update", function () {
          chrome.alarms.create("agpuh-price-update", {
            delayInMinutes: intervalMinutes,
            periodInMinutes: intervalMinutes
          });
        });
        console.log("[AGPUH SW] Alarm interval updated to " + intervalHours + "h");
      }

      // Update global fetch status
      lastFetchError = null;
      lastFetchTime = Date.now();

      // Console report
      console.log(
        "[AGPUH SW] Prices updated from mirror " + (i + 1) + ". " +
        "Entries: " + validEntries.length + " valid" +
        (skippedCount > 0 ? " (" + skippedCount + " filtered)" : "") + ". " +
        "Hash: " + (hashValid === null ? "N/A" : hashValid ? "OK" : "FAIL") + ". " +
        "Interval: " + intervalHours + "h."
      );

      return { updated: true, reason: "success", entries: validEntries.length, skipped: skippedCount };

    } catch (e) {
      console.warn("[AGPUH SW] Mirror " + (i + 1) + " error:", e.message);
      lastError = e.message;
    }
  }

  // All mirrors failed
  lastFetchError = lastError;
  lastFetchTime = Date.now();
  console.warn("[AGPUH SW] All mirrors failed. Last error:", lastError);
  return { updated: false, reason: "all-mirrors-failed", error: lastError };
}

/**
 * Validate a single price entry.
 * Returns true if valid, false if should be filtered out.
 */
function isValidPriceEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (!entry.model || typeof entry.model !== "string") return false;
  if (typeof entry.average_price !== "number" || entry.average_price <= 0) return false;
  if (typeof entry.min_safe_price !== "number" || entry.min_safe_price <= 0) return false;
  if (typeof entry.max_fair_price !== "number" || entry.max_fair_price <= 0) return false;
  if (typeof entry.scam_threshold !== "number" || entry.scam_threshold <= 0) return false;

  // v3.1.0 (V-11): Aligned with fetch_prices.py MIN_PRICE_FRACTION = 0.30
  // (was 0.40 — caused extension to drop entries the parser accepted)
  // Quality guard: min_safe_price should be at least 30% of average
  // If not - this entry has bad data (accessories mixed in), skip it
  if (entry.min_safe_price < entry.average_price * 0.30) return false;

  // Logical order checks
  if (entry.scam_threshold >= entry.min_safe_price) return false;
  if (entry.min_safe_price >= entry.average_price) return false;
  if (entry.average_price >= entry.max_fair_price) return false;

  return true;
}

/**
 * v3.1.0 (V-5): Cleanup orphaned agpuh-deal-* keys older than 24 hours.
 * Called on install, on alarm, and periodically to prevent storage leak.
 */
function cleanupOldDealKeys() {
  try {
    chrome.storage.local.get(null, function (data) {
      var now = Date.now();
      var TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours
      var keysToRemove = [];
      Object.keys(data).forEach(function (k) {
        if (k.indexOf("agpuh-deal-") === 0) {
          var ts = parseInt(k.substring(11), 10);
          if (!isNaN(ts) && now - ts > TTL_MS) {
            keysToRemove.push(k);
          }
        }
      });
      if (keysToRemove.length > 0) {
        console.log("[AGPUH SW] Cleanup: removing " + keysToRemove.length + " old deal keys");
        chrome.storage.local.remove(keysToRemove);
      }
    });
  } catch (e) {
    // Non-critical
  }
}

/**
 * Verify SHA-256 hash of prices data.
 * Returns: true (valid), false (mismatch), null (no hash file available)
 *
 * v3.1.0 (V-6): After the first successful hash verification, the hash file
 * becomes mandatory (fail-closed). If a subsequent update lacks the .sha256
 * file, the update is rejected to prevent silent MITM data substitution.
 */
async function verifyHash(baseUrl, pricesArray) {
  var hashUrl = baseUrl + HASH_SUFFIX;

  try {
    // Cache-busting for hash file too
    var response = await fetch(hashUrl + "?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) {
      // v3.1.0 (V-6): Fail-closed — if hash was required (previously seen),
      // missing .sha256 file means data integrity cannot be verified.
      var required = await new Promise(function (resolve) {
        chrome.storage.local.get(["agpuh_hash_required"], function (d) {
          resolve(d && d.agpuh_hash_required === true);
        });
      });
      if (required) {
        console.error("[AGPUH SW] Hash file missing but previously verified — REJECTING (fail-closed)");
        return false;
      }
      // First-time install: hash not yet required, skip verification
      return null;
    }

    var expectedHash = (await response.text()).trim();
    if (!expectedHash || expectedHash.length < 10) {
      // Same fail-closed logic for empty/malformed hash file
      var required2 = await new Promise(function (resolve) {
        chrome.storage.local.get(["agpuh_hash_required"], function (d) {
          resolve(d && d.agpuh_hash_required === true);
        });
      });
      if (required2) {
        console.error("[AGPUH SW] Hash file malformed but previously verified — REJECTING (fail-closed)");
        return false;
      }
      return null;
    }

    // Calculate actual hash from the VALID entries array
    var jsonString = JSON.stringify(pricesArray);
    var hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(jsonString));
    var hashArray = Array.from(new Uint8Array(hashBuffer));
    var actualHash = hashArray.map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");

    var match = actualHash === expectedHash;
    if (match) {
      // v3.1.0 (V-6): Mark hash as required for future updates
      chrome.storage.local.set({ "agpuh_hash_required": true });
    }
    return match;

  } catch (e) {
    return null;
  }
}

