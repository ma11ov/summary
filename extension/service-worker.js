// Этот скрипт будет "мозгом" расширения.
// Он будет слушать клики по иконке, общаться с сервером и content.js.

// Регистрация при первой установке расширения
chrome.runtime.onInstalled.addListener(async (details) => {
    // Проверяем, что это первая установка (не обновление)
    if (details.reason === 'install') {
        console.log("Расширение установлено впервые, выполняется регистрация...");
        
        try {
            // Проверяем, есть ли уже сохраненный токен
            const result = await chrome.storage.local.get('authToken');
            
            if (result.authToken) {
                console.log("Токен уже существует, пропускаем регистрацию");
                return;
            }
            
            // Делаем запрос на /auth/register для получения токена
            const response = await fetch('http://localhost:3000/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ошибка регистрации: ${response.status} ${response.statusText}. ${errorText}`);
            }
            
            const data = await response.json();
            
            if (!data.token) {
                throw new Error('Токен не получен в ответе сервера');
            }
            
            // Сохраняем токен в chrome.storage.local
            await chrome.storage.local.set({ authToken: data.token });
            console.log("✅ Токен успешно получен и сохранен");
            
            if (data.userId) {
                console.log(`📝 UserId: ${data.userId}`);
            }
        } catch (error) {
            console.error("❌ Ошибка при регистрации:", error);
            // Не блокируем работу расширения, но логируем ошибку
        }
    }
});

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

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    console.log("Service worker получил сообщение:", message);
    
    if (message.command === "articleText" && message.text) {
        console.log("Service worker обрабатывает текст от content script");
        
        // Сохраняем tab.id для отправки результата обратно
        const tabId = sender.tab?.id;
        
        try {
            // Получаем токен из chrome.storage.local
            const storageData = await chrome.storage.local.get('authToken');
            const authToken = storageData.authToken;
            
            if (!authToken) {
                console.error("❌ Ошибка: токен аутентификации не найден");
                
                // Пытаемся зарегистрироваться, если токен отсутствует
                try {
                    console.log("Попытка регистрации...");
                    const registerResponse = await fetch('http://localhost:3000/auth/register', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (!registerResponse.ok) {
                        throw new Error(`Ошибка регистрации: ${registerResponse.status}`);
                    }
                    
                    const registerData = await registerResponse.json();
                    
                    if (!registerData.token) {
                        throw new Error('Токен не получен при регистрации');
                    }
                    
                    // Сохраняем новый токен
                    await chrome.storage.local.set({ authToken: registerData.token });
                    console.log("✅ Токен получен и сохранен");
                    
                    // Используем новый токен
                    const newToken = registerData.token;
                    
                    // Отправляем текст на сервер для суммаризации с токеном
                    fetch('http://localhost:3000/summarize', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${newToken}`
                        },
                        body: JSON.stringify({ text: message.text })
                    })
                    .then(response => {
                        if (response.ok) {
                            console.log("Текст успешно передан на server");
                            return response.json();
                        } else {
                            // Если получили 401 или 403, возможно токен невалиден
                            if (response.status === 401 || response.status === 403) {
                                throw new Error('Токен невалиден или истек. Требуется повторная регистрация.');
                            }
                            throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`);
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
                    
                    return true;
                } catch (registerError) {
                    console.error("❌ Ошибка при попытке регистрации:", registerError);
                    
                    // Отправляем ошибку в content.js
                    if (tabId) {
                        chrome.tabs.sendMessage(tabId, {
                            command: "summaryResult",
                            error: "Ошибка аутентификации",
                            details: registerError.message
                        }).catch(err => {
                            if (err.message && err.message.includes("Receiving end does not exist")) {
                                console.warn("Content script не загружен, ошибка не может быть отправлена");
                            } else {
                                console.error("Ошибка при отправке ошибки в content.js:", err);
                            }
                        });
                    }
                    return true;
                }
            }
            
            // Отправляем текст на сервер для суммаризации с токеном
            fetch('http://localhost:3000/summarize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ text: message.text })
            })
        .then(response => {
            if (response.ok) {
                console.log("Текст успешно передан на server");
                return response.json();
            } else {
                // Если получили 401 или 403, возможно токен невалиден
                if (response.status === 401 || response.status === 403) {
                    throw new Error('Токен невалиден или истек. Требуется повторная регистрация.');
                }
                const errorText = response.statusText || 'Неизвестная ошибка';
                throw new Error(`Ошибка сервера: ${response.status} ${errorText}`);
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
        } catch (error) {
            console.error("❌ Критическая ошибка при обработке запроса:", error);
            
            // Отправляем ошибку в content.js
            if (tabId) {
                chrome.tabs.sendMessage(tabId, {
                    command: "summaryResult",
                    error: "Критическая ошибка",
                    details: error.message
                }).catch(err => {
                    if (err.message && err.message.includes("Receiving end does not exist")) {
                        console.warn("Content script не загружен, ошибка не может быть отправлена");
                    } else {
                        console.error("Ошибка при отправке ошибки в content.js:", err);
                    }
                });
            }
            
            return true;
        }
    }
    
    // Возвращаем false, если сообщение не обработано
    return false;
});


