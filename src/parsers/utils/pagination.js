/**
 * Утилита для пагинации страниц
 * Просто инкрементирует номер страницы в URL, пока есть контент
 * 
 * @example
 * // Простое использование:
 * const { paginatePagesAuto } = require('./parsers/utils/pagination');
 * 
 * for await (const { pageNumber, url, hasContent, count } of paginatePagesAuto(context, {
 *     baseUrl: 'https://example.com/listings',
 *     contentSelector: '.listing-item', // Селектор для проверки наличия контента
 *     urlOptions: {
 *         pageParam: 'page',
 *         additionalParams: '&limit=20'
 *     },
 *     contentOptions: {
 *         minItems: 1 // Минимум 1 элемент для считания страницы непустой
 *     },
 *     maxPages: 100,
 *     maxEmptyPages: 3
 * })) {
 *     if (hasContent) {
 *         console.log(`Страница ${pageNumber}: найдено ${count} элементов`);
 *         // Здесь можно парсить контент со страницы
 *     }
 * }
 * 
 * @example
 * // Использование с кастомной функцией проверки контента:
 * for await (const result of paginatePagesAuto(context, {
 *     baseUrl: 'https://example.com/listings',
 *     contentSelector: async () => {
 *         const items = document.querySelectorAll('.listing-item');
 *         return {
 *             hasContent: items.length > 0,
 *             count: items.length
 *         };
 *     },
 *     urlOptions: {
 *         pageParam: 'p',
 *         separator: '?'
 *     }
 * })) {
 *     // Обработка результата
 * }
 */

const { getRealisticHeaders, getRealisticUserAgent } = require('../../utils/stealth');

/**
 * Создает URL для страницы пагинации
 * @param {string} baseUrl - Базовый URL
 * @param {number} pageNumber - Номер страницы
 * @param {Object} options - Опции для формирования URL
 * @param {string} options.pageParam - Имя параметра для страницы (по умолчанию 'page')
 * @param {string} options.separator - Разделитель параметров (по умолчанию '?')
 * @param {string} options.additionalParams - Дополнительные параметры для URL (например, '&limit=20')
 * @returns {string} URL с номером страницы
 */
function buildPageUrl(baseUrl, pageNumber, options = {}) {
    const {
        pageParam = 'page',
        separator = '?',
        additionalParams = '',
        customUrlBuilder = null
    } = options;

    // Если есть кастомная функция для формирования URL, используем её
    if (customUrlBuilder && typeof customUrlBuilder === 'function') {
        return customUrlBuilder(baseUrl, pageNumber);
    }

    // Убираем trailing slash
    const cleanUrl = baseUrl.replace(/\/$/, '');
    
    // Если это первая страница, возвращаем базовый URL
    if (pageNumber === 1) {
        return additionalParams 
            ? `${cleanUrl}${separator}${additionalParams}`
            : cleanUrl;
    }

    // Проверяем, есть ли уже параметры в URL
    const hasParams = cleanUrl.includes('?');
    const paramSeparator = hasParams ? '&' : separator;
    
    // Формируем URL с номером страницы
    const pageParamString = `${pageParam}=${pageNumber}`;
    
    if (hasParams) {
        // Если уже есть параметры, добавляем через &
        return `${cleanUrl}&${pageParamString}${additionalParams}`;
    } else {
        // Если параметров нет, добавляем через ? или &
        return `${cleanUrl}${paramSeparator}${pageParamString}${additionalParams}`;
    }
}

/**
 * Проверяет наличие контента на странице
 * @param {Object} page - Страница Playwright
 * @param {string|Function} contentSelector - Селектор для проверки контента или функция проверки
 * @param {Object} options - Опции проверки
 * @param {number} options.minItems - Минимальное количество элементов для считания страницы непустой (по умолчанию 1)
 * @param {number} options.timeout - Таймаут ожидания элементов (по умолчанию 5000)
 * @returns {Promise<Object>} Объект с результатом проверки { hasContent: boolean, count: number }
 */
async function checkPageContent(page, contentSelector, options = {}) {
    const {
        minItems = 1,
        timeout = 5000
    } = options;

    try {
        let hasContent = false;
        let count = 0;

        if (typeof contentSelector === 'function') {
            // Если переданная функция, вызываем её
            const result = await page.evaluate(contentSelector);
            hasContent = result.hasContent || result.count >= minItems;
            count = result.count || 0;
        } else {
            // Если передан селектор, проверяем количество элементов
            try {
                await page.waitForSelector(contentSelector, { timeout });
                count = await page.$$eval(contentSelector, elements => elements.length);
                hasContent = count >= minItems;
            } catch (error) {
                // Если селектор не найден, страница пустая
                hasContent = false;
                count = 0;
            }
        }

        return { hasContent, count };
    } catch (error) {
        console.warn(`⚠️ Ошибка при проверке контента на странице:`, error.message);
        return { hasContent: false, count: 0 };
    }
}

/**
 * Генератор для пагинации страниц
 * @param {Object} context - Контекст браузера Playwright
 * @param {Object} config - Конфигурация пагинации
 * @param {string} config.baseUrl - Базовый URL для пагинации
 * @param {string|Function} config.contentSelector - Селектор для проверки контента или функция проверки
 * @param {Object} config.urlOptions - Опции для формирования URL (pageParam, separator, additionalParams)
 * @param {Object} config.contentOptions - Опции для проверки контента (minItems, timeout)
 * @param {number} config.maxPages - Максимальное количество страниц (по умолчанию 1000)
 * @param {number} config.maxEmptyPages - Максимальное количество пустых страниц подряд (по умолчанию 3)
 * @param {Function} config.onPageLoad - Callback функция, вызываемая при загрузке каждой страницы (page, pageNumber, url)
 * @param {Function} config.onPageContent - Callback функция, вызываемая после проверки контента (page, pageNumber, hasContent, count)
 * @yields {Object} Объект с информацией о странице { page, pageNumber, url, hasContent, count }
 */
async function* paginatePages(context, config) {
    const {
        baseUrl,
        contentSelector,
        urlOptions = {},
        contentOptions = {},
        maxPages = 1000,
        maxEmptyPages = 3,
        onPageLoad = null,
        onPageContent = null
    } = config;

    let currentPage = 1;
    let emptyPagesCount = 0;
    let page = null;

    try {
        while (currentPage <= maxPages && emptyPagesCount < maxEmptyPages) {
            // Формируем URL для текущей страницы
            const url = buildPageUrl(baseUrl, currentPage, urlOptions);
            
            // Создаем новую страницу, если её еще нет
            if (!page) {
                page = await context.newPage();
                
                // Устанавливаем заголовки один раз для страницы
                const userAgent = getRealisticUserAgent();
                const headers = getRealisticHeaders(userAgent);
                await page.setExtraHTTPHeaders(headers);
            }

            try {
                // Загружаем страницу
                await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });

                // Вызываем callback при загрузке страницы
                if (onPageLoad) {
                    await onPageLoad(page, currentPage, url);
                }

                // Проверяем наличие контента
                const { hasContent, count } = await checkPageContent(
                    page,
                    contentSelector,
                    contentOptions
                );

                // Вызываем callback после проверки контента
                if (onPageContent) {
                    await onPageContent(page, currentPage, hasContent, count);
                }

                // Если контента нет, увеличиваем счетчик пустых страниц
                if (!hasContent) {
                    emptyPagesCount++;
                    console.log(`⚠️ Страница ${currentPage} пустая (пустых подряд: ${emptyPagesCount}/${maxEmptyPages})`);
                } else {
                    // Если контент есть, сбрасываем счетчик пустых страниц
                    emptyPagesCount = 0;
                }

                // Возвращаем информацию о странице
                yield {
                    page,
                    pageNumber: currentPage,
                    url,
                    hasContent,
                    count
                };

                // Если контента нет и достигнут лимит пустых страниц, останавливаемся
                if (!hasContent && emptyPagesCount >= maxEmptyPages) {
                    console.log(`🏁 Достигнут лимит пустых страниц (${maxEmptyPages}). Останавливаем пагинацию.`);
                    break;
                }

                // Переходим к следующей странице
                currentPage++;

            } catch (error) {
                console.error(`❌ Ошибка при загрузке страницы ${currentPage}:`, error.message);
                emptyPagesCount++;
                
                // Если слишком много ошибок подряд, останавливаемся
                if (emptyPagesCount >= maxEmptyPages) {
                    console.log(`🏁 Слишком много ошибок подряд (${emptyPagesCount}). Останавливаем пагинацию.`);
                    break;
                }
                
                currentPage++;
            }
        }

        console.log(`✅ Пагинация завершена. Обработано страниц: ${currentPage - 1}`);

    } finally {
        // Закрываем страницу, если она была создана
        if (page) {
            await page.close();
            page = null;
        }
    }
}

/**
 * Упрощенная функция для пагинации с автоматическим закрытием страниц
 * @param {Object} context - Контекст браузера Playwright
 * @param {Object} config - Конфигурация пагинации (см. paginatePages)
 * @yields {Object} Объект с информацией о странице { pageNumber, url, hasContent, count }
 */
async function* paginatePagesAuto(context, config) {
    for await (const result of paginatePages(context, {
        ...config,
        onPageLoad: async (page, pageNumber, url) => {
            // Вызываем пользовательский callback, если он есть
            if (config.onPageLoad) {
                await config.onPageLoad(page, pageNumber, url);
            }
        },
        onPageContent: async (page, pageNumber, hasContent, count) => {
            // Вызываем пользовательский callback, если он есть
            if (config.onPageContent) {
                await config.onPageContent(page, pageNumber, hasContent, count);
            }
            
            // Автоматически закрываем страницу после обработки
            if (page && !page.isClosed()) {
                await page.close();
            }
        }
    })) {
        // Возвращаем результат без объекта page (так как он уже закрыт)
        yield {
            pageNumber: result.pageNumber,
            url: result.url,
            hasContent: result.hasContent,
            count: result.count
        };
    }
}

module.exports = {
    buildPageUrl,
    checkPageContent,
    paginatePages,
    paginatePagesAuto
};

