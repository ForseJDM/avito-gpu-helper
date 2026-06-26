// =====================================================
//  Avito GPU Helper v2.2.0 - Widget Drag (hotfix3b)
//  v2.2.0 hotfix3b: Fix SyntaxError - { passive: false }
//  cannot be part of var declaration.
// =====================================================

(function () {
  "use strict";

  var STORAGE_KEY_POSITION = "agpuh_widget_position";

  // Track active document-level listeners for cleanup
  var activeListeners = null;

  /**
   * Clean up any previous document-level listeners.
   */
  function cleanupListeners() {
    if (!activeListeners) return;
    try {
      document.removeEventListener("mousemove", activeListeners.mousemove);
      document.removeEventListener("mouseup", activeListeners.mouseup);
      document.removeEventListener("touchmove", activeListeners.touchmove);
      document.removeEventListener("touchend", activeListeners.touchend);
    } catch (e) {
      // Ignore
    }
    activeListeners = null;
  }

  /**
   * Enables drag on widget via specified handle element.
   * v2.2.0: Saves position to chrome.storage.local after drag.
   * hotfix3b: Cleans up previous listeners before adding new ones.
   */
  function enableDrag(widget, handle) {
    // Clean up any previous listeners first (fixes leak on SPA navigation)
    cleanupListeners();

    var isDown = false;
    var offsetX = 0;
    var offsetY = 0;

    // --- Mouse events ---

    handle.addEventListener("mousedown", function (e) {
      if (e.target.classList.contains("agpuh-close")) return;
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
    });

    var mouseMoveHandler = function (e) {
      if (!isDown) return;
      moveTo(e.clientX, e.clientY);
    };

    var mouseUpHandler = function () {
      if (isDown) {
        isDown = false;
        savePosition(widget);
      }
    };

    document.addEventListener("mousemove", mouseMoveHandler);
    document.addEventListener("mouseup", mouseUpHandler);

    // --- Touch events ---

    handle.addEventListener("touchstart", function (e) {
      if (e.target.classList.contains("agpuh-close")) return;
      var touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY);
      e.preventDefault();
    }, { passive: false });

    var touchMoveHandler = function (e) {
      if (!isDown) return;
      var touch = e.touches[0];
      moveTo(touch.clientX, touch.clientY);
      e.preventDefault();
    };

    var touchEndHandler = function () {
      if (isDown) {
        isDown = false;
        savePosition(widget);
      }
    };

    document.addEventListener("touchmove", touchMoveHandler, { passive: false });
    document.addEventListener("touchend", touchEndHandler);

    // Store references for cleanup
    activeListeners = {
      mousemove: mouseMoveHandler,
      mouseup: mouseUpHandler,
      touchmove: touchMoveHandler,
      touchend: touchEndHandler
    };

    // --- Internal functions ---

    function startDrag(clientX, clientY) {
      isDown = true;
      var rect = widget.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      widget.style.right = "auto";
      widget.style.left = rect.left + "px";
      widget.style.top = rect.top + "px";
    }

    function moveTo(clientX, clientY) {
      var newLeft = clientX - offsetX;
      var newTop = clientY - offsetY;

      var widgetWidth = widget.offsetWidth;
      var widgetHeight = widget.offsetHeight;
      var viewWidth = window.innerWidth;
      var viewHeight = window.innerHeight;

      if (newLeft < 0) newLeft = 0;
      if (newLeft + widgetWidth > viewWidth) {
        newLeft = viewWidth - widgetWidth;
      }
      if (newTop < 0) newTop = 0;
      if (newTop + widgetHeight > viewHeight) {
        newTop = viewHeight - widgetHeight;
      }

      widget.style.left = newLeft + "px";
      widget.style.top = newTop + "px";
    }
  }

  /**
   * Saves widget position to chrome.storage.local.
   */
  function savePosition(widget) {
    try {
      var left = widget.style.left;
      var top = widget.style.top;
      if (!left || !top) return;

      var pos = { left: left, top: top };

      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [STORAGE_KEY_POSITION]: pos });
      }
    } catch (e) {
      // Non-critical
    }
  }

  /**
   * Restores saved widget position from chrome.storage.local.
   */
  function restorePosition(widget, callback) {
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
        if (callback) callback();
        return;
      }

      chrome.storage.local.get([STORAGE_KEY_POSITION, "agpuh_settings"], function (data) {
        var settings = data["agpuh_settings"] || {};
        var savedPos = data[STORAGE_KEY_POSITION];

        if (settings.position === "right") {
          widget.style.right = "24px";
          widget.style.left = "auto";
          widget.style.top = "100px";
          if (callback) callback();
          return;
        }

        if (settings.position === "left") {
          widget.style.left = "24px";
          widget.style.right = "auto";
          widget.style.top = "100px";
          if (callback) callback();
          return;
        }

        // Position "saved" - use drag-saved position
        if (savedPos && savedPos.left && savedPos.top) {
          widget.style.right = "auto";
          widget.style.left = savedPos.left;
          widget.style.top = savedPos.top;

          var viewWidth = window.innerWidth;
          var viewHeight = window.innerHeight;
          var leftVal = parseInt(savedPos.left, 10);
          var topVal = parseInt(savedPos.top, 10);

          if (leftVal + widget.offsetWidth > viewWidth) {
            widget.style.left = Math.max(0, viewWidth - widget.offsetWidth) + "px";
          }
          if (topVal + widget.offsetHeight > viewHeight) {
            widget.style.top = Math.max(0, viewHeight - widget.offsetHeight) + "px";
          }
        }

        if (callback) callback();
      });
    } catch (e) {
      if (callback) callback();
    }
  }

  // Register module
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.widgetDrag = {
    enableDrag: enableDrag,
    restorePosition: restorePosition,
    cleanupListeners: cleanupListeners
  };
})();
