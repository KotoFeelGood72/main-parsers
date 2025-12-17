const { telegramService } = require('../../../../services/TelegramService');

/**
 * Парсинг детальной информации для Sharrai.ae (функциональный подход)
 */

/**
 * Создание парсера детальной информации Sharrai
 */
function createSharraiDetailParser(config) {
    // Конфигурация
    const parserConfig = config;
    
    // Счетчик ошибок для логирования
    let errorCount = 0;
    
    // Селекторы для детальной страницы Sharrai (обновлены под реальную структуру)
    const selectors = {
            // Основные данные
            title: 'h1',
            price: '.dealerLocation.title h2, .carDetailsRight h2',
            location: '.dealerLocation:has(img[src*="location"]) a, .dealerLocation:has-text("Location")',
            
            // Детали автомобиля из карусели
            overviewCarousel: '.singleOverViewSlider',
            additionalDetails: '.additionalDetailsGrid ul li',
            
            // Продавец
            sellerInfo: '.dealerLocation:has(img[src*="dealer-icon"])',
            sellerName: '.dealerLocation:has(img[src*="dealer-icon"]) a.link',
            sellerProfileLink: 'a[href*="/dealer-detail/"]',
            
            // Телефон
            phone: 'a.show-number[data-number], a[href^="tel:"]',
            phoneButton: 'a.show-number',
            
            // Изображения
            images: '#sync1 .owl-item img, #sync1 img, .car_details_img img',
            mainImage: '#sync1 .owl-item.active img, #sync1 .owl-item:first-child img'
        };
        
        // Поля для извлечения данных
        const dataFields = {
            make: ['Make', 'Марка', 'Brand', 'brand'],
            model: ['Model', 'Модель', 'Car Model', 'car model'],
            bodyType: ['Body type', 'Body Type', 'Тип кузова', 'body type', 'Body', 'body'],
            fuelType: ['Fuel Type', 'Тип топлива', 'Fuel', 'fuel', 'Fuel type', 'fuel type'],
            transmission: ['Transmission', 'Коробка передач', 'Gear', 'gear'],
            color: ['Color', 'Цвет', 'Exterior Color', 'exterior color']
        };

    /**
     * Парсинг детальной страницы автомобиля
     */
    async function parseCarDetails(url, context) {
        const page = await context.newPage();

        try {
            console.log(`🚗 Переходим к ${url}`);

            await page.goto(url, {
                waitUntil: "networkidle",
                timeout: 60000
            });

            console.log("📄 Загружаем данные...");

            // Ждем загрузки основных элементов
            await page.waitForTimeout(3000);
            
            // Дополнительное ожидание для загрузки карусели изображений
            try {
                await page.waitForSelector('#sync1, .car_details_img, h1', { timeout: 10000 });
            } catch (e) {
                console.warn("⚠️ Некоторые элементы не загрузились, продолжаем...");
            }

            // Ждем загрузки основных элементов
            await page.waitForSelector('h1, .carDetailsRight', { timeout: 30000 });
            await page.waitForTimeout(2000); // Дополнительное ожидание для динамического контента

            // Извлекаем основные поля
            const title = await safeEval(page, selectors.title, el => el.textContent.trim()) || "Не указано";
            console.log(`📝 Заголовок: ${title}`);
            
            // Извлекаем цену
            let priceData = { formatted: "Не указано", raw: 0 };
            try {
                priceData = await page.evaluate(() => {
                    const priceEl = document.querySelector('.dealerLocation.title h2, .carDetailsRight h2');
                    if (priceEl) {
                        const text = priceEl.textContent.trim();
                        // Ищем цену в формате "AED 25,500"
                        const match = text.match(/AED\s*([\d,]+)/i) || text.match(/([\d,]+)/);
                        if (match) {
                            const numeric = match[1].replace(/,/g, '');
                            return {
                                formatted: text,
                                raw: parseInt(numeric) || 0
                            };
                        }
                    }
                    return { formatted: "Не указано", raw: 0 };
                });
                console.log(`💰 Цена: ${priceData.formatted}`);
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения price:`, error.message);
            }

            // Извлекаем локацию
            let location = "Не указано";
            try {
                location = await page.evaluate(() => {
                    // Ищем локацию в блоке с иконкой location
                    const locationBlocks = Array.from(document.querySelectorAll('.dealerLocation'));
                    for (const block of locationBlocks) {
                        const img = block.querySelector('img[src*="location"]');
                        if (img) {
                            const link = block.querySelector('a');
                            if (link && link.textContent.trim()) {
                                return link.textContent.trim();
                            }
                        }
                    }
                    return "Не указано";
                });
                console.log(`📍 Локация: ${location}`);
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения локации:`, error.message);
            }

            // Извлекаем детали автомобиля из карусели и дополнительных деталей
            let make = "Не указано";
            let model = "Не указано";
            let year = "Не указано";
            let bodyType = "Не указано";
            let fuelType = "Не указано";
            let transmission = "Не указано";
            let kilometers = "0";
            let exteriorColor = "Не указано";
            let cylinders = "Не указано";

            try {
                const carDetails = await page.evaluate(() => {
                    const details = {};
                    
                    // Извлекаем данные из карусели .singleOverViewSlider
                    const overviewItems = Array.from(document.querySelectorAll('.singleOverViewSlider'));
                    for (const item of overviewItems) {
                        const label = item.querySelector('p')?.textContent.trim().toLowerCase() || '';
                        const value = item.querySelector('h5')?.textContent.trim() || '';
                        
                        // Проверяем в правильном порядке, чтобы не перезаписать значения
                        if (label.includes('transmission')) {
                            // Transmission Type - это трансмиссия (Automatic, Manual)
                            details.transmission = value;
                        } else if (label.includes('model') && !label.includes('car model') && !label.includes('car-model')) {
                            // "Model" в карусели - это тип кузова (Sedan, SUV и т.д.), не модель автомобиля
                            details.bodyType = value;
                        } else if (label.includes('year')) {
                            const yearMatch = value.match(/\d{4}/);
                            if (yearMatch) details.year = yearMatch[0];
                        } else if (label.includes('mileage') || label.includes('km')) {
                            // Извлекаем пробег, убираем "K KM" и преобразуем
                            const kmMatch = value.match(/([\d.]+)\s*K?\s*KM?/i);
                            if (kmMatch) {
                                const kmValue = parseFloat(kmMatch[1]);
                                // Если значение меньше 1000, значит это уже в тысячах (например "64K KM" = 64000)
                                details.mileage = kmValue < 1000 ? Math.round(kmValue * 1000).toString() : Math.round(kmValue).toString();
                            } else {
                                details.mileage = value.replace(/[^\d]/g, '');
                            }
                        } else if (label.includes('cylinder')) {
                            const cylMatch = value.match(/(\d+)/);
                            if (cylMatch) details.cylinders = cylMatch[1];
                        }
                    }
                    
                    // Извлекаем данные из дополнительных деталей
                    const additionalItems = Array.from(document.querySelectorAll('.additionalDetailsGrid li'));
                    for (const item of additionalItems) {
                        const strong = item.querySelector('strong')?.textContent.trim() || '';
                        const span = item.querySelector('span')?.textContent.trim() || '';
                        
                        if (strong.includes('Fuel Type') || strong.includes('Fuel')) {
                            details.fuelType = span;
                        } else if (strong.includes('Color') || strong.includes('Colour')) {
                            details.color = span;
                        } else if (strong.includes('Engine Capacity') || strong.includes('HP')) {
                            // Можно использовать для horsepower
                            details.horsepower = span;
                        }
                    }
                    
                    // Извлекаем make и model из заголовка h1 (например "Nissan Sentra 2021")
                    const titleEl = document.querySelector('h1');
                    if (titleEl) {
                        const titleText = titleEl.textContent.trim();
                        // Пробуем извлечь марку и модель (первые два слова обычно)
                        const words = titleText.split(/\s+/);
                        if (words.length >= 2) {
                            details.make = words[0];
                            details.model = words.slice(1, -1).join(' '); // Все слова кроме последнего (год)
                        }
                    }
                    
                    return details;
                });
                
                make = carDetails.make || "Не указано";
                model = carDetails.model || "Не указано";
                year = carDetails.year || "Не указано";
                bodyType = carDetails.bodyType || "Не указано";
                fuelType = carDetails.fuelType || "Не указано";
                transmission = carDetails.transmission || "Не указано";
                kilometers = carDetails.mileage || "0";
                exteriorColor = carDetails.color || "Не указано";
                cylinders = carDetails.cylinders || "Не указано";
                
                console.log(`🚗 Детали: ${make} ${model} ${year}, ${bodyType}, ${transmission}, ${kilometers} км`);
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения деталей автомобиля:`, error.message);
            }

            // Извлекаем информацию о продавце
            let sellerName = "Не указано";
            let sellerType = "Частное лицо";
            let sellerLogo = null;
            let sellerProfileLink = null;

            try {
                const sellerInfo = await page.evaluate(() => {
                    const info = {};
                    
                    // Ищем блок с информацией о дилере
                    const dealerBlocks = Array.from(document.querySelectorAll('.dealerLocation'));
                    for (const block of dealerBlocks) {
                        const img = block.querySelector('img[src*="dealer-icon"]');
                        if (img) {
                            // Находим ссылку на профиль дилера
                            const link = block.querySelector('a.link[href*="/dealer-detail/"]');
                            if (link) {
                                info.sellerProfileLink = link.href.startsWith('http') ? link.href : `https://sharrai.ae${link.href}`;
                                // Имя дилера может быть в тексте ссылки или в span
                                const span = block.querySelector('span');
                                if (span) {
                                    info.sellerName = span.textContent.trim();
                                } else {
                                    // Пробуем извлечь из URL
                                    const urlMatch = link.href.match(/\/dealer-detail\/([^\/]+)/);
                                    if (urlMatch) {
                                        info.sellerName = urlMatch[1].replace(/-/g, ' ');
                                    }
                                }
                                info.sellerType = 'Дилер';
                                break;
                            }
                        }
                    }
                    
                    return info;
                });
                
                sellerName = sellerInfo.sellerName || "Не указано";
                sellerType = sellerInfo.sellerType || "Частное лицо";
                sellerLogo = sellerInfo.sellerLogo || null;
                sellerProfileLink = sellerInfo.sellerProfileLink || null;
                
                console.log(`👤 Продавец: ${sellerName} (${sellerType})`);
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения информации о продавце:`, error.message);
            }

            // Извлекаем телефон
            let phoneNumber = "Не указан";
            try {
                phoneNumber = await page.evaluate(() => {
                    // Сначала ищем в data-number атрибуте кнопки
                    const phoneButton = document.querySelector('a.show-number[data-number]');
                    if (phoneButton) {
                        const phone = phoneButton.getAttribute('data-number');
                        if (phone) return phone.trim();
                    }
                    
                    // Ищем все ссылки tel:
                    const telLinks = document.querySelectorAll('a[href^="tel:"]');
                    for (const link of telLinks) {
                        const tel = link.getAttribute('href').replace('tel:', '').trim();
                        if (tel) return tel;
                    }
                    
                    return "Не указан";
                });
                console.log(`📞 Телефон: ${phoneNumber}`);
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения телефона:`, error.message);
            }

            // Извлекаем изображения из карусели
            let photos = [];
            let mainImage = null;
            try {
                const imagesData = await page.evaluate(() => {
                    const images = [];
                    const uniqueUrls = new Set();
                    
                    // Извлекаем все изображения из карусели #sync1
                    const imageElements = document.querySelectorAll('#sync1 .owl-item img, #sync1 img, .car_details_img img');
                    
                    for (const img of imageElements) {
                        if (img.src && !img.src.includes('data:') && !img.src.includes('placeholder')) {
                            let imageUrl = img.src;
                            
                            // Нормализуем URL
                            if (!imageUrl.startsWith('http')) {
                                imageUrl = `https://sharrai.ae${imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl}`;
                            }
                            
                            // Убираем параметры для получения оригинального изображения
                            imageUrl = imageUrl.split('?')[0];
                            
                            if (!uniqueUrls.has(imageUrl)) {
                                uniqueUrls.add(imageUrl);
                                images.push(imageUrl);
                            }
                        }
                    }
                    
                    // Главное изображение - первое активное или первое в списке
                    const activeImg = document.querySelector('#sync1 .owl-item.active img, #sync1 .owl-item:first-child img');
                    let mainImg = null;
                    if (activeImg && activeImg.src) {
                        mainImg = activeImg.src.startsWith('http') 
                            ? activeImg.src.split('?')[0]
                            : `https://sharrai.ae${activeImg.src.startsWith('/') ? activeImg.src : '/' + activeImg.src}`.split('?')[0];
                    } else if (images.length > 0) {
                        mainImg = images[0];
                    }
                    
                    return { images: images, mainImage: mainImg };
                });
                
                photos = imagesData.images || [];
                mainImage = imagesData.mainImage || (photos.length > 0 ? photos[0] : null);
                console.log(`📸 Найдено изображений: ${photos.length}`);
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения изображений:`, error.message);
            }

            // Формируем объект с данными в плоской структуре
            const carDetails = {
                short_url: url,
                title: title || "Не указано",
                photos: photos || [],
                main_image: mainImage,
                make: make || "Не указано",
                model: model || "Не указано",
                year: year || "Не указано",
                body_type: bodyType || "Не указано",
                horsepower: cylinders ? `${cylinders} цилиндров` : "Не указано",
                fuel_type: fuelType || "Не указано",
                motors_trim: transmission || "Не указано", // motors_trim используется для хранения типа трансмиссии
                kilometers: kilometers || "0",
                seller_name: sellerName || "Не указано",
                seller_type: sellerType || "Частное лицо",
                seller_logo: sellerLogo || null,
                seller_profile_link: sellerProfileLink || null,
                price_formatted: priceData?.formatted || "Не указано",
                price_raw: priceData?.raw || 0,
                currency: "AED",
                exterior_color: exteriorColor || "Не указано",
                location: location || "Не указано",
                phone: phoneNumber || "Не указан",
            };

            console.log("✅ Данные автомобиля успешно извлечены");

            return carDetails;

        } catch (error) {
            errorCount++;
            console.error(`❌ Ошибка при загрузке данных с ${url}:`, error.message);
            
            if (telegramService.getStatus().enabled && errorCount % 10 === 0) {
                await sendErrorNotification(url, error);
            }
            
            return null;
        } finally {
            try {
                await page.close();
            } catch (closeError) {
                console.warn(`⚠️ Ошибка при закрытии страницы:`, closeError.message);
            }
        }
    }

    /**
     * Отправка уведомления об ошибке в Telegram
     */
    async function sendErrorNotification(url, error) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const message = `⚠️ *Sharrai: Ошибка парсинга*\n\n` +
                          `URL: ${url}\n` +
                          `Ошибка: ${error.message}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления:`, telegramError.message);
        }
    }

    /**
     * Безопасное выполнение функции на элементе
     */
    async function safeEval(page, selector, fn, defaultValue = null) {
        try {
            const result = await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                if (!element) return null;
                return element.textContent.trim();
            }, selector);
            return result !== null ? result : defaultValue;
        } catch (error) {
            console.warn(`⚠️ Ошибка в safeEval для селектора ${selector}:`, error.message);
            return defaultValue;
        }
    }

    // Возвращаем объект с методами
    return {
        parseCarDetails,
        sendErrorNotification,
        safeEval
    };
}

module.exports = { createSharraiDetailParser };

