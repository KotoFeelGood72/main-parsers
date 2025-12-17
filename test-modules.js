require('dotenv').config();
const { parserModuleManager } = require('./src/parsers/ModuleManager');

/**
 * Тестирование всех модулей по очереди
 */
async function testAllModules() {
    console.log('🧪 Начинаем тестирование всех модулей...\n');
    
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
            
            // Пробуем получить первую ссылку (если есть)
            console.log(`🔄 Пробуем получить первую ссылку...`);
            const firstResult = await listingsGenerator.next();
            
            if (firstResult.done) {
                console.log(`⚠️ Нет объявлений для парсинга (возможно, это нормально)`);
            } else {
                console.log(`✅ Получена первая ссылка: ${firstResult.value}`);
                console.log(`   (не парсим детали в тестовом режиме)`);
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
            console.log(`\n⏸️ Пауза 2 секунды перед следующим модулем...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // Очистка завершена в каждом модуле
    console.log(`\n${'='.repeat(80)}`);
    
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
testAllModules().catch(error => {
    console.error('❌ Критическая ошибка при тестировании:', error);
    process.exit(1);
});
