require('dotenv').config();
const { statusUpdateService } = require('./services/StatusUpdateService');
const { loggerService } = require('./services/LoggerService');

// Обработка сигналов для корректного завершения
process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал SIGINT. Останавливаем сервис актуализации...');
    await statusUpdateService.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Получен сигнал SIGTERM. Останавливаем сервис актуализации...');
    await statusUpdateService.stop();
    process.exit(0);
});

// Получаем параметры из командной строки или переменных окружения
const mode = process.argv[2] || process.env.STATUS_UPDATE_MODE || 'cycle';
const batchSize = process.argv[3] 
    ? parseInt(process.argv[3]) 
    : (process.env.STATUS_UPDATE_BATCH_SIZE ? parseInt(process.env.STATUS_UPDATE_BATCH_SIZE) : 50);

const useBrowser = process.env.STATUS_UPDATE_USE_BROWSER === 'true';
const delayBetweenRequests = process.env.STATUS_UPDATE_DELAY 
    ? parseInt(process.env.STATUS_UPDATE_DELAY) 
    : 1000;
const intervalMinutes = process.env.STATUS_UPDATE_INTERVAL 
    ? parseInt(process.env.STATUS_UPDATE_INTERVAL) 
    : 60; // По умолчанию каждый час

// Конфигурация сервиса
const config = {
    batchSize,
    delayBetweenRequests,
    useBrowser,
    timeout: parseInt(process.env.STATUS_UPDATE_TIMEOUT) || 30000,
    maxRetries: parseInt(process.env.STATUS_UPDATE_MAX_RETRIES) || 3,
    recentDays: parseInt(process.env.STATUS_UPDATE_RECENT_DAYS) || 7,
    longSellingDays: parseInt(process.env.STATUS_UPDATE_LONG_SELLING_DAYS) || 30
};

// Создаем экземпляр сервиса с конфигурацией
const { createStatusUpdateService } = require('./services/StatusUpdateService');
const service = createStatusUpdateService(config);

// Запускаем сервис
(async () => {
    try {
        console.log('🚀 Запуск сервиса актуализации статусов автомобилей');
        console.log(`📊 Конфигурация:`);
        console.log(`   Режим: ${mode}`);
        console.log(`   Размер батча: ${config.batchSize}`);
        console.log(`   Задержка между запросами: ${config.delayBetweenRequests}мс`);
        console.log(`   Использование браузера: ${config.useBrowser ? 'Да' : 'Нет'}`);
        console.log(`   Таймаут: ${config.timeout}мс`);
        console.log(`   Дней для "Появилось недавно": ${config.recentDays}`);
        console.log(`   Дней для "Долго продается": ${config.longSellingDays}`);
        
        if (mode === 'cycle') {
            console.log(`   Интервал между циклами: ${intervalMinutes} минут`);
            await service.startCycling(intervalMinutes);
        } else {
            await service.start();

            const stats = service.getStats();
            console.log('\n✅ Сервис актуализации завершен');
            console.log(`📈 Статистика:`);
            console.log(`   Всего проверено: ${stats.checked}`);
            console.log(`   Обновлено статусов: ${stats.updated}`);
            console.log(`   Продано: ${stats.sold}`);
            console.log(`   Активно: ${stats.active}`);
            console.log(`   Ошибок: ${stats.errors}`);

            process.exit(0);
        }
    } catch (error) {
        console.error('❌ Ошибка при работе сервиса актуализации:', error);
        loggerService.logSystemError('status-updater', error, {
            action: 'main'
        });
        process.exit(1);
    }
})();
