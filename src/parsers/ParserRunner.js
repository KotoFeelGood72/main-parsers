const { startBrowser, logMemoryUsage, forceGarbageCollection } = require('../utils/browser');
const { saveData } = require('../utils/saveData');
const { databaseManager } = require('../database/database');
const { parserModuleManager } = require('./ModuleManager');
const { errorHandler } = require('../services/ErrorHandler');
const { telegramService } = require('../services/TelegramService');

/**
 * Создание раннера парсеров (функциональный стиль)
 */
function createParserRunner() {
    const state = {
        isRunning: false,
        currentParser: null,
        browser: null,
        context: null,
        memoryCheckCounter: 0,
        parserQueue: [],
        parserStats: new Map()
    };

    /**
     * Задержка
     */
    async function delay(ms) {
        await new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Обновление статистики парсера
     */
    function updateParserStats(parserName, processedCount) {
        const currentStats = state.parserStats.get(parserName) || {
            totalProcessed: 0,
            lastRun: null,
            runs: 0
        };

        currentStats.totalProcessed += processedCount;
        currentStats.lastRun = new Date();
        currentStats.runs++;

        state.parserStats.set(parserName, currentStats);
    }

    /**
     * Получение статистики памяти
     */
    function getMemoryStats() {
        const usage = process.memoryUsage();
        return {
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
            external: Math.round(usage.external / 1024 / 1024),
            rss: Math.round(usage.rss / 1024 / 1024),
            processedCount: state.memoryCheckCounter
        };
    }

    /**
     * Вывод статистики парсеров
     */
    function printStats() {
        console.log("\n📊 Статистика:");
        
        for (const [parserName, stats] of state.parserStats) {
            console.log(`   ${parserName}: ${stats.totalProcessed} объявлений`);
        }

        const totalProcessed = Array.from(state.parserStats.values())
            .reduce((sum, stats) => sum + stats.totalProcessed, 0);
        
        console.log(`   Всего: ${totalProcessed} объявлений`);
    }

    /**
     * Запуск одного парсера
     */
    async function runParser(parserName, globalConfig = {}, dbManager = null) {
        console.log(`🎯 ${parserName}`);

        const parser = parserModuleManager.getModule(parserName);
        if (!parser) {
            console.error(`❌ Парсер ${parserName} не найден в модулях`);
            const error = new Error(`Парсер ${parserName} не найден в модулях`);
            await errorHandler.handleParserError(parserName, error, {
                parserName,
                context: 'parser_not_found'
            });
            return;
        }
        state.currentParser = parser;

        try {
            await parser.initialize(state.context, dbManager);
        } catch (error) {
            console.error(`❌ Ошибка инициализации парсера ${parserName}:`, error);
            await errorHandler.handleParserError(parserName, error, {
                parserName,
                context: 'parser_initialization'
            });
            return;
        }

        if (telegramService.getStatus().enabled) {
            await telegramService.sendParserStartNotification(parserName, {
                mode: 'parsing'
            });
        }

        let processedCount = 0;

        try {
            for await (const link of parser.getListings()) {
                if (!state.isRunning) break;

                try {
                    const rawData = await parser.parseListing(link);
                    if (rawData) {
                        await saveData(rawData);
                        processedCount++;
                        state.memoryCheckCounter++;

                        if (state.memoryCheckCounter % 10 === 0) {
                            logMemoryUsage();
                        }
                    }
                } catch (error) {
                    console.error(`❌ Ошибка обработки: ${error.message}`);
                    await errorHandler.handleParsingError(parserName, error, {
                        url: link,
                        parserName,
                        context: 'listing_processing'
                    });
                }
            }

            updateParserStats(parserName, processedCount);

            if (telegramService.getStatus().enabled && processedCount > 0) {
                await telegramService.sendParserSuccessNotification(parserName, {
                    processed: processedCount,
                    duration: 'completed'
                });
            }

        } catch (error) {
            console.error(`❌ Ошибка парсинга ${parserName}: ${error.message}`);
            await errorHandler.handleParserError(parserName, error, {
                parserName,
                context: 'main_parsing_loop'
            });
        } finally {
            try {
                const cleanupMethod = parser && typeof parser.cleanup === 'function' ? parser.cleanup : null;
                if (cleanupMethod) {
                    await cleanupMethod.call(parser);
                }
            } catch (cleanupError) {
                console.error("❌ Ошибка очистки:", cleanupError.message);
                await errorHandler.handleSystemError('parser_cleanup', cleanupError, {
                    parserName,
                    context: 'cleanup'
                });
            }
        }

        console.log(`✅ ${parserName}: ${processedCount} объявлений`);
    }

    /**
     * Основной цикл парсинга
     */
    async function runCycle(globalConfig = {}, dbManager = null) {
        let cycleCount = 0;

        while (state.isRunning) {
            cycleCount++;
            console.log(`🔄 Цикл ${cycleCount}`);

            for (const parserName of state.parserQueue) {
                if (!state.isRunning) break;

                try {
                    await runParser(parserName, globalConfig, dbManager);
                } catch (error) {
                    console.error(`❌ Ошибка парсера ${parserName}: ${error.message}`);
                    await errorHandler.handleParserError(parserName, error, {
                        parserName,
                        cycleCount,
                        context: 'parser_runner'
                    });
                }

                if (state.isRunning) {
                    await delay(5000);
                }
            }

            if (state.isRunning) {
                forceGarbageCollection();
            }
        }

        console.log("✅ Циклический парсинг остановлен");
    }

    /**
     * Запуск циклического парсинга
     */
    async function startCycling(parserNames = [], globalConfig = {}) {
        if (state.isRunning) {
            console.log("⚠️ Парсер уже запущен");
            return;
        }

        if (parserNames.length === 0) {
            parserNames = parserModuleManager.getModules();
        }

        if (parserNames.length === 0) {
            console.error("❌ Нет доступных парсеров для запуска");
            return;
        }

        state.isRunning = true;
        state.parserQueue = [...parserNames];
        
        console.log(`🚀 Запуск парсеров: ${parserNames.join(', ')}`);

        if (telegramService.getStatus().enabled) {
            await telegramService.sendParserStartNotification('ParserRunner', { 
                mode: 'cycle',
                parsers: parserNames.join(', ')
            });
        }

        try {
            await databaseManager.initialize();
        } catch (error) {
            console.error("❌ База данных недоступна, используем файлы");
            await errorHandler.handleSystemError('database', error, {
                component: 'ParserRunner',
                action: 'initialize'
            });
        }

        try {
            const { createStealthContext } = require('../utils/browser');
            state.browser = await startBrowser();
            state.context = await createStealthContext(state.browser);
        } catch (error) {
            console.error("❌ Не удалось инициализировать браузер:", error);
            await errorHandler.handleBrowserError('ParserRunner', error, {
                component: 'ParserRunner',
                action: 'startBrowser'
            });
            state.isRunning = false;
            return;
        }

        state.memoryCheckCounter = 0;
        await runCycle(globalConfig, databaseManager);
    }

    /**
     * Остановка циклического парсинга
     */
    async function stop() {
        console.log("🛑 Остановка...");
        state.isRunning = false;

        if (state.currentParser) {
            try {
                const cleanupMethod = typeof state.currentParser.cleanup === 'function' 
                    ? state.currentParser.cleanup 
                    : null;
                if (cleanupMethod) {
                    await cleanupMethod.call(state.currentParser);
                }
            } catch (error) {
                console.error("❌ Ошибка очистки парсера:", error.message);
                await errorHandler.handleSystemError('parser_cleanup', error, {
                    component: 'ParserRunner',
                    action: 'stop_cleanup'
                });
            }
        }

        if (state.context) {
            try {
                await state.context.close();
            } catch (error) {
                console.error("❌ Ошибка закрытия контекста:", error.message);
                await errorHandler.handleBrowserError('ParserRunner', error, {
                    component: 'ParserRunner',
                    action: 'close_context'
                });
            }
        }

        if (state.browser) {
            try {
                await state.browser.close();
            } catch (error) {
                console.error("❌ Ошибка закрытия браузера:", error.message);
                await errorHandler.handleBrowserError('ParserRunner', error, {
                    component: 'ParserRunner',
                    action: 'close_browser'
                });
            }
        }

        forceGarbageCollection();
        printStats();
    }

    /**
     * Получение статистики
     */
    function getStats() {
        return {
            isRunning: state.isRunning,
            currentParser: state.currentParser?.name || null,
            parserQueue: [...state.parserQueue],
            parserStats: Object.fromEntries(state.parserStats),
            memoryStats: getMemoryStats()
        };
    }

    /**
     * Добавление парсера в очередь
     */
    function addParser(parserName) {
        if (!state.parserQueue.includes(parserName)) {
            state.parserQueue.push(parserName);
            console.log(`✅ Парсер ${parserName} добавлен в очередь`);
        }
    }

    /**
     * Удаление парсера из очереди
     */
    function removeParser(parserName) {
        const index = state.parserQueue.indexOf(parserName);
        if (index > -1) {
            state.parserQueue.splice(index, 1);
            console.log(`✅ Парсер ${parserName} удален из очереди`);
        }
    }

    return {
        startCycling,
        stop,
        getStats,
        addParser,
        removeParser
    };
}

// Создаем глобальный экземпляр
const parserRunner = createParserRunner();

module.exports = { createParserRunner, parserRunner };
