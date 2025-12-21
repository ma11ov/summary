require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const app = express();
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Rate limiting для защиты от DoS-атак: максимум 50 запросов за 5 минут с одного IP
const limiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 минут
    max: 50, // максимум 50 запросов за окно
    message: 'Too many requests',
    standardHeaders: true, // Возвращает информацию об ограничениях в заголовках `RateLimit-*`
    legacyHeaders: false, // Отключает заголовки `X-RateLimit-*`
});

// Применяем rate limiting ко всем запросам ДО любой другой логики
app.use(limiter);

// Middleware для того, чтобы сервер мог принимать JSON в теле запроса
app.use(express.json());

// Определяем порт. process.env.PORT нужен для хостинг-платформ.
const PORT = process.env.PORT || 3000;

// Маршрут /summarize с обращением к OpenAI API
app.post('/summarize', async (req, res) => {
    console.log("Получен запрос на /summarize");
    
    const { text } = req.body;
    if (!text) {
        console.log("❌ Ошибка: поле text отсутствует в запросе");
        return res.status(400).json({ error: 'Требуется поле text' });
    }

    console.log(`📤 Отправка запроса к OpenAI API. Длина текста: ${text.length} символов`);

    try {
        // Настройка прокси: http://156.246.211.187:63008:Y2PsTvNV:P4G4dVuX
        // Формат: http://host:port:username:password -> http://username:password@host:port
        const proxyUrl = 'http://Y2PsTvNV:P4G4dVuX@156.246.211.187:63008';
        const agent = new HttpsProxyAgent(proxyUrl);
        
        console.log('🔗 Используется прокси для запроса к OpenAI API');

        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            agent: agent, // Используем прокси-агент
            body: JSON.stringify({
                model: 'gpt-4o-2024-05-13', // gpt-4o-mini от OpenAI, ближайшая поддерживаемая нотация
                messages: [
                    {
                        role: 'system',
                        content: 'суммаризируй этот текст'
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                max_tokens: 512,
                temperature: 0.3
            })
        });

        console.log(`📥 Получен ответ от OpenAI API. Статус: ${openaiResponse.status} ${openaiResponse.statusText}`);

        if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            console.error('❌ Ошибка OpenAI API:', errorText);
            return res.status(500).json({ error: 'Ошибка при запросе к OpenAI', details: errorText });
        }

        const openaiData = await openaiResponse.json();
        const summary = openaiData.choices?.[0]?.message?.content?.trim();

        if (summary) {
            const preview = summary.length > 100 ? summary.substring(0, 100) + '...' : summary;
            console.log(`✅ Суммаризация успешно получена. Первые 100 символов: "${preview}"`);
        } else {
            console.warn('⚠️  Внимание: получен пустой ответ от OpenAI');
        }

        res.json({
            summary: summary || '',
            openai_response: openaiData
        });
        console.log('✓ Ответ успешно отправлен клиенту');
    } catch (err) {
        console.error('❌ Серверная ошибка:', err);
        res.status(500).json({ error: "Ошибка сервера", details: err.message });
    }
});

// Запускаем сервер, чтобы он начал слушать входящие запросы
app.listen(PORT, () => {
    console.log(`Сервер запущен и слушает порт ${PORT}`);
});