require('dotenv').config();
const express = require('express');
const app = express();
const fetch = require('node-fetch');

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
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
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