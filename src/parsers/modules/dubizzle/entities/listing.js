const { telegramService } = require('../../../../services/TelegramService');
const { paginatePages } = require('../../../utils/pagination');

/**
 * Парсинг списка объявлений для Dubizzle.com
 */

class DubizzleListingParser {
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
        this.maxPages = config.maxPages || 50;
        
        // Интервал для отправки уведомлений в Telegram (каждые N страниц)
        this.telegramNotificationInterval = this.config.telegramNotificationInterval || 10;
        
        // Основные селекторы для Dubizzle
        // Сам элемент с data-testid ЯВЛЯЕТСЯ ссылкой <a>
        this.listingSelector = '#listings-top a[data-testid^="listing-"]';
        
        // Селекторы для скролла
        this.scrollContainers = [
            'main',
            '[data-testid="search-results"]',
            "body"
        ];
    }

    /**
     * Получение списка объявлений
     */
    async* getListings(context) {
        let attempt = 0;
        let currentPage = 1; // Начинаем с page=1, page=0 не существует
        this.stats.startTime = Date.now();
        this.stats.totalPages = 0;
        this.stats.totalListings = 0;
        this.stats.errors = 0;

        // Отправляем уведомление о старте парсинга списка
        if (telegramService.getStatus().enabled) {
            await this.sendProgressNotification('start', currentPage, 0);
        }

        while (attempt < this.config.maxRetries) {
            let page = null;

            try {
                page = await context.newPage();
                console.log("🔍 Открываем каталог Dubizzle...");

                // Используем утилиту пагинации
                for await (const { page: paginationPage, pageNumber, url, hasContent } of paginatePages(context, {
                    baseUrl: this.config.listingsUrl,
                    contentSelector: this.listingSelector,
                    urlOptions: {
                        pageParam: 'page',
                        separator: '?'
                    },
                    contentOptions: {
                        minItems: 1,
                        timeout: 30000
                    },
                    maxPages: this.maxPages,
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
                            this.listingSelector,
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
                    this.stats.totalPages = currentPage;
                    this.stats.totalListings += carLinks.length;
                    
                    // Логируем первые несколько ссылок для отладки
                    if (carLinks.length > 0 && currentPage <= 3) {
                        console.log(`🔗 Первые 3 ссылки на странице ${currentPage}:`);
                        carLinks.slice(0, 3).forEach((link, index) => {
                            console.log(`   ${index + 1}. ${link}`);
                        });
                    }

                    // Отправляем уведомление в Telegram каждые N страниц
                    if (telegramService.getStatus().enabled && currentPage % this.telegramNotificationInterval === 0) {
                        await this.sendProgressNotification('progress', currentPage, this.stats.totalListings);
                    }

                    // Сначала возвращаем все ссылки
                    for (const link of carLinks) {
                        yield link;
                    }
                    
                    // Ограничим количество страниц
                    if (currentPage >= this.maxPages) {
                        console.log(`⚠️ Достигнут лимит страниц (${this.maxPages})`);
                        
                        if (telegramService.getStatus().enabled) {
                            await this.sendProgressNotification('limit_reached', currentPage - 1, this.stats.totalListings);
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
                    await this.sendProgressNotification('end', currentPage - 1, this.stats.totalListings);
                }
                
                break; // Успешно завершили парсинг
            } catch (error) {
                console.error(`❌ Ошибка при парсинге страницы ${currentPage}:`, error);
                this.stats.errors++;
                
                // Закрываем страницу при ошибке
                if (page) {
                    await page.close();
                    page = null;
                }
                
                // Отправляем уведомление об ошибке в Telegram
                if (telegramService.getStatus().enabled) {
                    await this.sendErrorNotification(currentPage, error, 'unknown', attempt + 1 >= this.config.maxRetries);
                }
                
                attempt++;
                
                if (attempt >= this.config.maxRetries) {
                    throw error;
                }
                
                console.log(`🔄 Повторная попытка ${attempt}/${this.config.maxRetries}...`);
                await this.sleep(this.config.retryDelay || 5000);
            }
        }
    }

    /**
     * Автоматический скролл для подгрузки контента
     */
    async autoScroll(page) {
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
        }, this.scrollContainers);
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
                message = `🚀 *Dubizzle: Начало парсинга*\n\n` +
                         `Страница: ${page}\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'progress') {
                message = `📊 *Dubizzle: Прогресс парсинга*\n\n` +
                         `Страниц обработано: ${page}\n` +
                         `Объявлений найдено: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.errors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'end') {
                message = `✅ *Dubizzle: Парсинг завершен*\n\n` +
                         `Всего страниц: ${page}\n` +
                         `Всего объявлений: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.errors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'limit_reached') {
                message = `⚠️ *Dubizzle: Достигнут лимит страниц*\n\n` +
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
    async sendErrorNotification(page, error, url = 'unknown', isCritical = false) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const emoji = isCritical ? '🚨' : '⚠️';
            const message = `${emoji} *Dubizzle: Ошибка парсинга*\n\n` +
                          `Страница: ${page}\n` +
                          `Ошибка: ${error.name || 'Unknown'}\n` +
                          `Сообщение: ${error.message}\n` +
                          (url !== 'unknown' ? `URL: ${url}\n` : '') +
                          `Всего ошибок: ${this.stats.errors}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления об ошибке:`, telegramError.message);
        }
    }

    /**
     * Утилита для паузы
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { DubizzleListingParser };
