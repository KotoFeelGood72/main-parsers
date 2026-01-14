const pool = require('../db');
const { loggerService } = require('./LoggerService');

/**
 * Сервис для записи ошибок парсинга в базу данных
 */
function createParsingErrorService(config = {}) {
    const state = {
        config: config
    };

    /**
     * Запись ошибки парсинга в базу данных
     * @param {Object} errorData - Данные об ошибке
     * @param {string} errorData.parserName - Имя парсера
     * @param {string} errorData.url - URL объявления
     * @param {Error} errorData.error - Объект ошибки
     * @param {string} errorData.errorType - Тип ошибки (parsing, network, browser, database, etc.)
     * @param {Object} errorData.carData - Частично спарсенные данные автомобиля (если есть)
     * @param {Object} errorData.context - Дополнительный контекст
     */
    async function saveParsingError(errorData) {
        if (!errorData || !errorData.parserName || !errorData.url || !errorData.error) {
            loggerService.logWarning('Некорректные данные для сохранения ошибки парсинга', {
                errorData
            });
            return null;
        }

        let client;
        try {
            client = await pool.connect();
            
            const insertQuery = `
                INSERT INTO parsing_errors (
                    parser_name,
                    url,
                    error_type,
                    error_name,
                    error_message,
                    error_stack,
                    car_data,
                    context,
                    is_processed,
                    created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
                )
                RETURNING id;
            `;

            const values = [
                errorData.parserName,
                errorData.url,
                errorData.errorType || 'unknown',
                errorData.error?.name || null,
                errorData.error?.message || 'Unknown error',
                errorData.error?.stack || null,
                errorData.carData ? JSON.stringify(errorData.carData) : null,
                errorData.context ? JSON.stringify(errorData.context) : null,
                false
            ];

            const result = await client.query(insertQuery, values);
            const errorId = result.rows[0].id;

            loggerService.logInfo('Ошибка парсинга сохранена в БД', {
                id: errorId,
                parserName: errorData.parserName,
                url: errorData.url,
                errorType: errorData.errorType
            });

            return errorId;
        } catch (dbError) {
            loggerService.logWarning('Ошибка при сохранении ошибки парсинга в БД', {
                error: dbError.message,
                originalError: errorData.error?.message
            });
            return null;
        } finally {
            if (client) {
                try {
                    client.release();
                } catch (releaseError) {
                    loggerService.logWarning('Ошибка при освобождении клиента БД', {
                        error: releaseError.message
                    });
                }
            }
        }
    }

    /**
     * Получение необработанных ошибок
     * @param {Object} options - Опции фильтрации
     * @param {string} options.parserName - Фильтр по имени парсера
     * @param {string} options.errorType - Фильтр по типу ошибки
     * @param {number} options.limit - Лимит записей
     * @param {number} options.offset - Смещение
     */
    async function getUnprocessedErrors(options = {}) {
        let client;
        try {
            client = await pool.connect();

            let query = `
                SELECT 
                    id,
                    parser_name,
                    url,
                    error_type,
                    error_name,
                    error_message,
                    error_stack,
                    car_data,
                    context,
                    is_processed,
                    created_at
                FROM parsing_errors
                WHERE is_processed = false
            `;

            const queryParams = [];
            let paramIndex = 1;

            if (options.parserName) {
                query += ` AND parser_name = $${paramIndex}`;
                queryParams.push(options.parserName);
                paramIndex++;
            }

            if (options.errorType) {
                query += ` AND error_type = $${paramIndex}`;
                queryParams.push(options.errorType);
                paramIndex++;
            }

            query += ` ORDER BY created_at DESC`;

            if (options.limit) {
                query += ` LIMIT $${paramIndex}`;
                queryParams.push(options.limit);
                paramIndex++;
            }

            if (options.offset) {
                query += ` OFFSET $${paramIndex}`;
                queryParams.push(options.offset);
            }

            const result = await client.query(query, queryParams);
            return result.rows;
        } catch (error) {
            loggerService.logWarning('Ошибка при получении необработанных ошибок', {
                error: error.message
            });
            return [];
        } finally {
            if (client) {
                try {
                    client.release();
                } catch (releaseError) {
                    loggerService.logWarning('Ошибка при освобождении клиента БД', {
                        error: releaseError.message
                    });
                }
            }
        }
    }

    /**
     * Отметить ошибку как обработанную
     * @param {number} errorId - ID ошибки
     */
    async function markAsProcessed(errorId) {
        let client;
        try {
            client = await pool.connect();

            const updateQuery = `
                UPDATE parsing_errors
                SET is_processed = true,
                    processed_at = NOW()
                WHERE id = $1
                RETURNING id;
            `;

            const result = await client.query(updateQuery, [errorId]);
            return result.rows.length > 0;
        } catch (error) {
            loggerService.logWarning('Ошибка при отметке ошибки как обработанной', {
                error: error.message,
                errorId
            });
            return false;
        } finally {
            if (client) {
                try {
                    client.release();
                } catch (releaseError) {
                    loggerService.logWarning('Ошибка при освобождении клиента БД', {
                        error: releaseError.message
                    });
                }
            }
        }
    }

    /**
     * Получение статистики ошибок
     */
    async function getErrorStats() {
        let client;
        try {
            client = await pool.connect();

            const statsQuery = `
                SELECT 
                    parser_name,
                    error_type,
                    COUNT(*) as count,
                    COUNT(*) FILTER (WHERE is_processed = false) as unprocessed_count
                FROM parsing_errors
                GROUP BY parser_name, error_type
                ORDER BY count DESC;
            `;

            const result = await client.query(statsQuery);
            return result.rows;
        } catch (error) {
            loggerService.logWarning('Ошибка при получении статистики ошибок', {
                error: error.message
            });
            return [];
        } finally {
            if (client) {
                try {
                    client.release();
                } catch (releaseError) {
                    loggerService.logWarning('Ошибка при освобождении клиента БД', {
                        error: releaseError.message
                    });
                }
            }
        }
    }

    return {
        saveParsingError,
        getUnprocessedErrors,
        markAsProcessed,
        getErrorStats
    };
}

// Создаем глобальный экземпляр
const parsingErrorService = createParsingErrorService();

module.exports = { createParsingErrorService, parsingErrorService };
