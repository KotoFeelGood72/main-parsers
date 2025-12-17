const { errorHandler } = require('../services/ErrorHandler');
const { validateCarData } = require('./utils/parserHelpers');

/**
 * Создание базового парсера (функциональный стиль)
 */
function createBaseParser(name, config = {}) {
    const defaultConfig = {
        maxRetries: 3,
        timeout: 60000,
        delayBetweenRequests: 1000,
        enableImageLoading: false,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ...config
    };

    const state = {
        name,
        config: defaultConfig,
        context: null,
        databaseManager: null
    };

    /**
     * Инициализация парсера
     */
    async function initialize(context, databaseManager = null) {
        state.context = context;
        state.databaseManager = databaseManager;
        console.log(`🚀 Инициализация парсера: ${state.name}`);
    }

    /**
     * Валидация данных объявления
     */
    function validateData(data) {
        return validateCarData(data);
    }

    /**
     * Задержка между запросами
     */
    async function delay(ms = null) {
        const delayTime = ms || state.config.delayBetweenRequests;
        await new Promise(resolve => setTimeout(resolve, delayTime));
    }

    /**
     * Очистка ресурсов парсера
     */
    async function cleanup() {
        console.log(`🧹 Очистка ресурсов парсера: ${state.name}`);
    }

    return {
        get name() { return state.name; },
        get config() { return state.config; },
        get context() { return state.context; },
        get databaseManager() { return state.databaseManager; },
        initialize,
        validateData,
        delay,
        cleanup
    };
}

module.exports = { createBaseParser };
