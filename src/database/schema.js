/**
 * Схема базы данных для парсера автомобилей
 */

/**
 * SQL для создания таблицы car_listings
 */
const createCarListingsTable = `
    CREATE TABLE IF NOT EXISTS car_listings (
        id SERIAL PRIMARY KEY,
        short_url TEXT UNIQUE NOT NULL,
        title TEXT DEFAULT 'Неизвестно',
        make TEXT DEFAULT 'Неизвестно',
        model TEXT DEFAULT 'Неизвестно',
        year TEXT DEFAULT 'Неизвестно',
        body_type TEXT DEFAULT 'Неизвестно',
        horsepower TEXT DEFAULT 'Неизвестно',
        fuel_type TEXT DEFAULT 'Неизвестно',
        motors_trim TEXT DEFAULT 'Неизвестно',
        kilometers TEXT DEFAULT '0',
        price_formatted TEXT DEFAULT '0',
        price_raw NUMERIC DEFAULT 0,
        currency TEXT DEFAULT 'Неизвестно',
        exterior_color TEXT DEFAULT 'Неизвестно',
        location TEXT DEFAULT 'Неизвестно',
        phone TEXT DEFAULT 'Не указан',
        seller_name TEXT DEFAULT 'Неизвестен',
        seller_type TEXT DEFAULT 'Неизвестен',
        seller_logo TEXT,
        seller_profile_link TEXT,
        main_image TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );
`;

/**
 * SQL для создания таблицы car_photos
 */
const createCarPhotosTable = `
    CREATE TABLE IF NOT EXISTS car_photos (
        id SERIAL PRIMARY KEY,
        listing_id INT REFERENCES car_listings(id) ON DELETE CASCADE,
        photo_url TEXT NOT NULL,
        UNIQUE(listing_id, photo_url)
    );
`;

/**
 * SQL для создания таблицы users
 */
const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        first_name TEXT,
        last_name TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );
`;

/**
 * SQL для создания индексов
 */
const createIndexes = [
    `CREATE INDEX IF NOT EXISTS idx_car_listings_short_url ON car_listings(short_url);`,
    `CREATE INDEX IF NOT EXISTS idx_car_listings_make ON car_listings(make);`,
    `CREATE INDEX IF NOT EXISTS idx_car_listings_model ON car_listings(model);`,
    `CREATE INDEX IF NOT EXISTS idx_car_listings_year ON car_listings(year);`,
    `CREATE INDEX IF NOT EXISTS idx_car_listings_price_raw ON car_listings(price_raw);`,
    `CREATE INDEX IF NOT EXISTS idx_car_listings_created_at ON car_listings(created_at);`,
    `CREATE INDEX IF NOT EXISTS idx_car_photos_listing_id ON car_photos(listing_id);`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
    `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`
];

/**
 * SQL для создания триггеров
 */
const createTriggers = [
    `CREATE OR REPLACE FUNCTION update_updated_at_column()
     RETURNS TRIGGER AS $$
     BEGIN
         NEW.updated_at = NOW();
         RETURN NEW;
     END;
     $$ language 'plpgsql';`,
    
    `DROP TRIGGER IF EXISTS update_car_listings_updated_at ON car_listings;
     CREATE TRIGGER update_car_listings_updated_at
         BEFORE UPDATE ON car_listings
         FOR EACH ROW
         EXECUTE FUNCTION update_updated_at_column();`
];

/**
 * Полная схема базы данных
 */
const fullSchema = {
    tables: {
        car_listings: createCarListingsTable,
        car_photos: createCarPhotosTable,
        users: createUsersTable
    },
    indexes: createIndexes,
    triggers: createTriggers
};

/**
 * Получение SQL для создания всех таблиц
 * @returns {Array<string>} Массив SQL запросов
 */
function getCreateTablesSQL() {
    return [
        createCarListingsTable,
        createCarPhotosTable,
        createUsersTable
    ];
}

/**
 * Получение SQL для создания всех индексов
 * @returns {Array<string>} Массив SQL запросов
 */
function getCreateIndexesSQL() {
    return createIndexes;
}

/**
 * Получение SQL для создания всех триггеров
 * @returns {Array<string>} Массив SQL запросов
 */
function getCreateTriggersSQL() {
    return createTriggers;
}

/**
 * Получение полной схемы базы данных
 * @returns {Object} Объект с полной схемой
 */
function getFullSchema() {
    return fullSchema;
}

/**
 * Получение SQL для удаления всех таблиц (в правильном порядке)
 * @returns {Array<string>} Массив SQL запросов
 */
function getDropTablesSQL() {
    return [
        'DROP TABLE IF EXISTS car_photos CASCADE;',
        'DROP TABLE IF EXISTS car_listings CASCADE;',
        'DROP TABLE IF EXISTS users CASCADE;'
    ];
}

/**
 * Получение SQL для проверки существования таблиц
 * @returns {Array<string>} Массив SQL запросов
 */
function getCheckTablesSQL() {
    return [
        `SELECT table_name 
         FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name IN ('car_listings', 'car_photos', 'users');`
    ];
}

module.exports = {
    createCarListingsTable,
    createCarPhotosTable,
    createUsersTable,
    createIndexes,
    createTriggers,
    fullSchema,
    getCreateTablesSQL,
    getCreateIndexesSQL,
    getCreateTriggersSQL,
    getFullSchema,
    getDropTablesSQL,
    getCheckTablesSQL
};
