const path = require('path');
const fs = require('fs');

/**
 * Создание сервиса логирования (функциональный стиль)
 */
function createLoggerService(config = {}) {
    const defaultConfig = {
        logLevel: 'info',
        logDir: path.join(process.cwd(), 'logs'),
        maxFiles: 10,
        maxSize: '10MB',
        enableConsole: true,
        enableFile: true,
        enableTelegram: false,
        ...config
    };

    const state = {
        config: defaultConfig,
        telegramService: null,
        errorCounts: new Map(),
        lastErrorTime: new Map()
    };

    // Создаем директорию для логов если её нет
    if (!fs.existsSync(state.config.logDir)) {
        fs.mkdirSync(state.config.logDir, { recursive: true });
    }

    /**
     * Запись в файл
     */
    function writeToFile(filename, content) {
        try {
            const filePath = path.join(state.config.logDir, filename);
            fs.appendFileSync(filePath, content);
        } catch (error) {
            console.error('Ошибка записи в файл лога:', error.message);
        }
    }

    /**
     * Простое логирование
     */
    function log(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...meta
        };

        const logLine = `${timestamp} [${level.toUpperCase()}] ${message} ${JSON.stringify(meta)}`;

        if (state.config.enableConsole) {
            const colors = {
                error: '\x1b[31m',
                warn: '\x1b[33m',
                info: '\x1b[32m',
                debug: '\x1b[36m'
            };
            const reset = '\x1b[0m';
            console.log(`${colors[level] || ''}${logLine}${reset}`);
        }

        if (state.config.enableFile) {
            writeToFile('parser.log', JSON.stringify(logEntry) + '\n');
            
            if (level === 'error') {
                writeToFile('errors.log', JSON.stringify(logEntry) + '\n');
            }
        }
    }

    // Создаем объект логгера
    const logger = {
        error: (message, meta = {}) => log('error', message, meta),
        warn: (message, meta = {}) => log('warn', message, meta),
        info: (message, meta = {}) => log('info', message, meta),
        debug: (message, meta = {}) => log('debug', message, meta)
    };

    /**
     * Отправка уведомления в Telegram
     */
    async function sendTelegramNotification(component, error, context, count = 1, type = 'parser') {
        if (!state.telegramService) return;

        try {
            const emoji = type === 'parser' ? '🚨' : '⚠️';
            const title = type === 'parser' ? 'Ошибка парсера' : 'Системная ошибка';
            
            let message = `${emoji} *${title}*\n\n`;
            message += `*Компонент:* ${component}\n`;
            message += `*Ошибка:* ${error.name || 'Unknown'}\n`;
            message += `*Сообщение:* ${error.message}\n`;
            message += `*Повторений:* ${count}\n`;
            message += `*Время:* ${new Date().toLocaleString('ru-RU')}\n`;

            if (context.url) {
                message += `*URL:* ${context.url}\n`;
            }
            if (context.parserName) {
                message += `*Парсер:* ${context.parserName}\n`;
            }

            if (error.stack && count <= 3) {
                const stackLines = error.stack.split('\n').slice(0, 5);
                message += `\n*Стек:*\n\`\`\`\n${stackLines.join('\n')}\`\`\``;
            }

            await state.telegramService.sendMessage(message);
        } catch (telegramError) {
            logger.error('Failed to send Telegram notification', {
                originalError: error.message,
                telegramError: telegramError.message
            });
        }
    }

    /**
     * Логирование ошибки парсера
     */
    async function logParserError(parserName, error, context = {}) {
        const errorKey = `${parserName}:${error.name || 'Unknown'}`;
        const now = new Date();
        
        state.errorCounts.set(errorKey, (state.errorCounts.get(errorKey) || 0) + 1);
        state.lastErrorTime.set(errorKey, now);

        const errorData = {
            parser: parserName,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context,
            timestamp: now.toISOString(),
            count: state.errorCounts.get(errorKey)
        };

        logger.error(`Parser Error [${parserName}]: ${error.message}`, errorData);

        if (state.config.enableTelegram && state.telegramService) {
            await sendTelegramNotification(parserName, error, context, errorData.count);
        }
    }

    /**
     * Логирование системной ошибки
     */
    async function logSystemError(component, error, context = {}) {
        const errorData = {
            component,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context,
            timestamp: new Date().toISOString()
        };

        logger.error(`System Error [${component}]: ${error.message}`, errorData);

        if (state.config.enableTelegram && state.telegramService) {
            await sendTelegramNotification(component, error, context, 1, 'system');
        }
    }

    /**
     * Логирование информационного сообщения
     */
    function logInfo(message, meta = {}) {
        logger.info(message, meta);
    }

    /**
     * Логирование предупреждения
     */
    function logWarning(message, meta = {}) {
        logger.warn(message, meta);
    }

    /**
     * Логирование успешного события
     */
    function logSuccess(parserName, stats = {}) {
        logger.info(`Parser Success [${parserName}]`, {
            parser: parserName,
            stats,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Установка Telegram сервиса
     */
    function setTelegramService(telegramService) {
        state.telegramService = telegramService;
        state.config.enableTelegram = true;
    }

    /**
     * Получение статистики ошибок
     */
    function getErrorStats() {
        const stats = {};
        for (const [key, count] of state.errorCounts) {
            const [parser, errorType] = key.split(':');
            if (!stats[parser]) {
                stats[parser] = {};
            }
            stats[parser][errorType] = {
                count,
                lastTime: state.lastErrorTime.get(key)
            };
        }
        return stats;
    }

    /**
     * Очистка статистики ошибок
     */
    function clearErrorStats() {
        state.errorCounts.clear();
        state.lastErrorTime.clear();
        logger.info('Error statistics cleared');
    }

    return {
        logger,
        logParserError,
        logSystemError,
        logInfo,
        logWarning,
        logSuccess,
        setTelegramService,
        getErrorStats,
        clearErrorStats,
        getLogger: () => logger
    };
}

// Создаем глобальный экземпляр
const loggerService = createLoggerService();

module.exports = { createLoggerService, loggerService };
