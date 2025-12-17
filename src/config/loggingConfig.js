/**
 * Конфигурация для сервисов логирования и уведомлений
 */

module.exports = {
    // Настройки логирования
    logging: {
        // Уровень логирования (error, warn, info, debug)
        level: process.env.LOG_LEVEL || 'info',
        
        // Директория для логов
        logDir: process.env.LOG_DIR || './logs',
        
        // Максимальный размер файла лога
        maxFileSize: process.env.LOG_MAX_SIZE || '10MB',
        
        // Максимальное количество файлов логов
        maxFiles: parseInt(process.env.LOG_MAX_FILES) || 10,
        
        // Включить консольный вывод
        enableConsole: process.env.LOG_CONSOLE !== 'false',
        
        // Включить файловое логирование
        enableFile: process.env.LOG_FILE !== 'false'
    },

    // Настройки Telegram
    telegram: {
        // Токен бота (обязательно)
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        
        // ID чата (обязательно)
        chatId: process.env.TELEGRAM_CHAT_ID || '',
        
        // Таймаут запросов к API
        timeout: parseInt(process.env.TELEGRAM_TIMEOUT) || 10000,
        
        // Количество попыток отправки
        retryAttempts: parseInt(process.env.TELEGRAM_RETRY_ATTEMPTS) || 3,
        
        // Задержка между попытками
        retryDelay: parseInt(process.env.TELEGRAM_RETRY_DELAY) || 1000,
        
        // Задержка между сообщениями (rate limit)
        rateLimitDelay: parseInt(process.env.TELEGRAM_RATE_LIMIT) || 1000,
        
        // Включить уведомления
        enableNotifications: process.env.TELEGRAM_ENABLED !== 'false'
    },

    // Настройки обработки ошибок
    errorHandling: {
        // Максимум ошибок в час для одного парсера
        maxErrorsPerHour: parseInt(process.env.MAX_ERRORS_PER_HOUR) || 50,
        
        // Задержка между одинаковыми ошибками (мс)
        errorCooldown: parseInt(process.env.ERROR_COOLDOWN) || 300000, // 5 минут
        
        // Порог для критических ошибок
        criticalErrorThreshold: parseInt(process.env.CRITICAL_ERROR_THRESHOLD) || 10,
        
        // Включить Telegram уведомления
        enableTelegram: process.env.ERROR_TELEGRAM_ENABLED !== 'false',
        
        // Включить файловое логирование
        enableFileLogging: process.env.ERROR_FILE_ENABLED !== 'false',
        
        // Включить консольное логирование
        enableConsoleLogging: process.env.ERROR_CONSOLE_ENABLED !== 'false'
    },

    // Настройки уведомлений
    notifications: {
        // Отправлять уведомления о запуске парсеров
        sendStartNotifications: process.env.NOTIFY_START !== 'false',
        
        // Отправлять уведомления об успешном завершении
        sendSuccessNotifications: process.env.NOTIFY_SUCCESS !== 'false',
        
        // Отправлять ежедневные отчеты
        sendDailyReports: process.env.NOTIFY_DAILY !== 'false',
        
        // Время отправки ежедневного отчета (UTC)
        dailyReportTime: process.env.DAILY_REPORT_TIME || '09:00',
        
        // Отправлять уведомления о состоянии системы
        sendSystemStatus: process.env.NOTIFY_SYSTEM_STATUS !== 'false',
        
        // Интервал отправки статуса системы (мс)
        systemStatusInterval: parseInt(process.env.SYSTEM_STATUS_INTERVAL) || 3600000 // 1 час
    },

    // Настройки парсеров
    parsers: {
        // Включить логирование для всех парсеров
        enableLogging: process.env.PARSER_LOGGING !== 'false',
        
        // Логировать успешные операции
        logSuccess: process.env.PARSER_LOG_SUCCESS !== 'false',
        
        // Логировать предупреждения
        logWarnings: process.env.PARSER_LOG_WARNINGS !== 'false',
        
        // Максимальная длина сообщения об ошибке
        maxErrorMessageLength: parseInt(process.env.MAX_ERROR_MESSAGE_LENGTH) || 1000
    }
};
