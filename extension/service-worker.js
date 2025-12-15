// Этот скрипт будет "мозгом" расширения.
// Он будет слушать клики по иконке, общаться с сервером и content.js.
chrome.action.onClicked.addListener((tab) => {
    console.log("Иконка нажата");
    // Отправляем команду в content.js начать работу
    chrome.tabs.sendMessage(tab.id, { command: "start" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === "articleText" && message.text) {
        console.log("Service worker получил текст от content script:");
        console.log(message.text);
    }
});
