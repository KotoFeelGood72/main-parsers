const { telegramService } = require('../../../../services/TelegramService');
const { paginatePages } = require('../../../utils/pagination');

/**
 * Парсинг списка объявлений для Dubicars.com
 */

class DubicarsListingParser {
    constructor(config) {
        this.config = config;
        
        // Основные селекторы для Dubicars
        this.listingSelector = 'section#serp-list li.serp-list-item a.image-container';
        
        // Селекторы для скролла
        this.scrollContainers = [
            'section#serp-list',
            'main',
            'body'
        ];
        
        // Селекторы для пагинации
        this.selectors = {
            pagination: '.pagination, .pager, [class*="pagination"], [class*="pager"]',
            nextButton: 'a[aria-label*="Next"], a[aria-label*="next"], .next, [class*="next"]',
            activePage: '.pagination .active, .pager .active, [class*="active"]',
            paginationLinks: 'a, button'
        };
    }

    /**
     * Создание новой страницы с настройками
     */
    async createPage(context) {
        const page = await context.newPage();
        
        // Оптимизация: блокируем все ненужные ресурсы для ускорения
        await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            const url = route.request().url();
            
            // Блокируем изображения
            if (resourceType === 'image' && !this.config.enableImageLoading) {
                route.abort();
                return;
            }
            
            // Блокируем ненужные ресурсы
            if (resourceType === 'stylesheet' || 
                resourceType === 'font' ||
                resourceType === 'media' ||
                resourceType === 'websocket' ||
                url.includes('analytics') ||
                url.includes('tracking') ||
                url.includes('advertisement')) {
                route.abort();
                return;
            }
            
            route.continue();
        });

        return page;
    }

    /**
     * Получение списка объявлений
     */
    async* getListings(context) {
        let attempt = 0;
        let currentPage = 1;
        // Увеличиваем лимит страниц: если на сайте 26,245 результатов и по ~20-30 на странице, нужно ~1300 страниц
        const maxPages = 2000; // Увеличенный лимит для больших каталогов
        const timeout = this.config.timeout || 60000; // Используем timeout из конфигурации
        const processedLinks = new Set(); // Отслеживаем уже обработанные ссылки
        let emptyPagesCount = 0; // Счетчик пустых страниц подряд
        const maxEmptyPages = 3; // Максимум пустых страниц подряд перед остановкой
        
        // Статистика для логирования
        this.stats = {
            startTime: Date.now(),
            totalFound: 0,
            totalUnique: 0,
            totalDuplicates: 0,
            totalPagesProcessed: 0,
            totalErrors: 0,
            lastProgressLog: 0,
            stopReason: null
        };

        // Интервал для отправки уведомлений в Telegram (каждые N страниц)
        this.telegramNotificationInterval = this.config.telegramNotificationInterval || 10;

        // Отправляем уведомление о старте парсинга списка
        if (telegramService.getStatus().enabled) {
            await this.sendProgressNotification('start', 1, 0);
        }

        while (attempt < this.config.maxRetries) {
            const page = await this.createPage(context);

            try {
                console.log("=".repeat(80));
                console.log(`🚀 НАЧАЛО ПАРСИНГА DUBICARS`);
                console.log(`📋 Конфигурация: maxPages=${maxPages}, maxEmptyPages=${maxEmptyPages}, timeout=${timeout}ms`);
                console.log(`⏰ Время начала: ${new Date().toLocaleString('ru-RU')}`);
                console.log("=".repeat(80));

                // Используем утилиту пагинации с кастомным формированием URL
                for await (const { page: paginationPage, pageNumber, url, hasContent } of paginatePages(context, {
                    baseUrl: this.config.listingsUrl,
                    contentSelector: this.listingSelector,
                    urlOptions: {
                        pageParam: 'page',
                        separator: '?',
                        // Кастомная функция для формирования URL (dubicars использует {page})
                        customUrlBuilder: (baseUrl, pageNum) => {
                            return baseUrl.replace('{page}', pageNum);
                        }
                    },
                    contentOptions: {
                        minItems: 1,
                        timeout: 15000
                    },
                    maxPages: maxPages,
                    maxEmptyPages: maxEmptyPages,
                    onPageLoad: async (page, pageNum, pageUrl) => {
                        currentPage = pageNum;
                        console.log(`📄 [${currentPage}/${maxPages}] Загружаем страницу: ${pageUrl}`);
                    }
                })) {
                    const pageStartTime = Date.now();
                    
                    // Логируем прогресс каждые 10 страниц
                    if (currentPage % 10 === 0 || currentPage === 1) {
                        const elapsed = Math.round((Date.now() - this.stats.startTime) / 1000);
                        const pagesPerSec = this.stats.totalPagesProcessed > 0 ? (this.stats.totalPagesProcessed / elapsed).toFixed(2) : 0;
                        const linksPerSec = this.stats.totalUnique > 0 ? (this.stats.totalUnique / elapsed).toFixed(2) : 0;
                        console.log("─".repeat(80));
                        console.log(`📊 ПРОГРЕСС ПАРСИНГА (страница ${currentPage}):`);
                        console.log(`   📄 Обработано страниц: ${this.stats.totalPagesProcessed}`);
                        console.log(`   🔗 Найдено объявлений: ${this.stats.totalFound}`);
                        console.log(`   ✅ Уникальных: ${this.stats.totalUnique}`);
                        console.log(`   🔄 Дубликатов: ${this.stats.totalDuplicates}`);
                        console.log(`   ⏱️  Время работы: ${elapsed}с (${pagesPerSec} стр/с, ${linksPerSec} объяв/с)`);
                        console.log("─".repeat(80));
                    }

                    // Отправляем уведомление в Telegram каждые N страниц
                    if (telegramService.getStatus().enabled && currentPage % this.telegramNotificationInterval === 0) {
                        await this.sendProgressNotification('progress', currentPage, this.stats.totalUnique);
                    }

                    try {
                        // Страница уже загружена утилитой пагинации
                        if (!hasContent) {
                            console.warn(`⚠️ На странице ${currentPage} не найдено объявлений`);
                            continue;
                        }
                    } catch (navigationError) {
                        this.stats.totalErrors++;
                        const pageLoadTime = Date.now() - pageStartTime;
                        
                        // Отправляем уведомление об ошибке в Telegram
                        if (telegramService.getStatus().enabled) {
                            await this.sendErrorNotification(currentPage, navigationError, url);
                        }
                        // Обработка ошибок загрузки страницы
                        if (navigationError.name === 'TimeoutError') {
                            console.warn(`⏱️ [${currentPage}] ТАЙМАУТ загрузки (${pageLoadTime}ms/${timeout}ms), пропускаем...`);
                            emptyPagesCount++;
                            if (emptyPagesCount >= maxEmptyPages) {
                                stats.stopReason = `Подряд ${maxEmptyPages} пустых страниц (таймауты)`;
                                console.log(`🏁 ОСТАНОВКА: ${stats.stopReason}`);
                                break;
                            }
                            currentPage++;
                            continue;
                        }
                        // Для других ошибок навигации также пропускаем страницу
                        console.warn(`⚠️ [${currentPage}] ОШИБКА загрузки (${pageLoadTime}ms): ${navigationError.message}`);
                        emptyPagesCount++;
                        if (emptyPagesCount >= maxEmptyPages) {
                            stats.stopReason = `Подряд ${maxEmptyPages} пустых страниц (ошибки загрузки)`;
                            console.log(`🏁 ОСТАНОВКА: ${stats.stopReason}`);
                            break;
                        }
                        currentPage++;
                        continue;
                    }
                    
                    this.stats.totalPagesProcessed++;
                    const pageLoadTime = Date.now() - pageStartTime;
                    if (pageLoadTime > 5000) {
                        console.log(`⏱️ [${currentPage}] Страница загружена за ${pageLoadTime}ms (медленно)`);
                    }

                    // Ждём основной список машин с обработкой таймаута
                    try {
                        await paginationPage.waitForSelector(this.listingSelector, { timeout: 15000 });
                    } catch (selectorError) {
                        if (selectorError.name === 'TimeoutError') {
                            console.warn(`⏱️ Селектор не найден на странице ${currentPage}, пропускаем...`);
                            emptyPagesCount++;
                            if (emptyPagesCount >= maxEmptyPages) {
                                console.log(`🏁 Подряд ${maxEmptyPages} пустых страниц. Завершаем парсинг.`);
                                break;
                            }
                            currentPage++;
                            continue;
                        }
                        throw selectorError;
                    }

                    // Проверяем общее количество результатов на сайте (если доступно)
                    const totalResults = await paginationPage.evaluate(() => {
                        // Ищем текст типа "26,245 Results found" или подобный
                        const bodyText = document.body.textContent || '';
                        const resultsMatch = bodyText.match(/(\d{1,3}(?:[,\s]\d{3})*)\s*Results?\s*found/i);
                        if (resultsMatch) {
                            return parseInt(resultsMatch[1].replace(/[,\s]/g, ''));
                        }
                        return null;
                    });
                    
                    if (totalResults && currentPage === 1) {
                        console.log(`📊 ОБЩАЯ СТАТИСТИКА САЙТА: Всего результатов на сайте: ${totalResults.toLocaleString()}`);
                        console.log(`📊 Ожидаемое количество страниц: ~${Math.ceil(totalResults / 25).toLocaleString()} (при ~25 объявлений на странице)`);
                    }

                    // Скроллим страницу для подгрузки всех карточек
                    await this.autoScroll(page);
                    await paginationPage.waitForTimeout(1000); // Увеличиваем задержку для полной загрузки

                    // Ищем объявления с основным селектором и альтернативными
                    let carLinks = [];
                    
                    try {
                        // Основной селектор
                        carLinks = await paginationPage.$$eval(
                            this.listingSelector,
                            (elements, baseUrl) =>
                                elements
                                    .map((el) => {
                                        const href = el.getAttribute("href");
                                        // Обрабатываем относительные и абсолютные URL
                                        if (!href) return null;
                                        if (href.startsWith('http')) return href;
                                        if (href.startsWith('/')) return baseUrl + href;
                                        return baseUrl + '/' + href;
                                    })
                                    .filter((href) => href && (href.startsWith(baseUrl) || href.includes('/dubai/used/'))),
                            this.config.baseUrl
                        );
                        
                        if (carLinks.length > 0) {
                            console.log(`✅ Найдено ${carLinks.length} объявлений с основным селектором`);
                        }
                        
                        // Если основной селектор не нашел объявления, пробуем альтернативные
                        if (carLinks.length === 0) {
                            console.log("🔍 Пробуем альтернативные селекторы...");
                            
                            const alternativeSelectors = [
                                'section#serp-list li.serp-list-item a',
                                'section#serp-list a[href*="/dubai/used/"]',
                                'li.serp-list-item a.image-container',
                                '.serp-list-item a',
                                'a[href*="/dubai/used/"]'
                            ];
                            
                            for (const selector of alternativeSelectors) {
                                try {
                                    const altLinks = await paginationPage.$$eval(
                                        selector,
                                        (elements, baseUrl) =>
                                            elements
                                                .map((el) => {
                                                    const href = el.getAttribute("href");
                                                    if (!href) return null;
                                                    if (href.startsWith('http')) return href;
                                                    if (href.startsWith('/')) return baseUrl + href;
                                                    return baseUrl + '/' + href;
                                                })
                                                .filter((href) => href && (href.startsWith(baseUrl) || href.includes('/dubai/used/')))
                                                .filter((href, index, self) => self.indexOf(href) === index), // Убираем дубликаты
                                        this.config.baseUrl
                                    );
                                    
                                    if (altLinks.length > 0) {
                                        console.log(`✅ Найдено ${altLinks.length} объявлений с альтернативным селектором: ${selector}`);
                                        carLinks = altLinks;
                                        break;
                                    }
                                } catch (altError) {
                                    // Продолжаем пробовать другие селекторы
                                    continue;
                                }
                            }
                        }
                    } catch (error) {
                        console.log("⚠️ Ошибка при поиске объявлений:", error.message);
                    }

                    if (carLinks.length === 0) {
                        const pageProcessTime = Date.now() - pageStartTime;
                        console.warn(`⚠️ [${currentPage}] ПУСТАЯ СТРАНИЦА: не найдено объявлений (время загрузки: ${pageProcessTime}ms)`);
                        emptyPagesCount++;
                        this.stats.totalPagesProcessed++;
                        
                        // Проверяем наличие пагинации или следующей страницы
                        const hasNextPage = await paginationPage.evaluate((selectors) => {
                            // Ищем кнопки пагинации или индикаторы следующей страницы
                            const pagination = document.querySelector(selectors.pagination);
                            if (!pagination) return false;
                            
                            // Проверяем наличие кнопки "Next" или следующей страницы
                            const nextButton = pagination.querySelector(selectors.nextButton);
                            const currentPageNum = parseInt(document.querySelector(selectors.activePage)?.textContent || '0');
                            const lastPageNum = Array.from(pagination.querySelectorAll(selectors.paginationLinks))
                                .map(el => parseInt(el.textContent))
                                .filter(num => !isNaN(num))
                                .sort((a, b) => b - a)[0] || 0;
                            
                            return nextButton !== null || (currentPageNum > 0 && currentPageNum < lastPageNum);
                        });
                        
                        if (!hasNextPage && emptyPagesCount >= maxEmptyPages) {
                            this.stats.stopReason = `Нет следующей страницы и подряд ${maxEmptyPages} пустых страниц`;
                            console.log(`🏁 ОСТАНОВКА: ${this.stats.stopReason}`);
                            
                            if (telegramService.getStatus().enabled) {
                                await this.sendProgressNotification('end', currentPage, this.stats.totalUnique);
                            }
                            break;
                        }
                        
                        // Если страница не пустая, но объявления не найдены, попробуем следующую страницу
                        if (emptyPagesCount < maxEmptyPages) {
                            console.log(`🔄 [${currentPage}] Переходим к следующей странице (пустых подряд: ${emptyPagesCount}/${maxEmptyPages})`);
                            currentPage++;
                            continue;
                        } else {
                            stats.stopReason = `Подряд ${maxEmptyPages} пустых страниц`;
                            console.log(`🏁 ОСТАНОВКА: ${stats.stopReason}`);
                            break;
                        }
                    }

                    // Сбрасываем счетчик пустых страниц, если нашли объявления
                    emptyPagesCount = 0;
                    this.stats.totalPagesProcessed++;

                    // Фильтруем дубликаты
                    const newLinks = carLinks.filter(link => !processedLinks.has(link));
                    const duplicatesCount = carLinks.length - newLinks.length;
                    
                    // Обновляем статистику
                    this.stats.totalFound += carLinks.length;
                    this.stats.totalDuplicates += duplicatesCount;
                    this.stats.totalUnique += newLinks.length;

                    if (duplicatesCount > 0) {
                        console.log(`🔄 [${currentPage}] Найдено ${duplicatesCount} дубликатов (новых: ${newLinks.length}, всего на странице: ${carLinks.length})`);
                    }

                    if (newLinks.length === 0) {
                        console.log(`⚠️ [${currentPage}] Все объявления уже обработаны (найдено: ${carLinks.length}, дубликатов: ${duplicatesCount})`);
                        emptyPagesCount++;
                        if (emptyPagesCount >= maxEmptyPages) {
                            this.stats.stopReason = `Подряд ${maxEmptyPages} страниц без новых объявлений`;
                            console.log(`🏁 ОСТАНОВКА: ${this.stats.stopReason}`);
                            
                            if (telegramService.getStatus().enabled) {
                                await this.sendProgressNotification('end', currentPage, this.stats.totalUnique);
                            }
                            break;
                        }
                        currentPage++;
                        continue;
                    }

                    const pageProcessTime = Date.now() - pageStartTime;
                    console.log(`✅ [${currentPage}] Найдено ${newLinks.length} новых объявлений (всего: ${carLinks.length}, дубликатов: ${duplicatesCount}, время: ${pageProcessTime}ms)`);
                    console.log(`   📈 Общая статистика: уникальных=${this.stats.totalUnique}, дубликатов=${this.stats.totalDuplicates}, найдено=${this.stats.totalFound}`);
                    
                    // Логируем первые несколько ссылок для отладки (только на первых страницах)
                    if (newLinks.length > 0 && currentPage <= 3) {
                        console.log(`🔗 [${currentPage}] Первые 3 новые ссылки:`);
                        newLinks.slice(0, 3).forEach((link, index) => {
                            console.log(`      ${index + 1}. ${link}`);
                        });
                    }

                    // Добавляем ссылки в множество обработанных и возвращаем их
                    for (const link of newLinks) {
                        processedLinks.add(link);
                        yield link;
                    }
                    
                    currentPage++;
                    
                    // Проверка достижения лимита страниц
                    if (currentPage > maxPages) {
                        stats.stopReason = `Достигнут лимит страниц (${maxPages})`;
                        console.log(`🏁 ОСТАНОВКА: ${stats.stopReason}`);
                        break;
                    }
                }

                // Финальная статистика
                const totalTime = Math.round((Date.now() - this.stats.startTime) / 1000);
                const avgPagesPerSec = this.stats.totalPagesProcessed > 0 ? (this.stats.totalPagesProcessed / totalTime).toFixed(2) : 0;
                const avgLinksPerSec = this.stats.totalUnique > 0 ? (this.stats.totalUnique / totalTime).toFixed(2) : 0;
                
                console.log("=".repeat(80));
                console.log(`🏁 ЗАВЕРШЕНИЕ ПАРСИНГА DUBICARS`);
                console.log(`⏰ Время завершения: ${new Date().toLocaleString('ru-RU')}`);
                console.log(`⏱️  Общее время работы: ${totalTime}с (${Math.floor(totalTime / 60)}м ${totalTime % 60}с)`);
                console.log(`📊 ФИНАЛЬНАЯ СТАТИСТИКА:`);
                console.log(`   📄 Обработано страниц: ${this.stats.totalPagesProcessed}`);
                console.log(`   🔗 Всего найдено объявлений: ${this.stats.totalFound}`);
                console.log(`   ✅ Уникальных объявлений: ${this.stats.totalUnique}`);
                console.log(`   🔄 Дубликатов: ${this.stats.totalDuplicates}`);
                console.log(`   ⚠️  Ошибок: ${this.stats.totalErrors}`);
                console.log(`   📈 Производительность: ${avgPagesPerSec} стр/с, ${avgLinksPerSec} объяв/с`);
                console.log(`   🛑 Причина остановки: ${this.stats.stopReason || 'Успешное завершение'}`);
                console.log(`   📍 Последняя страница: ${currentPage - 1}`);
                console.log("=".repeat(80));

                if (telegramService.getStatus().enabled) {
                    await this.sendProgressNotification('end', currentPage - 1, this.stats.totalUnique);
                }
                
                break; // Успешно завершили парсинг
            } catch (error) {
                this.stats.totalErrors++;
                const totalTime = Math.round((Date.now() - this.stats.startTime) / 1000);
                console.error("=".repeat(80));
                console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА при парсинге страницы ${currentPage}`);
                console.error(`   Ошибка: ${error.name} - ${error.message}`);
                console.error(`   Время работы до ошибки: ${totalTime}с`);
                console.error(`   Обработано страниц: ${this.stats.totalPagesProcessed}`);
                console.error(`   Найдено объявлений: ${this.stats.totalUnique}`);
                console.error(`   Попытка: ${attempt + 1}/${this.config.maxRetries}`);
                if (error.stack) {
                    console.error(`   Стек: ${error.stack.split('\n').slice(0, 3).join('\n   ')}`);
                }
                console.error("=".repeat(80));
                
                // Отправляем уведомление о критической ошибке
                if (telegramService.getStatus().enabled) {
                    await this.sendErrorNotification(currentPage, error, 'unknown', attempt + 1 >= this.config.maxRetries);
                }
                
                attempt++;
                
                if (attempt >= this.config.maxRetries) {
                    this.stats.stopReason = `Достигнут лимит повторных попыток (${this.config.maxRetries})`;
                    console.error(`❌ ОСТАНОВКА: ${this.stats.stopReason}`);
                    throw error;
                }
                
                console.log(`🔄 Повторная попытка ${attempt}/${this.config.maxRetries} через ${this.config.retryDelay || 5000}ms...`);
                await this.sleep(this.config.retryDelay || 5000);
            } finally {
                try {
                    await page.close();
                } catch (closeError) {
                    console.warn(`⚠️ Ошибка при закрытии страницы: ${closeError.message}`);
                }
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
                    scrollElement.scrollBy(0, 500); // Увеличили шаг скролла

                    const currentHeight = scrollElement.scrollHeight;
                    if (currentHeight !== lastScrollHeight) {
                        attemptsWithoutChange = 0;
                        lastScrollHeight = currentHeight;
                    } else {
                        attemptsWithoutChange++;
                    }

                    // остановка после 2 "пустых" скроллов (быстрее)
                    if (attemptsWithoutChange >= 2) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 200); // Уменьшили интервал
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
                message = `🚀 *Dubicars: Начало парсинга*\n\n` +
                         `Страница: ${page}\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'progress') {
                message = `📊 *Dubicars: Прогресс парсинга*\n\n` +
                         `Страниц обработано: ${page}\n` +
                         `Объявлений найдено: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.totalErrors}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'end') {
                message = `✅ *Dubicars: Парсинг завершен*\n\n` +
                         `Всего страниц: ${page}\n` +
                         `Всего объявлений: ${listingsCount}\n` +
                         `Ошибок: ${this.stats.totalErrors}\n` +
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
            const message = `${emoji} *Dubicars: Ошибка парсинга*\n\n` +
                          `Страница: ${page}\n` +
                          `Ошибка: ${error.name || 'Unknown'}\n` +
                          `Сообщение: ${error.message}\n` +
                          (url !== 'unknown' ? `URL: ${url}\n` : '') +
                          `Всего ошибок: ${this.stats.totalErrors}\n` +
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

module.exports = { DubicarsListingParser };
