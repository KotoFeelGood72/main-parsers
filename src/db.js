const { Pool } = require('pg');
require('dotenv').config(); // Загружаем переменные из .env

// Настройка SSL для удаленного подключения
const sslConfig = process.env.DB_SSL === 'true' || process.env.DB_SSL === 'require' 
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : process.env.DB_SSL === 'false' 
        ? false 
        : undefined; // Если не указано, используем настройки по умолчанию

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432, // По умолчанию PostgreSQL работает на 5432 порту
    // Настройки SSL для удаленного подключения
    ssl: sslConfig,
    // Настройки для стабильного соединения
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000, // Увеличено до 30 секунд для удаленного подключения
    idleTimeoutMillis: 30000, // 30 секунд неактивности
    max: 20, // Максимум соединений в пуле
    min: 2, // Минимум соединений в пуле
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
});

// Обработка ошибок подключения
pool.on('error', (err, client) => {
    console.error('❌ Неожиданная ошибка на клиенте базы данных:', err);
});

// Логирование попытки подключения
if (process.env.DB_HOST) {
    console.log(`🔌 Попытка подключения к БД: ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`);
    if (sslConfig) {
        console.log(`🔒 SSL включен для подключения к БД`);
    }
}

module.exports = pool;