// Этот скрипт будет "мозгом" расширения.
// Он будет слушать клики по иконке, общаться с сервером и content.js.
chrome.action.onClicked.addListener((tab) => {
    console.log("Иконка нажата");
    // Отправляем команду в content.js начать работу
    chrome.tabs.sendMessage(tab.id, { command: "start" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Service worker получил сообщение:", message);
    
    if (message.command === "articleText" && message.text) {
        console.log("Service worker обрабатывает текст от content script");
        
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
        })
        .catch(error => {
            console.error("Ошибка при передаче текста на server:", error);
        });
        
        // Возвращаем true для асинхронных операций
        return true;
    }
    
    // Возвращаем false, если сообщение не обработано
    return false;
});


