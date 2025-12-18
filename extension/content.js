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

/**
 * Внедряет UI-панель справа на четверть экрана по всей высоте
 */
function injectUIPanel() {
  console.log('injectUIPanel вызвана');
  
  // Проверяем, не существует ли уже панель
  const existingPanel = document.getElementById('summary-ui-panel');
  if (existingPanel) {
    console.log('Панель уже существует');
    return; // Панель уже существует
  }

  // Убеждаемся, что DOM готов
  if (!document.body) {
    console.log('document.body не готов, ожидаем...');
    setTimeout(injectUIPanel, 100);
    return;
  }

  console.log('Создаём UI-панель...');

  // Проверяем, не добавлены ли уже стили
  let style = document.getElementById('summary-ui-panel-styles');
  if (!style) {
    style = document.createElement('style');
    style.id = 'summary-ui-panel-styles';
    style.textContent = `
      #summary-ui-panel {
        position: fixed !important;
        top: 0 !important;
        right: 0 !important;
        width: 25% !important;
        height: 100vh !important;
        background-color: #ffffff !important;
        box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        flex-direction: column !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      
      .summary-panel-header {
        padding: 16px !important;
        border-bottom: 1px solid #e0e0e0 !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        background-color: #f5f5f5 !important;
        flex-shrink: 0 !important;
      }
      
      .summary-panel-header h3 {
        margin: 0 !important;
        font-size: 18px !important;
        font-weight: 600 !important;
        color: #333 !important;
      }
      
      .summary-panel-close {
        background: none !important;
        border: none !important;
        font-size: 24px !important;
        cursor: pointer !important;
        color: #666 !important;
        padding: 0 !important;
        width: 30px !important;
        height: 30px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 4px !important;
        transition: background-color 0.2s !important;
      }
      
      .summary-panel-close:hover {
        background-color: #e0e0e0 !important;
      }
      
      .summary-panel-content {
        flex: 1 !important;
        padding: 16px !important;
        overflow-y: auto !important;
        color: #333 !important;
        line-height: 1.6 !important;
      }
      
      .summary-panel-content p {
        margin: 0 0 12px 0 !important;
      }
    `;
    document.head.appendChild(style);
    console.log('Стили добавлены');
  }

  // Создаём контейнер панели
  const panel = document.createElement('div');
  panel.id = 'summary-ui-panel';
  panel.innerHTML = `
    <div class="summary-panel-header">
      <h3>AI Summary Panel</h3>
      <button class="summary-panel-close" id="summary-panel-close">×</button>
    </div>
    <div class="summary-panel-content" id="summary-panel-content">
      <p>Обработка статьи...</p>
    </div>
  `;

  // Добавляем панель в документ
  document.body.appendChild(panel);
  console.log('Панель добавлена в DOM');

  // Обработчик закрытия панели
  const closeButton = panel.querySelector('#summary-panel-close');
  closeButton.addEventListener('click', () => {
    console.log('Закрытие панели');
    panel.remove();
    if (style && style.parentNode) {
      style.remove();
    }
  });
}

/**
 * Обновляет содержимое UI-панели
 */
function updatePanelContent(text, isError = false) {
  const contentDiv = document.getElementById('summary-panel-content');
  if (contentDiv) {
    if (isError) {
      contentDiv.innerHTML = `<p style="color: #d32f2f;">${text}</p>`;
    } else {
      // Форматируем текст, сохраняя переносы строк
      const formattedText = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => `<p>${line}</p>`)
        .join('');
      contentDiv.innerHTML = formattedText || '<p>Результат пуст</p>';
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Обработка команды "summaryResult" - результат суммаризации от service-worker
  if (message.command === 'summaryResult') {
    console.log('content.js получил результат суммаризации:', message);
    
    if (message.error) {
      const errorText = message.details 
        ? `Ошибка: ${message.error}\nДетали: ${message.details}`
        : `Ошибка: ${message.error}`;
      updatePanelContent(errorText, true);
    } else if (message.summary) {
      updatePanelContent(message.summary, false);
      console.log('Суммаризация отображена в панели');
    } else {
      updatePanelContent('Получен пустой результат', true);
    }
    
    return;
  }

  // Обработка команды "start"
  if (message.command !== 'start') return;

  console.log('content.js получил сообщение:', message);

  // Внедряем UI-панель в первую очередь
  // Используем небольшую задержку для гарантии готовности DOM
  if (document.body) {
    injectUIPanel();
  } else {
    // Если body ещё не готов, ждём
    const checkBody = setInterval(() => {
      if (document.body) {
        clearInterval(checkBody);
        injectUIPanel();
      }
    }, 50);
    // Таймаут на случай, если body никогда не появится
    setTimeout(() => clearInterval(checkBody), 2000);
  }

  try {
    // Readability уже загружена из локального файла readability.js
    const ReadabilityCtor = window.Readability || Readability;

    if (!ReadabilityCtor) {
      console.error(
        'Readability не найдена. Проверьте, что readability.js подключен в manifest.json до content.js.'
      );
      updatePanelContent('Ошибка: Readability не найдена', true);
      return;
    }

    // Делаем глубокую копию DOM, предварительно чистим от "мусорных" блоков
    const cloned = document.cloneNode(true);
    cleanDocument(cloned);

    const article = new ReadabilityCtor(cloned).parse();

    if (article && article.textContent) {
      const cleanedText = postProcessText(article.textContent);

      console.log('Извлечённый чистый текст статьи (после очистки):', cleanedText);
      updatePanelContent('Текст извлечён. Отправка на сервер...', false);

      // Отправляем извлеченный текст в service-worker с командой "articleText"
      chrome.runtime.sendMessage({
        command: 'articleText',
        text: cleanedText
      }).then(() => {
        updatePanelContent('Текст успешно отправлен на сервер. Ожидание результата...', false);
      }).catch(error => {
        console.error('Ошибка при отправке сообщения в service worker:', error);
        updatePanelContent('Ошибка при отправке текста на сервер: ' + error.message, true);
      });
    } else {
      console.log('Не удалось извлечь содержимое статьи.');
      updatePanelContent('Не удалось извлечь содержимое статьи.', true);
    }
  } catch (err) {
    console.error('Ошибка при работе с Readability:', err);
    updatePanelContent('Ошибка при обработке статьи: ' + err.message, true);
  }
});

 
