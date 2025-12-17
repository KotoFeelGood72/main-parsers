const { telegramService } = require('../../../../services/TelegramService');
const { paginatePages } = require('../../../utils/pagination');

/**
 * Парсинг списка объявлений для OpenSooq.com (функциональный подход)
 */

/**
 * Создание парсера списка объявлений OpenSooq
 */
function createOpenSooqListingParser(config) {
    // Конфигурация
    const parserConfig = config;
    
    // Основные селекторы для OpenSooq
    // Используем новые селекторы на основе структуры сайта
    const listingSelector = '#serpMainContent a.postListItemData';
    const listingStemSelector = 'a.postListItemData';
    const containerSelector = '#serpMainContent';
    
    // Селекторы для скролла
    const scrollContainers = [
        '#serpMainContent',
        '.posts-container',
        'main',
        "body"
    ];
    
    // Дополнительные селекторы
    const selectors = {
        serpMainContent: '#serpMainContent',
        main: 'main',
        postListItemData: 'a.postListItemData',
        allLinks: 'a[href]',
        linksWithSearch: 'a[href*="/en/search/"]',
        postListItemDataAll: 'a.postListItemData, a[class*="postListItemData"], a[data-id1]'
    };

    /**
     * Получение списка объявлений
     */
    async function* getListings(context) {
        let attempt = 0;
        let currentPage = 1;
        const processedLinks = new Set(); // Отслеживаем уже обработанные ссылки
        let emptyPagesCount = 0; // Счетчик пустых страниц подряд
        const maxEmptyPages = 3; // Максимум пустых страниц подряд перед остановкой
        // Статистика для логирования
        const stats = {
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
        const telegramNotificationInterval = parserConfig.telegramNotificationInterval || 10;

        // Отправляем уведомление о старте парсинга списка
        if (telegramService.getStatus().enabled) {
            await sendProgressNotification('start', 1, 0, stats);
        }

        while (attempt < parserConfig.maxRetries) {
            let page = await context.newPage();
            let currentContext = context;

            try {
                // Устанавливаем viewport для имитации реального браузера
                await page.setViewportSize({ width: 1920, height: 1080 });

                if (attempt === 0 && currentPage === 1) {
                    console.log("=".repeat(80));
                    console.log(`🚀 НАЧАЛО ПАРСИНГА OPENSOOQ`);
                    console.log(`📋 Конфигурация: maxEmptyPages=${maxEmptyPages}`);
                    console.log(`⏰ Время начала: ${new Date().toLocaleString('ru-RU')}`);
                    console.log("=".repeat(80));
                }
                
                console.log("🔍 Открываем каталог OpenSooq...");

                // Сначала заходим на главную страницу для установки cookies и обхода блокировки
                try {
                    console.log(`🌐 Заходим на главную страницу для установки cookies...`);
                    await page.goto(parserConfig.baseUrl, { 
                        waitUntil: "domcontentloaded", 
                        timeout: 30000 
                    });
                    await page.waitForTimeout(2000);
                    console.log(`✅ Главная страница загружена`);
                } catch (mainPageError) {
                    console.warn(`⚠️ Не удалось загрузить главную страницу: ${mainPageError.message}`);
                }

                // Используем утилиту пагинации
                for await (const { page: paginationPage, pageNumber, url, hasContent } of paginatePages(context, {
                    baseUrl: parserConfig.listingsUrl,
                    contentSelector: 'a.postListItemData, a[data-id1]',
                    urlOptions: {
                        pageParam: 'page',
                        separator: '?'
                    },
                    contentOptions: {
                        minItems: 1,
                        timeout: 20000
                    },
                    maxPages: parserConfig.maxPages || 1000,
                    maxEmptyPages: maxEmptyPages,
                    onPageLoad: async (page, pageNum, pageUrl) => {
                        currentPage = pageNum;
                        console.log(`📄 [${currentPage}] Загружаем страницу: ${pageUrl}`);
                    }
                })) {
                    const pageStartTime = Date.now();
                    
                    // Логируем прогресс каждые 10 страниц
                    if (currentPage % 10 === 0 || currentPage === 1) {
                        const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
                        const pagesPerSec = stats.totalPagesProcessed > 0 ? (stats.totalPagesProcessed / elapsed).toFixed(2) : 0;
                        const linksPerSec = stats.totalUnique > 0 ? (stats.totalUnique / elapsed).toFixed(2) : 0;
                        console.log("─".repeat(80));
                        console.log(`📊 ПРОГРЕСС ПАРСИНГА OPENSOOQ (страница ${currentPage}):`);
                        console.log(`   📄 Обработано страниц: ${stats.totalPagesProcessed}`);
                        console.log(`   🔗 Найдено объявлений: ${stats.totalFound}`);
                        console.log(`   ✅ Уникальных: ${stats.totalUnique}`);
                        console.log(`   🔄 Дубликатов: ${stats.totalDuplicates}`);
                        console.log(`   ⏱️  Время работы: ${elapsed}с (${pagesPerSec} стр/с, ${linksPerSec} объяв/с)`);
                        console.log("─".repeat(80));
                    }

                    // Отправляем уведомление в Telegram каждые N страниц
                    if (telegramService.getStatus().enabled && currentPage % telegramNotificationInterval === 0) {
                        await sendProgressNotification('progress', currentPage, stats.totalUnique, stats);
                    }

                    if (!hasContent) {
                        console.warn(`⚠️ На странице ${currentPage} не найдено объявлений`);
                        emptyPagesCount++;
                        continue;
                    }

                    // Ждем загрузки страницы
                    await paginationPage.waitForTimeout(3000);

                    // Ждем появления хотя бы одной ссылки с классом postListItemData или data-id1
                    try {
                        await paginationPage.waitForSelector('a.postListItemData, a[data-id1]', { timeout: 20000 });
                        console.log(`✅ Найдены ссылки с классом postListItemData или data-id1`);
                    } catch (e) {
                        console.warn(`⚠️ Ссылки с классом postListItemData не появились, продолжаем поиск...`);
                    }

                    // Дополнительное ожидание для загрузки динамического контента
                    await paginationPage.waitForTimeout(3000);

                    // Скроллим страницу для подгрузки всех карточек
                    await autoScroll(paginationPage);
                    await paginationPage.waitForTimeout(2000);

                    // Отладочная информация: проверяем, что есть на странице
                    const debugInfo = await paginationPage.evaluate((selectors) => {
                        const info = {
                            hasSerpMainContent: !!document.querySelector(selectors.serpMainContent),
                            hasMain: !!document.querySelector(selectors.main),
                            postListItemDataCount: document.querySelectorAll(selectors.postListItemData).length,
                            allLinksCount: document.querySelectorAll(selectors.allLinks).length,
                            linksWithSearch: document.querySelectorAll(selectors.linksWithSearch).length,
                            pageTitle: document.title,
                            bodyTextLength: document.body ? document.body.textContent.length : 0,
                            htmlSnippet: document.body ? document.body.innerHTML.substring(0, 5000) : 'No body',
                            isBlocked: document.title.includes('Access Restricted') || document.body.textContent.includes('Access Not Available')
                        };
                        return info;
                    }, selectors);
                    console.log(`📊 Отладочная информация о странице:`, JSON.stringify(debugInfo, null, 2));
                    
                    // Если страница заблокирована, логируем и продолжаем
                    if (debugInfo.isBlocked) {
                        console.warn(`⚠️ Страница заблокирована по региону. Продолжаем работу без прокси...`);
                    }
                    
                    // Логируем HTML содержимое #serpMainContent если он есть
                    const serpMainContentHTML = await paginationPage.evaluate((selectors) => {
                        const container = document.querySelector(selectors.serpMainContent);
                        if (container) {
                            return container.innerHTML.substring(0, 10000); // Первые 10000 символов
                        }
                        return null;
                    }, selectors);
                    
                    if (serpMainContentHTML) {
                        console.log(`📄 HTML содержимое #serpMainContent (первые 10000 символов):`);
                        console.log(serpMainContentHTML);
                    } else {
                        console.log(`⚠️ #serpMainContent не найден, логируем main...`);
                        const mainHTML = await paginationPage.evaluate((selectors) => {
                            const main = document.querySelector(selectors.main);
                            if (main) {
                                return main.innerHTML.substring(0, 10000);
                            }
                            return null;
                        }, selectors);
                        if (mainHTML) {
                            console.log(`📄 HTML содержимое main (первые 10000 символов):`);
                            console.log(mainHTML);
                        }
                    }

                    // Ищем объявления с основным селектором и альтернативными
                    let carLinks = [];
                    
                    try {
                        // Ищем все элементы с классом postListItemData на странице
                        console.log(`🔍 Ищем все элементы с классом postListItemData...`);
                        
                        const searchResult = await paginationPage.evaluate((baseUrl, selectors) => {
                            // Ищем все ссылки с классом postListItemData или атрибутом data-id1
                            const links = Array.from(document.querySelectorAll(selectors.postListItemDataAll));
                            
                            const debugInfo = {
                                foundLinks: links.length,
                                sampleLinks: [],
                                allLinksCount: 0,
                                sampleAllLinks: [],
                                linksWithSearch: 0
                            };
                            
                            // Логируем первые несколько ссылок для отладки
                            if (links.length > 0) {
                                debugInfo.sampleLinks = links.slice(0, 5).map((link, i) => ({
                                    index: i + 1,
                                    href: link.getAttribute('href'),
                                    classes: link.className,
                                    dataId1: link.getAttribute('data-id1')
                                }));
                            } else {
                                // Если не нашли, проверяем, что вообще есть на странице
                                const allLinks = Array.from(document.querySelectorAll(selectors.allLinks));
                                debugInfo.allLinksCount = allLinks.length;
                                
                                // Проверяем ссылки с /en/search/
                                const searchLinks = allLinks.filter(link => {
                                    const href = link.getAttribute('href');
                                    return href && href.includes('/en/search/');
                                });
                                debugInfo.linksWithSearch = searchLinks.length;
                                
                                if (allLinks.length > 0) {
                                    debugInfo.sampleAllLinks = allLinks.slice(0, 10).map((link, i) => ({
                                        index: i + 1,
                                        href: link.getAttribute('href'),
                                        classes: link.className,
                                        hasPostListItemData: link.className.includes('postListItemData'),
                                        dataId1: link.getAttribute('data-id1')
                                    }));
                                }
                            }
                            
                            const result = links
                                .map(a => {
                                        const href = a.getAttribute('href');
                                    if (!href) return null;
                                    
                                        // Проверяем, полная ли это ссылка или относительная
                                    let fullUrl;
                                    if (href.startsWith('http')) {
                                        fullUrl = href;
                                    } else if (href.startsWith('/')) {
                                            // Конструируем полный URL из относительного пути
                                        fullUrl = baseUrl + href;
                                    } else {
                                        fullUrl = baseUrl + '/' + href;
                                    }
                                    
                                    // Проверяем, что это ссылка на объявление (формат /en/search/ID)
                                    if (fullUrl.includes('/en/search/') && /\/en\/search\/\d+/.test(fullUrl)) {
                                        return fullUrl;
                                    }
                                    
                                    return null;
                                })
                                .filter(href => href !== null);
                            
                            return {
                                links: result,
                                debug: debugInfo
                            };
                        }, parserConfig.baseUrl);
                        
                        // Логируем отладочную информацию
                        if (searchResult.debug) {
                            console.log(`📊 Найдено ссылок с классом postListItemData: ${searchResult.debug.foundLinks}`);
                            if (searchResult.debug.linksWithSearch > 0) {
                                console.log(`📊 Найдено ссылок с /en/search/: ${searchResult.debug.linksWithSearch}`);
                            }
                            if (searchResult.debug.sampleLinks.length > 0) {
                                console.log(`🔗 Примеры найденных ссылок:`);
                                searchResult.debug.sampleLinks.forEach(item => {
                                    console.log(`   ${item.index}. href: ${item.href}, classes: ${item.classes}, data-id1: ${item.dataId1}`);
                                });
                            } else if (searchResult.debug.allLinksCount > 0) {
                                console.log(`⚠️ Всего ссылок на странице: ${searchResult.debug.allLinksCount}`);
                                console.log(`🔗 Примеры всех ссылок на странице:`);
                                searchResult.debug.sampleAllLinks.forEach(item => {
                                    console.log(`   ${item.index}. href: ${item.href}, hasPostListItemData: ${item.hasPostListItemData}, data-id1: ${item.dataId1}`);
                                });
                            }
                        }
                        
                        carLinks = searchResult.links || [];
                        
                        // Убираем дубликаты
                        carLinks = [...new Set(carLinks)];
                        
                        if (carLinks.length > 0) {
                            stats.totalFound += carLinks.length;
                            console.log(`✅ [${currentPage}] Найдено ${carLinks.length} объявлений с классом postListItemData`);
                        } else {
                            // Альтернативный метод: ищем все ссылки с /en/search/ в href
                            console.log(`🔍 Альтернативный поиск: ищем все ссылки с /en/search/...`);
                            carLinks = await paginationPage.evaluate((baseUrl, selectors) => {
                                // Ищем все ссылки, содержащие /en/search/ в href
                                const allLinks = Array.from(document.querySelectorAll(selectors.linksWithSearch));
                                
                                return allLinks
                                    .map(a => {
                                        const href = a.getAttribute('href');
                                        if (!href) return null;
                                        
                                        // Проверяем, что это ссылка на объявление (содержит /en/search/ и ID)
                                        if (!/\/en\/search\/\d+/.test(href)) return null;
                                        
                                        if (href.startsWith('http')) return href;
                                        if (href.startsWith('/')) return baseUrl + href;
                                        return baseUrl + '/' + href;
                                    })
                                    .filter(href => href !== null);
                            }, parserConfig.baseUrl, selectors);
                            
                            carLinks = [...new Set(carLinks)];
                            
                            if (carLinks.length > 0) {
                                stats.totalFound += carLinks.length;
                                console.log(`✅ [${currentPage}] Найдено ${carLinks.length} объявлений через альтернативный поиск`);
                            }
                        }
                    } catch (error) {
                        console.log("⚠️ Ошибка при поиске объявлений:", error.message);
                        console.log("⚠️ Детали ошибки:", error.stack);
                    }

                    if (carLinks.length === 0) {
                        console.warn(`⚠️ На странице ${currentPage} не найдено объявлений`);
                        emptyPagesCount++;
                        
                        // Проверяем, есть ли вообще контент на странице
                        const pageContent = await paginationPage.evaluate(() => document.body.textContent);
                        if (pageContent.length < 1000) {
                            console.warn(`⚠️ Страница ${currentPage} выглядит пустой, возможно сайт недоступен`);
                            if (emptyPagesCount >= maxEmptyPages) {
                                stats.stopReason = `Подряд ${maxEmptyPages} пустых страниц`;
                                console.log(`🏁 ОСТАНОВКА: ${stats.stopReason}`);
                                
                                if (telegramService.getStatus().enabled) {
                                    await sendProgressNotification('end', currentPage, stats.totalUnique, stats);
                                }
                            break;
                            }
                        }
                        
                        // Пагинация обрабатывается автоматически утилитой
                        continue;
                    }

                    // Сбрасываем счетчик пустых страниц, если нашли объявления
                    emptyPagesCount = 0;

                    // Фильтруем дубликаты
                    const newLinks = carLinks.filter(link => !processedLinks.has(link));
                    const duplicatesCount = carLinks.length - newLinks.length;
                    
                    // Обновляем статистику
                    stats.totalDuplicates += duplicatesCount;
                    stats.totalUnique += newLinks.length;
                    stats.totalPagesProcessed++;

                    if (duplicatesCount > 0) {
                        console.log(`🔄 [${currentPage}] Найдено ${duplicatesCount} дубликатов (новых: ${newLinks.length}, всего на странице: ${carLinks.length})`);
                    }

                    if (newLinks.length === 0) {
                        console.log(`⚠️ [${currentPage}] Все объявления уже обработаны (найдено: ${carLinks.length}, дубликатов: ${duplicatesCount})`);
                        emptyPagesCount++;
                        if (emptyPagesCount >= maxEmptyPages) {
                            stats.stopReason = `Подряд ${maxEmptyPages} страниц без новых объявлений`;
                            console.log(`🏁 ОСТАНОВКА: ${stats.stopReason}`);
                            
                            if (telegramService.getStatus().enabled) {
                                await sendProgressNotification('end', currentPage, stats.totalUnique, stats);
                            }
                            break;
                        }
                        continue;
                    }

                    const pageProcessTime = Date.now() - pageStartTime;
                    console.log(`✅ [${currentPage}] Найдено ${newLinks.length} новых объявлений (всего: ${carLinks.length}, дубликатов: ${duplicatesCount}, время: ${pageProcessTime}ms)`);
                    console.log(`   📈 Общая статистика: уникальных=${stats.totalUnique}, дубликатов=${stats.totalDuplicates}, найдено=${stats.totalFound}`);
                    
                    // Логируем первые несколько ссылок для отладки
                    if (newLinks.length > 0) {
                        console.log(`🔗 Первые 3 новые ссылки на странице ${currentPage}:`);
                        newLinks.slice(0, 3).forEach((link, index) => {
                            console.log(`   ${index + 1}. ${link}`);
                        });
                    }

                    // Добавляем ссылки в множество обработанных и возвращаем их
                    for (const link of newLinks) {
                        processedLinks.add(link);
                        yield link;
                    }
                }

                // Финальная статистика
                const totalTime = Math.round((Date.now() - stats.startTime) / 1000);
                const avgPagesPerSec = stats.totalPagesProcessed > 0 ? (stats.totalPagesProcessed / totalTime).toFixed(2) : 0;
                const avgLinksPerSec = stats.totalUnique > 0 ? (stats.totalUnique / totalTime).toFixed(2) : 0;
                
                console.log("=".repeat(80));
                console.log(`🏁 ЗАВЕРШЕНИЕ ПАРСИНГА OPENSOOQ`);
                console.log(`⏰ Время завершения: ${new Date().toLocaleString('ru-RU')}`);
                console.log(`⏱️  Общее время работы: ${totalTime}с (${Math.floor(totalTime / 60)}м ${totalTime % 60}с)`);
                console.log(`📊 ФИНАЛЬНАЯ СТАТИСТИКА:`);
                console.log(`   📄 Обработано страниц: ${stats.totalPagesProcessed}`);
                console.log(`   🔗 Всего найдено объявлений: ${stats.totalFound}`);
                console.log(`   ✅ Уникальных объявлений: ${stats.totalUnique}`);
                console.log(`   🔄 Дубликатов: ${stats.totalDuplicates}`);
                console.log(`   ⚠️  Ошибок: ${stats.totalErrors}`);
                console.log(`   📈 Производительность: ${avgPagesPerSec} стр/с, ${avgLinksPerSec} объяв/с`);
                console.log(`   🛑 Причина остановки: ${stats.stopReason || 'Успешное завершение'}`);
                console.log(`   📍 Последняя страница: ${currentPage - 1}`);
                console.log("=".repeat(80));

                if (telegramService.getStatus().enabled) {
                    await sendProgressNotification('end', currentPage - 1, stats.totalUnique, stats);
                }
                
                break; // Успешно завершили парсинг
            } catch (error) {
                stats.totalErrors++;
                const totalTime = Math.round((Date.now() - stats.startTime) / 1000);
                console.error("=".repeat(80));
                console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА при парсинге страницы ${currentPage}`);
                console.error(`   Ошибка: ${error.name} - ${error.message}`);
                console.error(`   Время работы до ошибки: ${totalTime}с`);
                console.error(`   Обработано страниц: ${stats.totalPagesProcessed}`);
                console.error(`   Найдено объявлений: ${stats.totalUnique}`);
                console.error(`   Попытка: ${attempt + 1}/${parserConfig.maxRetries}`);
                if (error.stack) {
                    console.error(`   Стек: ${error.stack.split('\n').slice(0, 3).join('\n   ')}`);
                }
                console.error("=".repeat(80));
                
                // Отправляем уведомление о критической ошибке
                if (telegramService.getStatus().enabled) {
                    await sendErrorNotification(currentPage, error, 'unknown', attempt + 1 >= parserConfig.maxRetries, stats);
                }
                
                attempt++;
                
                if (attempt >= parserConfig.maxRetries) {
                    stats.stopReason = `Достигнут лимит повторных попыток (${parserConfig.maxRetries})`;
                    console.error(`❌ ОСТАНОВКА: ${stats.stopReason}`);
                    throw error;
                }
                
                console.log(`🔄 Повторная попытка ${attempt}/${parserConfig.maxRetries} через ${parserConfig.retryDelay || 5000}ms...`);
                await sleep(parserConfig.retryDelay || 5000);
            } finally {
                try {
                await page.close();
                } catch (e) {
                    // Игнорируем ошибки закрытия
                }
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
                message = `🚀 *OpenSooq: Начало парсинга*\n\n` +
                         `Страница: ${page}\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'progress') {
                message = `📊 *OpenSooq: Прогресс парсинга*\n\n` +
                         `Страниц обработано: ${page}\n` +
                         `Объявлений найдено: ${listingsCount}\n` +
                         `Ошибок: ${stats ? stats.totalErrors : 0}\n` +
                         `Время работы: ${duration} мин\n` +
                         `Время: ${new Date().toLocaleString('ru-RU')}`;
            } else if (type === 'end') {
                message = `✅ *OpenSooq: Парсинг завершен*\n\n` +
                         `Всего страниц: ${page}\n` +
                         `Всего объявлений: ${listingsCount}\n` +
                         `Ошибок: ${stats ? stats.totalErrors : 0}\n` +
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
    async function sendErrorNotification(page, error, url = 'unknown', isCritical = false, stats = null) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const emoji = isCritical ? '🚨' : '⚠️';
            const message = `${emoji} *OpenSooq: Ошибка парсинга*\n\n` +
                          `Страница: ${page}\n` +
                          `Ошибка: ${error.name || 'Unknown'}\n` +
                          `Сообщение: ${error.message}\n` +
                          (url !== 'unknown' ? `URL: ${url}\n` : '') +
                          `Всего ошибок: ${stats ? stats.totalErrors : 0}\n` +
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

module.exports = { createOpenSooqListingParser };
