require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Запуск парсера и сервиса актуализации статусов...');

// Запускаем парсер
const parserProcess = spawn('node', [
    '--expose-gc',
    '--max-old-space-size=512',
    path.join(__dirname, 'index.js'),
    'cycle'
], {
    stdio: 'inherit',
    cwd: __dirname
});

// Запускаем сервис актуализации статусов в циклическом режиме
const statusUpdateProcess = spawn('node', [
    '--expose-gc',
    '--max-old-space-size=512',
    path.join(__dirname, 'status-updater.js'),
    'cycle'
], {
    stdio: 'inherit',
    cwd: __dirname
});

// Обработка завершения процессов
parserProcess.on('exit', (code) => {
    console.log(`\n📊 Парсер завершился с кодом: ${code}`);
    if (code !== 0) {
        console.error('❌ Парсер завершился с ошибкой');
    }
});

statusUpdateProcess.on('exit', (code) => {
    console.log(`\n📊 Сервис актуализации статусов завершился с кодом: ${code}`);
    if (code !== 0) {
        console.error('❌ Сервис актуализации статусов завершился с ошибкой');
    }
});

// Обработка сигналов для корректного завершения
process.on('SIGINT', () => {
    console.log('\n🛑 Получен сигнал SIGINT. Останавливаем все процессы...');
    parserProcess.kill('SIGINT');
    statusUpdateProcess.kill('SIGINT');
    setTimeout(() => {
        process.exit(0);
    }, 5000);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Получен сигнал SIGTERM. Останавливаем все процессы...');
    parserProcess.kill('SIGTERM');
    statusUpdateProcess.kill('SIGTERM');
    setTimeout(() => {
        process.exit(0);
    }, 5000);
});

// Если один из процессов упал, логируем, но не останавливаем другой
parserProcess.on('error', (error) => {
    console.error('❌ Ошибка при запуске парсера:', error);
});

statusUpdateProcess.on('error', (error) => {
    console.error('❌ Ошибка при запуске сервиса актуализации:', error);
});

console.log('✅ Оба процесса запущены');
