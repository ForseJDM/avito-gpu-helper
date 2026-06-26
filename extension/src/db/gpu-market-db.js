// =====================================================
//  Avito GPU Helper v2 — GPU Market Database
//  База данных GPU-моделей с рыночными ценами и порогами.
//  Используется gpu-detector.js, fair-price-engine.js
//  и anti-scam-engine.js.
// =====================================================

(function () {
  "use strict";

  // Каждая запись содержит:
  //   pattern       — regex для поиска модели в тексте
  //   model         — человекочитаемое название модели
  //   vram          — объём видеопамяти в ГБ (по умолчанию)
  //   variants      — (optional) список допустимых объёмов VRAM
  //   market:
  //     average_price    — средняя рыночная цена (₽)
  //     min_safe_price   — нижняя граница безопасной цены (~75% average)
  //     max_fair_price   — верхняя граница справедливой цены (~125% average)
  //     scam_threshold   — цена ниже этого = скам с вероятностью >95% (~42% average)

  var GPU_MARKET_DB = [
    // ---------- NVIDIA GeForce RTX 50 серии ----------
    {
      pattern: /rtx[\s\-]*5090/i,
      model: "NVIDIA GeForce RTX 5090",
      vram: 32,
      market: { average_price: 320000, min_safe_price: 250000, max_fair_price: 380000, scam_threshold: 135000 }
    },
    {
      pattern: /rtx[\s\-]*5080/i,
      model: "NVIDIA GeForce RTX 5080",
      vram: 16,
      market: { average_price: 180000, min_safe_price: 140000, max_fair_price: 215000, scam_threshold: 75000 }
    },
    {
      pattern: /rtx[\s\-]*5070[\s\-]*ti/i,
      model: "NVIDIA GeForce RTX 5070 Ti",
      vram: 16,
      market: { average_price: 120000, min_safe_price: 94000, max_fair_price: 145000, scam_threshold: 50000 }
    },
    {
      pattern: /rtx[\s\-]*5070(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce RTX 5070",
      vram: 12,
      market: { average_price: 85000, min_safe_price: 66000, max_fair_price: 102000, scam_threshold: 36000 }
    },
    {
      pattern: /rtx[\s\-]*5060[\s\-]*ti/i,
      model: "NVIDIA GeForce RTX 5060 Ti",
      vram: 16,
      market: { average_price: 70000, min_safe_price: 55000, max_fair_price: 84000, scam_threshold: 29000 }
    },
    {
      pattern: /rtx[\s\-]*5060(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce RTX 5060",
      vram: 8,
      market: { average_price: 50000, min_safe_price: 39000, max_fair_price: 60000, scam_threshold: 21000 }
    },

    // ---------- NVIDIA GeForce RTX 40 серии ----------
    {
      pattern: /rtx[\s\-]*4090/i,
      model: "NVIDIA GeForce RTX 4090",
      vram: 24,
      market: { average_price: 210000, min_safe_price: 165000, max_fair_price: 255000, scam_threshold: 88000 }
    },
    {
      pattern: /rtx[\s\-]*4080[\s\-]*super/i,
      model: "NVIDIA GeForce RTX 4080 SUPER",
      vram: 16,
      market: { average_price: 135000, min_safe_price: 105000, max_fair_price: 162000, scam_threshold: 57000 }
    },
    {
      pattern: /rtx[\s\-]*4080(?![\s\-]*super)/i,
      model: "NVIDIA GeForce RTX 4080",
      vram: 16,
      market: { average_price: 120000, min_safe_price: 94000, max_fair_price: 144000, scam_threshold: 50000 }
    },
    {
      pattern: /rtx[\s\-]*4070[\s\-]*ti[\s\-]*super/i,
      model: "NVIDIA GeForce RTX 4070 Ti SUPER",
      vram: 16,
      market: { average_price: 100000, min_safe_price: 78000, max_fair_price: 120000, scam_threshold: 42000 }
    },
    {
      pattern: /rtx[\s\-]*4070[\s\-]*ti(?![\s\-]*super)/i,
      model: "NVIDIA GeForce RTX 4070 Ti",
      vram: 12,
      market: { average_price: 75000, min_safe_price: 59000, max_fair_price: 90000, scam_threshold: 32000 }
    },
    {
      pattern: /rtx[\s\-]*4070[\s\-]*super/i,
      model: "NVIDIA GeForce RTX 4070 SUPER",
      vram: 12,
      market: { average_price: 68000, min_safe_price: 53000, max_fair_price: 82000, scam_threshold: 29000 }
    },
    {
      pattern: /rtx[\s\-]*4070(?![\s\-]*(ti|super))/i,
      model: "NVIDIA GeForce RTX 4070",
      vram: 12,
      market: { average_price: 48000, min_safe_price: 38000, max_fair_price: 58000, scam_threshold: 22000 }
    },
    {
      pattern: /rtx[\s\-]*4060[\s\-]*ti/i,
      model: "NVIDIA GeForce RTX 4060 Ti",
      vram: 8,
      variants: [8, 16],
      market: { average_price: 42000, min_safe_price: 33000, max_fair_price: 50000, scam_threshold: 18000 }
    },
    {
      pattern: /rtx[\s\-]*4060(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce RTX 4060",
      vram: 8,
      market: { average_price: 33000, min_safe_price: 26000, max_fair_price: 40000, scam_threshold: 15000 }
    },

    // ---------- NVIDIA GeForce RTX 30 серии ----------
    {
      pattern: /rtx[\s\-]*3090[\s\-]*ti/i,
      model: "NVIDIA GeForce RTX 3090 Ti",
      vram: 24,
      market: { average_price: 85000, min_safe_price: 66000, max_fair_price: 102000, scam_threshold: 36000 }
    },
    {
      pattern: /rtx[\s\-]*3090(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce RTX 3090",
      vram: 24,
      market: { average_price: 70000, min_safe_price: 55000, max_fair_price: 84000, scam_threshold: 29000 }
    },
    {
      pattern: /rtx[\s\-]*3080[\s\-]*ti/i,
      model: "NVIDIA GeForce RTX 3080 Ti",
      vram: 12,
      market: { average_price: 58000, min_safe_price: 45000, max_fair_price: 70000, scam_threshold: 24000 }
    },
    {
      pattern: /rtx[\s\-]*3080(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce RTX 3080",
      vram: 10,
      variants: [10, 12],
      market: { average_price: 42000, min_safe_price: 33000, max_fair_price: 50000, scam_threshold: 18000 }
    },
    {
      pattern: /rtx[\s\-]*3070[\s\-]*ti/i,
      model: "NVIDIA GeForce RTX 3070 Ti",
      vram: 8,
      market: { average_price: 35000, min_safe_price: 27000, max_fair_price: 42000, scam_threshold: 15000 }
    },
    {
      pattern: /rtx[\s\-]*3070(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce RTX 3070",
      vram: 8,
      market: { average_price: 28000, min_safe_price: 22000, max_fair_price: 34000, scam_threshold: 12000 }
    },
    {
      pattern: /rtx[\s\-]*3060[\s\-]*ti/i,
      model: "NVIDIA GeForce RTX 3060 Ti",
      vram: 8,
      market: { average_price: 24000, min_safe_price: 19000, max_fair_price: 29000, scam_threshold: 10000 }
    },
    {
      pattern: /rtx[\s\-]*3060(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce RTX 3060",
      vram: 12,
      variants: [8, 12],
      market: { average_price: 24000, min_safe_price: 18000, max_fair_price: 30000, scam_threshold: 10000 }
    },
    {
      pattern: /rtx[\s\-]*3050/i,
      model: "NVIDIA GeForce RTX 3050",
      vram: 8,
      variants: [6, 8],
      market: { average_price: 16000, min_safe_price: 12000, max_fair_price: 19000, scam_threshold: 7000 }
    },

    // ---------- NVIDIA GeForce RTX 20 серии ----------
    {
      pattern: /rtx[\s\-]*2080[\s\-]*ti/i,
      model: "NVIDIA GeForce RTX 2080 Ti",
      vram: 11,
      market: { average_price: 25000, min_safe_price: 19000, max_fair_price: 30000, scam_threshold: 10500 }
    },
    {
      pattern: /rtx[\s\-]*2080[\s\-]*super/i,
      model: "NVIDIA GeForce RTX 2080 SUPER",
      vram: 8,
      market: { average_price: 18000, min_safe_price: 14000, max_fair_price: 22000, scam_threshold: 7500 }
    },
    {
      pattern: /rtx[\s\-]*2080(?![\s\-]*(super|ti))/i,
      model: "NVIDIA GeForce RTX 2080",
      vram: 8,
      market: { average_price: 16000, min_safe_price: 12000, max_fair_price: 19000, scam_threshold: 6700 }
    },
    {
      pattern: /rtx[\s\-]*2070[\s\-]*super/i,
      model: "NVIDIA GeForce RTX 2070 SUPER",
      vram: 8,
      market: { average_price: 15000, min_safe_price: 12000, max_fair_price: 18000, scam_threshold: 6300 }
    },
    {
      pattern: /rtx[\s\-]*2070(?![\s\-]*super)/i,
      model: "NVIDIA GeForce RTX 2070",
      vram: 8,
      market: { average_price: 13000, min_safe_price: 10000, max_fair_price: 16000, scam_threshold: 5500 }
    },
    {
      pattern: /rtx[\s\-]*2060[\s\-]*super/i,
      model: "NVIDIA GeForce RTX 2060 SUPER",
      vram: 8,
      market: { average_price: 12000, min_safe_price: 9000, max_fair_price: 14000, scam_threshold: 5000 }
    },
    {
      pattern: /rtx[\s\-]*2060(?![\s\-]*super)/i,
      model: "NVIDIA GeForce RTX 2060",
      vram: 6,
      variants: [6, 12],
      market: { average_price: 10000, min_safe_price: 7500, max_fair_price: 12000, scam_threshold: 4200 }
    },

    // ---------- NVIDIA GeForce GTX 16 серии ----------
    {
      pattern: /gtx[\s\-]*1660[\s\-]*ti/i,
      model: "NVIDIA GeForce GTX 1660 Ti",
      vram: 6,
      market: { average_price: 9000, min_safe_price: 7000, max_fair_price: 11000, scam_threshold: 3800 }
    },
    {
      pattern: /gtx[\s\-]*1660[\s\-]*super/i,
      model: "NVIDIA GeForce GTX 1660 SUPER",
      vram: 6,
      market: { average_price: 8000, min_safe_price: 6000, max_fair_price: 9500, scam_threshold: 3400 }
    },
    {
      pattern: /gtx[\s\-]*1660(?![\s\-]*(ti|super))/i,
      model: "NVIDIA GeForce GTX 1660",
      vram: 6,
      market: { average_price: 7000, min_safe_price: 5500, max_fair_price: 8500, scam_threshold: 2900 }
    },
    {
      pattern: /gtx[\s\-]*1650[\s\-]*super/i,
      model: "NVIDIA GeForce GTX 1650 SUPER",
      vram: 4,
      market: { average_price: 6000, min_safe_price: 4500, max_fair_price: 7200, scam_threshold: 2500 }
    },
    {
      pattern: /gtx[\s\-]*1650(?![\s\-]*super)/i,
      model: "NVIDIA GeForce GTX 1650",
      vram: 4,
      market: { average_price: 5000, min_safe_price: 3800, max_fair_price: 6000, scam_threshold: 2100 }
    },
    {
      pattern: /gtx[\s\-]*1630/i,
      model: "NVIDIA GeForce GTX 1630",
      vram: 4,
      market: { average_price: 4500, min_safe_price: 3500, max_fair_price: 5500, scam_threshold: 1900 }
    },

    // ---------- NVIDIA GeForce GTX 10 серии ----------
    {
      pattern: /gtx[\s\-]*1080[\s\-]*ti/i,
      model: "NVIDIA GeForce GTX 1080 Ti",
      vram: 11,
      market: { average_price: 14000, min_safe_price: 11000, max_fair_price: 17000, scam_threshold: 5900 }
    },
    {
      pattern: /gtx[\s\-]*1080(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce GTX 1080",
      vram: 8,
      market: { average_price: 10000, min_safe_price: 7500, max_fair_price: 12000, scam_threshold: 4200 }
    },
    {
      pattern: /gtx[\s\-]*1070[\s\-]*ti/i,
      model: "NVIDIA GeForce GTX 1070 Ti",
      vram: 8,
      market: { average_price: 9000, min_safe_price: 7000, max_fair_price: 11000, scam_threshold: 3800 }
    },
    {
      pattern: /gtx[\s\-]*1070(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce GTX 1070",
      vram: 8,
      market: { average_price: 7500, min_safe_price: 5800, max_fair_price: 9000, scam_threshold: 3200 }
    },
    {
      pattern: /gtx[\s\-]*1060/i,
      model: "NVIDIA GeForce GTX 1060",
      vram: 6,
      variants: [3, 6],
      market: { average_price: 5500, min_safe_price: 4200, max_fair_price: 6500, scam_threshold: 2300 }
    },
    {
      pattern: /gtx[\s\-]*1050[\s\-]*ti/i,
      model: "NVIDIA GeForce GTX 1050 Ti",
      vram: 4,
      market: { average_price: 4000, min_safe_price: 3000, max_fair_price: 4800, scam_threshold: 1700 }
    },
    {
      pattern: /gtx[\s\-]*1050(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce GTX 1050",
      vram: 2,
      market: { average_price: 3000, min_safe_price: 2300, max_fair_price: 3600, scam_threshold: 1300 }
    },

    // ---------- NVIDIA GeForce GTX 9xx / 7xx серии ----------
    {
      pattern: /gtx[\s\-]*980[\s\-]*ti/i,
      model: "NVIDIA GeForce GTX 980 Ti",
      vram: 6,
      market: { average_price: 6000, min_safe_price: 4500, max_fair_price: 7200, scam_threshold: 2500 }
    },
    {
      pattern: /gtx[\s\-]*980(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce GTX 980",
      vram: 4,
      market: { average_price: 4500, min_safe_price: 3500, max_fair_price: 5500, scam_threshold: 1900 }
    },
    {
      pattern: /gtx[\s\-]*970/i,
      model: "NVIDIA GeForce GTX 970",
      vram: 4,
      market: { average_price: 3500, min_safe_price: 2700, max_fair_price: 4200, scam_threshold: 1500 }
    },
    {
      pattern: /gtx[\s\-]*960/i,
      model: "NVIDIA GeForce GTX 960",
      vram: 2,
      variants: [2, 4],
      market: { average_price: 2500, min_safe_price: 1900, max_fair_price: 3000, scam_threshold: 1050 }
    },
    {
      pattern: /gtx[\s\-]*950/i,
      model: "NVIDIA GeForce GTX 950",
      vram: 2,
      market: { average_price: 2000, min_safe_price: 1500, max_fair_price: 2400, scam_threshold: 840 }
    },
    {
      pattern: /gtx[\s\-]*780[\s\-]*ti/i,
      model: "NVIDIA GeForce GTX 780 Ti",
      vram: 3,
      market: { average_price: 3000, min_safe_price: 2300, max_fair_price: 3600, scam_threshold: 1300 }
    },
    {
      pattern: /gtx[\s\-]*780(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce GTX 780",
      vram: 3,
      market: { average_price: 2500, min_safe_price: 1900, max_fair_price: 3000, scam_threshold: 1050 }
    },
    {
      pattern: /gtx[\s\-]*770/i,
      model: "NVIDIA GeForce GTX 770",
      vram: 2,
      variants: [2, 4],
      market: { average_price: 2000, min_safe_price: 1500, max_fair_price: 2400, scam_threshold: 840 }
    },
    {
      pattern: /gtx[\s\-]*760/i,
      model: "NVIDIA GeForce GTX 760",
      vram: 2,
      variants: [2, 4],
      market: { average_price: 1500, min_safe_price: 1100, max_fair_price: 1800, scam_threshold: 630 }
    },
    {
      pattern: /gtx[\s\-]*750[\s\-]*ti/i,
      model: "NVIDIA GeForce GTX 750 Ti",
      vram: 2,
      market: { average_price: 1500, min_safe_price: 1100, max_fair_price: 1800, scam_threshold: 630 }
    },
    {
      pattern: /gtx[\s\-]*750(?![\s\-]*ti)/i,
      model: "NVIDIA GeForce GTX 750",
      vram: 1,
      market: { average_price: 1000, min_safe_price: 750, max_fair_price: 1200, scam_threshold: 420 }
    },

    // ---------- NVIDIA Titan ----------
    {
      pattern: /titan[\s\-]*rtx/i,
      model: "NVIDIA Titan RTX",
      vram: 24,
      market: { average_price: 90000, min_safe_price: 70000, max_fair_price: 108000, scam_threshold: 38000 }
    },
    {
      pattern: /titan[\s\-]*v(?![\s\-]*(p|x))/i,
      model: "NVIDIA Titan V",
      vram: 12,
      market: { average_price: 50000, min_safe_price: 39000, max_fair_price: 60000, scam_threshold: 21000 }
    },
    {
      pattern: /titan[\s\-]*xp/i,
      model: "NVIDIA Titan Xp",
      vram: 12,
      market: { average_price: 22000, min_safe_price: 17000, max_fair_price: 26000, scam_threshold: 9200 }
    },
    {
      pattern: /titan[\s\-]*x(?![\s\-]*p)/i,
      model: "NVIDIA Titan X",
      vram: 12,
      market: { average_price: 18000, min_safe_price: 14000, max_fair_price: 22000, scam_threshold: 7500 }
    },

    // ---------- AMD Radeon RX 7000 серии ----------
    {
      pattern: /rx[\s\-]*7900[\s\-]*xtx/i,
      model: "AMD Radeon RX 7900 XTX",
      vram: 24,
      market: { average_price: 105000, min_safe_price: 82000, max_fair_price: 126000, scam_threshold: 44000 }
    },
    {
      pattern: /rx[\s\-]*7900[\s\-]*xt(?![\s\-]*x)/i,
      model: "AMD Radeon RX 7900 XT",
      vram: 20,
      market: { average_price: 80000, min_safe_price: 62000, max_fair_price: 96000, scam_threshold: 34000 }
    },
    {
      pattern: /rx[\s\-]*7900[\s\-]*gre/i,
      model: "AMD Radeon RX 7900 GRE",
      vram: 16,
      market: { average_price: 68000, min_safe_price: 53000, max_fair_price: 82000, scam_threshold: 29000 }
    },
    {
      pattern: /rx[\s\-]*7800[\s\-]*xt/i,
      model: "AMD Radeon RX 7800 XT",
      vram: 16,
      market: { average_price: 58000, min_safe_price: 45000, max_fair_price: 70000, scam_threshold: 24000 }
    },
    {
      pattern: /rx[\s\-]*7700[\s\-]*xt/i,
      model: "AMD Radeon RX 7700 XT",
      vram: 12,
      market: { average_price: 47000, min_safe_price: 37000, max_fair_price: 56000, scam_threshold: 20000 }
    },
    {
      pattern: /rx[\s\-]*7600[\s\-]*xt/i,
      model: "AMD Radeon RX 7600 XT",
      vram: 16,
      market: { average_price: 38000, min_safe_price: 30000, max_fair_price: 46000, scam_threshold: 16000 }
    },
    {
      pattern: /rx[\s\-]*7600(?![\s\-]*xt)/i,
      model: "AMD Radeon RX 7600",
      vram: 8,
      market: { average_price: 28000, min_safe_price: 22000, max_fair_price: 34000, scam_threshold: 12000 }
    },

    // ---------- AMD Radeon RX 6000 серии ----------
    {
      pattern: /rx[\s\-]*6950[\s\-]*xt/i,
      model: "AMD Radeon RX 6950 XT",
      vram: 16,
      market: { average_price: 50000, min_safe_price: 39000, max_fair_price: 60000, scam_threshold: 21000 }
    },
    {
      pattern: /rx[\s\-]*6900[\s\-]*xt/i,
      model: "AMD Radeon RX 6900 XT",
      vram: 16,
      market: { average_price: 45000, min_safe_price: 35000, max_fair_price: 54000, scam_threshold: 19000 }
    },
    {
      pattern: /rx[\s\-]*6800[\s\-]*xt/i,
      model: "AMD Radeon RX 6800 XT",
      vram: 16,
      market: { average_price: 40000, min_safe_price: 31000, max_fair_price: 48000, scam_threshold: 17000 }
    },
    {
      pattern: /rx[\s\-]*6800(?![\s\-]*xt)/i,
      model: "AMD Radeon RX 6800",
      vram: 16,
      market: { average_price: 33000, min_safe_price: 26000, max_fair_price: 40000, scam_threshold: 14000 }
    },
    {
      pattern: /rx[\s\-]*6750[\s\-]*xt/i,
      model: "AMD Radeon RX 6750 XT",
      vram: 12,
      market: { average_price: 32000, min_safe_price: 25000, max_fair_price: 38000, scam_threshold: 13000 }
    },
    {
      pattern: /rx[\s\-]*6700[\s\-]*xt/i,
      model: "AMD Radeon RX 6700 XT",
      vram: 12,
      market: { average_price: 30000, min_safe_price: 23000, max_fair_price: 37000, scam_threshold: 13000 }
    },
    {
      pattern: /rx[\s\-]*6700(?![\s\-]*xt)/i,
      model: "AMD Radeon RX 6700",
      vram: 10,
      market: { average_price: 25000, min_safe_price: 19000, max_fair_price: 30000, scam_threshold: 10500 }
    },
    {
      pattern: /rx[\s\-]*6650[\s\-]*xt/i,
      model: "AMD Radeon RX 6650 XT",
      vram: 8,
      market: { average_price: 24000, min_safe_price: 19000, max_fair_price: 29000, scam_threshold: 10000 }
    },
    {
      pattern: /rx[\s\-]*6600[\s\-]*xt/i,
      model: "AMD Radeon RX 6600 XT",
      vram: 8,
      market: { average_price: 22000, min_safe_price: 17000, max_fair_price: 26000, scam_threshold: 9200 }
    },
    {
      pattern: /rx[\s\-]*6600(?![\s\-]*xt)/i,
      model: "AMD Radeon RX 6600",
      vram: 8,
      market: { average_price: 20000, min_safe_price: 15000, max_fair_price: 25000, scam_threshold: 8000 }
    },
    {
      pattern: /rx[\s\-]*6500[\s\-]*xt/i,
      model: "AMD Radeon RX 6500 XT",
      vram: 4,
      market: { average_price: 10000, min_safe_price: 7500, max_fair_price: 12000, scam_threshold: 4200 }
    },
    {
      pattern: /rx[\s\-]*6400/i,
      model: "AMD Radeon RX 6400",
      vram: 4,
      market: { average_price: 8000, min_safe_price: 6000, max_fair_price: 9500, scam_threshold: 3400 }
    },

    // ---------- AMD Radeon RX 5000 серии ----------
    {
      pattern: /rx[\s\-]*5700[\s\-]*xt/i,
      model: "AMD Radeon RX 5700 XT",
      vram: 8,
      market: { average_price: 14000, min_safe_price: 11000, max_fair_price: 17000, scam_threshold: 5900 }
    },
    {
      pattern: /rx[\s\-]*5700(?![\s\-]*xt)/i,
      model: "AMD Radeon RX 5700",
      vram: 8,
      market: { average_price: 12000, min_safe_price: 9000, max_fair_price: 14000, scam_threshold: 5000 }
    },
    {
      pattern: /rx[\s\-]*5600[\s\-]*xt/i,
      model: "AMD Radeon RX 5600 XT",
      vram: 6,
      market: { average_price: 10000, min_safe_price: 7500, max_fair_price: 12000, scam_threshold: 4200 }
    },
    {
      pattern: /rx[\s\-]*5600(?![\s\-]*xt)/i,
      model: "AMD Radeon RX 5600",
      vram: 6,
      market: { average_price: 8500, min_safe_price: 6500, max_fair_price: 10000, scam_threshold: 3600 }
    },
    {
      pattern: /rx[\s\-]*5500[\s\-]*xt/i,
      model: "AMD Radeon RX 5500 XT",
      vram: 8,
      variants: [4, 8],
      market: { average_price: 8000, min_safe_price: 6000, max_fair_price: 9500, scam_threshold: 3400 }
    },
    {
      pattern: /rx[\s\-]*5500(?![\s\-]*xt)/i,
      model: "AMD Radeon RX 5500",
      vram: 4,
      market: { average_price: 5500, min_safe_price: 4200, max_fair_price: 6500, scam_threshold: 2300 }
    },

    // ---------- AMD Radeon RX 500/400 серии ----------
    {
      pattern: /rx[\s\-]*590/i,
      model: "AMD Radeon RX 590",
      vram: 8,
      market: { average_price: 7000, min_safe_price: 5500, max_fair_price: 8500, scam_threshold: 2900 }
    },
    {
      pattern: /rx[\s\-]*580/i,
      model: "AMD Radeon RX 580",
      vram: 8,
      variants: [4, 8],
      market: { average_price: 5500, min_safe_price: 4200, max_fair_price: 6500, scam_threshold: 2300 }
    },
    {
      pattern: /rx[\s\-]*570/i,
      model: "AMD Radeon RX 570",
      vram: 4,
      variants: [4, 8],
      market: { average_price: 4000, min_safe_price: 3000, max_fair_price: 4800, scam_threshold: 1700 }
    },
    {
      pattern: /rx[\s\-]*560/i,
      model: "AMD Radeon RX 560",
      vram: 4,
      variants: [2, 4],
      market: { average_price: 3000, min_safe_price: 2300, max_fair_price: 3600, scam_threshold: 1300 }
    },
    {
      pattern: /rx[\s\-]*550/i,
      model: "AMD Radeon RX 550",
      vram: 2,
      variants: [2, 4],
      market: { average_price: 2000, min_safe_price: 1500, max_fair_price: 2400, scam_threshold: 840 }
    },
    {
      pattern: /rx[\s\-]*480/i,
      model: "AMD Radeon RX 480",
      vram: 8,
      variants: [4, 8],
      market: { average_price: 4000, min_safe_price: 3000, max_fair_price: 4800, scam_threshold: 1700 }
    },
    {
      pattern: /rx[\s\-]*470/i,
      model: "AMD Radeon RX 470",
      vram: 4,
      variants: [4, 8],
      market: { average_price: 3000, min_safe_price: 2300, max_fair_price: 3600, scam_threshold: 1300 }
    },
    {
      pattern: /rx[\s\-]*460/i,
      model: "AMD Radeon RX 460",
      vram: 2,
      variants: [2, 4],
      market: { average_price: 2000, min_safe_price: 1500, max_fair_price: 2400, scam_threshold: 840 }
    },

    // ---------- AMD Radeon RX Vega серии ----------
    {
      pattern: /radeon[\s\-]*vii/i,
      model: "AMD Radeon VII",
      vram: 16,
      market: { average_price: 25000, min_safe_price: 19000, max_fair_price: 30000, scam_threshold: 10500 }
    },
    {
      pattern: /vega[\s\-]*64/i,
      model: "AMD Radeon RX Vega 64",
      vram: 8,
      market: { average_price: 10000, min_safe_price: 7500, max_fair_price: 12000, scam_threshold: 4200 }
    },
    {
      pattern: /vega[\s\-]*56/i,
      model: "AMD Radeon RX Vega 56",
      vram: 8,
      market: { average_price: 8000, min_safe_price: 6000, max_fair_price: 9500, scam_threshold: 3400 }
    },

    // ---------- Intel Arc ----------
    {
      pattern: /arc[\s\-]*a770/i,
      model: "Intel Arc A770",
      vram: 8,
      variants: [8, 16],
      market: { average_price: 18000, min_safe_price: 14000, max_fair_price: 22000, scam_threshold: 7500 }
    },
    {
      pattern: /arc[\s\-]*a750/i,
      model: "Intel Arc A750",
      vram: 8,
      market: { average_price: 14000, min_safe_price: 11000, max_fair_price: 17000, scam_threshold: 5900 }
    },
    {
      pattern: /arc[\s\-]*a580/i,
      model: "Intel Arc A580",
      vram: 8,
      market: { average_price: 11000, min_safe_price: 8500, max_fair_price: 13000, scam_threshold: 4600 }
    },
    {
      pattern: /arc[\s\-]*a380/i,
      model: "Intel Arc A380",
      vram: 6,
      market: { average_price: 7000, min_safe_price: 5500, max_fair_price: 8500, scam_threshold: 2900 }
    }
  ];

  // Регистрируем в глобальном реестре модулей
  window.AGPUH = window.AGPUH || {};
  window.AGPUH.gpuMarketDb = GPU_MARKET_DB;
  window.AGPUH.gpuMarketDbTotalModels = GPU_MARKET_DB.length;
})();
