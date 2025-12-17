const { telegramService } = require('../../../../services/TelegramService');

/**
 * Парсинг детальной информации для Carswitch.com (функциональный подход)
 */

/**
 * Создание парсера детальной информации Carswitch
 */
function createCarswitchDetailParser(config) {
    // Конфигурация
    const parserConfig = config;
    
    // Счетчик ошибок для логирования
    let errorCount = 0;
    
    // Селекторы для детальной страницы
    const selectors = {
            // Селекторы для кнопок открытия модального окна
            modalButtons: [
                '.font-bold.rtl\\:-ml-12.text-primary-500.cursor-pointer',
                '.font-bold.text-primary-500.cursor-pointer',
                '.text-primary-500.cursor-pointer',
                '.font-bold.cursor-pointer',
                'button[class*="cursor-pointer"]',
                'div[class*="cursor-pointer"]',
                'span[class*="cursor-pointer"]',
                '[class*="text-primary-500"]',
                'button',
                'div[role="button"]'
            ],
            // Селекторы для модального окна
            modal: '.flex-1.px-8.py-28.sm\\:px-24.sm\\:py-24.overflow-y-auto.flex.\\!py-4.w-full.h-full',
            modalRows: '.flex.w-full.justify-between.py-3.border-b.border-gray-100',
            // Селекторы для основных данных
            title: 'h2.text-base.md\\:text-2xl.font-medium.text-label-black',
            price: '.md\\:text-2xl.text-base.font-bold.text-black',
            // Селекторы для Car Overview
            overviewContainer: '.md\\:flex.md\\:flex-row.flex-col.md\\:items-start.items-stretch.md\\:gap-1.gap-4.w-full .md\\:flex-1.bg-white.p-4',
            overviewKey: 'h3.font-medium',
            overviewValue: 'p.text-sm.text-label-black',
            // Селекторы для Car Details
            detailContainer: '.mt-2.md\\:text-base.text-sm.leading-5',
            // Селекторы для кнопки закрытия модального окна
            closeButton: '.rounded-full.w-6.h-6.flex.items-center.border.border-\\[\\#0F1B41\\].justify-center.hover\\:bg-gray-100.cursor-pointer.transition-colors',
            // Селекторы для изображений с атрибутами
            images: 'img'
        };
        
        // Атрибуты для поиска изображений
        const imageAttributes = {
            year: ['Year', 'Год'],
            mileage: ['Mileage', 'Пробег'],
            location: ['Location', 'Локация'],
            carImage: 'Car image'
        };
        
        // Дополнительные селекторы для поиска по атрибутам
        selectors.allImages = 'img';
        selectors.imageParentSpan = 'span';
        
        // Поля для извлечения данных
        const dataFields = {
            make: ['Make', 'Марка', 'Brand', 'brand'],
            model: ['Model', 'Модель', 'Car Model', 'car model'],
            bodyType: ['Body type', 'Body Type', 'Тип кузова', 'body type', 'Body', 'body', 'Vehicle Type', 'vehicle type'],
            horsepower: ['Engine Size', 'Мощность', 'Engine', 'engine', 'Displacement', 'displacement'],
            fuelType: ['Fuel Type', 'Тип топлива', 'Fuel', 'fuel', 'Fuel type', 'fuel type', 'Gas', 'gas', 'Petrol', 'petrol'],
            motorsTrim: ['Specs', 'Комплектация', 'Spec', 'spec', 'Specification', 'specification', 'Trim', 'trim', 'Variant', 'variant'],
            exteriorColor: ['Color', 'Цвет', 'Exterior Color', 'exterior color', 'Paint', 'paint', 'Exterior', 'exterior', 'Body Color', 'body color']
        };

    /**
     * Парсинг детальной страницы автомобиля
     */
    async function parseCarDetails(url, context) {
        const page = await context.newPage();

        try {
            console.log(`🚗 Переходим к ${url}`);
            

            // Добавляем случайную задержку перед загрузкой
            const randomDelay = Math.floor(Math.random() * 1500) + 1000;
            await sleep(randomDelay);

            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: 30000
            });


            console.log("📄 Загружаем данные...");

            // Кликаем на кнопку для открытия модального окна с детальными параметрами
            try {
                let detailsButton = null;
                for (const selector of selectors.modalButtons) {
                    detailsButton = await page.$(selector);
                    if (detailsButton) {
                        console.log("🔍 Кнопка найдена с селектором:", selector);
                        break;
                    }
                }
                
                if (detailsButton) {
                    console.log("🔍 Открываем модальное окно с детальными параметрами...");
                    await detailsButton.click();
                    await page.waitForTimeout(3000); // Увеличиваем время ожидания
                    
                    // Проверяем, открылось ли модальное окно
                    const modal = await page.$(selectors.modal);
                    console.log("🔍 Модальное окно открыто:", !!modal);
                } else {
                    console.log("⚠️ Кнопка для открытия модального окна не найдена ни с одним селектором");
                    
                    // Попробуем найти все элементы с cursor-pointer
                    const allClickableElements = await page.$$eval('[class*="cursor-pointer"]', elements => 
                        elements.map(el => ({
                            tagName: el.tagName,
                            className: el.className,
                            textContent: el.textContent?.trim().substring(0, 50)
                        }))
                    );
                    console.log("🔍 Все кликабельные элементы:", allClickableElements);
                }
            } catch (error) {
                console.log("⚠️ Не удалось открыть модальное окно:", error.message);
            }

            // Получаем сырой набор фич из Car Overview (новая структура)
            const overviewFeatures = await page.$$eval(
                selectors.overviewContainer,
                (items, selectors) => {
                    const map = {};
                    items.forEach(item => {
                        const key = item.querySelector(selectors.key)?.textContent.trim();
                        const val = item.querySelector(selectors.value)?.textContent.trim();
                        if (key) map[key] = val;
                    });
                    return map;
                },
                {
                    key: selectors.overviewKey,
                    value: selectors.overviewValue
                }
            );

            // Получаем сырой набор фич из Car details (новая структура)
            const detailFeatures = await page.$eval(
                selectors.detailContainer,
                (item) => {
                    const map = {};
                    const text = item?.textContent?.trim();
                    if (text) {
                        // Парсим текст вида "First owner: No • Specs: GCC specs • More"
                        const parts = text.split('•');
                        parts.forEach(part => {
                            const [key, val] = part.split(':');
                            if (key && val) {
                                map[key.trim()] = val.trim();
                            }
                        });
                    }
                    return map;
                }
            ).catch(() => ({})); // Возвращаем пустой объект если элемент не найден

            // Получаем параметры из модального окна
            const modalFeatures = await page.evaluate((selectors) => {
                const modal = document.querySelector(selectors.modal);
                console.log('Modal found:', !!modal);
                if (!modal) return {};

                const map = {};
                
                // Ищем все строки с параметрами в модальном окне
                const rows = modal.querySelectorAll(selectors.rows);
                console.log('Rows found:', rows.length);
                rows.forEach(row => {
                    const spans = row.querySelectorAll('span');
                    if (spans.length >= 2) {
                        const key = spans[0]?.textContent?.trim();
                        const value = spans[1]?.textContent?.trim();
                        console.log('Found param:', key, '=', value);
                        if (key && value) {
                            map[key] = value;
                        }
                    }
                });

                return map;
            }, {
                modal: selectors.modal,
                rows: selectors.modalRows
            });

            // Объединяем их в одну карту
            const rawFeatures = {
                ...overviewFeatures,
                ...detailFeatures,
                ...modalFeatures
            };

            // Отладочная информация
            console.log("🔍 Извлеченные параметры:", rawFeatures);
            console.log("🔍 Параметры из модального окна:", modalFeatures);

            // Извлекаем основные поля
            const title = await safeEval(page, selectors.title, el => el.textContent.trim()) || "Не указано";

            // Отладочная информация для заголовка
            console.log("🔍 Извлеченный заголовок:", title);

            // Извлекаем год - ищем span после изображения с alt="Year"
            const yearText = await page.evaluate(({ yearAttrs, selectors }) => {
                const yearImg = Array.from(document.querySelectorAll(selectors.allImages)).find(img => 
                    yearAttrs.includes(img.getAttribute('alt'))
                );
                if (yearImg) {
                    const nextSpan = yearImg.parentElement?.querySelector(selectors.imageParentSpan);
                    return nextSpan?.textContent?.trim() || null;
                }
                return null;
            }, { yearAttrs: imageAttributes.year, selectors: selectors }) 
            const year = yearText ? yearText.replace(/\D/g, "") : null;

            // Извлекаем пробег - ищем span после изображения с alt="Mileage"
            const kmText = await page.evaluate(({ mileageAttrs, selectors }) => {
                const mileageImg = Array.from(document.querySelectorAll(selectors.allImages)).find(img => 
                    mileageAttrs.includes(img.getAttribute('alt'))
                );
                if (mileageImg) {
                    const nextSpan = mileageImg.parentElement?.querySelector(selectors.imageParentSpan);
                    return nextSpan?.textContent?.trim() || null;
                }
                return null;
            }, { mileageAttrs: imageAttributes.mileage, selectors: selectors }) 
            const kilometers = kmText || "0";

            // Извлекаем цену
            const priceText = await safeEval(page, selectors.price, el => el.textContent) || "";
            const priceFormatted = priceText.replace(/[^\d,]/g, "").trim();
            const priceRaw = priceFormatted ?
                parseFloat(priceFormatted.replace(/,/g, "")) :
                null;

            // Получаем фотографии - ищем изображения с alt, начинающимся с "Car image"
            const photos = await page.evaluate(({ carImageAttr, selectors }) => {
                const carImages = Array.from(document.querySelectorAll(selectors.allImages)).filter(img => 
                    img.getAttribute('alt') && img.getAttribute('alt').startsWith(carImageAttr)
                );
                
                return Array.from(
                    new Set(
                        carImages
                            .map(img => img.getAttribute("src") || img.src)
                            .map(src => src.startsWith("//") ? "https:" + src : src)
                            .filter(src => src && (src.includes("carswitch.com") || src.includes("cloudfront.net")))
                    )
                );
            }, { carImageAttr: imageAttributes.carImage, selectors: selectors }) || [];

            // Извлекаем локацию - ищем span после изображения с alt="Location"
            const location = await page.evaluate(({ locationAttrs, selectors }) => {
                const locationImg = Array.from(document.querySelectorAll(selectors.allImages)).find(img => 
                    locationAttrs.includes(img.getAttribute('alt'))
                );
                if (locationImg) {
                    const nextSpan = locationImg.parentElement?.querySelector(selectors.imageParentSpan);
                    return nextSpan?.textContent?.trim() || null;
                }
                return null;
            }, { locationAttrs: imageAttributes.location, selectors: selectors }) || "Не указано";

            // Данные о продавце (пока используем значения по умолчанию, так как структура изменилась)
            const sellerName = "CarSwitch";
            const sellerType = "Дилер";
            const sellerLogo = null;
            const sellerProfileLink = null;
            const phoneNumber = "Не указан";

            // Составляем итоговый объект
            const carDetails = {
                short_url: url,
                title,
                photos,
                main_image: photos.length > 0 ? photos[0] : null,
                make: pick(rawFeatures, dataFields.make, title && title !== "Не указано" ? title.split(" ")[0] : "Не указано"),
                model: pick(rawFeatures, dataFields.model, title && title !== "Не указано" ? title.replace(/^\S+\s*/, "") : "Не указано"),
                year,
                body_type: pick(rawFeatures, dataFields.bodyType, "Не указано"),
                horsepower: pick(rawFeatures, dataFields.horsepower, null),
                fuel_type: pick(rawFeatures, dataFields.fuelType, "Не указано"),
                motors_trim: pick(rawFeatures, dataFields.motorsTrim, "Не указано"),
                kilometers,
                sellers: {
                    sellerName,
                    sellerType,
                    sellerLogo,
                    sellerProfileLink,
                },
                price: {
                    formatted: priceFormatted,
                    raw: priceRaw,
                    currency: "AED",
                },
                exterior_color: pick(rawFeatures, dataFields.exteriorColor, "Не указано"),
                location,
                contact: {
                    phone: phoneNumber,
                },
            };

            // Закрываем модальное окно если оно открыто
            try {
                const closeButton = await page.$(selectors.closeButton);
                if (closeButton) {
                    await closeButton.click();
                    await page.waitForTimeout(500);
                }
            } catch (error) {
                // Игнорируем ошибки закрытия модального окна
            }

            console.log("✅ Данные автомобиля успешно извлечены");
            return carDetails;

        } catch (error) {
            errorCount++;
            console.error(`❌ Ошибка при загрузке данных с ${url}:`, error.message);
            
            // Отправляем уведомление в Telegram при критических ошибках
            if (telegramService.getStatus().enabled && errorCount % 10 === 0) {
                await sendErrorNotification(url, error);
            }
            
            return null;
        } finally {
            await page.close();
        }
    }

    /**
     * Отправка уведомления об ошибке в Telegram
     */
    async function sendErrorNotification(url, error) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const message = `⚠️ *Carswitch: Ошибка парсинга детальной страницы*\n\n` +
                          `URL: ${url}\n` +
                          `Ошибка: ${error.name || 'Unknown'}\n` +
                          `Сообщение: ${error.message}\n` +
                          `Всего ошибок: ${errorCount}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления:`, telegramError.message);
        }
    }

    /**
     * Безопасное выполнение eval на странице
     */
    async function safeEval(page, selector, fn) {
        try {
            return await page.$eval(selector, fn);
        } catch {
            return null;
        }
    }

    /**
     * Выбор первого непустого значения из объекта
     */
    function pick(map, keys, def = null) {
        for (const k of keys) {
            if (map[k] != null) return map[k];
        }
        return def;
    }

    /**
     * Утилита для паузы
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Возвращаем объект с методами
    return {
        parseCarDetails,
        sendErrorNotification,
        safeEval,
        pick,
        sleep
    };
}

module.exports = { createCarswitchDetailParser };
