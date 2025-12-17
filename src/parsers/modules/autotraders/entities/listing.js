const { telegramService } = require('../../../../services/TelegramService');
const { paginatePages } = require('../../../utils/pagination');

/**
 * Парсинг списка объявлений для Autotraders.com
 */

class AutotradersListingParser {
    constructor(config) {
        this.config = config;
        
        // Основные селекторы для Autotraders.ae
        this.listingSelector = '.row.cars-cont';
        this.listingStemSelector = '.row.cars-cont a';
        
        // Селекторы для скролла
        this.scrollContainers = [
            'main',
            '.container',
            "body"
        ];
        
        // Дополнительные селекторы
        this.selectors = {
            listings: '.row.cars-cont',
            pagination: '.pagination, .pager, .page-navigation'
        };
    }

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
        this.telegramNotificationInterval = config.telegramNotificationInterval || 10;
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

        while (attempt < (this.config.maxRetries || 3)) {
            try {
                console.log("🔍 Открываем каталог Autotraders...");

                // Используем утилиту пагинации
                for await (const { page: paginationPage, pageNumber, url, hasContent } of paginatePages(context, {
                    baseUrl: this.config.listingsUrl,
                    contentSelector: this.selectors.listings,
                    urlOptions: {
                        pageParam: 'page',
                        separator: '?',
                        additionalParams: '&limit=20'
                    },
                    contentOptions: {
                        minItems: 1,
                        timeout: 5000
                    },
                    maxPages: this.maxPages,
                    maxEmptyPages: 3,
                    onPageLoad: async (page, pageNum, pageUrl) => {
                        currentPage = pageNum;
                        console.log(`📄 Загружаем страницу ${currentPage}: ${pageUrl}`);
                    }
                })) {
                    // Используем страницу из пагинации
                    const currentPageUrl = url;
                    
                    try {
                        // Страница уже загружена утилитой пагинации
                        if (!hasContent) {
                            console.warn(`⚠️ На странице ${currentPage} не найдено объявлений`);
                            continue;
                        }

                        // Проверяем, что страница загрузилась корректно
                        const pageTitle = await paginationPage.title().catch(() => null);
                        if (!pageTitle) {
                            console.warn(`⚠️ Страница не загрузилась (нет title), пропускаем`);
                            continue;
                        }

                        // Ждем загрузки страницы
                        await paginationPage.waitForTimeout(3000);

                        // Скроллим страницу для подгрузки всех карточек
                        try {
                            await this.autoScroll(paginationPage);
                            await paginationPage.waitForTimeout(2000);
                        } catch (scrollError) {
                            console.warn(`⚠️ Ошибка при скролле страницы ${currentPage}:`, scrollError.message);
                        }

                        // Ищем объявления с основным селектором
                        let carLinks = [];
                        
                        try {
                            // Извлекаем ссылки на объявления - берем первую ссылку из каждого блока cars-cont
                            carLinks = await paginationPage.evaluate((selectors) => {
                                try {
                                    const listings = Array.from(document.querySelectorAll(selectors.listings));
                                    const links = [];
                                    const uniqueLinks = new Set();
                                    
                                    for (const listing of listings) {
                                        if (!listing) continue;
                                        
                                        // Ищем первую ссылку, которая ведет на детальную страницу автомобиля
                                        const anchor = listing.querySelector('a[href*="/used-cars/"]');
                                        if (anchor && anchor.href && !uniqueLinks.has(anchor.href)) {
                                            uniqueLinks.add(anchor.href);
                                            links.push(anchor.href);
                                        }
                                    }
                                    
                                    return links;
                                } catch (e) {
                                    console.error('Ошибка в evaluate:', e);
                                    return [];
                                }
                            }, this.selectors);
                            
                            if (carLinks.length > 0) {
                                console.log(`✅ Найдено ${carLinks.length} объявлений на странице ${currentPage}`);
                            }
                        } catch (error) {
                            console.error(`⚠️ Ошибка при поиске объявлений на странице ${currentPage}:`, error.message);
                            this.stats.errors++;
                            
                            // Отправляем уведомление об ошибке в Telegram
                            if (telegramService.getStatus().enabled) {
                                await this.sendErrorNotification(currentPage, error, currentPageUrl);
                            }
                        }

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

                        // Пагинация обрабатывается автоматически утилитой
                        // Небольшая задержка между страницами
                        await this.sleep(this.config.delayBetweenRequests || 1000);

                    } catch (pageError) {
                        console.error(`❌ Ошибка при обработке страницы ${currentPage}:`, pageError.message);
                        this.stats.errors++;
                        
                        // Отправляем уведомление об ошибке в Telegram
                        if (telegramService.getStatus().enabled) {
                            await this.sendErrorNotification(currentPage, pageError, currentPageUrl);
                        }

                        // Продолжаем к следующей странице (пагинация обрабатывается автоматически)
                        continue;
                    }
                }
                
                // Завершаем парсинг
                console.log(`✅ Завершаем парсинг Autotraders: обработано ${currentPage} страниц`);
                
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
            } finally {
                // Страницы закрываются автоматически утилитой пагинации
            }
        }
    }

    /**
     * Надежная проверка наличия следующей страницы
     * Пробует загрузить следующую страницу и проверить наличие объявлений
     */
    async checkNextPageReliable(context, page, currentPage, currentListingsCount) {
        try {
            // Сначала проверяем пагинацию на текущей странице
            const hasPaginationNext = await page.evaluate((pageNum) => {
                try {
                    // Ищем различные варианты пагинации
                    const paginationSelectors = [
                        '.pagination',
                        '.pager',
                        '.page-navigation',
                        '.pagination-wrapper',
                        '[class*="pagination"]',
                        '[class*="pager"]'
                    ];
                    
                    for (const selector of paginationSelectors) {
                        const pagination = document.querySelector(selector);
                        if (pagination) {
                            // Ищем кнопку "Next" или стрелку вправо
                            const nextSelectors = [
                                'a[aria-label*="Next"]',
                                'a[aria-label*="next"]',
                                'a[aria-label*="Next page"]',
                                '.next',
                                '.page-next',
                                'a.next',
                                'button.next',
                                '[class*="next"]',
                                'a[href*="page"]:contains(">")',
                                'a:contains("Next")',
                                'a:contains("→")',
                                'a:contains("›")'
                            ];
                            
                            for (const nextSelector of nextSelectors) {
                                try {
                                    const nextButton = pagination.querySelector(nextSelector);
                                    if (nextButton) {
                                        // Проверяем, не disabled ли кнопка
                                        const isDisabled = nextButton.classList.contains('disabled') ||
                                                         nextButton.classList.contains('inactive') ||
                                                         nextButton.hasAttribute('disabled') ||
                                                         nextButton.getAttribute('aria-disabled') === 'true';
                                        
                                        if (!isDisabled) {
                                            return true;
                                        }
                                    }
                                } catch (e) {
                                    // Продолжаем поиск
                                }
                            }
                            
                            // Проверяем номера страниц
                            const pageLinks = pagination.querySelectorAll('a, button, span');
                            for (const link of pageLinks) {
                                if (!link) continue;
                                const text = link.textContent ? link.textContent.trim() : '';
                                const linkPageNum = parseInt(text);
                                if (!isNaN(linkPageNum) && linkPageNum > currentPageNum) {
                                    return true;
                                }
                            }
                        }
                    }
                    
                    return false;
                } catch (e) {
                    console.error('Ошибка при проверке пагинации:', e);
                    return false;
                }
            }, currentPage);

            // Если на текущей странице есть объявления, пробуем загрузить следующую страницу
            if (currentListingsCount > 0) {
                const nextPageUrl = currentPage === 1 
                    ? `${this.config.listingsUrl}?page=2&limit=20`
                    : `${this.config.listingsUrl}?page=${currentPage + 1}&limit=20`;
                
                console.log(`🔍 Проверяем наличие следующей страницы: ${nextPageUrl}`);
                
                try {
                    // Создаем новую страницу для проверки
                    const testPage = await context.newPage();
                    
                    try {
                        await testPage.goto(nextPageUrl, {
                            waitUntil: "domcontentloaded",
                            timeout: 30000
                        });
                        
                        await testPage.waitForTimeout(2000);
                        
                        // Проверяем наличие объявлений на следующей странице
                        const hasListings = await testPage.evaluate(() => {
                            try {
                                const listings = document.querySelectorAll(selectors.listings);
                                return listings.length > 0;
                            } catch (e) {
                                return false;
                            }
                        });
                        
                        await testPage.close();
                        
                        if (hasListings) {
                            console.log(`✅ Следующая страница ${currentPage + 1} существует и содержит объявления`);
                            return true;
                        } else {
                            console.log(`⚠️ Следующая страница ${currentPage + 1} существует, но не содержит объявлений`);
                            return false;
                        }
                    } catch (testError) {
                        await testPage.close().catch(() => {});
                        
                        // Если ошибка 404 или страница не найдена - значит следующей страницы нет
                        if (testError.message.includes('404') || 
                            testError.message.includes('not found') ||
                            testError.message.includes('net::ERR')) {
                            console.log(`✅ Следующая страница ${currentPage + 1} не существует (404)`);
                            return false;
                        }
                        
                        // Для других ошибок предполагаем, что страница может существовать
                        console.warn(`⚠️ Ошибка при проверке следующей страницы: ${testError.message}`);
                        return hasPaginationNext; // Используем результат проверки пагинации
                    }
                } catch (browserError) {
                    console.warn(`⚠️ Ошибка создания тестовой страницы: ${browserError.message}`);
                    return hasPaginationNext; // Используем результат проверки пагинации
                }
            } else {
                // Если на текущей странице нет объявлений, используем только проверку пагинации
                return hasPaginationNext;
            }
        } catch (error) {
            console.warn(`⚠️ Ошибка при надежной проверке следующей страницы:`, error.message);
            // В случае ошибки предполагаем, что следующая страница может быть (если есть объявления на текущей)
            return currentListingsCount > 0;
        }
    }

    /**
     * Старая проверка наличия следующей страницы (для обратной совместимости)
     */
    async checkNextPage(page, currentPage) {
        // Для обратной совместимости используем упрощенную проверку
        try {
            const hasNext = await page.evaluate((currentPageNum, selectors) => {
                try {
                    const pagination = document.querySelector(selectors.pagination);
                    if (pagination) {
                        const nextButton = pagination.querySelector('a[aria-label*="Next"], a[aria-label*="next"], .next, .page-next');
                        if (nextButton && !nextButton.classList.contains('disabled')) {
                            return true;
                        }
                    }
                    const listings = document.querySelectorAll(selectors.listings);
                    return listings.length > 0;
                } catch (e) {
                    return false;
                }
            }, currentPage);
            return hasNext;
        } catch (error) {
            return true;
        }
    }

    /**
     * Автоматический скролл для подгрузки контента
     */
    async autoScroll(page) {
        try {
            await page.evaluate(async (scrollContainers) => {
                try {
                    const container = scrollContainers.find(c => {
                        const el = document.querySelector(c);
                        return el !== null;
                    });
                    if (!container) return;

                    const scrollElement = document.querySelector(container);
                    if (!scrollElement) return;

                    await new Promise((resolve) => {
                        let lastScrollHeight = 0;
                        let attemptsWithoutChange = 0;
                        let maxAttempts = 50; // Максимальное количество попыток

                        const interval = setInterval(() => {
                            try {
                                scrollElement.scrollBy(0, 300);

                                const currentHeight = scrollElement.scrollHeight;
                                if (currentHeight !== lastScrollHeight) {
                                    attemptsWithoutChange = 0;
                                    lastScrollHeight = currentHeight;
                                } else {
                                    attemptsWithoutChange++;
                                }

                                // Остановка после 3 "пустых" скроллов или достижения максимума
                                if (attemptsWithoutChange >= 3 || maxAttempts <= 0) {
                                    clearInterval(interval);
                                    resolve();
                                }
                                maxAttempts--;
                            } catch (e) {
                                clearInterval(interval);
                                resolve();
                            }
                        }, 400);
                    });
                } catch (e) {
                    console.error('Ошибка в autoScroll:', e);
                }
            }, this.scrollContainers);
        } catch (error) {
            console.warn(`⚠️ Ошибка при скролле:`, error.message);
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
                message = `🚀 *Autotraders: Начало парсинга*\n\n` +
                         `Страница: ${page}\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'progress') {
                message = `📊 *Autotraders: Прогресс парсинга*\n\n` +
                         `Страниц обработано: ${page}\n` +
                         `Объявлений найдено: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.errors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'end') {
                message = `✅ *Autotraders: Парсинг завершен*\n\n` +
                         `Всего страниц: ${page}\n` +
                         `Всего объявлений: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.errors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'limit_reached') {
                message = `⚠️ *Autotraders: Достигнут лимит страниц*\n\n` +
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
            const message = `${emoji} *Autotraders: Ошибка парсинга*\n\n` +
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

module.exports = { AutotradersListingParser };
