const { createOpenSooqParser } = require('./OpenSooqParser');
const { createModuleConfig, initializeBrowser, cleanupModuleResources, handleModuleError, createModuleSuccessResult } = require('../../utils/moduleHelpers');

/**
 * Создание модуля парсера OpenSooq (функциональный стиль)
 */
function createOpenSooqModule() {
    const config = createModuleConfig({
        name: 'OpenSooq',
        baseUrl: 'https://ae.opensooq.com',
        listingsUrl: 'https://ae.opensooq.com/en/cars/cars-for-sale',
        maxRetries: 3,
        retryDelay: 5000,
        delayBetweenRequests: 2000,
        timeout: 30000
    });

    const state = {
        name: 'OpenSooq',
        config,
        parser: null,
        browser: null,
        context: null
    };

    async function initialize() {
        try {
            console.log(`🚀 Инициализация модуля ${state.name}...`);
            const browserData = await initializeBrowser({
                ...config,
                locale: 'en-AE',
                geolocation: { latitude: 25.2048, longitude: 55.2708 },
                extraHeaders: {
                    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Referer': 'https://ae.opensooq.com/en',
                    'Origin': 'https://ae.opensooq.com'
                }
            });
            state.browser = browserData.browser;
            state.context = browserData.context;
            state.parser = createOpenSooqParser(config);
            await state.parser.initialize(state.context);
            console.log(`✅ Модуль ${state.name} инициализирован`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка инициализации модуля ${state.name}:`, error.message);
            return false;
        }
    }

    async function* getListings() {
        if (!state.parser) throw new Error('Module not initialized. Call initialize() first.');
        yield* state.parser.getListings();
    }

    async function parseListing(url) {
        if (!state.parser) throw new Error('Module not initialized. Call initialize() first.');
        return await state.parser.parseListing(url);
    }

    async function run() {
        try {
            console.log(`🚀 Запускаем парсер ${state.name}...`);
            if (!state.parser) throw new Error('Module not initialized. Call initialize() first.');
            const results = await state.parser.run();
            console.log(`✅ Парсер ${state.name} завершен. Обработано: ${results.length} объявлений`);
            await cleanupModuleResources({ parser: state.parser, context: state.context, browser: state.browser });
            return createModuleSuccessResult(results.length, results);
        } catch (error) {
            return await handleModuleError(state.name, error, { parser: state.parser, context: state.context, browser: state.browser });
        }
    }

    async function cleanup() {
        await cleanupModuleResources({ parser: state.parser, context: state.context, browser: state.browser });
    }

    function getInfo() {
        return { name: state.name, baseUrl: config.baseUrl, timeout: config.timeout };
    }

    async function isAvailable() {
        return true;
    }

    return {
        get name() { return state.name; },
        get config() { return config; },
        get parser() { return state.parser; },
        get context() { return state.context; },
        get browser() { return state.browser; },
        initialize, getListings, parseListing, run, cleanup, getInfo, isAvailable
    };
}

module.exports = { createOpenSooqModule, OpenSooqModule: createOpenSooqModule };
