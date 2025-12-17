const { telegramService } = require('../../../../services/TelegramService');
const { createOptimizedPage, safeEval } = require('../../../../parsers/utils/parserHelpers');

/**
 * Парсинг детальной информации для Dubicars.com
 */

class DubicarsDetailParser {
    constructor(config) {
        this.config = config;
        
        // Счетчик ошибок для логирования
        this.errorCount = 0;
        
        // Селекторы для детальной страницы
        this.selectors = {
            // Селекторы для основных данных
            title: 'h1.text-dark',
            price: 'div.price.fs-20.fw-600.text-dark.currency-price-field',
            // Селекторы для спецификаций
            specifications: '#item-specifications ul.faq__data li',
            // Селекторы для highlights
            mobileHighlights: '#highlights .mobile-only li',
            laptopHighlights: '#highlights .laptop-only li',
            // Селекторы для фотографий
            photos: '#car-images-slider img',
            altPhotos: 'img[alt*="Rolls-Royce"], img[alt*="Cullinan"], .car-image img, .image-container img',
            // Селекторы для продавца
            sellerName: '.seller-intro p',
            sellerLogo: '.seller-intro img',
            sellerProfileLink: '.seller-intro a',
            // Селекторы для контактов
            whatsappLink: 'a.whatsapp-link'
        };
        
        // Поля для извлечения данных из спецификаций
        this.specificationFields = {
            make: ['make'],
            model: ['model'],
            year: ['year', 'model year'],
            kilometers: ['kilometers', 'mileage'],
            exterior_color: ['color'],
            interior_color: ['interior color'],
            transmission: ['transmission'],
            body_type: ['vehicle type'],
            drive_type: ['drive type'],
            seating_capacity: ['seating capacity'],
            doors: ['number of doors'],
            wheel_size: ['wheel size'],
            fuel_type: ['fuel type'],
            horsepower: ['horsepower', 'power'],
            engine_capacity: ['engine capacity'],
            cylinders: ['cylinders']
        };
    }

    /**
     * Парсинг детальной страницы автомобиля
     */
    async parseCarDetails(url, context) {
        const page = await createOptimizedPage(context, this.config);

        try {
            console.log(`🚗 Переходим к ${url}`);

            await page.goto(url, { 
                waitUntil: "domcontentloaded", 
                timeout: 30000 
            });

            console.log("⏳ Ждем загрузку страницы...");
            // Ждем загрузки страницы с меньшим таймаутом
            await page.waitForSelector('h1.text-dark', { timeout: 5000, state: 'attached' });

            console.log("📄 Парсим данные...");

            // Парсинг основных данных
            const title = await safeEval(page, this.selectors.title, el => el.textContent.trim());

            // Извлекаем год из заголовка, если он там есть
            const yearFromTitle = title ? title.match(/\b(202[0-9]|203[0-9])\b/) : null;

            // Парсинг цены
            const priceFormatted = await safeEval(page, this.selectors.price, el => el.textContent.trim());

            // Извлекаем валюту и сумму из строки типа "USD 734,200"
            let priceRaw = null;
            let currency = "USD";
            
            if (priceFormatted) {
                const priceMatch = priceFormatted.match(/([A-Z]{3})\s*([\d,]+)/);
                if (priceMatch) {
                    currency = priceMatch[1];
                    priceRaw = parseFloat(priceMatch[2].replace(/,/g, ""));
                }
            }

            // Парсинг характеристик - универсальный подход для mobile и laptop версий
            const specifications = await page.evaluate((params) => {
                const { specSelector } = params;
                const specs = {};
                const motorParts = []; // Массив для сбора данных о двигателе

                // Ищем все элементы спецификаций (и mobile, и laptop)
                const specElements = document.querySelectorAll(specSelector);

                specElements.forEach(el => {
                    const spans = el.querySelectorAll('span');
                    if (spans.length >= 2) {
                        const key = spans[0].textContent.trim().toLowerCase();
                        const value = spans[spans.length - 1].textContent.trim();

                        // Маппинг ключей на основе новой структуры
                        if (key.includes('make')) specs.make = value;
                        else if (key.includes('model')) specs.model = value;
                        else if (key.includes('year') || key.includes('model year')) {
                            // Извлекаем год из значения, если это число
                            const yearMatch = value.match(/(\d{4})/);
                            specs.year = yearMatch ? yearMatch[1] : value;
                        }
                        else if (key.includes('kilometers') || key.includes('mileage')) specs.kilometers = value;
                        else if (key.includes('color') && !key.includes('interior')) specs.exterior_color = value;
                        else if (key.includes('interior color')) specs.interior_color = value;
                        else if (key.includes('transmission')) specs.transmission = value;
                        else if (key.includes('vehicle type')) specs.body_type = value;
                        else if (key.includes('drive type')) specs.drive_type = value;
                        else if (key.includes('seating capacity')) specs.seating_capacity = value;
                        else if (key.includes('number of doors')) specs.doors = value;
                        else if (key.includes('wheel size')) specs.wheel_size = value;
                        
                        // Собираем данные о двигателе
                        else if (key.includes('fuel type')) {
                            motorParts.push(`Fuel: ${value}`);
                            specs.fuel_type = value;
                        }
                        else if (key.includes('horsepower')) {
                            // Записываем мощность в отдельное поле
                            specs.horsepower = value;
                            motorParts.push(`Power: ${value}`);
                        }
                        else if (key.includes('engine capacity')) {
                            motorParts.push(`Engine: ${value}`);
                            specs.engine_capacity = value;
                        }
                        else if (key.includes('cylinders')) {
                            motorParts.push(`Cylinders: ${value}`);
                            specs.cylinders = value;
                        }
                    }
                });

                // Объединяем данные о двигателе в одно поле
                if (motorParts.length > 0) {
                    specs.motors_trim = motorParts.join(', ');
                }

                return specs;
            }, {
                specSelector: this.selectors.specifications
            });

            // Всегда пробуем парсить из highlights секции для дополнительных данных
            console.log("🔍 Парсим highlights секцию для дополнительных данных...");
            
            const highlights = await page.evaluate((params) => {
                const { mobileSelector, laptopSelector } = params;
                const highlights = {};
                const motorParts = []; // Массив для сбора данных о двигателе
                
                // Парсим mobile версию highlights
                const mobileHighlights = document.querySelectorAll(mobileSelector);
                mobileHighlights.forEach(el => {
                    const text = el.textContent.trim();
                    
                    // Парсим километры
                    if (text.includes('Km')) {
                        // Извлекаем километры с запятыми и пробелами, но останавливаемся на "==" или других разделителях
                        const kmMatch = text.match(/(\d+[,\s]*\d*\s*Km)(?:\s*==.*)?/);
                        if (kmMatch) {
                            highlights.kilometers = kmMatch[1];
                        } else {
                            // Если не нашли точное совпадение, берем весь текст
                            highlights.kilometers = text;
                        }
                    }
                    
                    // Парсим год - ищем в ссылках и тексте
                    const yearLink = el.querySelector('a[title]');
                    if (yearLink && yearLink.getAttribute('title').match(/\d{4}/)) {
                        highlights.year = yearLink.getAttribute('title').match(/(\d{4})/)?.[1] || null;
                    } else if (text.match(/\b(202[0-9]|203[0-9])\b/)) {
                        highlights.year = text.match(/\b(202[0-9]|203[0-9])\b/)?.[1] || null;
                    }
                    
                    // Собираем данные о двигателе
                    const fuelLink = el.querySelector('a[title*="Petrol"], a[title*="Diesel"], a[title*="Electric"]');
                    if (fuelLink) {
                        const fuelType = fuelLink.getAttribute('title');
                        motorParts.push(`Fuel: ${fuelType}`);
                        highlights.fuel_type = fuelType;
                    } else if (text.includes('Petrol') || text.includes('Diesel') || text.includes('Electric')) {
                        const fuelType = text.match(/(Petrol|Diesel|Electric|Hybrid)/)?.[1];
                        if (fuelType) {
                            motorParts.push(`Fuel: ${fuelType}`);
                            highlights.fuel_type = fuelType;
                        }
                    }
                    
                    // Парсим мощность
                    if (text.includes('HP')) {
                        const power = text.match(/(\d+\s*HP)/)?.[1];
                        if (power) {
                            highlights.horsepower = power;
                            motorParts.push(`Power: ${power}`);
                        }
                    }
                    
                    // Парсим объем двигателя
                    if (text.includes('L')) {
                        const engine = text.match(/(\d+\.?\d*\s*L)/)?.[1];
                        if (engine) {
                            motorParts.push(`Engine: ${engine}`);
                            highlights.engine_capacity = engine;
                        }
                    }
                });
                
                // Парсим laptop версию highlights
                const laptopHighlights = document.querySelectorAll(laptopSelector);
                laptopHighlights.forEach(el => {
                    const text = el.textContent.trim();
                    
                    // Парсим год модели
                    if (text.includes('Model year')) {
                        const yearMatch = text.match(/(\d{4})/);
                        if (yearMatch) {
                            highlights.year = yearMatch[1];
                        }
                    }
                    
                    // Парсим километры
                    if (text.includes('Kilometers')) {
                        // Извлекаем километры с запятыми и пробелами, но останавливаемся на "==" или других разделителях
                        const kmMatch = text.match(/(\d+[,\s]*\d*\s*Km)(?:\s*==.*)?/);
                        if (kmMatch) {
                            highlights.kilometers = kmMatch[1];
                        } else {
                            // Если не нашли точное совпадение, берем весь текст
                            highlights.kilometers = text;
                        }
                    }
                    
                    // Собираем данные о двигателе из laptop версии
                    if (text.includes('Engine capacity')) {
                        const engineMatch = text.match(/(\d+\.?\d*\s*L)/);
                        if (engineMatch) {
                            motorParts.push(`Engine: ${engineMatch[1]}`);
                            highlights.engine_capacity = engineMatch[1];
                        }
                    }
                    
                    if (text.includes('Fuel Type') || text.includes('Fuel')) {
                        const fuelMatch = text.match(/(Petrol|Diesel|Electric|Hybrid)/);
                        if (fuelMatch) {
                            motorParts.push(`Fuel: ${fuelMatch[1]}`);
                            highlights.fuel_type = fuelMatch[1];
                        }
                    }
                });
                
                // Объединяем данные о двигателе в одно поле
                if (motorParts.length > 0) {
                    highlights.motors_trim = motorParts.join(', ');
                }
                
                return highlights;
            }, {
                mobileSelector: this.selectors.mobileHighlights,
                laptopSelector: this.selectors.laptopHighlights
            });
            
            console.log("📊 Найденные данные в highlights:", highlights);
            
            // Объединяем данные из highlights с основными спецификациями
            // Приоритет отдаем данным из спецификаций, но дополняем из highlights
            const finalSpecs = { ...specifications };
            
            // Объединяем данные о двигателе
            const motorParts = [];
            if (finalSpecs.motors_trim) {
                motorParts.push(...finalSpecs.motors_trim.split(', '));
            }
            if (highlights.motors_trim) {
                motorParts.push(...highlights.motors_trim.split(', '));
            }
            
            // Убираем дубликаты
            const uniqueMotorParts = [...new Set(motorParts)];
            if (uniqueMotorParts.length > 0) {
                finalSpecs.motors_trim = uniqueMotorParts.join(', ');
            }
            
            // Дополняем недостающие данные из highlights
            Object.keys(highlights).forEach(key => {
                if (!finalSpecs[key] && highlights[key]) {
                    finalSpecs[key] = highlights[key];
                }
            });

            // Если год не найден в спецификациях, используем год из заголовка
            if (!finalSpecs.year && yearFromTitle) {
                finalSpecs.year = yearFromTitle[1];
            }

            const {
                make,
                model,
                year,
                kilometers,
                fuel_type,
                horsepower,
                exterior_color,
                interior_color,
                engine_capacity,
                transmission,
                body_type,
                cylinders,
                drive_type,
                seating_capacity,
                doors,
                wheel_size
            } = finalSpecs;

            // Парсинг фотографий из слайдера - более надежный подход
            const photos = await page.evaluate((params) => {
                const { photoSelector, altPhotoSelector } = params;
                const images = [];
                
                // Ищем все изображения в слайдере
                const sliderImages = document.querySelectorAll(photoSelector);
                
                sliderImages.forEach(img => {
                    if (img.src && !img.src.includes('data:')) {
                        // Преобразуем относительные URL в абсолютные
                        const fullUrl = img.src.startsWith('//') ? 'https:' + img.src : img.src;
                        if (!images.includes(fullUrl)) {
                            images.push(fullUrl);
                        }
                    }
                });
                
                // Если в слайдере нет изображений, пробуем другие селекторы
                if (images.length === 0) {
                    const altImages = document.querySelectorAll(altPhotoSelector);
                    altImages.forEach(img => {
                        if (img.src && !img.src.includes('data:')) {
                            const fullUrl = img.src.startsWith('//') ? 'https:' + img.src : img.src;
                            if (!images.includes(fullUrl)) {
                                images.push(fullUrl);
                            }
                        }
                    });
                }
                
                return images;
            }, {
                photoSelector: this.selectors.photos,
                altPhotoSelector: this.selectors.altPhotos
            });

            // Извлекаем главное изображение (первая фотография)
            const main_image = photos.length > 0 ? photos[0] : null;

            // Парсинг информации о продавце
            const sellerName = await safeEval(page, this.selectors.sellerName, el => el.textContent.trim());
            const sellerLogo = await safeEval(page, this.selectors.sellerLogo, img => img.src.startsWith('//') ? 'https:' + img.src : img.src);
            const sellerProfileLink = await safeEval(page, this.selectors.sellerProfileLink, a => a.href);

            // Парсинг телефона
            const whatsappHref = await safeEval(page, this.selectors.whatsappLink, a => a.href);
            const phoneMatch = whatsappHref ? whatsappHref.match(/phone=(\d+)/) : null;
            const phone = phoneMatch ? `+${phoneMatch[1]}` : "Не указан";

            // Извлекаем отдельные поля двигателя из motors_trim для сохранения в БД
            let extractedHorsepower = finalSpecs.horsepower || null;
            let extractedFuelType = finalSpecs.fuel_type || null;
            
            // Если мощность не найдена, пробуем извлечь из заголовка
            if (!extractedHorsepower) {
                const titlePowerMatch = title?.match(/(\d+(?:\.\d+)?\s*(?:HP|hp|Horsepower|horsepower|BHP|bhp))/i);
                if (titlePowerMatch) {
                    extractedHorsepower = titlePowerMatch[1];
                }
            }
            
            // Если мощность все еще не найдена, пробуем поискать на всей странице
            if (!extractedHorsepower) {
                const pagePower = await page.evaluate(() => {
                    // Ищем мощность в различных элементах страницы
                    const powerSelectors = [
                        '[class*="power"]',
                        '[class*="horsepower"]',
                        '[class*="hp"]',
                        '.spec-value',
                        '#item-specifications .spec-item',
                        '.car-specs li',
                        '.specifications li'
                    ];
                    
                    for (const selector of powerSelectors) {
                        const elements = document.querySelectorAll(selector);
                        for (const el of elements) {
                            const text = el.textContent.trim();
                            const powerMatch = text.match(/(\d+(?:\.\d+)?\s*(?:HP|hp|Horsepower|horsepower|BHP|bhp))/i);
                            if (powerMatch) {
                                return powerMatch[1];
                            }
                        }
                    }
                    return null;
                });
                
                if (pagePower) {
                    extractedHorsepower = pagePower;
                }
            }

            // Формирование объекта данных
            const carDetails = {
                short_url: url,
                title: title || "Не указано",
                photos,
                main_image: main_image,
                make: make || null,
                model: model || null,
                year: year || null,
                body_type: body_type || null,
                horsepower: extractedHorsepower || null,
                fuel_type: extractedFuelType || null,
                motors_trim: finalSpecs.motors_trim || null,
                kilometers: kilometers || null,
                exterior_color: exterior_color || null,
                interior_color: interior_color || null,
                transmission: transmission || null,
                drive_type: drive_type || null,
                seating_capacity: seating_capacity || null,
                doors: doors || null,
                wheel_size: wheel_size || null,
                sellers: {
                    sellerName: sellerName || "Не указан",
                    sellerType: "Dealer",
                    sellerLogo: sellerLogo || null,
                    sellerProfileLink: sellerProfileLink || null,
                },
                price: {
                    formatted: priceFormatted || "Не указано",
                    raw: priceRaw || 0,
                    currency: currency || "USD",
                },
                location: "Dubai",
                contact: {
                    phone: phone || "Не указан",
                },
            };

            console.log("✅ Данные автомобиля успешно извлечены");
            return carDetails;

        } catch (error) {
            this.errorCount++;
            console.error(`❌ Ошибка при загрузке данных с ${url}:`, error.message);
            
            // Отправляем уведомление в Telegram при критических ошибках
            if (telegramService.getStatus().enabled && this.errorCount % 10 === 0) {
                await this.sendErrorNotification(url, error);
            }
            
            return null;
        } finally {
            await page.close();
        }
    }

    /**
     * Отправка уведомления об ошибке в Telegram
     */
    async sendErrorNotification(url, error) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const message = `⚠️ *Dubicars: Ошибка парсинга детальной страницы*\n\n` +
                          `URL: ${url}\n` +
                          `Ошибка: ${error.name || 'Unknown'}\n` +
                          `Сообщение: ${error.message}\n` +
                          `Всего ошибок: ${this.errorCount}\n` +
                          `Время: ${new Date().toLocaleString('ru-RU')}`;

            await telegramService.sendMessage(message);
        } catch (telegramError) {
            console.warn(`⚠️ Ошибка отправки уведомления:`, telegramError.message);
        }
    }
}

module.exports = { DubicarsDetailParser };
