import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { Order, Order_Product, Payment, PaymentType } from '@prisma/client';

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
            const sheets = await this.getSheetsClient(credentials);

            // 1. Check if the worksheet exists
            const spreadsheet = await sheets.spreadsheets.get({
                spreadsheetId: sheetId,
            });
            const sheetExists = spreadsheet.data.sheets.some(
                (s) => s.properties.title === worksheetName,
            );

            const headers = Object.keys(dataObjects[0]);

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

                await sheets.spreadsheets.values.append({
                    spreadsheetId: sheetId,
                    range: `${worksheetName}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: [headers],
                    },
                });
            }

            // 3. Convert data and append
            const values = dataObjects.map((obj) => headers.map((header) => obj[header]));

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
            return false;
        }
    }

    // Order ma'lumotlarini Google Sheets formatiga o'tkazish
    formatOrdersForSheets(orders: (Order & {
        branch: { name: string };
        cashier: { full_name: string };
        order_products: Order_Product[];
        payments: Payment[];
    })[]): any[] {
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
                'Branch': order.branch.name,
                'Cashier': order.cashier.full_name,
                'Total Amount': order.total_amount,
                'Order Date': order.created_at.toLocaleString('uz-UZ'),
            };

            // Mahsulotlar ma'lumotlari
            const productsInfo = order.order_products.map((product, index) => 
                `${index + 1}. ${product.product_name} (${product.category}) - ${product.side_name} - ${product.quantity}x${product.price} = ${product.quantity * product.price} so'm`
            ).join(' | ');

            // To'lovlar ma'lumotlari
            const paymentsInfo = order.payments.map((payment, index) => {
                const paymentTypeName = this.getPaymentTypeName(payment.payment_type);
                return `${index + 1}. ${paymentTypeName}: ${payment.amount} so'm`;
            }).join(' | ');

            // Bitta qatorda barcha ma'lumotlar
            formattedData.push({
                ...baseOrderData,
                'Products': productsInfo,
                'Payments': paymentsInfo,
                'Products Count': order.order_products.length,
                'Payments Count': order.payments.length,
            });
        }

        return formattedData;
    }

    // Har bir mahsulot uchun alohida qator (batafsil format)
    formatOrdersDetailedForSheets(orders: (Order & {
        branch: { name: string };
        cashier: { full_name: string };
        order_products: Order_Product[];
        payments: Payment[];
    })[]): any[] {
        const formattedData = [];

        for (const order of orders) {
            // Har bir mahsulot uchun alohida qator
            for (let i = 0; i < order.order_products.length; i++) {
                const product = order.order_products[i];
                
                // Faqat birinchi mahsulot uchun order ma'lumotlarini ko'rsatish
                const orderInfo = i === 0 ? {
                    'Order Number': order.order_number,
                    'Client Name': order.client_name,
                    'Client Phone': order.client_phone || 'N/A',
                    'Client Birthday': order.client_birthday 
                        ? order.client_birthday.toLocaleDateString('uz-UZ') 
                        : 'N/A',
                    'Branch': order.branch.name,
                    'Cashier': order.cashier.full_name,
                    'Total Amount': order.total_amount,
                    'Order Date': order.created_at.toLocaleString('uz-UZ'),
                    'Payments': order.payments.map((payment, index) => {
                        const paymentTypeName = this.getPaymentTypeName(payment.payment_type);
                        return `${index + 1}. ${paymentTypeName}: ${payment.amount} so'm`;
                    }).join(' | '),
                } : {
                    'Order Number': '',
                    'Client Name': '',
                    'Client Phone': '',
                    'Client Birthday': '',
                    'Branch': '',
                    'Cashier': '',
                    'Total Amount': '',
                    'Order Date': '',
                    'Payments': '',
                };

                formattedData.push({
                    ...orderInfo,
                    'Product Name': product.product_name,
                    'Category': product.category,
                    'Side': product.side_name,
                    'Quantity': product.quantity,
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
                    'Branch': order.branch.name,
                    'Cashier': order.cashier.full_name,
                    'Total Amount': order.total_amount,
                    'Order Date': order.created_at.toLocaleString('uz-UZ'),
                    'Payments': order.payments.map((payment, index) => {
                        const paymentTypeName = this.getPaymentTypeName(payment.payment_type);
                        return `${index + 1}. ${paymentTypeName}: ${payment.amount} so'm`;
                    }).join(' | '),
                    'Product Name': 'N/A',
                    'Category': 'N/A',
                    'Side': 'N/A',
                    'Quantity': 0,
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
        detailed: boolean = false
    ): Promise<boolean> {
        try {
            const formattedData = detailed 
                ? this.formatOrdersDetailedForSheets(orders)
                : this.formatOrdersForSheets(orders);

            return await this.appendData(sheetId, credentials, formattedData, worksheetName);
        } catch (error) {
            this.logger.error('Failed to append orders to Google Sheets:', error);
            return false;
        }
    }
}
