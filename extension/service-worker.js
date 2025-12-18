// Этот скрипт будет "мозгом" расширения.
// Он будет слушать клики по иконке, общаться с сервером и content.js.
chrome.action.onClicked.addListener(async (tab) => {
    console.log("Иконка нажата");
    
    // Проверяем, что это обычная веб-страница (не chrome://, about:, и т.д.)
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://')) {
        console.error("Расширение не работает на этой странице:", tab.url);
        return;
    }
    
    try {
        // Пытаемся отправить сообщение в content script
        await chrome.tabs.sendMessage(tab.id, { command: "start" });
        console.log("Сообщение отправлено в content script");
    } catch (error) {
        console.log("Content script не отвечает, пытаемся инжектить скрипт:", error.message);
        
        // Если content script не загружен, инжектим его программно
        try {
            // Сначала инжектим readability.js, затем content.js
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['readability.js']
            });
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            
            // Ждём немного, чтобы скрипты загрузились
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Теперь отправляем сообщение
            await chrome.tabs.sendMessage(tab.id, { command: "start" });
            console.log("Скрипты инжектированы и сообщение отправлено");
        } catch (injectError) {
            console.error("Ошибка при инжекте скриптов:", injectError);
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Service worker получил сообщение:", message);
    
    if (message.command === "articleText" && message.text) {
        console.log("Service worker обрабатывает текст от content script");
        
        // Сохраняем tab.id для отправки результата обратно
        const tabId = sender.tab?.id;
        
        // Отправляем текст на сервер для суммаризации
        fetch('http://localhost:3000/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: message.text })
        })
        .then(response => {
            if (response.ok) {
                console.log("Текст успешно передан на server");
                return response.json();
            } else {
                throw new Error('Ошибка сервера');
            }
        })
        .then(data => {
            console.log("Ответ от сервера:", data);
            
            // Отправляем результат суммаризации обратно в content.js
            if (tabId && data.summary) {
                chrome.tabs.sendMessage(tabId, {
                    command: "summaryResult",
                    summary: data.summary
                }).then(() => {
                    console.log("Результат суммаризации отправлен в content.js");
                }).catch(error => {
                    // Игнорируем ошибку, если content script не загружен
                    if (error.message && error.message.includes("Receiving end does not exist")) {
                        console.warn("Content script не загружен, результат не может быть отправлен");
                    } else {
                        console.error("Ошибка при отправке результата в content.js:", error);
                    }
                });
            } else if (tabId && data.error) {
                // Отправляем ошибку, если она есть
                chrome.tabs.sendMessage(tabId, {
                    command: "summaryResult",
                    error: data.error,
                    details: data.details
                }).catch(error => {
                    // Игнорируем ошибку, если content script не загружен
                    if (error.message && error.message.includes("Receiving end does not exist")) {
                        console.warn("Content script не загружен, ошибка не может быть отправлена");
                    } else {
                        console.error("Ошибка при отправке ошибки в content.js:", error);
                    }
                });
            }
        })
        .catch(error => {
            console.error("Ошибка при передаче текста на server:", error);
            
            // Отправляем ошибку в content.js
            if (tabId) {
                chrome.tabs.sendMessage(tabId, {
                    command: "summaryResult",
                    error: "Ошибка при запросе к серверу",
                    details: error.message
                }).catch(err => {
                    // Игнорируем ошибку, если content script не загружен
                    if (err.message && err.message.includes("Receiving end does not exist")) {
                        console.warn("Content script не загружен, ошибка не может быть отправлена");
                    } else {
                        console.error("Ошибка при отправке ошибки в content.js:", err);
                    }
                });
            }
        });
        
        // Возвращаем true для асинхронных операций
        return true;
    }
    
    // Возвращаем false, если сообщение не обработано
    return false;
});


