const pool = require('../db');
const axios = require('axios');
const { loggerService } = require('./LoggerService');
const { startBrowser, createStealthContext } = require('../utils/browser');

/**
 * Создание сервиса для актуализации статусов автомобилей
 */
function createStatusUpdateService(config = {}) {
    const defaultConfig = {
        batchSize: 50, // Количество ссылок для обработки за раз
        delayBetweenRequests: 1000, // Задержка между запросами (мс)
        timeout: 30000, // Таймаут для запросов (мс)
        useBrowser: false, // Использовать браузер для проверки (если нужно обходить защиту)
        maxRetries: 3, // Максимальное количество попыток
        recentDays: 7, // Количество дней для статуса "Появилось недавно"
        longSellingDays: 30, // Количество дней для статуса "Долго продается"
        ...config
    };

    const state = {
        config: defaultConfig,
        isRunning: false,
        browser: null,
        context: null,
        stats: {
            total: 0,
            checked: 0,
            sold: 0,
            active: 0,
            updated: 0,
            errors: 0
        }
    };

    /**
     * Инициализация браузера (если нужно)
     */
    async function initializeBrowser() {
        if (!state.config.useBrowser) {
            return;
        }

        try {
            state.browser = await startBrowser({ headless: true });
            state.context = await createStealthContext(state.browser);
            loggerService.logInfo('Браузер инициализирован для StatusUpdateService');
        } catch (error) {
            loggerService.logSystemError('StatusUpdateService', error, { action: 'initializeBrowser' });
            throw error;
        }
    }

    /**
     * Закрытие браузера
     */
    async function closeBrowser() {
        if (state.context) {
            try {
                await state.context.close();
                state.context = null;
            } catch (error) {
                loggerService.logWarning('Ошибка при закрытии контекста браузера', { error: error.message });
            }
        }

        if (state.browser) {
            try {
                await state.browser.close();
                state.browser = null;
            } catch (error) {
                loggerService.logWarning('Ошибка при закрытии браузера', { error: error.message });
            }
        }
    }

    /**
     * Проверка доступности ссылки через HTTP запрос
     */
    async function checkUrlAvailability(url, retries = 0) {
        try {
            const response = await axios.head(url, {
                timeout: state.config.timeout,
                maxRedirects: 5,
                validateStatus: (status) => status < 500, // Принимаем все статусы кроме 5xx
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            // 404 означает, что автомобиль продан
            if (response.status === 404) {
                return { available: false, status: 404, sold: true };
            }

            // 2xx и 3xx - доступно
            if (response.status >= 200 && response.status < 400) {
                return { available: true, status: response.status, sold: false };
            }

            // Другие статусы - считаем недоступным
            return { available: false, status: response.status, sold: false };
        } catch (error) {
            // Если ошибка сети или таймаут - пробуем еще раз
            if (retries < state.config.maxRetries && (
                error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ENOTFOUND' ||
                error.message.includes('timeout')
            )) {
                await new Promise(resolve => setTimeout(resolve, state.config.delayBetweenRequests * (retries + 1)));
                return checkUrlAvailability(url, retries + 1);
            }

            // Если 404 в ошибке - автомобиль продан
            if (error.response && error.response.status === 404) {
                return { available: false, status: 404, sold: true };
            }

            // Другие ошибки - считаем недоступным, но не проданным
            loggerService.logWarning('Ошибка при проверке URL', {
                url,
                error: error.message,
                code: error.code,
                status: error.response?.status
            });

            return { available: false, status: error.response?.status || 0, sold: false, error: error.message };
        }
    }

    /**
     * Проверка доступности ссылки через браузер
     */
    async function checkUrlAvailabilityWithBrowser(url, retries = 0) {
        if (!state.context) {
            await initializeBrowser();
        }

        try {
            const page = await state.context.newPage();
            
            try {
                const response = await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: state.config.timeout
                });

                const status = response.status();
                await page.close();

                if (status === 404) {
                    return { available: false, status: 404, sold: true };
                }

                if (status >= 200 && status < 400) {
                    return { available: true, status, sold: false };
                }

                return { available: false, status, sold: false };
            } catch (error) {
                await page.close();
                throw error;
            }
        } catch (error) {
            if (retries < state.config.maxRetries && (
                error.message.includes('timeout') ||
                error.message.includes('Navigation failed')
            )) {
                await new Promise(resolve => setTimeout(resolve, state.config.delayBetweenRequests * (retries + 1)));
                return checkUrlAvailabilityWithBrowser(url, retries + 1);
            }

            loggerService.logWarning('Ошибка при проверке URL через браузер', {
                url,
                error: error.message
            });

            return { available: false, status: 0, sold: false, error: error.message };
        }
    }

    /**
     * Определение статуса на основе даты создания и доступности
     */
    function determineStatus(createdAt, isAvailable, isSold) {
        if (isSold) {
            return 'Продано';
        }

        if (!isAvailable) {
            return 'Активно'; // Если недоступно, но не 404, оставляем активным
        }

        const now = new Date();
        const created = new Date(createdAt);
        const daysSinceCreation = Math.floor((now - created) / (1000 * 60 * 60 * 24));

        if (daysSinceCreation < state.config.recentDays) {
            return 'Появилось недавно';
        }

        if (daysSinceCreation >= state.config.longSellingDays) {
            return 'Долго продается';
        }

        return 'Активно';
    }

    /**
     * Обновление статуса автомобиля в базе данных
     */
    async function updateCarStatus(carId, status, urlCheckResult) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Колонка должна быть уже добавлена через ensureStatusColumn
            // Но на всякий случай проверяем еще раз
            const checkColumnQuery = `
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'car_listings' 
                AND column_name = 'status';
            `;
            const columnCheck = await client.query(checkColumnQuery);

            // Если колонки все еще нет, добавляем её
            if (columnCheck.rows.length === 0) {
                await client.query(`
                    ALTER TABLE car_listings 
                    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Активно';
                `);
                loggerService.logInfo('Колонка status добавлена в таблицу car_listings (в updateCarStatus)');
            }

            // Обновляем статус
            const updateQuery = `
                UPDATE car_listings 
                SET status = $1, updated_at = NOW()
                WHERE id = $2
                RETURNING id, short_url, status;
            `;

            const result = await client.query(updateQuery, [status, carId]);
            
            await client.query('COMMIT');

            if (result.rows.length > 0) {
                loggerService.logInfo('Статус обновлен', {
                    id: carId,
                    url: result.rows[0].short_url,
                    status: result.rows[0].status
                });
                return true;
            }

            return false;
        } catch (error) {
            await client.query('ROLLBACK');
            loggerService.logSystemError('StatusUpdateService', error, {
                action: 'updateCarStatus',
                carId,
                status
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Проверка и добавление колонки status, если её нет
     */
    async function ensureStatusColumn() {
        const client = await pool.connect();
        
        try {
            // Проверяем, существует ли колонка status
            const checkColumnQuery = `
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'car_listings' 
                AND column_name = 'status';
            `;
            const columnCheck = await client.query(checkColumnQuery);

            // Если колонки нет, добавляем её
            if (columnCheck.rows.length === 0) {
                await client.query(`
                    ALTER TABLE car_listings 
                    ADD COLUMN status TEXT DEFAULT 'Активно';
                `);
                
                // Создаем индекс для колонки status
                await client.query(`
                    CREATE INDEX IF NOT EXISTS idx_car_listings_status 
                    ON car_listings(status);
                `);
                
                loggerService.logInfo('Колонка status добавлена в таблицу car_listings');
                return true;
            }
            
            return false;
        } catch (error) {
            loggerService.logSystemError('StatusUpdateService', error, {
                action: 'ensureStatusColumn'
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Получение списка автомобилей для проверки
     */
    async function getCarsToCheck(limit = null, offset = 0) {
        const client = await pool.connect();
        
        try {
            // Используем COALESCE для случая, если колонка status еще не существует
            let query = `
                SELECT id, short_url, created_at, COALESCE(status, 'Активно') as status
                FROM car_listings
                WHERE short_url IS NOT NULL
                ORDER BY updated_at ASC
            `;

            const params = [];
            if (limit) {
                query += ` LIMIT $1 OFFSET $2`;
                params.push(limit, offset);
            }

            const result = await client.query(query, params);
            return result.rows;
        } catch (error) {
            loggerService.logSystemError('StatusUpdateService', error, {
                action: 'getCarsToCheck'
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Обработка одного автомобиля
     */
    async function processCar(car) {
        try {
            const checkMethod = state.config.useBrowser 
                ? checkUrlAvailabilityWithBrowser 
                : checkUrlAvailability;

            const urlCheckResult = await checkMethod(car.short_url);
            
            const newStatus = determineStatus(
                car.created_at,
                urlCheckResult.available,
                urlCheckResult.sold
            );

            // Обновляем статус только если он изменился
            if (car.status !== newStatus) {
                await updateCarStatus(car.id, newStatus, urlCheckResult);
                state.stats.updated++;
            }

            // Обновляем статистику
            state.stats.checked++;
            if (urlCheckResult.sold) {
                state.stats.sold++;
            } else if (urlCheckResult.available) {
                state.stats.active++;
            }

            // Задержка между запросами
            if (state.config.delayBetweenRequests > 0) {
                await new Promise(resolve => setTimeout(resolve, state.config.delayBetweenRequests));
            }

            return { success: true, carId: car.id, status: newStatus };
        } catch (error) {
            state.stats.errors++;
            loggerService.logSystemError('StatusUpdateService', error, {
                action: 'processCar',
                carId: car.id,
                url: car.short_url
            });
            return { success: false, carId: car.id, error: error.message };
        }
    }

    /**
     * Запуск процесса актуализации статусов
     */
    async function start(batchSize = null) {
        if (state.isRunning) {
            loggerService.logWarning('StatusUpdateService уже запущен');
            return;
        }

        state.isRunning = true;
        const actualBatchSize = batchSize || state.config.batchSize;

        try {
            loggerService.logInfo('Запуск StatusUpdateService', {
                batchSize: actualBatchSize,
                useBrowser: state.config.useBrowser
            });

            // Проверяем и добавляем колонку status, если её нет
            await ensureStatusColumn();

            // Инициализируем браузер, если нужно
            if (state.config.useBrowser) {
                await initializeBrowser();
            }

            // Сбрасываем статистику
            state.stats = {
                total: 0,
                checked: 0,
                sold: 0,
                active: 0,
                updated: 0,
                errors: 0
            };

            let offset = 0;
            let hasMore = true;

            while (hasMore && state.isRunning) {
                // Получаем батч автомобилей
                const cars = await getCarsToCheck(actualBatchSize, offset);
                
                if (cars.length === 0) {
                    hasMore = false;
                    break;
                }

                state.stats.total += cars.length;

                loggerService.logInfo(`Обработка батча: ${cars.length} автомобилей`, {
                    offset,
                    total: state.stats.total
                });

                // Обрабатываем каждый автомобиль
                for (const car of cars) {
                    if (!state.isRunning) {
                        break;
                    }
                    await processCar(car);
                }

                offset += cars.length;
                hasMore = cars.length === actualBatchSize;

                // Логируем прогресс
                loggerService.logInfo('Прогресс актуализации', {
                    checked: state.stats.checked,
                    updated: state.stats.updated,
                    sold: state.stats.sold,
                    active: state.stats.active,
                    errors: state.stats.errors
                });
            }

            loggerService.logInfo('StatusUpdateService завершен', state.stats);
        } catch (error) {
            loggerService.logSystemError('StatusUpdateService', error, {
                action: 'start'
            });
            throw error;
        } finally {
            await closeBrowser();
            state.isRunning = false;
        }
    }

    /**
     * Запуск циклического процесса актуализации статусов
     */
    async function startCycling(intervalMinutes = 60) {
        if (state.isRunning) {
            loggerService.logWarning('StatusUpdateService уже запущен');
            return;
        }

        state.isRunning = true;
        const intervalMs = intervalMinutes * 60 * 1000;

        loggerService.logInfo('Запуск циклического режима StatusUpdateService', {
            intervalMinutes,
            intervalMs
        });

        // Запускаем первый цикл сразу
        await start();

        // Затем запускаем циклически
        const cycle = async () => {
            if (!state.isRunning) {
                return;
            }

            try {
                loggerService.logInfo(`Ожидание ${intervalMinutes} минут до следующего цикла актуализации...`);
                
                // Ждем указанный интервал
                await new Promise((resolve) => {
                    const timeout = setTimeout(resolve, intervalMs);
                    
                    // Проверяем каждую минуту, не остановлен ли сервис
                    const checkInterval = setInterval(() => {
                        if (!state.isRunning) {
                            clearTimeout(timeout);
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 60000);
                });

                if (state.isRunning) {
                    await start();
                    // Планируем следующий цикл
                    cycle();
                }
            } catch (error) {
                loggerService.logSystemError('StatusUpdateService', error, {
                    action: 'startCycling'
                });
                
                // При ошибке ждем и пробуем снова
                if (state.isRunning) {
                    setTimeout(cycle, intervalMs);
                }
            }
        };

        // Запускаем следующий цикл
        cycle();
    }

    /**
     * Остановка процесса актуализации
     */
    async function stop() {
        if (!state.isRunning) {
            return;
        }

        loggerService.logInfo('Остановка StatusUpdateService');
        state.isRunning = false;
        await closeBrowser();
    }

    /**
     * Получение статистики
     */
    function getStats() {
        return { ...state.stats, isRunning: state.isRunning };
    }

    return {
        start,
        startCycling,
        stop,
        getStats,
        processCar
    };
}

// Создаем глобальный экземпляр
const statusUpdateService = createStatusUpdateService();

module.exports = { createStatusUpdateService, statusUpdateService };
