# Avito GPU Helper

> Браузерное расширение, которое помогает покупать видеокарты на Авито: определяет реальную рыночную цену, выявляет скам, оценивает надёжность продавца и находит аналогичные предложения.

> 📌 **Парсер цен** (Python + Playwright) живёт в отдельном репозитории:
> **[ForseJDM/avito-gpu-prices](https://github.com/ForseJDM/avito-gpu-prices)**
> Он автоматически обновляет `prices.json` каждые 4 часа через GitHub Actions.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-v3.1.0-4285F4?logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Coverage](https://img.shields.io/badge/Remote%20prices-30.3%25-orange)](#состояние-проекта)

**Текущая версия:** v3.1.0 (Security Hotfix, 26 июня 2026)
**Лицензия:** MIT (свободное использование, включая коммерческое)
**Поддерживаемые браузеры:** Chrome, Edge, Brave, Arc, все Chromium-браузеры с поддержкой Manifest V3

---

## 🎯 Что делает расширение

Avito GPU Helper — это помощник покупателя б/у видеокарт на Авито. Расширение анализирует каждое объявление в реальном времени и показывает:

- **Реальную рыночную цену** на основе агрегированных данных с 30+ моделей RTX 20/30/40/50
- **Справедливость цены** — 5 статусов: 🟢 Выгодно / 🔵 Норма / 🔴 Дорого / ⚠️ Подозрение / 🚨 Скам
- **9 анти-скам эвристик** — цена ниже порога, фразы-маркеры, конфликт VRAM, отсутствие фото, упоминания майнинга, подмена модели и др.
- **Надёжность продавца** — рейтинг, отзывы, стаж на Авито → 🟢/🟡/🔴
- **Состояние товара** — Новое / Как новое / Б/У (из характеристик Avito, не из описания)
- **Аналогичные предложения** — топ-5 похожих объявлений с ценами
- **Badges на странице поиска** — компактные индикаторы прямо на карточках объявлений

## 📸 Скриншоты (сгенерированные заглушки)

### Виджет на карточке товара
![Виджет](docs/screenshots/01-widget-product-page.png)

### Badges на странице поиска
![Badges](docs/screenshots/02-badges-search-page.png)

### Popup с настройками и историей
![Popup](docs/screenshots/03-popup-settings.png)

### Аналоги и сравнение
![Аналоги](docs/screenshots/04-analogs-comparison.png)

### Сворачиваемые секции (v3.0.5+)
![Сворачиваемые секции](docs/screenshots/05-collapsible-sections.png)

## 🚀 Установка

### Способ 1: Chrome Web Store (рекомендуется)

> 📌 Ссылка появится после публикации. Сейчас расширение проходит review.

1. Откройте Chrome Web Store (ссылка появится здесь после релиза)
2. Нажмите «Установить»
3. Откройте любое объявление о видеокарте на [avito.ru](https://www.avito.ru)
4. Виджет появится в правом верхнем углу страницы

### Способ 2: Из GitHub Releases (для продвинутых пользователей)

1. Скачайте `avito-gpu-helper-v3.1.0.zip` со страницы [Releases](../../releases)
2. Распакуйте архив в любую папку
3. Откройте `chrome://extensions` в Chrome/Edge
4. Включите **Режим разработчика** (правый верхний угол)
5. Нажмите **«Загрузить распакованное расширение»** → выберите распакованную папку `extension/`
6. Откройте avito.ru — расширение работает

### Способ 3: Сборка из исходников

```bash
git clone https://github.com/ForseJDM/avito-gpu-helper.git
cd avito-gpu-helper/extension
# Загрузите папку extension/ в chrome://extensions как распакованное расширение
```

## 📊 Состояние проекта

| Метрика | Значение | Статус |
|---------|----------|--------|
| Моделей GPU в БД | 99 | ✅ NVIDIA + AMD + Intel |
| Покрытие remote prices | 30.3% (30/99) | ⚠️ Только RTX 20-50 серии |
| Anti-scam эвристик | 9 | ✅ Полностью реализовано |
| Размер расширения | 90 КБ (zip) | ✅ Очень лёгкое |
| Зависимости | 0 | ✅ Vanilla JS, без bundler |
| Языков интерфейса | 1 (русский) | ⚠️ i18n в плане |
| Тестов | 0 | ❌ В плане для v3.2.0 |

### Почему покрытие только 30%?

Парсер `fetch_prices.py` упирается в CAPTCHA Avito после ~30 страниц. Без IP-ротации оставшиеся 69 моделей (все GTX, Titan, AMD Radeon, Intel Arc) не могут быть автоматически распарсены. Это **главная инженерная проблема v3.2.0** — планируется решить через residential proxy или crowdsourcing.

Для не покрытых remote prices моделей расширение использует локальную БД с ценами, актуальными на момент релиза (могут быть устаревшими на 1-3 месяца).

## 🔒 Безопасность

v3.1.0 — это **Security Hotfix** выпуск, закрывающий 8 уязвимостей, обнаруженных в ходе аудита:

- **V-1 (CWE-601)**: Open redirect через notification — исправлен валидацией хоста
- **V-2 (CWE-923)**: Нет валидации sender в onMessage — добавлена проверка
- **V-3 (CWE-601)**: Фишинг через extractCardUrl — добавлена валидация хоста
- **V-4 (CWE-1357)**: Две расходящиеся копии парсера — унифицировано в монорепо
- **V-5 (CWE-770)**: Storage leak — добавлен TTL cleanup
- **V-6 (CWE-345)**: SHA-256 fail-open — переведён в fail-closed
- **V-11 (CWE-1117)**: Quality guard рассинхрон — выровнен с парсером
- **V-13 (CWE-693)**: Явный CSP в manifest

Полная информация: [SECURITY.md](extension/SECURITY.md) | [CHANGELOG.md](extension/CHANGELOG.md)

## 🗺️ Roadmap

### v3.1.0 — Security Hotfix ✅ (26 июня 2026)
8 security фиксов. См. [CHANGELOG.md](extension/CHANGELOG.md).

### v3.2.0 — Stability & Coverage (3-4 недели)
- 🔴 IP-ротация через residential proxy (Bright Data/Oxylabs)
- 🔴 Реализовать `validate_prices.py` (сейчас 140 LOC без функций)
- 🟡 Поднять покрытие с 30% до 80%+ через IP-ротацию
- 🟡 Unit-тесты для core модулей (Jest)
- 🟡 Исправить GitHub Actions script injection (V-8)
- 🟡 Заменить cache-busting на ETag/If-Modified-Since (V-7)

### v3.3.0 — UX & Defence-in-Depth (2-3 недели)
- 🟡 Тёмная тема по `prefers-color-scheme`
- 🟡 Фильтр аналогов по состоянию (Б/У / Новые)
- 🟡 Сортировка аналогов (цена / дата / расстояние)
- 🟡 Экспорт истории в CSV
- 🟡 Тихие часы для notifications
- 🟡 Onboarding tooltip при первом запуске

### v4.0.0 — Platform (3-6 месяцев)
- 🟢 Поддержка Юлы
- 🟢 Поддержка AliExpress (с расчётом доставки)
- 🟢 Сравнение с DNS/Ситилинк/Onlinetrade
- 🟢 База данных продавцов (чёрный список скамеров)
- 🟢 Web Dashboard с аналитикой
- 🟢 API для разработчиков

### Long-term
- 🟢 AI-ассистент на GPT
- 🟢 Порт на Firefox
- 🟢 Мобильное приложение React Native
- 🟢 Price alerts

## 🏗️ Архитектура

```
avito-gpu-helper/
├── extension/                    # Браузерное расширение Chrome MV3
│   ├── manifest.json
│   ├── src/
│   │   ├── content.js            # Оркестратор pipeline
│   │   ├── service-worker.js     # Background SW (fetch, notifications)
│   │   ├── popup.js              # UI настроек
│   │   ├── core/                 # 9 модулей бизнес-логики
│   │   │   ├── gpu-detector.js
│   │   │   ├── price-detector.js
│   │   │   ├── fair-price-engine.js
│   │   │   ├── anti-scam-engine.js
│   │   │   ├── condition-detector.js
│   │   │   ├── seller-analyzer.js
│   │   │   ├── price-updater.js
│   │   │   ├── realtime-prices.js
│   │   │   └── ...
│   │   ├── ui/                   # 4 UI модуля (widget, badge, drag, comparison)
│   │   └── db/                   # gpu-market-db.js (99 моделей)
│   └── styles/                   # CSS
├── .github/
│   └── workflows/
│       └── release.yml           # GitHub Actions: автосборка zip при tag v*.*.*
├── docs/
│   ├── PRIVACY.md                # Privacy Policy (нет сбора данных)
│   ├── CWS_LISTING.md            # Описания для Chrome Web Store
│   ├── screenshots/              # 5 PNG 1280x800 для README и CWS
│   └── promo/                    # promo-tile 440x280 для CWS
├── LICENSE                       # MIT
├── CHANGELOG.md                  # История релизов
├── CONTRIBUTING.md               # Как контрибьютить
├── DONATE.md                     # Поддержать проект
└── README.md                     # Этот файл
```

> 📌 **Репозиторий парсера** (Python + Playwright + GitHub Actions cron) живёт
> отдельно: **https://github.com/ForseJDM/avito-gpu-prices**
> Это разделение ответственности: парсер = data pipeline, расширение = клиент.
> URL `prices.json` захардкожен в `extension/src/service-worker.js:15`.

### Поток данных

```
[Отдельный репо: ForseJDM/avito-gpu-prices]
       ↓
GitHub Actions (cron каждые 4 часа)
       ↓
parser/fetch_prices.py → prices.json (commit to avito-gpu-prices repo)
       ↓
raw.githubusercontent.com/ForseJDM/avito-gpu-prices/main/prices.json
       ↓
[this repo: ForseJDM/avito-gpu-helper]
       ↓
extension service-worker.js → fetch + SHA-256 verify → chrome.storage.local
       ↓
extension content.js → merge with local gpu-market-db.js
       ↓
   Product page: виджет с ценой + anti-scam + продавец + аналоги
   Search page: badges на каждой карточке
```

## 🛠️ Разработка

### Требования

- Node.js 18+ (для tests и build)
- Python 3.11+ (для парсера)
- Chrome/Edge 116+ (для тестирования расширения)

### Локальный запуск расширения

```bash
git clone https://github.com/ForseJDM/avito-gpu-helper.git
cd avito-gpu-helper/extension
# Загрузите папку в chrome://extensions как "unpacked extension"
```

### Локальный запуск парсера

Парсер живёт в отдельном репозитории: **https://github.com/ForseJDM/avito-gpu-prices**

```bash
git clone https://github.com/ForseJDM/avito-gpu-prices.git
cd avito-gpu-prices
pip install -r requirements.txt
playwright install chromium

# Парсинг всех моделей (инкрементально)
python scripts/fetch_prices.py --debug

# Парсинг одной модели
python scripts/fetch_prices.py --model "RTX 4060" --debug

# Принудительный пересбор (игнорировать существующие цены)
python scripts/fetch_prices.py --force
```

### Структура коммитов

Используем [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: добавлена тёмная тема
fix: исправлен bug в extractCardUrl
security: закрыта V-1 (open redirect)
docs: обновлён README
chore: обновлены зависимости
```

## 🤝 Контрибьюции

Проект открыт для контрибуций. См. [CONTRIBUTING.md](CONTRIBUTING.md).

Особенно нужны:
- 🧪 Тесты для core модулей
- 🌐 Переводы (английский, казахский)
- 🎨 Дизайн тёмной темы
- 📊 Решение для IP-ротации парсера
- 🔍 Дополнительные анти-скам эвристики

## 💝 Поддержать проект

Расширение полностью бесплатное и без рекламы. Если оно сэкономило вам деньги на покупке видеокарты — поддержите разработку:

👉 [**Boosty**](https://boosty.to/avito-gpu-helper) | [**DonationAlerts**](https://donationalerts.com/r/avito-gpu-helper)

Подробности: [DONATE.md](DONATE.md)

## 📋 Privacy Policy

Расширение **не собирает никаких персональных данных**. Подробно: [docs/PRIVACY.md](docs/PRIVACY.md).

Кратко:
- ❌ Нет аналитики, нет телеметрии, нет трекеров
- ❌ Нет отправки данных на сторонние серверы
- ✅ Единственный network-запрос — к `raw.githubusercontent.com` за prices.json
- ✅ История просмотров хранится локально в `chrome.storage.local`, не покидает браузер
- ✅ Никакие данные не передаются третьим лицам

## ⚖️ Лицензия и disclaimer

[MIT License](LICENSE) — свободное использование, модификация и распространение.

**Disclaimer:** «Avito» — торговая марка Avito Group. Этот проект не аффилирован с Avito, не endorsement от Avito. Все названия продуктов, логотипы и бренды являются собственностью их владельцев. Расширение предоставляет аналитическую информацию на основе публичных данных; окончательное решение о покупке остаётся за пользователем.

## 📞 Контакты

- 🐛 [GitHub Issues](../../issues) — баг-репорты и feature requests
- 🔒 [Security Policy](extension/SECURITY.md) — ответственное disclosure
- 💬 [GitHub Discussions](../../discussions) — обсуждения и вопросы

---

**Сделано с ❤️ для сообщества покупателей б/у видеокарт**
