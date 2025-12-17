const fs = require('fs');
const path = require('path');

/**
 * Создание менеджера модулей парсеров (функциональный стиль)
 */
function createParserModuleManager() {
    const modulesPath = path.join(__dirname, 'modules');
    const state = {
        modules: new Map(),
        currentModuleIndex: 0
    };

    /**
     * Загрузка всех доступных модулей
     */
    function loadModules() {
        try {
            const moduleDirs = fs.readdirSync(modulesPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            console.log(`🔍 Найдены модули: ${moduleDirs.join(', ')}`);

            for (const moduleName of moduleDirs) {
                try {
                    const modulePath = path.join(modulesPath, moduleName, 'index.js');
                    if (fs.existsSync(modulePath)) {
                        const moduleExports = require(modulePath);
                        // Поддерживаем как функциональный стиль (createModule), так и классы (для обратной совместимости)
                        let moduleInstance;
                        const keys = Object.keys(moduleExports);
                        
                        // Ищем функцию создания модуля (create*Module или createModule)
                        let createFn = null;
                        for (const key of keys) {
                            if (key.startsWith('create') && typeof moduleExports[key] === 'function' && !moduleExports[key].prototype) {
                                createFn = moduleExports[key];
                                break;
                            }
                        }
                        
                        // Если не нашли, пробуем первый ключ
                        if (!createFn && keys.length > 0) {
                            const firstKey = keys[0];
                            createFn = moduleExports[firstKey];
                        }
                        
                        if (createFn && typeof createFn === 'function' && !createFn.prototype) {
                            // Функция создания (функциональный стиль)
                            moduleInstance = createFn();
                        } else if (createFn && typeof createFn === 'function') {
                            // Класс (для обратной совместимости)
                            moduleInstance = new createFn();
                        } else {
                            throw new Error(`Не удалось найти функцию создания модуля для ${moduleName}`);
                        }
                        state.modules.set(moduleName, moduleInstance);
                        console.log(`✅ Модуль ${moduleName} загружен`);
                    }
                } catch (error) {
                    console.error(`❌ Ошибка загрузки модуля ${moduleName}:`, error.message);
                }
            }

            console.log(`📊 Всего загружено модулей: ${state.modules.size}`);
        } catch (error) {
            console.error('❌ Ошибка загрузки модулей:', error.message);
        }
    }

    /**
     * Получение списка всех модулей
     */
    function getModules() {
        return Array.from(state.modules.keys());
    }

    /**
     * Получение модуля по имени
     */
    function getModule(name) {
        return state.modules.get(name);
    }

    /**
     * Получение следующего модуля в цикле
     */
    function getNextModule() {
        const moduleNames = Array.from(state.modules.keys());
        if (moduleNames.length === 0) {
            return null;
        }

        const module = state.modules.get(moduleNames[state.currentModuleIndex]);
        state.currentModuleIndex = (state.currentModuleIndex + 1) % moduleNames.length;
        return module;
    }

    /**
     * Получение текущего модуля
     */
    function getCurrentModule() {
        const moduleNames = Array.from(state.modules.keys());
        if (moduleNames.length === 0) {
            return null;
        }
        return state.modules.get(moduleNames[state.currentModuleIndex]);
    }

    /**
     * Проверка доступности всех модулей
     */
    async function checkAvailability() {
        const results = {};
        for (const [name, module] of state.modules) {
            try {
                results[name] = await module.isAvailable();
            } catch (error) {
                results[name] = false;
                console.warn(`⚠️ Модуль ${name} недоступен:`, error.message);
            }
        }
        return results;
    }

    /**
     * Получение информации о всех модулях
     */
    function getModulesInfo() {
        const info = {};
        for (const [name, module] of state.modules) {
            try {
                info[name] = module.getInfo();
            } catch (error) {
                info[name] = { name, error: error.message };
            }
        }
        return info;
    }

    /**
     * Запуск парсинга с циклическим переключением модулей
     */
    async function* runCyclicParsing(maxIterations = null) {
        let iteration = 0;
        
        while (maxIterations === null || iteration < maxIterations) {
            const module = getNextModule();
            if (!module) {
                console.log('❌ Нет доступных модулей для парсинга');
                break;
            }

            console.log(`\n🔄 Итерация ${iteration + 1}: Запускаем модуль ${module.name}`);
            
            try {
                const isAvailable = await module.isAvailable();
                if (!isAvailable) {
                    console.log(`⚠️ Модуль ${module.name} недоступен, пропускаем`);
                    continue;
                }

                if (module.parser && module.context) {
                    await module.parser.initialize(module.context);
                }
                
                let count = 0;
                for await (const listingUrl of module.getListings()) {
                    console.log(`\n🔍 Парсим объявление ${++count} из модуля ${module.name}: ${listingUrl}`);
                    
                    const data = await module.parseListing(listingUrl);
                    if (data) {
                        yield { module: module.name, data, url: listingUrl };
                    }
                }
                
                console.log(`✅ Модуль ${module.name} завершен. Обработано ${count} объявлений`);
            } catch (error) {
                console.error(`❌ Ошибка в модуле ${module.name}:`, error.message);
            }

            iteration++;
            
            if (maxIterations === null || iteration < maxIterations) {
                console.log('⏸️ Пауза между модулями...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    // Загружаем модули при создании
    loadModules();

    return {
        getModules,
        getModule,
        getNextModule,
        getCurrentModule,
        checkAvailability,
        getModulesInfo,
        runCyclicParsing
    };
}

// Создаем глобальный экземпляр
const parserModuleManager = createParserModuleManager();

module.exports = { createParserModuleManager, ParserModuleManager: createParserModuleManager, parserModuleManager };
