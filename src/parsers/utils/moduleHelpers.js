/**
 * Общие утилиты для модулей парсеров (SOLID, DRY, KISS)
 */

const { startBrowser, createStealthContext } = require('../../utils/browser');

/**
 * Создание стандартной конфигурации модуля
 * @param {Object} customConfig - Пользовательская конфигурация
 * @returns {Object}
 */
function createModuleConfig(customConfig = {}) {
    return {
        name: customConfig.name || 'Unknown',
        baseUrl: customConfig.baseUrl || '',
        listingsUrl: customConfig.listingsUrl || '',
        timeout: customConfig.timeout || 60000,
        delayBetweenRequests: customConfig.delayBetweenRequests || 1000,
        maxRetries: customConfig.maxRetries || 3,
        retryDelay: customConfig.retryDelay || 5000,
        enableImageLoading: customConfig.enableImageLoading || false,
        ...customConfig
    };
}

/**
 * Инициализация браузера для модуля
 * @param {Object} config - Конфигурация модуля
 * @returns {Promise<Object>}
 */
async function initializeBrowser(config = {}) {
    const browser = await startBrowser();
    
    const contextOptions = {
        locale: config.locale || 'en-US',
        timezoneId: config.timezoneId || 'America/New_York',
        permissions: ['geolocation'],
        geolocation: config.geolocation || { latitude: 25.2048, longitude: 55.2708 },
        extraHTTPHeaders: {
            'Referer': config.baseUrl || '',
            'Origin': config.baseUrl || '',
            ...config.extraHeaders
        }
    };
    
    const context = await createStealthContext(browser, contextOptions);
    
    return { browser, context };
}

/**
 * Очистка ресурсов модуля
 * @param {Object} resources - Ресурсы для очистки
 * @returns {Promise<void>}
 */
async function cleanupModuleResources(resources = {}) {
    const { parser, context, browser } = resources;
    
    try {
        if (parser && typeof parser.cleanup === 'function') {
            await parser.cleanup();
        }
    } catch (err) {
        console.error(`❌ Ошибка очистки парсера:`, err.message);
    }

    try {
        if (context) {
            await context.close();
        }
    } catch (err) {
        console.error(`❌ Ошибка закрытия контекста:`, err.message);
    }

    try {
        if (browser) {
            await browser.close();
        }
    } catch (err) {
        console.error(`❌ Ошибка закрытия браузера:`, err.message);
    }
}

/**
 * Обработка ошибок модуля
 * @param {string} moduleName - Имя модуля
 * @param {Error} error - Ошибка
 * @param {Object} resources - Ресурсы для очистки
 * @returns {Object}
 */
async function handleModuleError(moduleName, error, resources = {}) {
    console.error(`❌ Ошибка в модуле ${moduleName}:`, error.message);
    
    await cleanupModuleResources(resources);
    
    return {
        success: false,
        error: error.message,
        processed: 0
    };
}

/**
 * Создание результата успешного выполнения модуля
 * @param {number} processed - Количество обработанных элементов
 * @param {Array} results - Результаты
 * @returns {Object}
 */
function createModuleSuccessResult(processed, results = []) {
    return {
        success: true,
        processed,
        results
    };
}

module.exports = {
    createModuleConfig,
    initializeBrowser,
    cleanupModuleResources,
    handleModuleError,
    createModuleSuccessResult
};

