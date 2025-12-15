const express = require('express');
const app = express();

// Middleware для того, чтобы сервер мог принимать JSON в теле запроса
app.use(express.json());

// Определяем порт. process.env.PORT нужен для хостинг-платформ.
const PORT = process.env.PORT || 3000;

// Маршрут-заглушка. Пока он не делает ничего полезного.
app.post('/summarize', (req, res) => {
    console.log("Получен запрос на /summarize");
    
    // В будущем здесь будет логика обращения к OpenAI.
    // А сейчас просто отправляем успешный ответ.
    res.json({ 
        message: "Hello from server! Запрос получен, но суммаризация пока не реализована." 
    });
});

// Запускаем сервер, чтобы он начал слушать входящие запросы
app.listen(PORT, () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
});