// =====================================================
//  Avito GPU Helper v2.1.2 - Price Updater
//  Merges local GPU_MARKET_DB with remote market prices
//  from chrome.storage.local.
//  v2.1.2: Stale detection, quality guard, console report.
// =====================================================

(function () {
  "use strict";

  // Storage keys - synced with service-worker.js
  var STORAGE_KEY_PRICES = "agpuh_remote_prices";
  var STORAGE_KEY_UPDATED = "agpuh_remote_updated";

  // Max data age (48 hours)
  var MAX_AGE_MS = 48 * 60 * 60 * 1000;

  // Stale warning threshold (48 hours)
  var STALE_WARNING_MS = 48 * 60 * 60 * 1000;

  /**
   * Loads remote prices from chrome.storage.local and merges
   * with local GPU_MARKET_DB.
   *
   * v2.1.2: Added stale detection and console report.
   *
   * @param {function} callback - receives merged DB
   */
  function loadMergedDatabase(callback) {
    var localDb = window.AGPUH && window.AGPUH.gpuMarketDb;
    if (!localDb || !localDb.length) {
      callback([]);
      return;
    }

    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      callback(localDb);
      return;
    }

    try {
      chrome.storage.local.get([STORAGE_KEY_PRICES, STORAGE_KEY_UPDATED], function (data) {
        try {
          var remotePrices = data[STORAGE_KEY_PRICES];
          var lastUpdated = data[STORAGE_KEY_UPDATED];

          if (!remotePrices || !Array.isArray(remotePrices) || !lastUpdated) {
            console.log("[AGPUH] No remote prices. Using local DB.");
            requestUpdateIfNeeded(null);
            callback(localDb);
            return;
          }

          var age = Date.now() - lastUpdated;
          var ageHours = Math.round(age / 3600000);
          var isStale = age > STALE_WARNING_MS;

          if (isStale) {
            console.warn(
              "[AGPUH] Remote prices are STALE (" + ageHours + "h old). " +
              "Merging + requesting update. Prices may be inaccurate."
            );
          } else {
            console.log("[AGPUH] Remote prices fresh (" + ageHours + "h old). Merging.");
          }

          // Merge remote prices into local DB
          var merged = mergeRemotePrices(localDb, remotePrices);
          requestUpdateIfNeeded(isStale ? "stale" : null);

          // Console report: coverage stats
          printConsoleReport(merged, remotePrices, lastUpdated, ageHours);

          callback(merged);

        } catch (e) {
          console.error("[AGPUH] Error processing remote prices:", e);
          callback(localDb);
        }
      });
    } catch (e) {
      console.warn("[AGPUH] chrome.storage.local access failed:", e.message);
      callback(localDb);
    }
  }

  /**
   * Merges local DB with remote prices.
   * Key: model field (exact match).
   * v2.1.2: Quality guard - skip suspicious remote entries.
   */
  function mergeRemotePrices(localDb, remotePrices) {
    var remoteMap = {};
    for (var r = 0; r < remotePrices.length; r++) {
      var remote = remotePrices[r];
      // v3.1.0 (V-11): Quality guard aligned with fetch_prices.py (MIN_PRICE_FRACTION = 0.30)
      // was 0.40 — caused extension to drop entries the parser accepted
      if (remote.min_safe_price < remote.average_price * 0.30) {
        console.warn(
          "[AGPUH] Quality guard: skipping suspicious remote entry for " +
          remote.model + " (min_safe=" + remote.min_safe_price +
          " < 30% of avg=" + remote.average_price + ")"
        );
        continue;
      }
      remoteMap[remote.model] = remote;
    }

    var merged = [];
    for (var i = 0; i < localDb.length; i++) {
      var entry = localDb[i];
      var remote = remoteMap[entry.model];

      var newEntry = {
        pattern: entry.pattern,
        model: entry.model,
        vram: entry.vram,
        market: entry.market
      };

      if (entry.variants) {
        newEntry.variants = entry.variants;
      }

      if (remote) {
        newEntry.market = {
          average_price: remote.average_price,
          min_safe_price: remote.min_safe_price,
          max_fair_price: remote.max_fair_price,
          scam_threshold: remote.scam_threshold
        };
        newEntry._remoteSource = remote.source || "remote";
        newEntry._remoteUpdated = remote.last_updated || null;
      }

      merged.push(newEntry);
    }

    return merged;
  }

  /**
   * Print console report on price coverage.
   */
  function printConsoleReport(mergedDb, remotePrices, lastUpdated, ageHours) {
    try {
      var total = mergedDb.length;
      var withRemote = 0;
      for (var i = 0; i < mergedDb.length; i++) {
        if (mergedDb[i]._remoteSource) withRemote++;
      }
      var percent = total > 0 ? Math.round((withRemote / total) * 100) : 0;
      var dateStr = new Date(lastUpdated).toLocaleString("ru-RU");

      console.log(
        "[AGPUH] Price coverage: " + withRemote + "/" + total +
        " models (" + percent + "%) with remote prices. " +
        "Updated: " + dateStr + " (" + ageHours + "h ago)."
      );
    } catch (e) {
      // Non-critical
    }
  }

  /**
   * Request update from service worker if needed.
   */
  function requestUpdateIfNeeded(reason) {
    if (!reason) return;

    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "check-update" }, function (response) {
          if (chrome.runtime.lastError) {
            console.warn("[AGPUH] SW not available:", chrome.runtime.lastError.message);
          }
        });
      }
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Returns freshness info for a specific GPU entry.
   * v2.1.2: Added isStale field.
   */
  function getPriceFreshness(gpuEntry) {
    if (!gpuEntry) return { source: "local", updated: null, isStale: false };

    if (gpuEntry._remoteSource) {
      return {
        source: gpuEntry._remoteSource,
        updated: gpuEntry._remoteUpdated,
        isStale: false
      };
    }

    return { source: "local", updated: null, isStale: false };
  }

  /**
   * Returns overall freshness stats for widget footer.
   * v2.1.2: Added isStale and ageHours fields.
   */
  function getOverallFreshness() {
    return new Promise(function (resolve) {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        resolve({ source: "local", updated: null, percentCovered: 0, isStale: false, ageHours: null });
        return;
      }

      chrome.storage.local.get([STORAGE_KEY_PRICES, STORAGE_KEY_UPDATED], function (data) {
        var remotePrices = data[STORAGE_KEY_PRICES];
        var lastUpdated = data[STORAGE_KEY_UPDATED];

        if (!remotePrices || !Array.isArray(remotePrices)) {
          resolve({ source: "local", updated: null, percentCovered: 0, isStale: false, ageHours: null });
          return;
        }

        var localDb = window.AGPUH && window.AGPUH.gpuMarketDb;
        var localCount = localDb ? localDb.length : 0;
        var coveredCount = 0;

        if (localDb) {
          var remoteMap = {};
          for (var r = 0; r < remotePrices.length; r++) {
            remoteMap[remotePrices[r].model] = true;
          }
          for (var i = 0; i < localDb.length; i++) {
            if (remoteMap[localDb[i].model]) coveredCount++;
          }
        }

        var percent = localCount > 0 ? Math.round((coveredCount / localCount) * 100) : 0;
        var age = lastUpdated ? Date.now() - lastUpdated : null;
        var ageHours = age !== null ? Math.round(age / 3600000) : null;
        var isStale = age !== null && age > STALE_WARNING_MS;
        var updatedStr = lastUpdated
          ? new Date(lastUpdated).toLocaleDateString("ru-RU")
          : null;

        resolve({
          source: "remote",
          updated: updatedStr,
          percentCovered: percent,
          isStale: isStale,
          ageHours: ageHours
        });
      });
    });
  }

  // Register module
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.priceUpdater = {
    loadMergedDatabase: loadMergedDatabase,
    mergeRemotePrices: mergeRemotePrices,
    getPriceFreshness: getPriceFreshness,
    getOverallFreshness: getOverallFreshness
  };
})();
