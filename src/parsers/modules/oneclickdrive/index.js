const { createOneclickdriveParser } = require('./OneclickdriveParser');
const { createModuleConfig, initializeBrowser, cleanupModuleResources, handleModuleError, createModuleSuccessResult } = require('../../utils/moduleHelpers');

/**
 * Создание модуля парсера OneClickDrive (функциональный стиль)
 */
function createOneclickdriveModule() {
    const config = createModuleConfig({
        name: 'OneClickDrive',
        baseUrl: 'https://www.oneclickdrive.com',
        listingsUrl: 'https://www.oneclickdrive.com/buy-used-cars-dubai?page={page}',
        timeout: 60000,
        delayBetweenRequests: 1000,
        maxRetries: 3,
        enableImageLoading: false
    });

    const state = {
        name: 'OneClickDrive',
        config,
        parser: null,
        browser: null,
        context: null
    };

    async function initialize() {
        try {
            console.log(`🚀 Инициализация модуля ${state.name}...`);
            const browserData = await initializeBrowser(config);
            state.browser = browserData.browser;
            state.context = browserData.context;
            state.parser = createOneclickdriveParser(config);
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

module.exports = { createOneclickdriveModule, OneclickdriveModule: createOneclickdriveModule };
