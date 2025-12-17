const { telegramService } = require('../../../../services/TelegramService');
const { paginatePages } = require('../../../utils/pagination');

/**
 * Парсинг списка объявлений для OneClickDrive.com
 */

class OneclickdriveListingParser {
    constructor(config) {
        this.config = config;
        
        // Статистика для логирования
        this.stats = {
            totalPages: 0,
            totalListings: 0,
            errors: 0,
            startTime: null
        };

        // Максимальное количество страниц (защита от бесконечного цикла)
        this.maxPages = config.maxPages || 100;
        
        // Интервал для отправки уведомлений в Telegram (каждые N страниц)
        this.telegramNotificationInterval = this.config.telegramNotificationInterval || 10;
        
        // Селектор для элементов списка машин
        this.listingSelector = '.gallery-img-link';
    }

    /**
     * Получение списка объявлений
     */
    async* getListings(context) {
        let currentPage = 1;
        let processedLinks = new Set(); // Защита от повторного парсинга
        this.stats.startTime = Date.now();
        this.stats.totalPages = 0;
        this.stats.totalListings = 0;
        this.stats.errors = 0;

        // Отправляем уведомление о старте парсинга списка
        if (telegramService.getStatus().enabled) {
            await this.sendProgressNotification('start', currentPage, 0);
        }

        console.log("🔍 Открываем каталог OneClickDrive...");

        try {
            // Используем утилиту пагинации
            for await (const { page: paginationPage, pageNumber, url, hasContent } of paginatePages(context, {
                    baseUrl: this.config.listingsUrl,
                    contentSelector: this.listingSelector,
                    urlOptions: {
                        pageParam: 'page',
                        separator: this.config.listingsUrl.includes('?') ? '&' : '?'
                    },
                    contentOptions: {
                        minItems: 1,
                        timeout: 30000
                    },
                    maxPages: this.config.maxPages || 1000,
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
                            this.listingSelector, 
                            { timeout: 30000 }
                        );

                        const carLinks = await paginationPage.$$eval(
                            this.listingSelector, 
                            (elements, baseUrl) =>
                                elements
                                    .map((el) => el.getAttribute("href"))
                                    .filter((href) => href && href.startsWith(baseUrl)),
                            this.config.baseUrl
                        );

                        console.log(`✅ Найдено ${carLinks.length} объявлений на странице ${currentPage}`);

                        // Обновляем статистику
                        this.stats.totalPages = currentPage;
                        this.stats.totalListings += carLinks.length;

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
                        if (telegramService.getStatus().enabled && currentPage % this.telegramNotificationInterval === 0) {
                            await this.sendProgressNotification('progress', currentPage, processedLinks.size);
                        }

                        // Если нет новых ссылок, значит страница повторяется или это последняя
                        if (newLinksFound === 0) {
                            console.log("⚠️ Повторяющиеся объявления обнаружены. Переходим к следующей странице...");
                        }

                        // Пагинация обрабатывается автоматически утилитой
                        // Небольшая задержка между страницами
                        await new Promise(resolve => setTimeout(resolve, this.config.delayBetweenRequests));

                    } catch (pageError) {
                        console.error(`❌ Ошибка при парсинге страницы ${currentPage}:`, pageError.message);
                        this.stats.errors++;
                        
                        // Отправляем уведомление об ошибке в Telegram
                        if (telegramService.getStatus().enabled) {
                            await this.sendErrorNotification(currentPage, pageError);
                        }
                        
                        // Продолжаем к следующей странице
                        continue;
                    }
                }
                
                // Завершаем парсинг
                console.log(`✅ Завершаем парсинг OneClickDrive: обработано ${currentPage} страниц`);
                
                if (telegramService.getStatus().enabled) {
                    await this.sendProgressNotification('end', currentPage, processedLinks.size);
                }

        } catch (error) {
            console.error(`❌ Ошибка при работе со страницей:`, error.message);
            this.stats.errors++;
            
            // Отправляем уведомление об ошибке в Telegram
            if (telegramService.getStatus().enabled) {
                await this.sendErrorNotification(currentPage, error, true);
            }
        }

        console.log(`✅ Парсинг завершен. Всего уникальных объявлений: ${processedLinks.size}`);
        
        if (telegramService.getStatus().enabled) {
            await this.sendProgressNotification('end', this.stats.totalPages, processedLinks.size);
        }
    }

    /**
     * Отправка уведомления о прогрессе в Telegram
     */
    async sendProgressNotification(type, page, listingsCount) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const duration = this.stats.startTime 
                ? Math.round((Date.now() - this.stats.startTime) / 1000 / 60) 
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
                         `Ошибок: ${this.stats.errors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'end') {
                message = `✅ *OneClickDrive: Парсинг завершен*\n\n` +
                         `Всего страниц: ${page}\n` +
                         `Всего объявлений: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.errors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'limit_reached') {
                message = `⚠️ *OneClickDrive: Достигнут лимит страниц*\n\n` +
                         `Обработано страниц: ${page}\n` +
                         `Найдено объявлений: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.errors}\n` +
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
    async sendErrorNotification(page, error, isCritical = false) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const emoji = isCritical ? '🚨' : '⚠️';
            const message = `${emoji} *OneClickDrive: Ошибка парсинга*\n\n` +
                          `Страница: ${page}\n` +
                          `Ошибка: ${error.name || 'Unknown'}\n` +
                          `Сообщение: ${error.message}\n` +
                          `Всего ошибок: ${this.stats.errors}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления об ошибке:`, telegramError.message);
        }
    }
}

module.exports = { OneclickdriveListingParser };

