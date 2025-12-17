const { telegramService } = require('../../../../services/TelegramService');

/**
 * Парсинг детальной информации для Autotraders.com
 */

class AutotradersDetailParser {
    constructor(config) {
        this.config = config;
        
        // Счетчик ошибок для логирования
        this.errorCount = 0;
        
        // Селекторы для детальной страницы Autotraders.ae
        this.selectors = {
            // Основные данные
            title: 'h1, h2.title, .car-title',
            titleH2: '.title h2',
            price: '.price h3, .car-price',
            priceContainer: '.price',
            location: '.cincitymn, .location',
            locationUserDetails: '.user-details .location .dcname',
            locationCincitymn: '.cincitymn a',
            
            // Детали автомобиля
            carDetailsList: '.car-det-list',
            carDetailsItem: '.car-det-list li',
            carDetailsCol: '.detail-col',
            carDetailsTxt: '.detail-col .txt',
            make: '.cinml a',
            makeFirst: '.cinml li:first-child a',
            model: '.cinml li:nth-child(3) a',
            modelLast: '.cinml li:last-child a',
            year: '.yrkms .fa-calendar-alt',
            yearFirst: '.yrkms li:first-child',
            bodyType: '.car-specs .spec-body',
            fuelType: '.car-specs .spec-fuel',
            transmission: '.car-specs .spec-transmission',
            mileage: '.yrkms .fa-tachometer-alt',
            mileageLast: '.yrkms li:last-child',
            color: '.car-specs .spec-color',
            carDesc: '.car-desc p',
            
            // Продавец
            sellerName: '.user-name h4 a, .seller-name',
            sellerNameUserDetails: '.user-details .name .dpname',
            sellerType: '.user-name, .seller-type',
            sellerLogo: '.image-user img, .seller-logo img',
            sellerLogoUserDetails: '.user-details .logo img',
            phone: '.phone-number, .contact-phone',
            phoneShowNumber: '.show_number',
            
            // Изображения
            images: '.car-gallery img, .gallery img',
            mainImage: '.car-main-image img, .image img.img-fluid',
            galleryImages: '.image-gallery.lightgallery a.lightgallery.item',
            thumbnailImages: '.thumbnail img'
        };
        
        // Поля для извлечения данных
        this.dataFields = {
            make: ['Make', 'Марка', 'Brand', 'brand'],
            model: ['Model', 'Модель', 'Car Model', 'car model'],
            bodyType: ['Body type', 'Body Type', 'Тип кузова', 'body type', 'Body', 'body'],
            fuelType: ['Fuel Type', 'Тип топлива', 'Fuel', 'fuel', 'Fuel type', 'fuel type'],
            transmission: ['Transmission', 'Коробка передач', 'Gear', 'gear'],
            color: ['Color', 'Цвет', 'Exterior Color', 'exterior color']
        };
    }

    /**
     * Парсинг детальной страницы автомобиля
     */
    async parseCarDetails(url, context) {
        if (!url || !context) {
            console.error('❌ Некорректные параметры для parseCarDetails');
            return null;
        }

        const page = await context.newPage();

        try {
            console.log(`🚗 Переходим к ${url}`);
            

            // Безопасная загрузка страницы
            try {
                await page.goto(url, {
                    waitUntil: "domcontentloaded",
                    timeout: 30000 // Увеличиваем таймаут
                });
            } catch (gotoError) {
                throw new Error(`Ошибка загрузки страницы: ${gotoError.message}`);
            }

            // Проверяем, что страница загрузилась
            const pageTitle = await page.title().catch(() => null);
            if (!pageTitle) {
                throw new Error('Страница не загрузилась (нет title)');
            }

            console.log("📄 Загружаем данные...");

            // Ждем загрузки основных элементов
            await page.waitForTimeout(2000);

            // Безопасное извлечение данных с обработкой ошибок
            let title, priceData, location, make, model, year, bodyType, fuelType, transmission;
            let kilometers, exteriorColor, sellerName, sellerType, sellerLogo, phoneNumber, photos;

            try {
                title = await this.extractTitle(page) || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения title:`, error.message);
                title = "Не указано";
            }

            try {
                priceData = await this.extractPrice(page);
                if (!priceData || !priceData.formatted) {
                    priceData = { raw: 0, formatted: "Не указано" };
                }
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения price:`, error.message);
                priceData = { raw: 0, formatted: "Не указано" };
            }

            try {
                location = await this.extractLocation(page) || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения location:`, error.message);
                location = "Не указано";
            }

            try {
                make = await this.extractMake(page) || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения make:`, error.message);
                make = "Не указано";
            }

            try {
                model = await this.extractModel(page) || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения model:`, error.message);
                model = "Не указано";
            }

            try {
                year = await this.extractYear(page) || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения year:`, error.message);
                year = "Не указано";
            }

            try {
                bodyType = await this.extractBodyType(page) || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения bodyType:`, error.message);
                bodyType = "Не указано";
            }

            try {
                fuelType = await this.extractFuelType(page) || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения fuelType:`, error.message);
                fuelType = "Не указано";
            }

            try {
                transmission = await this.extractTransmission(page) || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения transmission:`, error.message);
                transmission = "Не указано";
            }

            try {
                kilometers = await this.extractKilometers(page) || "0";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения kilometers:`, error.message);
                kilometers = "0";
            }

            try {
                exteriorColor = await this.extractColor(page) || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения color:`, error.message);
                exteriorColor = "Не указано";
            }

            try {
                sellerName = await this.extractSellerName(page) || "Не указано";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения sellerName:`, error.message);
                sellerName = "Не указано";
            }

            try {
                sellerType = await this.extractSellerType(page) || "Частное лицо";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения sellerType:`, error.message);
                sellerType = "Частное лицо";
            }

            try {
                sellerLogo = await this.extractSellerLogo(page) || null;
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения sellerLogo:`, error.message);
                sellerLogo = null;
            }

            try {
                phoneNumber = await this.extractPhone(page) || "Не указан";
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения phone:`, error.message);
                phoneNumber = "Не указан";
            }

            try {
                photos = await this.extractPhotos(page) || [];
            } catch (error) {
                console.warn(`⚠️ Ошибка извлечения photos:`, error.message);
                photos = [];
            }

            const mainImage = photos && photos.length > 0 ? photos[0] : null;

            // Составляем итоговый объект с правильными именами полей (плоская структура)
            const carDetails = {
                short_url: url,
                title: title || "Не указано",
                photos: photos || [],
                main_image: mainImage,
                make: make || "Не указано",
                model: model || "Не указано",
                year: year || "Не указано",
                body_type: bodyType || "Не указано",
                horsepower: "Не указано",
                fuel_type: fuelType || "Не указано",
                motors_trim: transmission || "Не указано",
                kilometers: kilometers || "0",
                price_formatted: priceData?.formatted || "Не указано",
                price_raw: priceData?.raw || 0,
                currency: "AED",
                seller_name: sellerName || "Не указано",
                seller_type: sellerType || "Частное лицо",
                seller_logo: sellerLogo || null,
                seller_profile_link: null,
                exterior_color: exteriorColor || "Не указано",
                location: location || "Не указано",
                phone: phoneNumber || "Не указан",
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
    async sendErrorNotification(url, error) {
        if (!telegramService.getStatus().enabled) return;

        try {
            const message = `⚠️ *Autotraders: Ошибка парсинга детальной страницы*\n\n` +
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

    /**
     * Безопасное выполнение eval на странице
     */
    async safeEval(page, selector, fn) {
        try {
            if (!page || !selector || !fn) {
                return null;
            }
            return await page.$eval(selector, fn);
        } catch (error) {
            console.warn(`⚠️ Ошибка в safeEval для селектора ${selector}:`, error.message);
            return null;
        }
    }

    /**
     * Извлечение заголовка
     */
    async extractTitle(page) {
        if (!page) return "Не указано";
        
        try {
            const title = await page.evaluate((selectors) => {
                try {
                    const h2 = document.querySelector(selectors.titleH2);
                    return h2 ? h2.textContent.trim() : null;
                } catch (e) {
                    return null;
                }
            }, this.selectors);
            return title || "Не указано";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения title:`, error.message);
            return "Не указано";
        }
    }

    /**
     * Извлечение цены
     */
    async extractPrice(page) {
        if (!page) return { raw: 0, formatted: "Не указано" };
        
        try {
            const priceData = await page.evaluate((selectors) => {
                try {
                    const priceEl = document.querySelector(selectors.priceContainer);
                    if (!priceEl) return null;
                    
                    const text = priceEl.textContent.trim();
                    if (!text) return null;
                    
                    // Извлекаем число (формат: "AED 1,295,000")
                    const match = text.match(/([\d,]+)/);
                    if (match) {
                        const numeric = match[1].replace(/,/g, '');
                        const raw = parseInt(numeric, 10);
                        if (!isNaN(raw)) {
                            return {
                                raw: raw,
                                formatted: text
                            };
                        }
                    }
                    return { raw: 0, formatted: text };
                } catch (e) {
                    return null;
                }
            }, this.selectors);
            return priceData || { raw: 0, formatted: "Не указано" };
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения price:`, error.message);
            return { raw: 0, formatted: "Не указано" };
        }
    }

    /**
     * Извлечение марки
     */
    async extractMake(page) {
        if (!page) return "Не указано";
        
        try {
            const result = await page.evaluate((selectors) => {
                try {
                    // Сначала пробуем из car-det-list
                    const makeEl = document.querySelector(`${selectors.carDetailsList} ${selectors.carDetailsTxt}`);
                    if (makeEl && makeEl.textContent) {
                        return makeEl.textContent.trim();
                    }
                    
                    // Если нет, пробуем из .cinml
                    const makeEl2 = document.querySelector(selectors.makeFirst);
                    if (makeEl2 && makeEl2.textContent) {
                        return makeEl2.textContent.trim();
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            });
            return result || "Не указано";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения make:`, error.message);
            return "Не указано";
        }
    }

    /**
     * Извлечение модели
     */
    async extractModel(page) {
        if (!page) return "Не указано";
        
        try {
            const result = await page.evaluate((selectors) => {
                try {
                    // Ищем "Model" в car-det-list
                    const details = Array.from(document.querySelectorAll(selectors.carDetailsItem));
                    for (const detail of details) {
                        if (!detail) continue;
                        const cols = detail.querySelectorAll(selectors.carDetailsCol);
                        for (const col of cols) {
                            if (!col) continue;
                            const labelSpan = col.querySelector('span:first-child');
                            if (!labelSpan || !labelSpan.textContent) continue;
                            
                            const label = labelSpan.textContent.trim();
                            const value = col.querySelector('.txt');
                            if (label === 'Model' && value && value.textContent) {
                                return value.textContent.trim();
                            }
                        }
                    }
                    
                    // Fallback на .cinml
                    const modelEl = document.querySelector(selectors.modelLast);
                    if (modelEl && modelEl.textContent) {
                        return modelEl.textContent.trim();
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            });
            return result || "Не указано";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения model:`, error.message);
            return "Не указано";
        }
    }

    /**
     * Извлечение года
     */
    async extractYear(page) {
        if (!page) return "Не указано";
        
        try {
            const result = await page.evaluate((selectors) => {
                try {
                    // Ищем "Year" в car-det-list
                    const details = Array.from(document.querySelectorAll(selectors.carDetailsItem));
                    for (const detail of details) {
                        if (!detail) continue;
                        const cols = detail.querySelectorAll(selectors.carDetailsCol);
                        for (const col of cols) {
                            if (!col) continue;
                            const labelSpan = col.querySelector('span:first-child');
                            if (!labelSpan || !labelSpan.textContent) continue;
                            
                            const label = labelSpan.textContent.trim();
                            const value = col.querySelector('.txt');
                            if (label === 'Year' && value && value.textContent) {
                                return value.textContent.trim();
                            }
                        }
                    }
                    
                    // Fallback на .yrkms
                    const yearEl = document.querySelector(selectors.yearFirst);
                    if (yearEl && yearEl.textContent) {
                        const text = yearEl.textContent.trim();
                        const year = text.replace(/\D/g, '');
                        return year || null;
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            }, this.selectors);
            return result || "Не указано";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения year:`, error.message);
            return "Не указано";
        }
    }

    /**
     * Извлечение пробега
     */
    async extractKilometers(page) {
        if (!page) return '0';
        
        try {
            const result = await page.evaluate((selectors) => {
                try {
                    // Ищем "Mileage" в car-det-list
                    const details = Array.from(document.querySelectorAll(selectors.carDetailsItem));
                    for (const detail of details) {
                        if (!detail) continue;
                        const cols = detail.querySelectorAll(selectors.carDetailsCol);
                        for (const col of cols) {
                            if (!col) continue;
                            const labelSpan = col.querySelector('span:first-child');
                            if (!labelSpan || !labelSpan.textContent) continue;
                            
                            const label = labelSpan.textContent.trim();
                            const value = col.querySelector('.txt');
                            if (label === 'Mileage' && value && value.textContent) {
                                // Возвращаем исходное значение без парсинга
                                return value.textContent.trim();
                            }
                        }
                    }
                    
                    // Fallback на .yrkms
                    const kmEl = document.querySelector(selectors.mileageLast);
                    if (kmEl && kmEl.textContent) {
                        // Возвращаем исходное значение без парсинга
                        return kmEl.textContent.trim();
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            });
            return result || '0';
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения kilometers:`, error.message);
            return '0';
        }
    }

    /**
     * Извлечение местоположения
     */
    async extractLocation(page) {
        if (!page) return "Не указано";
        
        try {
            const result = await page.evaluate(() => {
                try {
                    // Ищем location в user-details
                    const locationEl = document.querySelector(selectors.locationUserDetails);
                    if (locationEl && locationEl.textContent) {
                        return locationEl.textContent.trim();
                    }
                    
                    // Fallback на .cincitymn
                    const locationEl2 = document.querySelector(selectors.locationCincitymn);
                    if (locationEl2 && locationEl2.textContent) {
                        return locationEl2.textContent.trim();
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            }, this.selectors);
            return result || "Не указано";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения location:`, error.message);
            return "Не указано";
        }
    }

    /**
     * Извлечение имени продавца
     */
    async extractSellerName(page) {
        if (!page) return "Не указано";
        
        try {
            const result = await page.evaluate((selectors) => {
                try {
                    const sellerEl = document.querySelector(selectors.sellerNameUserDetails);
                    if (sellerEl && sellerEl.textContent) {
                        return sellerEl.textContent.trim();
                    }
                    
                    // Fallback на user-name
                    const sellerEl2 = document.querySelector(selectors.sellerName);
                    if (sellerEl2 && sellerEl2.textContent) {
                        return sellerEl2.textContent.trim();
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            }, this.selectors);
            return result || "Не указано";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения sellerName:`, error.message);
            return "Не указано";
        }
    }

    /**
     * Извлечение типа продавца
     */
    async extractSellerType(page) {
        if (!page) return "Частное лицо";
        
        try {
            const result = await page.evaluate((selectors) => {
                try {
                    // Проверяем, есть ли логотип в user-details - значит дилер
                    const hasLogo = document.querySelector(selectors.sellerLogoUserDetails) || document.querySelector(selectors.sellerLogo);
                    if (hasLogo) {
                        return 'Dealer';
                    }
                    
                    // Проверяем название - если есть "Private" значит частное лицо
                    const name = document.querySelector(selectors.sellerNameUserDetails);
                    if (name && name.textContent && name.textContent.toLowerCase().includes('private')) {
                        return 'Private';
                    }
                    
                    return hasLogo ? 'Dealer' : 'Private';
                } catch (e) {
                    return 'Private';
                }
            });
            return result || "Частное лицо";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения sellerType:`, error.message);
            return "Частное лицо";
        }
    }

    /**
     * Извлечение логотипа продавца
     */
    async extractSellerLogo(page) {
        if (!page) return null;
        
        try {
            const result = await page.evaluate(() => {
                try {
                    const logoEl = document.querySelector(selectors.sellerLogoUserDetails);
                    if (logoEl && logoEl.src && logoEl.src.startsWith('http')) {
                        return logoEl.src;
                    }
                    
                    // Fallback на .image-user img
                    const logoEl2 = document.querySelector(selectors.sellerLogo);
                    if (logoEl2 && logoEl2.src && logoEl2.src.startsWith('http')) {
                        return logoEl2.src;
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            });
            return result || null;
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения sellerLogo:`, error.message);
            return null;
        }
    }

    /**
     * Извлечение телефона
     */
    async extractPhone(page) {
        if (!page) return "Не указан";
        
        try {
            const result = await page.evaluate(() => {
                try {
                    // Некоторые объявления показывают телефон в WhatsApp сообщении
                    const descEl = document.querySelector(selectors.carDesc);
                    if (descEl && descEl.textContent) {
                        const text = descEl.textContent;
                        const phoneMatch = text.match(/\+?\d{1,3}[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/);
                        if (phoneMatch && phoneMatch[0]) {
                            return phoneMatch[0];
                        }
                    }
                    
                    // Пытаемся найти в href ссылки
                    const callEl = document.querySelector(selectors.phoneShowNumber);
                    if (callEl && callEl.href) {
                        return callEl.href.replace('tel:', '');
                    }
                    
                    return null;
                } catch (e) {
                    return null;
                }
            });
            return result || "Не указан";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения phone:`, error.message);
            return "Не указан";
        }
    }

    /**
     * Извлечение фото
     */
    async extractPhotos(page) {
        if (!page) return [];
        
        try {
            const result = await page.evaluate((selectors) => {
                try {
                    // Извлекаем ссылки на изображения из lightgallery
                    const galleryImages = Array.from(document.querySelectorAll(selectors.galleryImages));
                    const photos = galleryImages.map(link => {
                        if (!link) return null;
                        
                        const href = link.getAttribute('href');
                        if (href && href.startsWith('http')) {
                            return href;
                        }
                        // Попробуем взять из img внутри
                        const img = link.querySelector('img');
                        if (img) {
                            const src = img.getAttribute('data-src') || img.src;
                            return src && src.startsWith('http') ? src : null;
                        }
                        return null;
                    }).filter(Boolean);
                    
                    // Если не нашли в gallery, пробуем взять из thumbnail
                    if (photos.length === 0) {
                        const thumbImages = Array.from(document.querySelectorAll(selectors.thumbnailImages));
                        const thumbPhotos = thumbImages.map(img => {
                            if (!img) return null;
                            const src = img.getAttribute('src') || img.src;
                            return src && src.startsWith('http') ? src : null;
                        }).filter(Boolean);
                        return Array.from(new Set(thumbPhotos));
                    }
                    
                    return Array.from(new Set(photos));
                } catch (e) {
                    return [];
                }
            });
            return result || [];
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения photos:`, error.message);
            return [];
        }
    }

    /**
     * Вспомогательные методы для типов
     */
    async extractBodyType(page) {
        if (!page) return "Не указано";
        
        try {
            const result = await page.evaluate(() => {
                try {
                    const details = Array.from(document.querySelectorAll(selectors.carDetailsItem));
                    for (const detail of details) {
                        if (!detail) continue;
                        const cols = detail.querySelectorAll(selectors.carDetailsCol);
                        for (const col of cols) {
                            if (!col) continue;
                            const labelSpan = col.querySelector('span:first-child');
                            if (!labelSpan || !labelSpan.textContent) continue;
                            
                            const label = labelSpan.textContent.trim();
                            if (label === 'Body Type') {
                                const spans = col.querySelectorAll('span');
                                if (spans.length > 1 && spans[1].textContent) {
                                    return spans[1].textContent.trim();
                                }
                            }
                        }
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            }, this.selectors);
            return result || "Не указано";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения bodyType:`, error.message);
            return "Не указано";
        }
    }

    async extractFuelType(page) {
        if (!page) return "Не указано";
        
        try {
            const result = await page.evaluate((selectors) => {
                try {
                    const details = Array.from(document.querySelectorAll(selectors.carDetailsItem));
                    for (const detail of details) {
                        if (!detail) continue;
                        const cols = detail.querySelectorAll(selectors.carDetailsCol);
                        for (const col of cols) {
                            if (!col) continue;
                            const labelSpan = col.querySelector('span:first-child');
                            if (!labelSpan || !labelSpan.textContent) continue;
                            
                            const label = labelSpan.textContent.trim();
                            if (label === 'Fuel Type') {
                                const spans = col.querySelectorAll('span');
                                if (spans.length > 1 && spans[1].textContent) {
                                    return spans[1].textContent.trim();
                                }
                            }
                        }
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            });
            return result || "Не указано";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения fuelType:`, error.message);
            return "Не указано";
        }
    }

    async extractTransmission(page) {
        // Autotraders не показывает transmission на детальной странице
        return "Не указано";
    }

    async extractColor(page) {
        if (!page) return "Не указано";
        
        try {
            const result = await page.evaluate(() => {
                try {
                    const details = Array.from(document.querySelectorAll(selectors.carDetailsItem));
                    for (const detail of details) {
                        if (!detail) continue;
                        const cols = detail.querySelectorAll(selectors.carDetailsCol);
                        for (const col of cols) {
                            if (!col) continue;
                            const labelSpan = col.querySelector('span:first-child');
                            if (!labelSpan || !labelSpan.textContent) continue;
                            
                            const label = labelSpan.textContent.trim();
                            if (label === 'Exterior Color') {
                                const spans = col.querySelectorAll('span');
                                if (spans.length > 1 && spans[1].textContent) {
                                    return spans[1].textContent.trim();
                                }
                            }
                        }
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            }, this.selectors);
            return result || "Не указано";
        } catch (error) {
            console.warn(`⚠️ Ошибка извлечения color:`, error.message);
            return "Не указано";
        }
    }

    /**
     * Выбор первого непустого значения из объекта
     */
    pick(map, keys, def = null) {
        for (const k of keys) {
            if (map[k] != null) return map[k];
        }
        return def;
    }
}

module.exports = { AutotradersDetailParser };
