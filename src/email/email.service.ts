import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Order, Order_Product, Payment, PaymentType } from '@prisma/client';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);

    private createTransporter(emailConfig: any) {
        return nodemailer.createTransport({
            host: emailConfig.host,
            port: emailConfig.port,
            secure: emailConfig.secure,
            auth: {
                user: emailConfig.auth.user,
                pass: emailConfig.auth.pass,
            },
        });
    }

    async sendOrdersReport(
        emailConfig: any,
        orders: (Order & {
            branch: { name: string };
            cashier: { full_name: string };
            order_products: Order_Product[];
            payments: Payment[];
        })[],
        subject: string = 'Buyurtmalar hisoboti',
        detailed: boolean = false
    ): Promise<boolean> {
        try {
            const transporter = this.createTransporter(emailConfig);

            const htmlContent = detailed 
                ? this.generateDetailedOrdersHTML(orders)
                : this.generateOrdersHTML(orders);

            const csvContent = detailed
                ? this.generateDetailedOrdersCSV(orders)
                : this.generateOrdersCSV(orders);

            const mailOptions = {
                from: emailConfig.auth.user,
                to: emailConfig.recipient,
                subject: subject,
                html: htmlContent,
                attachments: [
                    {
                        filename: `buyurtmalar_${new Date().toISOString().split('T')[0]}.csv`,
                        content: csvContent,
                        contentType: 'text/csv; charset=utf-8'
                    }
                ]
            };

            const result = await transporter.sendMail(mailOptions);
            this.logger.log(`Email sent successfully: ${result.messageId}`);
            return true;
        } catch (error) {
            this.logger.error('Failed to send email:', error);
            return false;
        }
    }

    private generateOrdersHTML(orders: (Order & {
        branch: { name: string };
        cashier: { full_name: string };
        order_products: Order_Product[];
        payments: Payment[];
    })[]): string {
        const totalAmount = orders.reduce((sum, order) => sum + order.total_amount, 0);
        const totalOrders = orders.length;

        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
                .summary { background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; font-weight: bold; }
                .order-row { background-color: #f9f9f9; }
                .amount { font-weight: bold; color: #2e7d32; }
                .footer { margin-top: 30px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📋 Buyurtmalar Hisoboti</h1>
                <p><strong>Sana:</strong> ${new Date().toLocaleString('uz-UZ')}</p>
            </div>

            <div class="summary">
                <h2>📊 Umumiy Ma'lumotlar</h2>
                <p><strong>Jami buyurtmalar:</strong> ${totalOrders} ta</p>
                <p><strong>Jami summa:</strong> <span class="amount">${totalAmount.toLocaleString()} so'm</span></p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>№</th>
                        <th>Buyurtma raqami</th>
                        <th>Mijoz</th>
                        <th>Telefon</th>
                        <th>Filial</th>
                        <th>Kassir</th>
                        <th>Mahsulotlar</th>
                        <th>To'lovlar</th>
                        <th>Jami summa</th>
                        <th>Sana</th>
                    </tr>
                </thead>
                <tbody>
        `;

        orders.forEach((order, index) => {
            const productsInfo = order.order_products.map((product, i) => 
                `${i + 1}. ${product.product_name} (${product.side_name}) - ${product.quantity}x${product.price} = ${(product.quantity * product.price).toLocaleString()} so'm`
            ).join('<br>');

            const paymentsInfo = order.payments.map((payment, i) => {
                const paymentTypeName = this.getPaymentTypeName(payment.payment_type);
                return `${i + 1}. ${paymentTypeName}: ${payment.amount.toLocaleString()} so'm`;
            }).join('<br>');

            html += `
                <tr class="order-row">
                    <td>${index + 1}</td>
                    <td><strong>${order.order_number}</strong></td>
                    <td>${order.client_name}</td>
                    <td>${order.client_phone || 'N/A'}</td>
                    <td>${order.branch.name}</td>
                    <td>${order.cashier.full_name}</td>
                    <td>${productsInfo}</td>
                    <td>${paymentsInfo}</td>
                    <td class="amount">${order.total_amount.toLocaleString()} so'm</td>
                    <td>${order.created_at.toLocaleString('uz-UZ')}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>

            <div class="footer">
                <p>Bu hisobot avtomatik tarzda yaratilgan. Sana: ${new Date().toLocaleString('uz-UZ')}</p>
            </div>
        </body>
        </html>
        `;

        return html;
    }

    private generateDetailedOrdersHTML(orders: (Order & {
        branch: { name: string };
        cashier: { full_name: string };
        order_products: Order_Product[];
        payments: Payment[];
    })[]): string {
        const totalAmount = orders.reduce((sum, order) => sum + order.total_amount, 0);
        const totalOrders = orders.length;
        const totalProducts = orders.reduce((sum, order) => sum + order.order_products.length, 0);

        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { background-color: #f4f4f4; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
                .summary { background-color: #e8f5e9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; font-weight: bold; }
                .order-header { background-color: #e3f2fd; font-weight: bold; }
                .product-row { background-color: #f9f9f9; }
                .amount { font-weight: bold; color: #2e7d32; }
                .footer { margin-top: 30px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>📋 Batafsil Buyurtmalar Hisoboti</h1>
                <p><strong>Sana:</strong> ${new Date().toLocaleString('uz-UZ')}</p>
            </div>

            <div class="summary">
                <h2>📊 Umumiy Ma'lumotlar</h2>
                <p><strong>Jami buyurtmalar:</strong> ${totalOrders} ta</p>
                <p><strong>Jami mahsulotlar:</strong> ${totalProducts} ta</p>
                <p><strong>Jami summa:</strong> <span class="amount">${totalAmount.toLocaleString()} so'm</span></p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Buyurtma raqami</th>
                        <th>Mijoz</th>
                        <th>Telefon</th>
                        <th>Filial</th>
                        <th>Kassir</th>
                        <th>Mahsulot</th>
                        <th>Kategoriya</th>
                        <th>Side</th>
                        <th>Miqdor</th>
                        <th>Narx</th>
                        <th>Jami</th>
                        <th>To'lovlar</th>
                        <th>Sana</th>
                    </tr>
                </thead>
                <tbody>
        `;

        orders.forEach((order) => {
            const paymentsInfo = order.payments.map((payment, i) => {
                const paymentTypeName = this.getPaymentTypeName(payment.payment_type);
                return `${i + 1}. ${paymentTypeName}: ${payment.amount.toLocaleString()} so'm`;
            }).join('<br>');

            order.order_products.forEach((product, productIndex) => {
                const isFirstProduct = productIndex === 0;
                
                html += `
                    <tr class="${isFirstProduct ? 'order-header' : 'product-row'}">
                        <td>${isFirstProduct ? order.order_number : ''}</td>
                        <td>${isFirstProduct ? order.client_name : ''}</td>
                        <td>${isFirstProduct ? (order.client_phone || 'N/A') : ''}</td>
                        <td>${isFirstProduct ? order.branch.name : ''}</td>
                        <td>${isFirstProduct ? order.cashier.full_name : ''}</td>
                        <td>${product.product_name}</td>
                        <td>${product.category}</td>
                        <td>${product.side_name}</td>
                        <td>${product.quantity}</td>
                        <td>${product.price.toLocaleString()} so'm</td>
                        <td class="amount">${(product.quantity * product.price).toLocaleString()} so'm</td>
                        <td>${isFirstProduct ? paymentsInfo : ''}</td>
                        <td>${isFirstProduct ? order.created_at.toLocaleString('uz-UZ') : ''}</td>
                    </tr>
                `;
            });

            // Agar mahsulot yo'q bo'lsa
            if (order.order_products.length === 0) {
                html += `
                    <tr class="order-header">
                        <td>${order.order_number}</td>
                        <td>${order.client_name}</td>
                        <td>${order.client_phone || 'N/A'}</td>
                        <td>${order.branch.name}</td>
                        <td>${order.cashier.full_name}</td>
                        <td>Mahsulot yo'q</td>
                        <td>-</td>
                        <td>-</td>
                        <td>0</td>
                        <td>0 so'm</td>
                        <td class="amount">0 so'm</td>
                        <td>${paymentsInfo}</td>
                        <td>${order.created_at.toLocaleString('uz-UZ')}</td>
                    </tr>
                `;
            }
        });

        html += `
                </tbody>
            </table>

            <div class="footer">
                <p>Bu batafsil hisobot avtomatik tarzda yaratilgan. Sana: ${new Date().toLocaleString('uz-UZ')}</p>
            </div>
        </body>
        </html>
        `;

        return html;
    }

    private generateOrdersCSV(orders: (Order & {
        branch: { name: string };
        cashier: { full_name: string };
        order_products: Order_Product[];
        payments: Payment[];
    })[]): string {
        const headers = [
            'Buyurtma raqami',
            'Mijoz ismi',
            'Telefon',
            'Tug\'ilgan kun',
            'Filial',
            'Kassir',
            'Jami summa',
            'Buyurtma sanasi',
            'Mahsulotlar',
            'To\'lovlar',
            'Mahsulotlar soni',
            'To\'lovlar soni'
        ];

        let csv = headers.join(',') + '\n';

        orders.forEach((order) => {
            const productsInfo = order.order_products.map((product, index) => 
                `${index + 1}. ${product.product_name} (${product.category}) - ${product.side_name} - ${product.quantity}x${product.price} = ${product.quantity * product.price} so'm`
            ).join(' | ');

            const paymentsInfo = order.payments.map((payment, index) => {
                const paymentTypeName = this.getPaymentTypeName(payment.payment_type);
                return `${index + 1}. ${paymentTypeName}: ${payment.amount} so'm`;
            }).join(' | ');

            const row = [
                `"${order.order_number}"`,
                `"${order.client_name}"`,
                `"${order.client_phone || 'N/A'}"`,
                `"${order.client_birthday ? order.client_birthday.toLocaleDateString('uz-UZ') : 'N/A'}"`,
                `"${order.branch.name}"`,
                `"${order.cashier.full_name}"`,
                order.total_amount,
                `"${order.created_at.toLocaleString('uz-UZ')}"`,
                `"${productsInfo}"`,
                `"${paymentsInfo}"`,
                order.order_products.length,
                order.payments.length
            ];

            csv += row.join(',') + '\n';
        });

        return csv;
    }

    private generateDetailedOrdersCSV(orders: (Order & {
        branch: { name: string };
        cashier: { full_name: string };
        order_products: Order_Product[];
        payments: Payment[];
    })[]): string {
        const headers = [
            'Buyurtma raqami',
            'Mijoz ismi',
            'Telefon',
            'Tug\'ilgan kun',
            'Filial',
            'Kassir',
            'Jami summa',
            'Buyurtma sanasi',
            'To\'lovlar',
            'Mahsulot nomi',
            'Kategoriya',
            'Side',
            'Miqdor',
            'Birlik narxi',
            'Jami narx'
        ];

        let csv = headers.join(',') + '\n';

        orders.forEach((order) => {
            const paymentsInfo = order.payments.map((payment, index) => {
                const paymentTypeName = this.getPaymentTypeName(payment.payment_type);
                return `${index + 1}. ${paymentTypeName}: ${payment.amount} so'm`;
            }).join(' | ');

            order.order_products.forEach((product, productIndex) => {
                const isFirstProduct = productIndex === 0;
                
                const row = [
                    isFirstProduct ? `"${order.order_number}"` : '""',
                    isFirstProduct ? `"${order.client_name}"` : '""',
                    isFirstProduct ? `"${order.client_phone || 'N/A'}"` : '""',
                    isFirstProduct ? `"${order.client_birthday ? order.client_birthday.toLocaleDateString('uz-UZ') : 'N/A'}"` : '""',
                    isFirstProduct ? `"${order.branch.name}"` : '""',
                    isFirstProduct ? `"${order.cashier.full_name}"` : '""',
                    isFirstProduct ? order.total_amount : '""',
                    isFirstProduct ? `"${order.created_at.toLocaleString('uz-UZ')}"` : '""',
                    isFirstProduct ? `"${paymentsInfo}"` : '""',
                    `"${product.product_name}"`,
                    `"${product.category}"`,
                    `"${product.side_name}"`,
                    product.quantity,
                    product.price,
                    product.quantity * product.price
                ];

                csv += row.join(',') + '\n';
            });

            // Agar mahsulot yo'q bo'lsa
            if (order.order_products.length === 0) {
                const row = [
                    `"${order.order_number}"`,
                    `"${order.client_name}"`,
                    `"${order.client_phone || 'N/A'}"`,
                    `"${order.client_birthday ? order.client_birthday.toLocaleDateString('uz-UZ') : 'N/A'}"`,
                    `"${order.branch.name}"`,
                    `"${order.cashier.full_name}"`,
                    order.total_amount,
                    `"${order.created_at.toLocaleString('uz-UZ')}"`,
                    `"${paymentsInfo}"`,
                    '"Mahsulot yo\'q"',
                    '"-"',
                    '"-"',
                    0,
                    0,
                    0
                ];

                csv += row.join(',') + '\n';
            }
        });

        return csv;
    }

    private getPaymentTypeName(paymentType: PaymentType): string {
        const names = {
            [PaymentType.CASH]: 'Naqd',
            [PaymentType.CARD]: 'Karta',
            [PaymentType.TRANSFER]: "O'tkazma",
        };
        return names[paymentType] || paymentType;
    }

    async testConnection(emailConfig: any): Promise<boolean> {
        try {
            const transporter = this.createTransporter(emailConfig);
            await transporter.verify();
            this.logger.log('Email connection test successful');
            return true;
        } catch (error) {
            this.logger.error('Email connection test failed:', error);
            return false;
        }
    }
}