const { telegramService } = require('../../../../services/TelegramService');
const { paginatePages } = require('../../../utils/pagination');

/**
 * Парсинг списка объявлений для OneClickDrive.com (функциональный подход)
 */

/**
 * Создание парсера списка объявлений OneClickDrive
 */
function createOneclickdriveListingParser(config) {
    // Конфигурация
    const parserConfig = config;
    
    // Максимальное количество страниц (защита от бесконечного цикла)
    const maxPages = config.maxPages || 100;
    
    // Интервал для отправки уведомлений в Telegram (каждые N страниц)
    const telegramNotificationInterval = config.telegramNotificationInterval || 10;
    
    // Селектор для элементов списка машин
    const listingSelector = '.gallery-img-link';

    /**
     * Получение списка объявлений
     */
    async function* getListings(context) {
        let currentPage = 1;
        let processedLinks = new Set(); // Защита от повторного парсинга
        
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

        console.log("🔍 Открываем каталог OneClickDrive...");

        try {
            // Используем утилиту пагинации
            for await (const { page: paginationPage, pageNumber, url, hasContent } of paginatePages(context, {
                    baseUrl: parserConfig.listingsUrl,
                    contentSelector: listingSelector,
                    urlOptions: {
                        pageParam: 'page',
                        separator: parserConfig.listingsUrl.includes('?') ? '&' : '?'
                    },
                    contentOptions: {
                        minItems: 1,
                        timeout: 30000
                    },
                    maxPages: parserConfig.maxPages || 1000,
                    maxEmptyPages: 3,
                    onPageLoad: async (page, pageNum, pageUrl) => {
                        currentPage = pageNum;
                        console.log(`📄 Загружаем страницу ${currentPage}: ${pageUrl}`);
                    }
                })) {
                    try {
                        if (!hasContent) {
                            console.warn(`⚠️ На странице ${currentPage} не найдено объявлений`);
                            continue;
                        }

                        // Ждём основной список машин
                        await paginationPage.waitForSelector(
                            listingSelector, 
                            { timeout: 30000 }
                        );

                        const carLinks = await paginationPage.$$eval(
                            listingSelector, 
                            (elements, baseUrl) =>
                                elements
                                    .map((el) => el.getAttribute("href"))
                                    .filter((href) => href && href.startsWith(baseUrl)),
                            parserConfig.baseUrl
                        );

                        console.log(`✅ Найдено ${carLinks.length} объявлений на странице ${currentPage}`);

                        // Обновляем статистику
                        stats.totalPages = currentPage;
                        stats.totalListings += carLinks.length;

                        // Проверяем есть ли новые ссылки
                        let newLinksFound = 0;
                        for (const link of carLinks) {
                            if (!processedLinks.has(link)) {
                                processedLinks.add(link);
                                yield link;
                                newLinksFound++;
                            }
                        }

                        console.log(`📌 Обработано новых объявлений: ${newLinksFound} (всего уникальных: ${processedLinks.size})`);

                        // Отправляем уведомление в Telegram каждые N страниц
                        if (telegramService.getStatus().enabled && currentPage % telegramNotificationInterval === 0) {
                            await sendProgressNotification('progress', currentPage, processedLinks.size, stats);
                        }

                        // Если нет новых ссылок, значит страница повторяется или это последняя
                        if (newLinksFound === 0) {
                            console.log("⚠️ Повторяющиеся объявления обнаружены. Переходим к следующей странице...");
                        }

                        // Пагинация обрабатывается автоматически утилитой
                        // Небольшая задержка между страницами
                        await new Promise(resolve => setTimeout(resolve, parserConfig.delayBetweenRequests));

                    } catch (pageError) {
                        console.error(`❌ Ошибка при парсинге страницы ${currentPage}:`, pageError.message);
                        stats.errors++;
                        
                        // Отправляем уведомление об ошибке в Telegram
                        if (telegramService.getStatus().enabled) {
                            await sendErrorNotification(currentPage, pageError, false, stats);
                        }
                        
                        // Продолжаем к следующей странице
                        continue;
                    }
                }
                
                // Завершаем парсинг
                console.log(`✅ Завершаем парсинг OneClickDrive: обработано ${currentPage} страниц`);
                
                if (telegramService.getStatus().enabled) {
                    await sendProgressNotification('end', currentPage, processedLinks.size, stats);
                }

        } catch (error) {
            console.error(`❌ Ошибка при работе со страницей:`, error.message);
            stats.errors++;
            
            // Отправляем уведомление об ошибке в Telegram
            if (telegramService.getStatus().enabled) {
                await sendErrorNotification(currentPage, error, true, stats);
            }
        }

        console.log(`✅ Парсинг завершен. Всего уникальных объявлений: ${processedLinks.size}`);
        
        if (telegramService.getStatus().enabled) {
            await sendProgressNotification('end', stats.totalPages, processedLinks.size, stats);
        }
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
                message = `🚀 *OneClickDrive: Начало парсинга*\n\n` +
                         `Страница: ${page}\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'progress') {
                message = `📊 *OneClickDrive: Прогресс парсинга*\n\n` +
                         `Страниц обработано: ${page}\n` +
                         `Объявлений найдено: ${listingsCount}\n` +
                         `Ошибок: ${stats ? stats.errors : 0}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'end') {
                message = `✅ *OneClickDrive: Парсинг завершен*\n\n` +
                         `Всего страниц: ${page}\n` +
                         `Всего объявлений: ${listingsCount}\n` +
                         `Ошибок: ${stats ? stats.errors : 0}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'limit_reached') {
                message = `⚠️ *OneClickDrive: Достигнут лимит страниц*\n\n` +
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
    async function sendErrorNotification(page, error, isCritical = false, stats = null) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const emoji = isCritical ? '🚨' : '⚠️';
            const message = `${emoji} *OneClickDrive: Ошибка парсинга*\n\n` +
                          `Страница: ${page}\n` +
                          `Ошибка: ${error.name || 'Unknown'}\n` +
                          `Сообщение: ${error.message}\n` +
                          `Всего ошибок: ${stats ? stats.errors : 0}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления об ошибке:`, telegramError.message);
        }
    }

    // Возвращаем объект с методами
    return {
        getListings,
        sendProgressNotification,
        sendErrorNotification
    };
}

module.exports = { createOneclickdriveListingParser };

