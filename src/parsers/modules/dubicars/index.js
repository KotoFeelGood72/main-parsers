const { createDubicarsParser } = require('./DubicarsParser');
const { createModuleConfig, initializeBrowser, cleanupModuleResources, handleModuleError, createModuleSuccessResult } = require('../../utils/moduleHelpers');

/**
 * Создание модуля парсера Dubicars (функциональный стиль)
 */
function createDubicarsModule() {
    const config = createModuleConfig({
        name: 'Dubicars',
        baseUrl: 'https://www.dubicars.com',
        listingsUrl: 'https://www.dubicars.com/dubai/used?page={page}',
        timeout: 60000,
        delayBetweenRequests: 1000,
        maxRetries: 3,
        retryDelay: 5000,
        enableImageLoading: false
    });

    const state = {
        name: 'Dubicars',
        config,
        parser: null,
        browser: null,
        context: null
    };

    /**
     * Инициализация модуля
     */
    async function initialize() {
        try {
            console.log(`🚀 Инициализация модуля ${state.name}...`);
            
            const browserData = await initializeBrowser(config);
            state.browser = browserData.browser;
            state.context = browserData.context;
            
            state.parser = createDubicarsParser(config);
            await state.parser.initialize(state.context);
            
            console.log(`✅ Модуль ${state.name} инициализирован`);
            return true;
        } catch (error) {
            console.error(`❌ Ошибка инициализации модуля ${state.name}:`, error.message);
            return false;
        }
    }

    /**
     * Получение списка объявлений
     */
    async function* getListings() {
        if (!state.parser) {
            throw new Error('Module not initialized. Call initialize() first.');
        }
        yield* state.parser.getListings();
    }

    /**
     * Парсинг детальной информации об объявлении
     */
    async function parseListing(url) {
        if (!state.parser) {
            throw new Error('Module not initialized. Call initialize() first.');
        }
        return await state.parser.parseListing(url);
    }

    /**
     * Запуск парсера
     */
    async function run() {
        try {
            console.log(`🚀 Запускаем парсер ${state.name}...`);
            
            if (!state.parser) {
                throw new Error('Module not initialized. Call initialize() first.');
            }
            
            const results = await state.parser.run();
            
            console.log(`✅ Парсер ${state.name} завершен. Обработано: ${results.length} объявлений`);
            
            await cleanupModuleResources({
                parser: state.parser,
                context: state.context,
                browser: state.browser
            });
            
            return createModuleSuccessResult(results.length, results);
            
        } catch (error) {
            return await handleModuleError(state.name, error, {
                parser: state.parser,
                context: state.context,
                browser: state.browser
            });
        }
    }

    /**
     * Очистка ресурсов модуля
     */
    async function cleanup() {
        await cleanupModuleResources({
            parser: state.parser,
            context: state.context,
            browser: state.browser
        });
    }

    /**
     * Получение информации о модуле
     */
    function getInfo() {
        return {
            name: state.name,
            baseUrl: config.baseUrl,
            timeout: config.timeout
        };
    }

    /**
     * Проверка доступности модуля
     */
    async function isAvailable() {
        return true;
    }

    return {
        get name() { return state.name; },
        get config() { return config; },
        get parser() { return state.parser; },
        get context() { return state.context; },
        get browser() { return state.browser; },
        initialize,
        getListings,
        parseListing,
        run,
        cleanup,
        getInfo,
        isAvailable
    };
}

module.exports = { createDubicarsModule, DubicarsModule: createDubicarsModule };
