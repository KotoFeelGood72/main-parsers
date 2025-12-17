const { createBaseParser } = require('../../BaseParser');
const { SharraiListingParser } = require('./entities/listing');
const { SharraiDetailParser } = require('./entities/detail');
const { saveData } = require('../../../utils/saveData');

/**
 * Создание парсера Sharrai (функциональный стиль)
 */
function createSharraiParser(config = {}) {
    const parserConfig = {
        baseUrl: 'https://sharrai.ae',
        listingsUrl: 'https://sharrai.ae/search-result/featured',
        timeout: 90000,
        delayBetweenRequests: 1000,
        maxRetries: 3,
        enableImageLoading: false,
        ...config
    };

    const baseParser = createBaseParser('Sharrai', parserConfig);
    const listingParser = new SharraiListingParser(parserConfig);
    const detailParser = new SharraiDetailParser(parserConfig);

    /**
     * Получение списка объявлений
     */
    async function* getListings() {
        if (!baseParser.context) {
            throw new Error('Parser not initialized. Call initialize() first.');
        }
        yield* listingParser.getListings(baseParser.context);
    }

    /**
     * Парсинг детальной информации об объявлении
     */
    async function parseListing(url) {
        if (!baseParser.context) {
            throw new Error('Parser not initialized. Call initialize() first.');
        }
        return await detailParser.parseCarDetails(url, baseParser.context);
    }

    /**
     * Сохранение данных в базу
     */
    async function saveCarData(carDetails) {
        try {
            await saveData(carDetails);
        } catch (error) {
            console.error(`❌ Ошибка сохранения данных:`, error.message);
        }
    }

    /**
     * Запуск полного цикла парсинга
     */
    async function run() {
        const results = [];
        
        try {
            console.log(`🚀 Запускаем парсер ${baseParser.name}...`);
            
            for await (const listingUrl of getListings()) {
                console.log(`🚗 Обрабатываем ${listingUrl}`);
                
                try {
                    const carDetails = await parseListing(listingUrl);
                    if (carDetails) {
                        results.push(carDetails);
                        await saveCarData(carDetails);
                    }
                } catch (error) {
                    console.error(`❌ Ошибка при обработке ${listingUrl}:`, error);
                }
            }
            
            console.log(`✅ Парсер ${baseParser.name} завершен. Обработано: ${results.length} объявлений`);
            return results;
            
        } catch (error) {
            console.error(`❌ Ошибка в парсере ${baseParser.name}:`, error.message);
            throw error;
        } finally {
            await baseParser.cleanup();
        }
    }

    /**
     * Получение информации о парсере
     */
    function getInfo() {
        return {
            name: baseParser.name,
            baseUrl: parserConfig.baseUrl,
            listingsUrl: parserConfig.listingsUrl,
            timeout: parserConfig.timeout
        };
    }

    return {
        get name() { return baseParser.name; },
        get config() { return parserConfig; },
        get context() { return baseParser.context; },
        initialize: baseParser.initialize,
        getListings,
        parseListing,
        validateData: baseParser.validateData,
        run,
        cleanup: baseParser.cleanup,
        getInfo
    };
}

module.exports = { createSharraiParser, SharraiParser: createSharraiParser };

