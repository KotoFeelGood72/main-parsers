const { Pool } = require('pg');
require('dotenv').config(); // Загружаем переменные из .env

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432, // По умолчанию PostgreSQL работает на 5432 порту
    // Настройки для стабильного соединения
    connectionTimeoutMillis: 10000, // 10 секунд на подключение
    idleTimeoutMillis: 30000, // 30 секунд неактивности
    max: 20, // Максимум соединений в пуле
    min: 2, // Минимум соединений в пуле
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
});

module.exports = pool;