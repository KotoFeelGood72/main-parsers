const { telegramService } = require('../../../../services/TelegramService');

/**
 * Парсинг списка объявлений для Carswitch.com
 */

class CarswitchListingParser {
    constructor(config) {
        this.config = config;
        
        // Основные селекторы для Carswitch
        this.listingSelector = '#car-listing-content';
        this.listingStemSelector = '#car-listing-content a.block.touch-manipulation';
        
        // Селекторы для скролла
        this.scrollContainers = [
            this.listingSelector,
            "main",
            "body"
        ];
        
        // Статистика для логирования
        this.stats = {
            totalPages: 0,
            totalListings: 0,
            errors: 0,
            startTime: null
        };

        // Максимальное количество страниц (защита от бесконечного цикла)
        this.maxPages = config.maxPages || 1000;
        
        // Интервал для отправки уведомлений в Telegram (каждые N страниц)
        this.telegramNotificationInterval = this.config.telegramNotificationInterval || 10;
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
            const page = await context.newPage();

            try {
                console.log("🔍 Открываем каталог Carswitch...");

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
                        timeout: 5000
                    },
                    maxPages: this.maxPages,
                    maxEmptyPages: 3,
                    onPageLoad: async (page, pageNum, pageUrl) => {
                        currentPage = pageNum;
                        console.log(`📄 Загружаем страницу: ${pageUrl}`);
                        
                        // Добавляем случайную задержку перед загрузкой страницы (имитация человеческого поведения)
                        const randomDelay = Math.floor(Math.random() * 2000) + 1000; // 1-3 секунды
                        await this.sleep(randomDelay);
                    }
                })) {
                    if (!hasContent) {
                        console.warn(`⚠️ На странице ${currentPage} не найдено объявлений`);
                        console.log(`✅ Завершаем парсинг Carswitch, переход к следующему модулю`);
                        
                        if (telegramService.getStatus().enabled) {
                            await this.sendProgressNotification('end', currentPage, this.stats.totalListings);
                        }
                        break;
                    }

                    // Ждем немного для загрузки контента
                    await paginationPage.waitForTimeout(2000);

                    // Ждем загрузки страницы
                    await paginationPage.waitForTimeout(3000);

                    // Скроллим страницу для подгрузки всех карточек (более реалистично)
                    await this.autoScroll(paginationPage);
                    
                    // Добавляем случайную задержку после скролла
                    const scrollDelay = Math.floor(Math.random() * 1500) + 1000; // 1-2.5 секунды
                    await paginationPage.waitForTimeout(scrollDelay);

                    // Ищем объявления с основным селектором
                    let carLinks = [];
                    
                    try {
                        // Проверяем наличие контейнера с объявлениями
                        const listingContainer = await paginationPage.$(this.listingSelector);
                        if (listingContainer) {
                            carLinks = await paginationPage.$$eval(
                                this.listingStemSelector,
                                (anchors) => anchors.map((a) => a.href).filter(Boolean)
                            );
                            
                            if (carLinks.length > 0) {
                                console.log(`✅ Найдено ${carLinks.length} объявлений с основным селектором`);
                            }
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

                    for (const link of carLinks) {
                        yield link;
                    }
                }

                break; // Успешно завершили парсинг
            } catch (error) {
                console.error(`❌ Ошибка при парсинге страницы ${currentPage}:`, error);
                this.stats.errors++;
                attempt++;
                
                // Отправляем уведомление об ошибке в Telegram
                if (telegramService.getStatus().enabled) {
                    await this.sendErrorNotification(currentPage, error, 'unknown', attempt >= this.config.maxRetries);
                }
                
                if (attempt >= this.config.maxRetries) {
                    throw error;
                }
                
                console.log(`🔄 Повторная попытка ${attempt}/${this.config.maxRetries}...`);
                await this.sleep(this.config.retryDelay);
            } finally {
                await page.close();
            }
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
                message = `🚀 *Carswitch: Начало парсинга*\n\n` +
                         `Страница: ${page}\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'progress') {
                message = `📊 *Carswitch: Прогресс парсинга*\n\n` +
                         `Страниц обработано: ${page}\n` +
                         `Объявлений найдено: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.errors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'end') {
                message = `✅ *Carswitch: Парсинг завершен*\n\n` +
                         `Всего страниц: ${page}\n` +
                         `Всего объявлений: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.errors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
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
            const message = `${emoji} *Carswitch: Ошибка парсинга*\n\n` +
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
     * Утилита для паузы
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { CarswitchListingParser };
