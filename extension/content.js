// Этот скрипт будет внедряться на страницу для извлечения текста и отображения UI.
// Ожидаем команду "start" от service worker.
// Предполагается, что readability.js уже подключён как content script в manifest.json.

/**
 * Грубая очистка DOM от типичных "мусорных" блоков
 * (навигация, сайдбары, реклама, футеры и т.п.).
 */
function cleanDocument(doc) {
  const junkSelectors = [
    'header',
    'footer',
    'nav',
    'aside',
    'form',
    'iframe',
    'noscript',
    'script',
    'style',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '.sidebar',
    '.side-bar',
    '.widget',
    '.advertisement',
    '.advert',
    '.ads',
    '.adblock',
    '.promo',
    '.promo-block',
    '.subscribe',
    '.subscription',
    '.popup',
    '.modal',
    '.share',
    '.social',
    '.breadcrumbs',
    '.breadcrumb'
  ];

  try {
    // Удаляем типовые блоки по селекторам
    const nodes = doc.querySelectorAll(junkSelectors.join(','));
    nodes.forEach((node) => node.parentNode && node.parentNode.removeChild(node));

    // Дополнительно вычищаем элементы по "подозрительным" class / id
    const suspiciousRe =
      /(nav|menu|breadcrumb|footer|header|sidebar|widget|ad-|ads|advert|promo|subscribe|popup|modal|share|social)/i;

    doc.querySelectorAll('*').forEach((el) => {
      const cls = el.className || '';
      const id = el.id || '';

      if (typeof cls === 'string' && suspiciousRe.test(cls)) {
        el.parentNode && el.parentNode.removeChild(el);
        return;
      }

      if (typeof id === 'string' && suspiciousRe.test(id)) {
        el.parentNode && el.parentNode.removeChild(el);
      }
    });
  } catch (e) {
    console.warn('Ошибка при предварительной очистке DOM:', e);
  }
}

/**
 * Дополнительная очистка текста после Readability:
 * - убираем короткие/служебные строки;
 * - схлопываем лишние пробелы.
 */
function postProcessText(rawText) {
  if (!rawText) return '';

  return rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      // Отбрасываем очень короткие/служебные строки
      if (line.length < 40) return false;

      const lower = line.toLowerCase();
      if (
        lower.startsWith('поделиться') ||
        lower.startsWith('подписаться') ||
        lower.startsWith('читать также') ||
        lower.startsWith('рекомендуем') ||
        lower.startsWith('вам может понравиться') ||
        lower.startsWith('related') ||
        lower.startsWith('share') ||
        lower.startsWith('subscribe')
      ) {
        return false;
      }

      return true;
    })
    .join('\n\n');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command !== 'start') return;

  console.log('content.js получил сообщение:', message);

  try {
    // Readability уже загружена из локального файла readability.js
    const ReadabilityCtor = window.Readability || Readability;

    if (!ReadabilityCtor) {
      console.error(
        'Readability не найдена. Проверьте, что readability.js подключен в manifest.json до content.js.'
      );
      return;
    }

    // Делаем глубокую копию DOM, предварительно чистим от "мусорных" блоков
    const cloned = document.cloneNode(true);
    cleanDocument(cloned);

    const article = new ReadabilityCtor(cloned).parse();

    if (article && article.textContent) {
      const cleanedText = postProcessText(article.textContent);

      console.log('Извлечённый чистый текст статьи (после очистки):', cleanedText);

      // Отправляем извлеченный текст в service-worker с командой "articleText"
      chrome.runtime.sendMessage({
        command: 'articleText',
        text: cleanedText
      });
    } else {
      console.log('Не удалось извлечь содержимое статьи.');
    }
  } catch (err) {
    console.error('Ошибка при работе с Readability:', err);
  }
});

 
