# Contributing to Avito GPU Helper

Спасибо за интерес к проекту! 🎉

Этот документ описывает, как контрибьютить в Avito GPU Helper.

## 🚀 Быстрый старт

### 1. Fork и clone репозитория

```bash
git clone https://github.com/YOUR_USERNAME/avito-gpu-helper.git
cd avito-gpu-helper
git remote add upstream https://github.com/ForseJDM/avito-gpu-helper.git
```

### 2. Создайте ветку для вашей фичи

```bash
git checkout -b feat/dark-theme
# или
git checkout -b fix/badge-renderer-bug
```

### 3. Внесите изменения

Расширение не требует сборки — это vanilla JS. Просто отредактируйте файлы в `extension/src/` и загрузите `extension/` как unpacked extension в `chrome://extensions`.

### 4. Протестируйте

Перед PR обязательно:

- ✅ Откройте `chrome://extensions`, нажмите "Reload" расширения
- ✅ Проверьте на avito.ru — виджет появляется на product pages
- ✅ Проверьте на search page — badges появляются на карточках
- ✅ Проверьте popup — настройки сохраняются
- ✅ Откройте DevTools console — нет ошибок
- ✅ Запустите `node --check` на изменённых JS файлах

### 5. Коммит и push

Используем [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: добавлена тёмная тема
fix: исправлен bug в extractCardUrl
security: закрыта V-1 (open redirect)
docs: обновлён README
chore: обновлены зависимости
refactor: упрощена логика detectGpu
test: добавлены unit-тесты для fair-price-engine
```

```bash
git add .
git commit -m "feat: добавлена тёмная тема"
git push origin feat/dark-theme
```

### 6. Откройте Pull Request

На GitHub откройте PR в `ForseJDM/avito-gpu-helper`. В описании укажите:
- Что изменилось и зачем
- Ссылки на issues (если есть)
- Скриншоты (если UI изменился)

## 📋 Кодстайл

### JavaScript

- ES5-совместимый синтаксис (var, function, без стрелочных функций в hot-path коде) — для совместимости со старыми Chrome
- IIFE для каждого модуля: `(function () { "use strict"; ... })();`
- Регистрация модулей через `window.AGPUH.<moduleName> = { ... }`
- Никаких `innerHTML` — только `createElement` + `textContent` (защита от XSS)
- Никаких `eval`, `new Function`, `setTimeout(string)`
- Используй `var` вместо `let/const` для совместимости
- Все строки — двойные кавычки `"..."`
- Отступы — 2 пробела

### Python (для parser/)

- Python 3.11+
- PEP 8 с line length 100
- Docstrings для всех публичных функций
- Type hints приветствуются

### CSS

- Префикс `agpuh-` для всех классов (избегаем конфликтов с Avito)
- Используем CSS variables для тем
- Mobile-first responsive подход

## 🎯 Приоритетные задачи

Особенно нужны контрибьюции в этих областях:

### High Priority
- 🧪 **Тесты** — unit-тесты для `gpu-detector`, `fair-price-engine`, `anti-scam-engine`
- 🌐 **i18n** — английский и казахский переводы
- 📊 **IP-ротация для парсера** — residential proxy интеграция
- 🔍 **Дополнительные анти-скам эвристики** — H10, H11, ...

### Medium Priority
- 🎨 **Тёмная тема** — CSS + `prefers-color-scheme`
- 📱 **Mobile responsiveness** виджета
- ⚡ **Performance optimization** — debounce, throttle
- 🔄 **TypeScript migration** (постепенный)

### Low Priority
- 📝 **Документация** — JSDoc для всех функций
- 🎓 **Examples** — примеры кастомных эвристик
- 🌍 **Локализации** — больше языков

## 🐛 Баг-репорты

Перед созданием issue:

1. Поищите в [существующих issues](../../issues) — возможно, уже сообщили
2. Воспроизведите на последней версии (v3.1.0+)
3. Соберите информацию:
   - Версия Chrome/Edge
   - Версия расширения
   - URL страницы с проблемой
   - Скриншот (если применимо)
   - Сообщения из DevTools console (F12 → Console)

Используйте шаблон issue:

```markdown
**Описание бага**
Чёткое описание проблемы.

**Воспроизведение**
1. Зайти на '...'
2. Нажать на '...'
3. Видеть ошибку

**Ожидаемое поведение**
Что должно было произойти.

**Скриншоты**
Если применимо.

**Окружение**
- OS: [Windows 11 / macOS 14 / Ubuntu 22.04]
- Browser: [Chrome 126 / Edge 126]
- Extension version: [v3.1.0]
- URL: [ссылка на объявление]

**Console log**
```
(вставьте сообщения из DevTools console)
```
```

## 🔒 Security disclosures

Если вы нашли уязвимость, **НЕ открывайте public issue**. См. [extension/SECURITY.md](extension/SECURITY.md) для процесса ответственного disclosure.

## 📜 Лицензия

Контрибьюции лицензируются под [MIT License](LICENSE). Делая PR, вы соглашаетесь, что ваш код будет лицензирован под MIT.

## 🤝 Кодекс поведения

Будьте уважительны. Мы следуем принципам открытого source-сообщества:

- ✅ Конструктивная критика
- ✅ Помощь новичкам
- ✅ Признание чужой работы
- ❌ Никаких оскорблений, дискриминации, спама
- ❌ Никакого плагиата

Нарушения могут привести к бану.

## ❓ Вопросы

- 💬 [GitHub Discussions](../../discussions) — общие вопросы
- 🐛 [GitHub Issues](../../issues) — баги и feature requests
- 📧 Email — для private вопросов (см. профиль владельца)

---

**Спасибо за контрибуцию! 🙏**
