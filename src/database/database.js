const pool = require('../db');
const { 
    getCreateTablesSQL, 
    getCreateIndexesSQL, 
    getCreateTriggersSQL,
    getDropTablesSQL,
    getCheckTablesSQL
} = require('./schema');

/**
 * Создание менеджера базы данных (функциональный стиль)
 */
function createDatabaseManager() {
    /**
     * Инициализация базы данных
     */
    async function initialize() {
        const client = await pool.connect();
        
        try {
            await client.query("BEGIN");

            console.log("🔧 Создание таблиц...");
            const createTablesSQL = getCreateTablesSQL();
            for (const sql of createTablesSQL) {
                await client.query(sql);
            }

            console.log("🔧 Создание индексов...");
            const createIndexesSQL = getCreateIndexesSQL();
            for (const sql of createIndexesSQL) {
                await client.query(sql);
            }

            console.log("🔧 Создание триггеров...");
            const createTriggersSQL = getCreateTriggersSQL();
            for (const sql of createTriggersSQL) {
                await client.query(sql);
            }

            await client.query("COMMIT");
            console.log("✅ База данных инициализирована успешно");
            return true;

        } catch (error) {
            await client.query("ROLLBACK");
            console.error("❌ Ошибка при инициализации базы данных:", error);
            return false;
        } finally {
            client.release();
        }
    }

    /**
     * Пересоздание базы данных
     */
    async function recreate() {
        const client = await pool.connect();
        
        try {
            await client.query("BEGIN");

            console.log("🗑️ Удаление старых таблиц...");
            const dropTablesSQL = getDropTablesSQL();
            for (const sql of dropTablesSQL) {
                await client.query(sql);
            }

            console.log("🔧 Создание новых таблиц...");
            const createTablesSQL = getCreateTablesSQL();
            for (const sql of createTablesSQL) {
                await client.query(sql);
            }

            console.log("🔧 Создание индексов...");
            const createIndexesSQL = getCreateIndexesSQL();
            for (const sql of createIndexesSQL) {
                await client.query(sql);
            }

            console.log("🔧 Создание триггеров...");
            const createTriggersSQL = getCreateTriggersSQL();
            for (const sql of createTriggersSQL) {
                await client.query(sql);
            }

            await client.query("COMMIT");
            console.log("✅ База данных пересоздана успешно");
            return true;

        } catch (error) {
            await client.query("ROLLBACK");
            console.error("❌ Ошибка при пересоздании базы данных:", error);
            return false;
        } finally {
            client.release();
        }
    }

    /**
     * Проверка существования таблиц
     */
    async function checkTables() {
        const client = await pool.connect();
        
        try {
            const result = await client.query(getCheckTablesSQL()[0]);
            const existingTables = result.rows.map(row => row.table_name);
            
            return {
                car_listings: existingTables.includes('car_listings'),
                car_photos: existingTables.includes('car_photos'),
                users: existingTables.includes('users'),
                allTablesExist: existingTables.length === 3
            };
        } catch (error) {
            console.error("❌ Ошибка при проверке таблиц:", error);
            return {
                car_listings: false,
                car_photos: false,
                users: false,
                allTablesExist: false
            };
        } finally {
            client.release();
        }
    }

    /**
     * Получение статистики базы данных
     */
    async function getStats() {
        const client = await pool.connect();
        
        try {
            const stats = {};
            
            const listingsResult = await client.query('SELECT COUNT(*) as count FROM car_listings');
            stats.totalListings = parseInt(listingsResult.rows[0].count);

            const photosResult = await client.query('SELECT COUNT(*) as count FROM car_photos');
            stats.totalPhotos = parseInt(photosResult.rows[0].count);

            stats.sourceStats = [];

            const makeStats = await client.query(`
                SELECT make, COUNT(*) as count 
                FROM car_listings 
                WHERE make != 'Неизвестно' 
                GROUP BY make 
                ORDER BY count DESC 
                LIMIT 10
            `);
            stats.topMakes = makeStats.rows;

            const yearStats = await client.query(`
                SELECT year, COUNT(*) as count 
                FROM car_listings 
                WHERE year != 'Неизвестно' 
                GROUP BY year 
                ORDER BY year DESC 
                LIMIT 10
            `);
            stats.topYears = yearStats.rows;

            const priceStats = await client.query(`
                SELECT 
                    AVG(price_raw) as avg_price,
                    MIN(price_raw) as min_price,
                    MAX(price_raw) as max_price
                FROM car_listings 
                WHERE price_raw > 0
            `);
            stats.priceStats = priceStats.rows[0];

            return stats;
        } catch (error) {
            console.error("❌ Ошибка при получении статистики:", error);
            return null;
        } finally {
            client.release();
        }
    }

    /**
     * Очистка базы данных
     */
    async function clear() {
        const client = await pool.connect();
        
        try {
            await client.query("BEGIN");

            console.log("🗑️ Очистка данных...");
            await client.query('DELETE FROM car_photos');
            await client.query('DELETE FROM car_listings');

            await client.query("COMMIT");
            console.log("✅ База данных очищена");
            return true;

        } catch (error) {
            await client.query("ROLLBACK");
            console.error("❌ Ошибка при очистке базы данных:", error);
            return false;
        } finally {
            client.release();
        }
    }

    /**
     * Закрытие соединения с базой данных
     */
    async function close() {
        await pool.end();
        console.log("🔌 Соединение с базой данных закрыто");
    }

    return {
        initialize,
        recreate,
        checkTables,
        getStats,
        clear,
        close
    };
}

// Создаем глобальный экземпляр
const databaseManager = createDatabaseManager();

module.exports = { createDatabaseManager, databaseManager };
