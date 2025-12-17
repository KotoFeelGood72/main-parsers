const { telegramService } = require('../../../../services/TelegramService');
const { paginatePages } = require('../../../utils/pagination');

/**
 * Парсинг списка объявлений для Sharrai.ae
 */

class SharraiListingParser {
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
        
        // Основные селекторы для Sharrai
        this.listingSelector = '.car-card, .listing-item, [class*="car-item"], [class*="listing-card"]';
        this.listingLinkSelector = 'a[href*="/car/"], a[href*="/vehicle/"], a[href*="/detail/"]';
        
        // Селекторы для скролла
        this.scrollContainers = [
            'main',
            '.search-results',
            '.listings-container',
            "body"
        ];
    }

    /**
     * Получение списка объявлений
     */
    async* getListings(context) {
        let attempt = 0;
        let currentPage = 1;
        this.stats.startTime = Date.now();
        this.stats.totalPages = 0;
        this.stats.totalListings = 0;
        this.stats.errors = 0;

        // Отправляем уведомление о старте парсинга списка
        if (telegramService.getStatus().enabled) {
            await this.sendProgressNotification('start', currentPage, 0);
        }

        while (attempt < this.config.maxRetries) {
            try {
                console.log("🔍 Открываем каталог Sharrai...");

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
                    await paginationPage.waitForTimeout(3000);

                    // Извлекаем ссылки
                    let carLinks = [];
                    
                    try {
                        // Ждем появления контейнера с объявлениями
                        await paginationPage.waitForSelector(this.listingSelector, { timeout: 30000 });
                        
                        // Извлекаем ссылки на объявления
                        carLinks = await paginationPage.$$eval(
                            this.listingSelector,
                            (elements) => {
                                const links = [];
                                const uniqueLinks = new Set();
                                
                                for (const element of elements) {
                                    // Ищем ссылку внутри элемента
                                    const link = element.querySelector('a[href*="/car/"], a[href*="/vehicle/"], a[href*="/detail/"]') || 
                                                 (element.tagName === 'A' ? element : null);
                                    
                                    if (link && link.href) {
                                        const fullUrl = link.href.startsWith('http') 
                                            ? link.href 
                                            : `https://sharrai.ae${link.href.startsWith('/') ? link.href : '/' + link.href}`;
                                        
                                        if (!uniqueLinks.has(fullUrl)) {
                                            uniqueLinks.add(fullUrl);
                                            links.push(fullUrl);
                                        }
                                    }
                                }
                                
                                return links;
                            }
                        );
                        
                        if (carLinks.length > 0) {
                            console.log(`✅ Найдено ${carLinks.length} объявлений`);
                        }
                    } catch (error) {
                        console.log("⚠️ Ошибка при поиске объявлений:", error.message);
                    }

                    if (carLinks.length === 0) {
                        console.warn(`⚠️ На странице ${currentPage} не найдено объявлений`);
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

                    // Возвращаем ссылки
                    for (const link of carLinks) {
                        if (link) {
                            yield link;
                        }
                    }
                }
                
                // Завершаем парсинг
                console.log(`✅ Завершаем парсинг Sharrai: обработано ${currentPage} страниц`);
                
                if (telegramService.getStatus().enabled) {
                    await this.sendProgressNotification('end', currentPage, this.stats.totalListings);
                }
                
                break; // Успешно завершили парсинг

            } catch (error) {
                console.error(`❌ Критическая ошибка при парсинге страницы ${currentPage}:`, error);
                this.stats.errors++;
                attempt++;
                
                // Отправляем уведомление о критической ошибке
                if (telegramService.getStatus().enabled) {
                    await this.sendErrorNotification(currentPage, error, 'unknown', true);
                }
                
                if (attempt >= (this.config.maxRetries || 3)) {
                    throw error;
                }
                
                console.log(`🔄 Повторная попытка ${attempt}/${this.config.maxRetries || 3}...`);
                await this.sleep(this.config.retryDelay || 1000);
            }
        }
    }

    /**
     * Отправка уведомления о прогрессе в Telegram
     */
    async sendProgressNotification(type, page, listingsCount) {
        if (!telegramService.getStatus().enabled) return;

        try {
            let message = '';
            
            if (type === 'start') {
                message = `🚀 *Sharrai: Начало парсинга*\n\n` +
                         `Страница: ${page}\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'progress') {
                message = `📊 *Sharrai: Прогресс парсинга*\n\n` +
                         `Страниц обработано: ${page}\n` +
                         `Объявлений найдено: ${listingsCount}\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'end') {
                const elapsed = Math.round((Date.now() - this.stats.startTime) / 1000);
                message = `✅ *Sharrai: Парсинг завершен*\n\n` +
                         `Страниц обработано: ${page}\n` +
                         `Объявлений найдено: ${listingsCount}\n` +
                         `Время работы: ${elapsed}с\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            }

            if (message) {
                await telegramService.sendMessage(message);
            }
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления:`, telegramError.message);
        }
    }

    /**
     * Отправка уведомления об ошибке в Telegram
     */
    async sendErrorNotification(page, error, url = 'unknown', isCritical = false) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const message = `${isCritical ? '🚨' : '⚠️'} *Sharrai: Ошибка*\n\n` +
                          `Страница: ${page}\n` +
                          `URL: ${url}\n` +
                          `Ошибка: ${error.message}\n` +
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

module.exports = { SharraiListingParser };

