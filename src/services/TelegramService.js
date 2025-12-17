const axios = require('axios');

/**
 * Создание сервиса Telegram (функциональный стиль)
 */
function createTelegramService(config = {}) {
    const defaultConfig = {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        chatId: process.env.TELEGRAM_CHAT_ID || '',
        apiUrl: 'https://api.telegram.org/bot',
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000,
        enableNotifications: true,
        rateLimitDelay: 1000,
        ...config
    };

    const state = {
        config: defaultConfig,
        lastMessageTime: 0,
        messageQueue: [],
        isProcessingQueue: false,
        isEnabled: !!(defaultConfig.botToken && defaultConfig.chatId)
    };

    if (!state.isEnabled) {
        console.warn('⚠️ Telegram уведомления отключены: не указаны botToken или chatId');
    } else {
        console.log('✅ Telegram уведомления включены');
    }

    /**
     * Задержка
     */
    async function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Прямая отправка сообщения
     */
    async function sendMessageDirect(message, options = {}) {
        const url = `${state.config.apiUrl}${state.config.botToken}/sendMessage`;
        
        const payload = {
            chat_id: state.config.chatId,
            text: message,
            ...options
        };

        let lastError = null;
        
        for (let attempt = 1; attempt <= state.config.retryAttempts; attempt++) {
            try {
                const response = await axios.post(url, payload, {
                    timeout: state.config.timeout,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data.ok) {
                    return true;
                } else {
                    throw new Error(`Telegram API error: ${response.data.description}`);
                }

            } catch (error) {
                lastError = error;
                
                if (attempt < state.config.retryAttempts) {
                    await delay(state.config.retryDelay * attempt);
                }
            }
        }

        console.error('Не удалось отправить сообщение в Telegram:', lastError.message);
        return false;
    }

    /**
     * Обработка очереди сообщений
     */
    async function processQueue() {
        if (state.isProcessingQueue || state.messageQueue.length === 0) {
            return;
        }

        state.isProcessingQueue = true;

        while (state.messageQueue.length > 0) {
            const { message, options, resolve } = state.messageQueue.shift();
            
            try {
                const timeSinceLastMessage = Date.now() - state.lastMessageTime;
                if (timeSinceLastMessage < state.config.rateLimitDelay) {
                    await delay(state.config.rateLimitDelay - timeSinceLastMessage);
                }

                const success = await sendMessageDirect(message, options);
                resolve(success);
                state.lastMessageTime = Date.now();

            } catch (error) {
                console.error('Ошибка отправки сообщения в Telegram:', error.message);
                resolve(false);
            }
        }

        state.isProcessingQueue = false;
    }

    /**
     * Отправка сообщения в Telegram
     */
    async function sendMessage(message, options = {}) {
        if (!state.isEnabled || !state.config.enableNotifications) {
            return false;
        }

        const messageOptions = {
            disable_web_page_preview: true,
            ...options
        };

        return new Promise((resolve) => {
            state.messageQueue.push({
                message,
                options: messageOptions,
                resolve,
                timestamp: Date.now()
            });

            processQueue();
        });
    }

    /**
     * Отправка уведомления о запуске парсера
     */
    async function sendParserStartNotification(parserName, config = {}) {
        const message = `🚀 Запуск парсера\n\n` +
                      `Парсер: ${parserName}\n` +
                      `Время: ${new Date().toLocaleString('ru-RU')}\n` +
                      `Режим: ${config.mode || 'cycle'}\n` +
                      (config.parsers ? `Парсеры: ${config.parsers}\n` : '');

        await sendMessage(message);
    }

    /**
     * Отправка уведомления об успешном завершении парсера
     */
    async function sendParserSuccessNotification(parserName, stats = {}) {
        const duration = stats.duration || (stats.startTime ? Math.round((Date.now() - stats.startTime) / 1000 / 60) + ' мин' : 'неизвестно');
        const message = `✅ *Парсер завершен*\n\n` +
                      `*Парсер:* ${parserName}\n` +
                      `*Обработано:* ${stats.processed || 0} объявлений\n` +
                      `*Ошибок:* ${stats.errors || 0}\n` +
                      `*Время работы:* ${duration}\n` +
                      `*Завершено:* ${new Date().toLocaleString('ru-RU')}`;

        await sendMessage(message);
    }

    /**
     * Отправка уведомления о прогрессе парсинга
     */
    async function sendParserProgressNotification(parserName, stats = {}) {
        const processed = stats.processed || 0;
        const errors = stats.errors || 0;
        const startTime = stats.startTime || Date.now();
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const elapsedMinutes = Math.round(elapsed / 60);
        const speed = elapsed > 0 ? (processed / elapsed * 60).toFixed(1) : 0;
        
        const message = `📊 *Прогресс парсинга*\n\n` +
                      `*Парсер:* ${parserName}\n` +
                      `*Обработано:* ${processed} объявлений\n` +
                      `*Ошибок:* ${errors}\n` +
                      `*Время работы:* ${elapsedMinutes} мин\n` +
                      `*Скорость:* ~${speed} объяв/мин\n` +
                      `*Время:* ${new Date().toLocaleString('ru-RU')}`;

        await sendMessage(message);
    }

    /**
     * Отправка уведомления о смене парсера
     */
    async function sendParserSwitchNotification(fromParser, toParser, cycleInfo = {}) {
        const message = `🔄 *Смена парсера*\n\n` +
                      `*С:* ${fromParser || 'начало'}\n` +
                      `*На:* ${toParser}\n` +
                      (cycleInfo.cycleNumber ? `*Цикл:* ${cycleInfo.cycleNumber}\n` : '') +
                      `*Время:* ${new Date().toLocaleString('ru-RU')}`;

        await sendMessage(message);
    }

    /**
     * Отправка уведомления о критической ошибке
     */
    async function sendCriticalErrorNotification(component, error, context = {}) {
        let message = `🚨 КРИТИЧЕСКАЯ ОШИБКА\n\n` +
                      `Компонент: ${component}\n` +
                      `Ошибка: ${error.name || 'Unknown'}\n` +
                      `Сообщение: ${error.message}\n` +
                      `Время: ${new Date().toLocaleString('ru-RU')}\n`;

        if (context.url) {
            message += `URL: ${context.url}\n`;
        }

        await sendMessage(message);
    }

    /**
     * Отправка ежедневного отчета
     */
    async function sendDailyReport(dailyStats = {}) {
        let message = `📊 *Ежедневный отчет*\n\n` +
                      `*Дата:* ${new Date().toLocaleDateString('ru-RU')}\n` +
                      `*Всего обработано:* ${dailyStats.totalProcessed || 0} объявлений\n` +
                      `*Ошибок:* ${dailyStats.totalErrors || 0}\n` +
                      `*Активных парсеров:* ${dailyStats.activeParsers || 0}\n\n`;

        if (dailyStats.parserStats) {
            message += `*Статистика по парсерам:*\n`;
            for (const [parser, stats] of Object.entries(dailyStats.parserStats)) {
                message += `• ${parser}: ${stats.processed || 0} объявлений\n`;
            }
        }

        await sendMessage(message);
    }

    /**
     * Отправка уведомления о состоянии системы
     */
    async function sendSystemStatusNotification(systemStatus = {}) {
        const message = `💻 *Статус системы*\n\n` +
                      `*Память:* ${systemStatus.memory || 'неизвестно'}\n` +
                      `*CPU:* ${systemStatus.cpu || 'неизвестно'}\n` +
                      `*Активные парсеры:* ${systemStatus.activeParsers || 0}\n` +
                      `*Время:* ${new Date().toLocaleString('ru-RU')}\n`;

        await sendMessage(message);
    }

    /**
     * Отправка уведомления о смене модуля парсера
     */
    async function sendModuleChangeNotification(fromModule, toModule, info = {}) {
        const message = `🔄 Смена модуля парсера\n\n` +
                      `С модуля: ${fromModule}\n` +
                      `На модуль: ${toModule}\n` +
                      `Время: ${new Date().toLocaleString('ru-RU')}\n` +
                      (info.reason ? `Причина: ${info.reason}\n` : '');

        await sendMessage(message);
    }

    /**
     * Тестовая отправка сообщения
     */
    async function testConnection() {
        const message = `🧪 *Тест подключения*\n\n` +
                      `Telegram сервис работает!\n` +
                      `Время: ${new Date().toLocaleString('ru-RU')}`;

        return await sendMessage(message);
    }

    /**
     * Включение/отключение уведомлений
     */
    function setNotificationsEnabled(enabled) {
        state.config.enableNotifications = enabled;
        console.log(`Telegram уведомления ${enabled ? 'включены' : 'отключены'}`);
    }

    /**
     * Проверка статуса сервиса
     */
    function getStatus() {
        return {
            enabled: state.isEnabled,
            notificationsEnabled: state.config.enableNotifications,
            queueLength: state.messageQueue.length,
            isProcessingQueue: state.isProcessingQueue,
            lastMessageTime: state.lastMessageTime
        };
    }

    return {
        sendMessage,
        sendParserStartNotification,
        sendParserSuccessNotification,
        sendParserProgressNotification,
        sendParserSwitchNotification,
        sendCriticalErrorNotification,
        sendDailyReport,
        sendSystemStatusNotification,
        sendModuleChangeNotification,
        testConnection,
        setNotificationsEnabled,
        getStatus
    };
}

// Создаем глобальный экземпляр
const telegramService = createTelegramService();

module.exports = { createTelegramService, telegramService };
