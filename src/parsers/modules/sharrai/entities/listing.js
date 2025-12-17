const { telegramService } = require('../../../../services/TelegramService');
const { paginatePages } = require('../../../utils/pagination');

/**
 * Парсинг списка объявлений для Sharrai.ae (функциональный подход)
 */

/**
 * Создание парсера списка объявлений Sharrai
 */
function createSharraiListingParser(config) {
    // Конфигурация
    const parserConfig = config;
    
    // Максимальное количество страниц (защита от бесконечного цикла)
    const maxPages = config.maxPages || 100;
    
    // Интервал для отправки уведомлений в Telegram (каждые N страниц)
    const telegramNotificationInterval = config.telegramNotificationInterval || 10;
    
    // Основные селекторы для Sharrai (обновлены под реальную структуру)
    const listingSelector = '#load_more_cars .recent_added, .recent_added, .col-md-4 .recent_added';
    const listingLinkSelector = 'a.carFeaturesImg[href*="/car/"], a[href*="/car/"]';
    
    // Селекторы для скролла
    const scrollContainers = [
        '#load_more_cars',
        'main',
        '.search-results',
        '.listings-container',
        "body"
    ];

    /**
     * Получение списка объявлений
     */
    async function* getListings(context) {
        let attempt = 0;
        let currentPage = 1;
        
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
            try {
                console.log("🔍 Открываем каталог Sharrai...");
                console.log(`📍 URL: ${parserConfig.listingsUrl}`);

                // Используем более гибкий селектор для проверки контента
                // Проверяем наличие контейнера #load_more_cars или любых ссылок с /car/
                const flexibleContentSelector = async () => {
                    const container = document.querySelector('#load_more_cars');
                    const links = document.querySelectorAll('a[href*="/car/"]');
                    const recentAdded = document.querySelectorAll('.recent_added');
                    
                    return {
                        hasContent: (container && container.children.length > 0) || links.length > 0 || recentAdded.length > 0,
                        count: links.length || recentAdded.length || (container ? container.children.length : 0)
                    };
                };

                // Используем утилиту пагинации
                for await (const { page: paginationPage, pageNumber, url, hasContent } of paginatePages(context, {
                    baseUrl: parserConfig.listingsUrl,
                    contentSelector: flexibleContentSelector, // Используем функцию вместо селектора
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
                        console.log(`📄 Загружаем страницу ${pageNum}: ${pageUrl}`);
                    },
                    onPageContent: async (page, pageNum, hasContent, count) => {
                        console.log(`📊 Страница ${pageNum}: контент=${hasContent}, элементов=${count}`);
                    }
                })) {
                    // Используем страницу из пагинации
                    console.log(`🔍 Обрабатываем страницу ${currentPage}, hasContent=${hasContent}`);
                    
                    if (!hasContent) {
                        console.warn(`⚠️ На странице ${currentPage} не найдено объявлений по результатам проверки контента`);
                        // Но все равно попробуем найти ссылки, возможно проверка контента не сработала
                        console.log("🔍 Пробуем найти ссылки несмотря на hasContent=false...");
                    }

                    // Ждем загрузки данных и скроллим страницу для загрузки динамического контента
                    await paginationPage.waitForTimeout(2000);
                    
                    // Пробуем скроллить страницу для загрузки динамического контента
                    try {
                        await paginationPage.evaluate(() => {
                            window.scrollTo(0, document.body.scrollHeight);
                        });
                        await paginationPage.waitForTimeout(2000);
                        
                        // Проверяем наличие кнопки "Load More" и кликаем, если есть
                        try {
                            const loadMoreButton = await paginationPage.$('button:has-text("Load More"), a:has-text("Load More"), .load-more, #load-more, [class*="load-more"], [id*="load-more"]');
                            if (loadMoreButton) {
                                console.log("🔘 Найдена кнопка Load More, кликаем...");
                                await loadMoreButton.click();
                                await paginationPage.waitForTimeout(3000);
                            }
                        } catch (loadMoreError) {
                            // Кнопка не найдена или не кликабельна - это нормально
                        }
                        
                        // Скроллим обратно вверх
                        await paginationPage.evaluate(() => {
                            window.scrollTo(0, 0);
                        });
                        await paginationPage.waitForTimeout(1000);
                    } catch (scrollError) {
                        console.log("⚠️ Ошибка при скролле:", scrollError.message);
                    }

                    // Извлекаем ссылки
                    let carLinks = [];
                    
                    try {
                        console.log(`🔍 Начинаем извлечение ссылок на странице ${currentPage}...`);
                        // Ждем появления контейнера с объявлениями
                        console.log(`🔍 Ожидаем появления контейнера с объявлениями на странице ${currentPage}...`);
                        await paginationPage.waitForSelector('#load_more_cars, .recent_added', { timeout: 30000 });
                        console.log(`✅ Контейнер найден`);
                        
                        // Дополнительное ожидание для полной загрузки
                        await paginationPage.waitForTimeout(2000);
                        
                        // Проверяем количество элементов на странице
                        const containerCount = await paginationPage.$$eval('#load_more_cars, .recent_added', els => els.length);
                        console.log(`📊 Найдено контейнеров: ${containerCount}`);
                        
                        // Извлекаем ссылки на объявления - используем более прямой подход
                        // Сначала пробуем найти все ссылки внутри #load_more_cars
                        try {
                            carLinks = await paginationPage.$$eval(
                                '#load_more_cars a[href*="/car/"]',
                                (elements) => {
                                    const links = [];
                                    const uniqueLinks = new Set();
                                    
                                    for (const link of elements) {
                                        if (link.href && link.href.includes('/car/')) {
                                            let fullUrl = link.href;
                                            if (!fullUrl.startsWith('http')) {
                                                fullUrl = `https://sharrai.ae${fullUrl.startsWith('/') ? fullUrl : '/' + fullUrl}`;
                                            }
                                            // Убираем якоря и параметры после #
                                            fullUrl = fullUrl.split('#')[0].split('?')[0];
                                            
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
                                console.log(`✅ Найдено ${carLinks.length} объявлений через прямой селектор #load_more_cars`);
                            }
                        } catch (directError) {
                            console.log("⚠️ Прямой селектор не сработал, пробуем через контейнеры:", directError.message);
                            
                            // Если прямой селектор не сработал, используем контейнеры
                            carLinks = await paginationPage.$$eval(
                                listingSelector,
                                (elements) => {
                                    const links = [];
                                    const uniqueLinks = new Set();
                                    
                                    for (const element of elements) {
                                        // Ищем ссылку внутри элемента - сначала ищем a.carFeaturesImg, потом любую ссылку с /car/
                                        const link = element.querySelector('a.carFeaturesImg[href*="/car/"]') || 
                                                     element.querySelector('a[href*="/car/"]') ||
                                                     (element.tagName === 'A' && element.href.includes('/car/') ? element : null);
                                        
                                        if (link && link.href) {
                                            // Нормализуем URL
                                            let fullUrl = link.href;
                                            if (!fullUrl.startsWith('http')) {
                                                fullUrl = `https://sharrai.ae${fullUrl.startsWith('/') ? fullUrl : '/' + fullUrl}`;
                                            }
                                            
                                            // Убираем якоря и параметры после #
                                            fullUrl = fullUrl.split('#')[0].split('?')[0];
                                            
                                            if (!uniqueLinks.has(fullUrl)) {
                                                uniqueLinks.add(fullUrl);
                                                links.push(fullUrl);
                                            }
                                        }
                                    }
                                    
                                    return links;
                                }
                            );
                        }
                        
                        if (carLinks.length > 0) {
                            console.log(`✅ Найдено ${carLinks.length} объявлений через основной селектор`);
                        }
                    } catch (error) {
                        console.log("⚠️ Ошибка при поиске объявлений через основной селектор:", error.message);
                    }

                    // Если не нашли через основной селектор, пробуем альтернативный способ
                    if (carLinks.length === 0) {
                        try {
                            console.log("🔍 Пробуем альтернативный способ поиска ссылок...");
                            carLinks = await paginationPage.$$eval(
                                'a[href*="/car/"]',
                                (elements) => {
                                    const links = [];
                                    const uniqueLinks = new Set();
                                    
                                    for (const link of elements) {
                                        if (link.href && link.href.includes('/car/')) {
                                            let fullUrl = link.href;
                                            if (!fullUrl.startsWith('http')) {
                                                fullUrl = `https://sharrai.ae${fullUrl.startsWith('/') ? fullUrl : '/' + fullUrl}`;
                                            }
                                            fullUrl = fullUrl.split('#')[0];
                                            
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
                                console.log(`✅ Найдено ${carLinks.length} объявлений через альтернативный селектор`);
                            }
                        } catch (altError) {
                            console.log("⚠️ Ошибка при альтернативном поиске:", altError.message);
                        }
                    }

                    if (carLinks.length === 0) {
                        console.warn(`⚠️ На странице ${currentPage} не найдено объявлений после всех попыток`);
                        // Попробуем сделать скриншот для отладки
                        try {
                            const pageContent = await paginationPage.content();
                            console.log(`📄 Размер HTML страницы: ${pageContent.length} символов`);
                            const hasLoadMore = pageContent.includes('load_more_cars');
                            const hasRecentAdded = pageContent.includes('recent_added');
                            const hasCarLinks = pageContent.includes('/car/');
                            console.log(`🔍 Проверка структуры: load_more_cars=${hasLoadMore}, recent_added=${hasRecentAdded}, /car/=${hasCarLinks}`);
                            
                            // Пробуем найти все ссылки на странице для отладки
                            const allLinks = await paginationPage.$$eval('a[href]', links => 
                                links.map(l => l.href).filter(h => h.includes('sharrai.ae'))
                            );
                            console.log(`🔗 Всего ссылок на sharrai.ae: ${allLinks.length}`);
                            if (allLinks.length > 0 && allLinks.length <= 20) {
                                console.log(`🔗 Первые ссылки:`, allLinks.slice(0, 5));
                            }
                        } catch (debugError) {
                            console.log(`⚠️ Ошибка при отладке:`, debugError.message);
                        }
                        
                        // Если это первая страница и ничего не найдено, это критическая ошибка
                        if (currentPage === 1) {
                            console.error(`❌ КРИТИЧЕСКАЯ ОШИБКА: На первой странице не найдено объявлений!`);
                            throw new Error(`Не удалось найти объявления на первой странице. Возможно, изменилась структура сайта.`);
                        }
                        
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
                    await sendProgressNotification('end', currentPage, stats.totalListings, stats);
                }
                
                break; // Успешно завершили парсинг

            } catch (error) {
                console.error(`❌ Критическая ошибка при парсинге страницы ${currentPage}:`, error);
                stats.errors++;
                attempt++;
                
                // Отправляем уведомление о критической ошибке
                if (telegramService.getStatus().enabled) {
                    await sendErrorNotification(currentPage, error, 'unknown', true, stats);
                }
                
                if (attempt >= (parserConfig.maxRetries || 3)) {
                    throw error;
                }
                
                console.log(`🔄 Повторная попытка ${attempt}/${parserConfig.maxRetries || 3}...`);
                await sleep(parserConfig.retryDelay || 1000);
            }
        }
    }

    /**
     * Отправка уведомления о прогрессе в Telegram
     */
    async function sendProgressNotification(type, page, listingsCount, stats) {
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
                const elapsed = stats && stats.startTime ? Math.round((Date.now() - stats.startTime) / 1000) : 0;
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
    async function sendErrorNotification(page, error, url = 'unknown', isCritical = false, stats = null) {
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
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Возвращаем объект с методами
    return {
        getListings,
        sendProgressNotification,
        sendErrorNotification,
        sleep
    };
}

module.exports = { createSharraiListingParser };

