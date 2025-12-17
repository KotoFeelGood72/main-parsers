/**
 * Менеджер модулей парсеров (функциональный стиль)
 */

const { parserModuleManager } = require('./ModuleManager');

/**
 * Создание менеджера парсеров
 */
function createParserManager() {
    const state = {
        modules: [],
        currentModuleIndex: 0,
        isRunning: false
    };

    /**
     * Регистрация модулей
     */
    function registerModules() {
        console.log('📋 Регистрация модулей парсеров...');
        
        const moduleNames = parserModuleManager.getModules();
        state.modules = moduleNames.map(name => parserModuleManager.getModule(name));
        
        console.log(`✅ Зарегистрировано ${state.modules.length} модулей:`);
        state.modules.forEach((module, index) => {
            console.log(`   ${index + 1}. ${module.name}`);
        });
    }

    /**
     * Инициализация всех модулей
     */
    async function initializeAll() {
        console.log('\n🚀 Инициализация всех модулей...');
        
        const results = await Promise.allSettled(
            state.modules.map(module => module.initialize())
        );
        
        const successful = results.filter(result => result.status === 'fulfilled' && result.value).length;
        const failed = results.length - successful;
        
        console.log(`✅ Инициализировано: ${successful}, ❌ Ошибок: ${failed}`);
        
        return successful > 0;
    }

    /**
     * Задержка
     */
    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Переход к следующему модулю
     */
    function nextModule() {
        state.currentModuleIndex = (state.currentModuleIndex + 1) % state.modules.length;
    }

    /**
     * Запуск циклического парсинга
     */
    async function startCyclicParsing() {
        if (state.isRunning) {
            console.log('⚠️ Парсинг уже запущен');
            return;
        }

        state.isRunning = true;
        console.log('\n🔄 Запуск циклического парсинга...');
        
        try {
            while (state.isRunning) {
                const currentModule = state.modules[state.currentModuleIndex];
                
                if (!currentModule) {
                    console.log('❌ Модуль не найден, переходим к следующему');
                    nextModule();
                    continue;
                }

                console.log(`\n🎯 Текущий модуль: ${currentModule.name} (${state.currentModuleIndex + 1}/${state.modules.length})`);
                
                try {
                    const success = await currentModule.run();
                    if (success) {
                        console.log(`✅ Модуль ${currentModule.name} выполнен успешно`);
                    } else {
                        console.log(`⚠️ Модуль ${currentModule.name} завершился с ошибками`);
                    }
                } catch (error) {
                    console.error(`❌ Критическая ошибка в модуле ${currentModule.name}:`, error.message);
                }

                nextModule();
                
                console.log('\n⏸️ Пауза между модулями (30 секунд)...');
                await sleep(30000);
            }
        } catch (error) {
            console.error('❌ Критическая ошибка в менеджере:', error.message);
        } finally {
            state.isRunning = false;
            console.log('\n🛑 Циклический парсинг остановлен');
        }
    }

    /**
     * Остановка парсинга
     */
    function stop() {
        console.log('\n🛑 Остановка парсинга...');
        state.isRunning = false;
    }

    /**
     * Получение статуса всех модулей
     */
    function getStatus() {
        return {
            isRunning: state.isRunning,
            currentModule: state.modules[state.currentModuleIndex]?.name || 'None',
            currentIndex: state.currentModuleIndex,
            totalModules: state.modules.length,
            modules: state.modules.map(module => module.getInfo())
        };
    }

    /**
     * Запуск конкретного модуля
     */
    async function runModule(moduleName) {
        const module = state.modules.find(m => m.name.toLowerCase() === moduleName.toLowerCase());
        
        if (!module) {
            console.error(`❌ Модуль ${moduleName} не найден`);
            return false;
        }

        console.log(`🎯 Запуск модуля ${module.name}...`);
        return await module.run();
    }

    return {
        registerModules,
        initializeAll,
        startCyclicParsing,
        stop,
        getStatus,
        runModule
    };
}

module.exports = { createParserManager, ParserManager: createParserManager };
