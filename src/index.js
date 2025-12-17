require('dotenv').config();
const { parserRunner } = require('./parsers/ParserRunner');

// Обработка сигналов для корректного завершения
process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал SIGINT. Останавливаем парсер...');
    await parserRunner.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Получен сигнал SIGTERM. Останавливаем парсер...');
    await parserRunner.stop();
    process.exit(0);
});

// Получаем параметры из командной строки или переменных окружения
const mode = process.argv[2] || process.env.PARSER_MODE || 'cycle';
const parserNames = process.argv[3] ? process.argv[3].split(',') : (process.env.PARSER_NAMES ? process.env.PARSER_NAMES.split(',') : []);
const globalConfig = {
    delayBetweenRequests: parseInt(process.env.DELAY_MS) || 1000,
    enableImageLoading: process.env.ENABLE_IMAGES === 'true'
};

// Запускаем парсер
(async () => {
    if (mode === 'cycle') {
        console.log("🔄 Циклический режим");
        await parserRunner.startCycling(parserNames, globalConfig);
    } else if (mode === 'single') {
        console.log("🎯 Одиночный режим");
        await parserRunner.startCycling(parserNames, globalConfig);
    } else {
        console.error(`❌ Неизвестный режим: ${mode}`);
        console.log("Доступные режимы: cycle, single");
    }
})();