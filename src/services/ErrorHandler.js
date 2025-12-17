const { loggerService } = require('./LoggerService');
const { telegramService } = require('./TelegramService');

/**
 * Создание обработчика ошибок (функциональный стиль)
 */
function createErrorHandler(config = {}) {
    const defaultConfig = {
        enableTelegram: true,
        enableFileLogging: true,
        enableConsoleLogging: true,
        maxErrorsPerHour: 50,
        errorCooldown: 300000,
        criticalErrorThreshold: 10,
        ...config
    };

    const state = {
        config: defaultConfig,
        errorCounts: new Map(),
        lastErrorTimes: new Map(),
        criticalErrors: new Set(),
        logger: loggerService,
        telegram: telegramService
    };

    // Связываем сервисы
    state.logger.setTelegramService(state.telegram);

    // Очистка счетчиков каждый час
    setInterval(() => {
        clearHourlyCounters();
    }, 3600000);

    /**
     * Проверка лимита ошибок
     */
    function isErrorRateLimited(parserName, errorKey, now) {
        const lastTime = state.lastErrorTimes.get(errorKey) || 0;
        const timeDiff = now - lastTime;
        
        if (timeDiff < state.config.errorCooldown) {
            return true;
        }

        const hourlyCount = state.errorCounts.get(parserName) || 0;
        if (hourlyCount >= state.config.maxErrorsPerHour) {
            return true;
        }

        return false;
    }

    /**
     * Обновление счетчиков ошибок
     */
    function updateErrorCounters(parserName, errorKey, now) {
        const parserCount = state.errorCounts.get(parserName) || 0;
        state.errorCounts.set(parserName, parserCount + 1);
        state.lastErrorTimes.set(errorKey, now);
    }

    /**
     * Определение критичности ошибки
     */
    function isCriticalError(parserName, error, context) {
        const criticalErrorTypes = [
            'TimeoutError',
            'NetworkError',
            'DatabaseError',
            'MemoryError',
            'BrowserError'
        ];

        if (criticalErrorTypes.includes(error.name)) {
            return true;
        }

        const errorCount = state.errorCounts.get(parserName) || 0;
        if (errorCount >= state.config.criticalErrorThreshold) {
            return true;
        }

        if (context.isCritical || context.critical) {
            return true;
        }

        return false;
    }

    /**
     * Обработка критической ошибки
     */
    async function handleCriticalError(parserName, error, context) {
        state.criticalErrors.add(`${parserName}:${error.name}`);

        state.logger.logger.error(`CRITICAL ERROR in ${parserName}`, {
            error: error.message,
            stack: error.stack,
            context
        });

        if (error.name === 'MemoryError' && global.gc) {
            global.gc();
        }
    }

    /**
     * Очистка счетчиков каждый час
     */
    function clearHourlyCounters() {
        state.errorCounts.clear();
        state.logger.logInfo('Hourly error counters cleared');
    }

    /**
     * Обработка ошибки парсера
     */
    async function handleParserError(parserName, error, context = {}) {
        const errorKey = `${parserName}:${error.name || 'Unknown'}`;
        const now = Date.now();
        
        if (isErrorRateLimited(parserName, errorKey, now)) {
            return;
        }

        updateErrorCounters(parserName, errorKey, now);
        const isCritical = isCriticalError(parserName, error, context);

        await state.logger.logParserError(parserName, error, {
            ...context,
            isCritical,
            errorCount: state.errorCounts.get(parserName) || 0
        });

        if (isCritical && state.config.enableTelegram) {
            await state.telegram.sendCriticalErrorNotification(parserName, error, context);
        }

        if (isCritical) {
            await handleCriticalError(parserName, error, context);
        }
    }

    /**
     * Обработка системной ошибки
     */
    async function handleSystemError(component, error, context = {}) {
        // Если это предупреждение (например, БД недоступна, но система может работать без неё)
        if (context.isWarning || context.skipCritical) {
            // Логируем как предупреждение, а не как критическую ошибку
            state.logger.logWarning(`System Warning [${component}]:`, {
                error: error.message,
                context
            });
            return; // Не отправляем уведомления в Telegram для предупреждений
        }
        
        await state.logger.logSystemError(component, error, context);

        if (state.config.enableTelegram) {
            await state.telegram.sendCriticalErrorNotification(component, error, context);
        }
    }

    /**
     * Обработка ошибки браузера
     */
    async function handleBrowserError(parserName, error, context = {}) {
        const browserContext = {
            ...context,
            errorType: 'browser',
            url: context.url || 'unknown',
            userAgent: context.userAgent || 'unknown'
        };

        await handleParserError(parserName, error, browserContext);
    }

    /**
     * Обработка ошибки сети
     */
    async function handleNetworkError(parserName, error, context = {}) {
        const networkContext = {
            ...context,
            errorType: 'network',
            url: context.url || 'unknown',
            statusCode: context.statusCode || 'unknown'
        };

        await handleParserError(parserName, error, networkContext);
    }

    /**
     * Обработка ошибки парсинга данных
     */
    async function handleParsingError(parserName, error, context = {}) {
        const parsingContext = {
            ...context,
            errorType: 'parsing',
            selector: context.selector || 'unknown',
            element: context.element || 'unknown'
        };

        await handleParserError(parserName, error, parsingContext);
    }

    /**
     * Обработка ошибки базы данных
     */
    async function handleDatabaseError(component, error, context = {}) {
        const dbContext = {
            ...context,
            errorType: 'database',
            query: context.query || 'unknown',
            table: context.table || 'unknown'
        };

        await handleSystemError(component, error, dbContext);
    }

    /**
     * Получение статистики ошибок
     */
    function getErrorStats() {
        return {
            errorCounts: Object.fromEntries(state.errorCounts),
            criticalErrors: Array.from(state.criticalErrors),
            lastErrorTimes: Object.fromEntries(state.lastErrorTimes),
            loggerStats: state.logger.getErrorStats()
        };
    }

    /**
     * Сброс всех счетчиков
     */
    function resetCounters() {
        state.errorCounts.clear();
        state.lastErrorTimes.clear();
        state.criticalErrors.clear();
        state.logger.clearErrorStats();
    }

    /**
     * Тест обработчика ошибок
     */
    async function test() {
        try {
            const testError = new Error('Test error for error handler');
            await handleParserError('test_parser', testError, { test: true });
            return true;
        } catch (error) {
            console.error('Error handler test failed:', error.message);
            return false;
        }
    }

    return {
        handleParserError,
        handleSystemError,
        handleBrowserError,
        handleNetworkError,
        handleParsingError,
        handleDatabaseError,
        getErrorStats,
        resetCounters,
        test
    };
}

// Создаем глобальный экземпляр
const errorHandler = createErrorHandler();

module.exports = { createErrorHandler, errorHandler };
