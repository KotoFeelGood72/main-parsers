const { telegramService } = require('../../../../services/TelegramService');
const { paginatePages } = require('../../../utils/pagination');

/**
 * Парсинг списка объявлений для Dubizzle.com (функциональный подход)
 */

/**
 * Создание парсера списка объявлений Dubizzle
 */
function createDubizzleListingParser(config) {
    // Конфигурация
    const parserConfig = config;
    
    // Максимальное количество страниц (защита от бесконечного цикла)
    const maxPages = config.maxPages || 50;
    
    // Интервал для отправки уведомлений в Telegram (каждые N страниц)
    const telegramNotificationInterval = config.telegramNotificationInterval || 10;
    
    // Основные селекторы для Dubizzle
    // Сам элемент с data-testid ЯВЛЯЕТСЯ ссылкой <a>
    const listingSelector = '#listings-top a[data-testid^="listing-"]';
    
    // Селекторы для скролла
    const scrollContainers = [
        'main',
        '[data-testid="search-results"]',
        "body"
    ];

    /**
     * Получение списка объявлений
     */
    async function* getListings(context) {
        let attempt = 0;
        let currentPage = 1; // Начинаем с page=1, page=0 не существует
        
        // Статистика для логирования
        const stats = {
            totalPages: 0,
            totalListings: 0,
            errors: 0,
            startTime: Date.now()
        };

        // Отправляем уведомление о старте парсинга списка
        if (telegramService.getStatus().enabled) {
            await sendProgressNotification('start', currentPage, 0, stats);
        }

        while (attempt < parserConfig.maxRetries) {
            let page = null;

            try {
                page = await context.newPage();
                console.log("🔍 Открываем каталог Dubizzle...");

                // Используем утилиту пагинации
                for await (const { page: paginationPage, pageNumber, url, hasContent } of paginatePages(context, {
                    baseUrl: parserConfig.listingsUrl,
                    contentSelector: listingSelector,
                    urlOptions: {
                        pageParam: 'page',
                        separator: '?'
                    },
                    contentOptions: {
                        minItems: 1,
                        timeout: 30000
                    },
                    maxPages: maxPages,
                    maxEmptyPages: 3,
                    onPageLoad: async (page, pageNum, pageUrl) => {
                        currentPage = pageNum;
                        console.log(`📄 Загружаем страницу: ${pageUrl}`);
                    }
                })) {
                    // Используем страницу из пагинации
                    if (!hasContent) {
                        console.warn(`⚠️ На странице ${currentPage} не найдено объявлений`);
                        continue;
                    }

                    // Ждем загрузки данных
                    await paginationPage.waitForTimeout(5000);

                    // Извлекаем ссылки используя правильные селекторы
                    let carLinks = [];
                    
                    try {
                        // Ждем появления контейнера с листингами
                        await paginationPage.waitForSelector('#listings-top', { timeout: 30000 });
                        
                        // Извлекаем ссылки - элементы с data-testid сами являются ссылками
                        carLinks = await paginationPage.$$eval(
                            listingSelector,
                            (anchors) => anchors.map((a) => a.href).filter(Boolean)
                        );
                        
                        if (carLinks.length > 0) {
                            console.log(`✅ Найдено ${carLinks.length} объявлений`);
                        } else {
                            // Debug: проверяем что есть на странице
                            const debug = await paginationPage.evaluate((selectors) => {
                                const container = document.querySelector(selectors.listingsContainer);
                                const listings = container ? container.querySelectorAll(selectors.listingItems) : [];
                                const count = listings.length;
                                let linksInFirst = 0;
                                if (listings.length > 0) {
                                    const firstListing = listings[0];
                                    linksInFirst = firstListing.querySelectorAll('a').length;
                                }
                                return { 
                                    hasContainer: !!container, 
                                    listingsCount: count,
                                    linksInFirstListing: linksInFirst
                                };
                            });
                            console.log(`⚠️ Debug: ${JSON.stringify(debug)}`);
                        }
                    } catch (error) {
                        console.log("⚠️ Ошибка при поиске объявлений:", error.message);
                    }

                    if (carLinks.length === 0) {
                        console.warn(`⚠️ На странице ${currentPage} не найдено объявлений`);
                        
                        // Пагинация обрабатывается автоматически утилитой
                        continue;
                    }

                    console.log(`✅ Найдено ${carLinks.length} объявлений на странице ${currentPage}`);
                    
                    // Обновляем статистику
                    stats.totalPages = currentPage;
                    stats.totalListings += carLinks.length;
                    
                    // Логируем первые несколько ссылок для отладки
                    if (carLinks.length > 0 && currentPage <= 3) {
                        console.log(`🔗 Первые 3 ссылки на странице ${currentPage}:`);
                        carLinks.slice(0, 3).forEach((link, index) => {
                            console.log(`   ${index + 1}. ${link}`);
                        });
                    }

                    // Отправляем уведомление в Telegram каждые N страниц
                    if (telegramService.getStatus().enabled && currentPage % telegramNotificationInterval === 0) {
                        await sendProgressNotification('progress', currentPage, stats.totalListings, stats);
                    }

                    // Сначала возвращаем все ссылки
                    for (const link of carLinks) {
                        yield link;
                    }
                    
                    // Ограничим количество страниц
                    if (currentPage >= maxPages) {
                        console.log(`⚠️ Достигнут лимит страниц (${maxPages})`);
                        
                        if (telegramService.getStatus().enabled) {
                            await sendProgressNotification('limit_reached', currentPage - 1, stats.totalListings, stats);
                        }
                        break;
                    }
                }

                // Закрываем страницу после завершения парсинга
                if (page) {
                    await page.close();
                    page = null;
                }
                
                if (telegramService.getStatus().enabled) {
                    await sendProgressNotification('end', currentPage - 1, stats.totalListings, stats);
                }
                
                break; // Успешно завершили парсинг
            } catch (error) {
                console.error(`❌ Ошибка при парсинге страницы ${currentPage}:`, error);
                stats.errors++;
                
                // Закрываем страницу при ошибке
                if (page) {
                    await page.close();
                    page = null;
                }
                
                // Отправляем уведомление об ошибке в Telegram
                if (telegramService.getStatus().enabled) {
                    await sendErrorNotification(currentPage, error, 'unknown', attempt + 1 >= parserConfig.maxRetries, stats);
                }
                
                attempt++;
                
                if (attempt >= parserConfig.maxRetries) {
                    throw error;
                }
                
                console.log(`🔄 Повторная попытка ${attempt}/${parserConfig.maxRetries}...`);
                await sleep(parserConfig.retryDelay || 5000);
            }
        }
    }

    /**
     * Автоматический скролл для подгрузки контента
     */
    async function autoScroll(page) {
        await page.evaluate(async (scrollContainers) => {
            const container = scrollContainers.find(c => document.querySelector(c) !== null);
            if (!container) return;

            const scrollElement = document.querySelector(container);
            if (!scrollElement) return;

            await new Promise((resolve) => {
                let lastScrollHeight = 0;
                let attemptsWithoutChange = 0;

                const interval = setInterval(() => {
                    scrollElement.scrollBy(0, 300);

                    const currentHeight = scrollElement.scrollHeight;
                    if (currentHeight !== lastScrollHeight) {
                        attemptsWithoutChange = 0;
                        lastScrollHeight = currentHeight;
                    } else {
                        attemptsWithoutChange++;
                    }

                    // остановка после 3 "пустых" скроллов
                    if (attemptsWithoutChange >= 3) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 400);
            });
        }, scrollContainers);
    }

    /**
     * Отправка уведомления о прогрессе в Telegram
     */
    async function sendProgressNotification(type, page, listingsCount, stats) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const duration = stats && stats.startTime 
                ? Math.round((Date.now() - stats.startTime) / 1000 / 60) 
                : 0;

            let message = '';
            
            if (type === 'start') {
                message = `🚀 *Dubizzle: Начало парсинга*\n\n` +
                         `Страница: ${page}\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'progress') {
                message = `📊 *Dubizzle: Прогресс парсинга*\n\n` +
                         `Страниц обработано: ${page}\n` +
                         `Объявлений найдено: ${listingsCount}\n` +
                         `Ошибок: ${stats ? stats.errors : 0}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'end') {
                message = `✅ *Dubizzle: Парсинг завершен*\n\n` +
                         `Всего страниц: ${page}\n` +
                         `Всего объявлений: ${listingsCount}\n` +
                         `Ошибок: ${stats ? stats.errors : 0}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'limit_reached') {
                message = `⚠️ *Dubizzle: Достигнут лимит страниц*\n\n` +
                         `Обработано страниц: ${page}\n` +
                         `Найдено объявлений: ${listingsCount}\n` +
                         `Ошибок: ${stats ? stats.errors : 0}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
                         `⚠️ Возможно, на сайте больше объявлений!`;
            }

            if (message) {
                await telegramService.sendMessage(message);
            }
        } catch (error) {
            console.warn(`⚠️ Ошибка отправки уведомления в Telegram:`, error.message);
        }
    }

    /**
     * Отправка уведомления об ошибке в Telegram
     */
    async function sendErrorNotification(page, error, url = 'unknown', isCritical = false, stats = null) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const emoji = isCritical ? '🚨' : '⚠️';
            const message = `${emoji} *Dubizzle: Ошибка парсинга*\n\n` +
                          `Страница: ${page}\n` +
                          `Ошибка: ${error.name || 'Unknown'}\n` +
                          `Сообщение: ${error.message}\n` +
                          (url !== 'unknown' ? `URL: ${url}\n` : '') +
                          `Всего ошибок: ${stats ? stats.errors : 0}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления об ошибке:`, telegramError.message);
        }
    }

    /**
     * Утилита для паузы
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Возвращаем объект с методами
    return {
        getListings,
        autoScroll,
        sendProgressNotification,
        sendErrorNotification,
        sleep
    };
}

module.exports = { createDubizzleListingParser };
