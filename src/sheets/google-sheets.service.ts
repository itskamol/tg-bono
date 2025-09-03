import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { Order, Order_Product, Payment, PaymentType } from '@prisma/client';
import { formatCurrency } from 'src/utils/format.utils';

@Injectable()
export class GoogleSheetsService {
    private readonly logger = new Logger(GoogleSheetsService.name);

    private getAuth(credentials: string) {
        const creds = JSON.parse(credentials);
        return new google.auth.GoogleAuth({
            credentials: {
                client_email: creds.client_email,
                private_key: creds.private_key,
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
    }

    private async getSheetsClient(credentials: string) {
        const auth = this.getAuth(credentials);
        const authClient = await auth.getClient();
        return google.sheets({ auth: authClient as any, version: 'v4' });
    }

    async appendData(
        sheetId: string,
        credentials: string,
        dataObjects: any[], // Array of objects
        worksheetName: string,
    ) {
        if (!dataObjects || dataObjects.length === 0) {
            this.logger.warn('No data provided to append.');
            return false;
        }

        try {
            this.logger.log(
                `Starting Google Sheets append operation. Sheet ID: ${sheetId}, Worksheet: ${worksheetName}, Data count: ${dataObjects.length}`,
            );

            const sheets = await this.getSheetsClient(credentials);
            this.logger.log('Google Sheets client created successfully');

            // 1. Check if the worksheet exists
            this.logger.log('Checking if spreadsheet exists...');
            const spreadsheet = await sheets.spreadsheets.get({
                spreadsheetId: sheetId,
            });

            this.logger.log(
                `Spreadsheet found. Available sheets: ${spreadsheet.data.sheets.map((s) => s.properties.title).join(', ')}`,
            );

            const sheetExists = spreadsheet.data.sheets.some(
                (s) => s.properties.title === worksheetName,
            );

            const headers = Object.keys(dataObjects[0]);
            this.logger.log(`Data headers: ${headers.join(', ')}`);

            // 2. Create it if it doesn't exist, and add headers
            if (!sheetExists) {
                this.logger.log(`Worksheet "${worksheetName}" not found. Creating it...`);
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId: sheetId,
                    requestBody: {
                        requests: [
                            {
                                addSheet: {
                                    properties: { title: worksheetName },
                                },
                            },
                        ],
                    },
                });
                this.logger.log(`Worksheet "${worksheetName}" created successfully`);

                this.logger.log('Adding headers to new worksheet...');
                await sheets.spreadsheets.values.append({
                    spreadsheetId: sheetId,
                    range: `${worksheetName}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: [headers],
                    },
                });
                this.logger.log('Headers added successfully');
            } else {
                this.logger.log(`Worksheet "${worksheetName}" already exists`);
            }

            // 3. Convert data and append
            this.logger.log('Converting data for append...');
            const values = dataObjects.map((obj) => headers.map((header) => obj[header] || ''));
            this.logger.log(`Converted ${values.length} rows of data`);

            this.logger.log('Appending data to worksheet...');
            const result = await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: `${worksheetName}!A1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: values,
                },
            });

            this.logger.log(
                `${result.data.updates.updatedCells} cells appended to "${worksheetName}".`,
            );
            return true;
        } catch (error) {
            this.logger.error('Failed to write to Google Sheets:', error);
            this.logger.error('Error details:', error.message);
            this.logger.error('Error stack:', error.stack);

            // Log specific error for debugging
            if (
                error.code === 403 &&
                error.message?.includes('Google Sheets API has not been used')
            ) {
                this.logger.error(
                    'Google Sheets API is disabled. User needs to enable it in Google Cloud Console.',
                );
            } else if (error.code === 403 && error.message?.includes('does not have permission')) {
                this.logger.error(
                    'Google Sheets permission denied. Service Account needs access to the sheet.',
                );
            }

            return false;
        }
    }

    // Order ma'lumotlarini Google Sheets formatiga o'tkazish
    formatOrdersForSheets(
        orders: (Order & {
            branch: { name: string };
            cashier: { full_name: string };
            order_products: Order_Product[];
            payments: Payment[];
        })[],
    ): any[] {
        const formattedData = [];

        for (const order of orders) {
            // Har bir order uchun asosiy ma'lumotlar
            const baseOrderData = {
                'Order Number': order.order_number,
                'Client Name': order.client_name,
                'Client Phone': order.client_phone || 'N/A',
                'Client Birthday': order.client_birthday
                    ? order.client_birthday.toLocaleDateString('uz-UZ')
                    : 'N/A',
                Branch: order.branch.name,
                Cashier: order.cashier.full_name,
                'Total Amount': order.total_amount,
                'Order Date': order.created_at.toLocaleString('uz-UZ'),
            };

            // Mahsulotlar ma'lumotlari
            const productsInfo = order.order_products
                .map(
                    (product, index) =>
                        `${index + 1}. ${product.product_name} (${product.category}) - ${product.side_name} - ${product.quantity}x${product.price} = ${formatCurrency(product.quantity * product.price)}`,
                )
                .join(' | ');

            // To'lovlar ma'lumotlari
            const paymentsInfo = order.payments
                .map((payment, index) => {
                    const paymentTypeName = this.getPaymentTypeName(payment.payment_type);
                    return `${index + 1}. ${paymentTypeName}: ${formatCurrency(payment.amount)}`;
                })
                .join(' | ');

            // Bitta qatorda barcha ma'lumotlar
            formattedData.push({
                ...baseOrderData,
                Products: productsInfo,
                Payments: paymentsInfo,
                'Products Count': order.order_products.length,
                'Payments Count': order.payments.length,
            });
        }

        return formattedData;
    }

    // Har bir mahsulot uchun alohida qator (batafsil format)
    formatOrdersDetailedForSheets(
        orders: (Order & {
            branch: { name: string };
            cashier: { full_name: string };
            order_products: Order_Product[];
            payments: Payment[];
        })[],
    ): any[] {
        const formattedData = [];

        for (const order of orders) {
            // Har bir mahsulot uchun alohida qator
            for (let i = 0; i < order.order_products.length; i++) {
                const product = order.order_products[i];

                // Faqat birinchi mahsulot uchun order ma'lumotlarini ko'rsatish
                const orderInfo =
                    i === 0
                        ? {
                              'Order Number': order.order_number,
                              'Client Name': order.client_name,
                              'Client Phone': order.client_phone || 'N/A',
                              'Client Birthday': order.client_birthday
                                  ? order.client_birthday.toLocaleDateString('uz-UZ')
                                  : 'N/A',
                              Branch: order.branch.name,
                              Cashier: order.cashier.full_name,
                              'Total Amount': order.total_amount,
                              'Order Date': order.created_at.toLocaleString('uz-UZ'),
                              Payments: order.payments
                                  .map((payment, index) => {
                                      const paymentTypeName = this.getPaymentTypeName(
                                          payment.payment_type,
                                      );
                                      return `${index + 1}. ${paymentTypeName}: ${formatCurrency(payment.amount)}`;
                                  })
                                  .join(' | '),
                          }
                        : {
                              'Order Number': '',
                              'Client Name': '',
                              'Client Phone': '',
                              'Client Birthday': '',
                              Branch: '',
                              Cashier: '',
                              'Total Amount': '',
                              'Order Date': '',
                              Payments: '',
                          };

                formattedData.push({
                    ...orderInfo,
                    'Product Name': product.product_name,
                    Category: product.category,
                    Side: product.side_name,
                    Quantity: product.quantity,
                    'Unit Price': product.price,
                    'Total Price': product.quantity * product.price,
                });
            }

            // Agar mahsulot yo'q bo'lsa, faqat order ma'lumotlarini qo'shish
            if (order.order_products.length === 0) {
                formattedData.push({
                    'Order Number': order.order_number,
                    'Client Name': order.client_name,
                    'Client Phone': order.client_phone || 'N/A',
                    'Client Birthday': order.client_birthday
                        ? order.client_birthday.toLocaleDateString('uz-UZ')
                        : 'N/A',
                    Branch: order.branch.name,
                    Cashier: order.cashier.full_name,
                    'Total Amount': order.total_amount,
                    'Order Date': order.created_at.toLocaleString('uz-UZ'),
                    Payments: order.payments
                        .map((payment, index) => {
                            const paymentTypeName = this.getPaymentTypeName(payment.payment_type);
                            return `${index + 1}. ${paymentTypeName}: ${formatCurrency(payment.amount)}`;
                        })
                        .join(' | '),
                    'Product Name': 'N/A',
                    Category: 'N/A',
                    Side: 'N/A',
                    Quantity: 0,
                    'Unit Price': 0,
                    'Total Price': 0,
                });
            }
        }

        return formattedData;
    }

    private getPaymentTypeName(paymentType: PaymentType): string {
        const names = {
            [PaymentType.CASH]: 'Naqd',
            [PaymentType.CARD]: 'Karta',
            [PaymentType.TRANSFER]: "O'tkazma",
        };
        return names[paymentType] || paymentType;
    }

    // Orders'ni Google Sheets'ga yozish (umumiy format)
    async appendOrdersToSheet(
        sheetId: string,
        credentials: string,
        orders: (Order & {
            branch: { name: string };
            cashier: { full_name: string };
            order_products: Order_Product[];
            payments: Payment[];
        })[],
        worksheetName: string = 'Orders',
        detailed: boolean = false,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const formattedData = detailed
                ? this.formatOrdersDetailedForSheets(orders)
                : this.formatOrdersForSheets(orders);

            const success = await this.appendData(
                sheetId,
                credentials,
                formattedData,
                worksheetName,
            );

            if (success) {
                return { success: true };
            } else {
                return {
                    success: false,
                    error: "Ma'lumotlarni Google Sheets ga yozishda xatolik yuz berdi.",
                };
            }
        } catch (error) {
            this.logger.error('Failed to append orders to Google Sheets:', error);

            // API disabled error
            if (
                error.code === 403 &&
                error.message?.includes('Google Sheets API has not been used')
            ) {
                const projectId = error.message.match(/project (\d+)/)?.[1];
                return {
                    success: false,
                    error: `Google Sheets API o'chirilgan.\n\nLoyiha ID: ${projectId}\n\nYechim: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${projectId} ga kirib API ni yoqing.`,
                };
            }

            // Permission denied
            if (error.code === 403 && error.message?.includes('does not have permission')) {
                return {
                    success: false,
                    error: `Google Sheet ga kirish ruxsati yo'q.\n\n🔧 Yechim:\n1. Google Sheet ni oching: https://docs.google.com/spreadsheets/d/${sheetId}\n\n2. "Share" tugmasini bosing\n\n3. Service Account email ni qo'shing va "Editor" ruxsati bering\n\n4. Yoki Sheet ni "Anyone with the link can edit" qilib ochiq qiling\n\n💡 Service Account email odatda "...@....iam.gserviceaccount.com" ko'rinishida bo'ladi`,
                };
            }

            return {
                success: false,
                error: `Google Sheets xatosi: ${error.message || "Noma'lum xatolik"}`,
            };
        }
    }

    // Google Sheets ulanishini tekshirish
    async testConnection(
        sheetId: string,
        credentials: string,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const sheets = await this.getSheetsClient(credentials);

            // Try to get spreadsheet info to test connection
            await sheets.spreadsheets.get({
                spreadsheetId: sheetId,
            });

            this.logger.log('Google Sheets connection test successful');
            return { success: true };
        } catch (error) {
            this.logger.error('Google Sheets connection test failed:', error);

            // API disabled error
            if (
                error.code === 403 &&
                error.message?.includes('Google Sheets API has not been used')
            ) {
                const projectId = error.message.match(/project (\d+)/)?.[1];
                return {
                    success: false,
                    error: `Google Sheets API o'chirilgan yoki yoqilmagan.\n\n📋 Loyiha ID: ${projectId}\n\n🔧 Yechim:\n1. Quyidagi havolaga kiring:\nhttps://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=${projectId}\n\n2. "Enable" tugmasini bosing\n\n3. Bir necha daqiqa kuting\n\n4. Qaytadan urinib ko'ring`,
                };
            }

            // Invalid credentials
            if (error.code === 401 || error.message?.includes('invalid_grant')) {
                return {
                    success: false,
                    error: "Service Account JSON noto'g'ri yoki muddati tugagan. Yangi Service Account yarating va qaytadan urinib ko'ring.",
                };
            }

            // Sheet not found
            if (error.code === 404) {
                return {
                    success: false,
                    error: 'Google Sheet topilmadi. Sheet ID ni tekshiring yoki Sheet ni ochiq (public) qiling.',
                };
            }

            // Permission denied
            if (error.code === 403 && !error.message?.includes('API has not been used')) {
                return {
                    success: false,
                    error: `Google Sheet ga kirish ruxsati yo'q.\n\n🔧 Yechim:\n1. Google Sheet ni oching: https://docs.google.com/spreadsheets/d/${sheetId}\n\n2. "Share" tugmasini bosing\n\n3. Service Account email ni qo'shing va "Editor" ruxsati bering\n\n4. Yoki Sheet ni "Anyone with the link can edit" qilib ochiq qiling\n\n💡 Service Account email odatda "...@....iam.gserviceaccount.com" ko'rinishida bo'ladi`,
                };
            }

            // Generic error
            return {
                success: false,
                error: `Ulanish xatosi: ${error.message || "Noma'lum xatolik"}`,
            };
        }
    }

    async writeOrderToSheet(orderData: any) {
        try {
            this.logger.log(`Writing order ${orderData.orderNumber} to Google Sheets`);

            // Order ma'lumotlarini Google Sheets formatiga o'tkazish
            const rowData = [
                orderData.orderNumber,
                orderData.clientName,
                orderData.clientPhone,
                orderData.branchName,
                orderData.cashierName,
                orderData.totalAmount,
                new Date(orderData.createdAt).toLocaleString('uz-UZ'),
                orderData.products.map(p => `${p.productName} (${p.quantity}x)`).join(', '),
                orderData.products.map(p => p.category).join(', '),
            ];

            // Bu method faqat ma'lumotni tayyorlaydi
            // Haqiqiy yozish appendData method orqali amalga oshiriladi
            this.logger.log(`Order ${orderData.orderNumber} data prepared for Google Sheets`);
            
            return {
                success: true,
                data: rowData,
            };
        } catch (error) {
            this.logger.error(`Error preparing order ${orderData.orderNumber} for Google Sheets:`, error);
            throw error;
        }
    }
}
