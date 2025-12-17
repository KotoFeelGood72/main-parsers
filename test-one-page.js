require('dotenv').config();
const { parserModuleManager } = require('./src/parsers/ModuleManager');

/**
 * Быстрое тестирование всех модулей - по 1 странице каждого
 */
async function testOnePagePerModule() {
    console.log('🧪 Быстрое тестирование всех модулей (по 1 странице)...\n');
    
    const modules = parserModuleManager.getModules();
    console.log(`📋 Найдено модулей: ${modules.length}\n`);
    
    if (modules.length === 0) {
        console.error('❌ Модули не найдены!');
        return;
    }
    
    console.log('📝 Список модулей для тестирования:');
    modules.forEach((name, index) => {
        console.log(`   ${index + 1}. ${name}`);
    });
    console.log('');
    
    const results = {
        total: modules.length,
        success: 0,
        failed: 0,
        errors: []
    };
    
    // Тестируем каждый модуль по очереди
    for (let i = 0; i < modules.length; i++) {
        const moduleName = modules[i];
        console.log(`\n${'='.repeat(80)}`);
        console.log(`📦 Тестируем модуль ${i + 1}/${modules.length}: ${moduleName}`);
        console.log('='.repeat(80));
        
        try {
            const module = parserModuleManager.getModule(moduleName);
            
            if (!module) {
                throw new Error(`Модуль ${moduleName} не найден`);
            }
            
            console.log(`✅ Модуль загружен: ${module.name || moduleName}`);
            
            // Проверяем наличие необходимых методов
            const requiredMethods = ['initialize', 'getListings', 'parseListing'];
            const missingMethods = requiredMethods.filter(method => typeof module[method] !== 'function');
            
            if (missingMethods.length > 0) {
                throw new Error(`Отсутствуют методы: ${missingMethods.join(', ')}`);
            }
            
            console.log(`✅ Все необходимые методы присутствуют`);
            
            // Пробуем инициализировать модуль
            console.log(`🔄 Инициализация модуля...`);
            const initResult = await module.initialize();
            if (!initResult) {
                throw new Error('Инициализация вернула false');
            }
            console.log(`✅ Модуль инициализирован успешно`);
            
            // Проверяем что getListings возвращает генератор
            console.log(`🔄 Проверка метода getListings...`);
            const listingsGenerator = module.getListings();
            
            if (!listingsGenerator || typeof listingsGenerator[Symbol.asyncIterator] !== 'function') {
                throw new Error('getListings не возвращает async generator');
            }
            
            console.log(`✅ getListings возвращает async generator`);
            
            // Пробуем получить первую ссылку (ограничиваемся 1 страницей)
            console.log(`🔄 Пробуем получить первую ссылку (только 1 страница)...`);
            let linkCount = 0;
            let firstLink = null;
            let hasError = false;
            
            try {
                for await (const link of listingsGenerator) {
                    if (!firstLink) {
                        firstLink = link;
                        console.log(`✅ Получена первая ссылка: ${link}`);
                    }
                    linkCount++;
                    
                    // Ограничиваемся максимум 5 ссылками для быстрого теста
                    if (linkCount >= 5) {
                        console.log(`   (получено ${linkCount} ссылок, ограничиваемся для быстрого теста)`);
                        break;
                    }
                }
                
                if (linkCount === 0) {
                    console.log(`⚠️ Нет объявлений на первой странице (возможно, это нормально)`);
                } else {
                    console.log(`✅ Получено ссылок: ${linkCount}`);
                }
            } catch (listingError) {
                hasError = true;
                console.error(`❌ Ошибка при получении ссылок: ${listingError.message}`);
                if (listingError.stack) {
                    console.error(`   Стек: ${listingError.stack.split('\n').slice(0, 3).join('\n   ')}`);
                }
                throw listingError;
            }
            
            // Если получили ссылку, пробуем парсить (только первую)
            if (firstLink && !hasError) {
                console.log(`🔄 Пробуем парсить первую ссылку...`);
                try {
                    const carDetails = await module.parseListing(firstLink);
                    if (carDetails) {
                        console.log(`✅ Парсинг успешен!`);
                        console.log(`   Заголовок: ${carDetails.title || 'Не указано'}`);
                        console.log(`   Цена: ${carDetails.price?.formatted || carDetails.price_formatted || 'Не указано'}`);
                    } else {
                        console.log(`⚠️ Парсинг вернул null (возможно, это нормально)`);
                    }
                } catch (parseError) {
                    console.error(`❌ Ошибка при парсинге: ${parseError.message}`);
                    if (parseError.stack) {
                        console.error(`   Стек: ${parseError.stack.split('\n').slice(0, 3).join('\n   ')}`);
                    }
                    // Не считаем это критической ошибкой, продолжаем
                }
            }
            
            // Очистка
            if (module.cleanup) {
                console.log(`🔄 Очистка модуля...`);
                await module.cleanup();
                console.log(`✅ Модуль очищен`);
            }
            
            results.success++;
            console.log(`\n✅ Модуль ${moduleName} протестирован успешно!`);
            
        } catch (error) {
            results.failed++;
            results.errors.push({
                module: moduleName,
                error: error.message,
                stack: error.stack
            });
            
            console.error(`\n❌ Ошибка при тестировании модуля ${moduleName}:`);
            console.error(`   ${error.message}`);
            if (error.stack) {
                console.error(`   Стек: ${error.stack.split('\n').slice(0, 5).join('\n   ')}`);
            }
            
            // Пробуем очистить модуль даже при ошибке
            try {
                const module = parserModuleManager.getModule(moduleName);
                if (module && module.cleanup) {
                    await module.cleanup();
                }
            } catch (cleanupError) {
                console.warn(`⚠️ Ошибка при очистке: ${cleanupError.message}`);
            }
        }
        
        // Небольшая пауза между модулями
        if (i < modules.length - 1) {
            console.log(`\n⏸️ Пауза 1 секунда перед следующим модулем...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    // Выводим итоговую статистику
    console.log(`\n${'='.repeat(80)}`);
    console.log('📊 ИТОГОВАЯ СТАТИСТИКА');
    console.log('='.repeat(80));
    console.log(`Всего модулей: ${results.total}`);
    console.log(`✅ Успешно: ${results.success}`);
    console.log(`❌ Ошибок: ${results.failed}`);
    
    if (results.errors.length > 0) {
        console.log(`\n❌ Детали ошибок:`);
        results.errors.forEach(({ module, error }) => {
            console.log(`   ${module}: ${error}`);
        });
    }
    
    console.log(`\n${results.failed === 0 ? '✅' : '⚠️'} Тестирование завершено!`);
    
    // Завершаем процесс
    process.exit(results.failed === 0 ? 0 : 1);
}

// Запускаем тестирование
testOnePagePerModule().catch(error => {
    console.error('❌ Критическая ошибка при тестировании:', error);
    process.exit(1);
});
