import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../settings/encryption.service';
import { Telegraf } from 'telegraf';
import { InjectBot } from 'nestjs-telegraf';
import { formatCurrency } from '../utils/format.utils';
import { withRetry } from '../common/utils/retry.util';

interface OrderData {
    orderNumber: string;
    clientName: string;
    clientPhone?: string | null;
    branchName: string;
    cashierName: string;
    products: Array<{
        productName: string;
        category: string;
        sideName: string;
        quantity: number;
        price: number;
    }>;
    payments: Array<{
        paymentType: string;
        amount: number;
    }>;
    totalAmount: number;
    createdAt: Date;
}

@Injectable()
export class NotificationService {
    private readonly logger = new Logger(NotificationService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
        @InjectBot() private readonly bot: Telegraf,
    ) {}

    async sendOrderNotification(orderData: OrderData): Promise<void> {
        try {
            // Kanal sozlamalarini olish
            const channelConfig = await this.prisma.setting.findUnique({
                where: { key: 'channel_config' }
            });

            if (!channelConfig) {
                return;
            }

            // Sozlamalarni decrypt qilish
            const decryptedConfig = this.encryptionService.decrypt(channelConfig.value);
            const config = JSON.parse(decryptedConfig);

            if (!config.enabled) {
                return;
            }

            // Xabar matnini yaratish
            const message = this.formatOrderMessage(orderData);

            // Xabarni yuborish (retry bilan)
            await withRetry(
                async () => {
                    await this.bot.telegram.sendMessage(config.chatId, message, {
                        parse_mode: 'HTML',
                        link_preview_options: {
                            is_disabled: true
                        }
                    });
                },
                {
                    maxAttempts: 2,
                    delay: 1000,
                    onRetry: (attempt, error) => {
                        this.logger.warn(`Telegram notification failed, attempt ${attempt}:`, error.message);
                    }
                }
            );

        } catch (error) {
            this.logger.error('❌ Kanal/guruhga xabar yuborishda xatolik:', error);
            
            if (error instanceof Error) {
                if (error.message.includes('chat not found')) {
                    this.logger.error('💡 Kanal/Guruh topilmadi. Chat ID ni tekshiring.');
                } else if (error.message.includes('bot was blocked')) {
                    this.logger.error('💡 Bot kanaldan/guruhdan chiqarilgan.');
                } else if (error.message.includes('not enough rights')) {
                    this.logger.error('💡 Botda xabar yuborish huquqi yo\'q. Admin qiling.');
                }
            }
            // Xatolik bo'lsa ham order yaratish jarayonini to'xtatmaymiz
        }
    }

    private formatOrderMessage(orderData: OrderData): string {
        const {
            orderNumber,
            clientName,
            clientPhone,
            branchName,
            cashierName,
            products,
            payments,
            totalAmount,
            createdAt
        } = orderData;

        // Mahsulotlar ro'yxati
        const productsList = products
            .map((p, index) => {
                const categoryInfo = p.category !== 'custom' ? ` [${p.category}]` : '';
                const sideInfo = p.sideName !== 'custom' ? ` (${p.sideName})` : '';
                return `${index + 1}. ${p.quantity}x <b>${p.productName}</b>${categoryInfo}${sideInfo}\n   💰 ${formatCurrency(p.price * p.quantity)}`;
            })
            .join('\n');

        // To'lovlar ro'yxati
        const paymentsList = payments
            .map((p, index) => {
                const emoji = this.getPaymentTypeEmoji(p.paymentType);
                return `${index + 1}. ${emoji} ${this.getPaymentTypeName(p.paymentType)}: ${formatCurrency(p.amount)}`;
            })
            .join('\n');

        // Asosiy xabar
        const message = `🆕 <b>YANGI BUYURTMA</b>

🔢 <b>Buyurtma:</b> <code>${orderNumber}</code>
👤 <b>Mijoz:</b> ${clientName}
${clientPhone ? `📞 <b>Telefon:</b> ${clientPhone}` : ''}
🏢 <b>Filial:</b> ${branchName}
👨‍💼 <b>Kassir:</b> ${cashierName}
📅 <b>Vaqt:</b> ${createdAt.toLocaleString('uz-UZ')}

📦 <b>Mahsulotlar:</b>
${productsList}

$<b>To'lovlar:</b>
${paymentsList}

💰 <b>Jami summa:</b> <b>${formatCurrency(totalAmount)}</b>

✅ <i>Buyurtma muvaffaqiyatli yaratildi</i>`;

        return message;
    }

    private getPaymentTypeEmoji(paymentType: string): string {
        const emojis: Record<string, string> = {
            'CASH': '💵',
            'CARD': '💳',
            'TRANSFER': '📱',
        };
        return emojis[paymentType] || '💰';
    }

    private getPaymentTypeName(paymentType: string): string {
        const names: Record<string, string> = {
            'CASH': 'Naqd',
            'CARD': 'Karta',
            'TRANSFER': 'Nasiya',
        };
        return names[paymentType] || paymentType;
    }

    async testChannelConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            const channelConfig = await this.prisma.setting.findUnique({
                where: { key: 'channel_config' }
            });

            if (!channelConfig) {
                return { success: false, error: 'Kanal sozlamalari topilmadi' };
            }

            const decryptedConfig = this.encryptionService.decrypt(channelConfig.value);
            const config = JSON.parse(decryptedConfig);

            if (!config.enabled) {
                return { success: false, error: 'Kanal xabarlari o\'chirilgan' };
            }

            // Test xabarini yuborish
            const testMessage = `🧪 <b>Test xabari</b>\n\n📅 Vaqt: ${new Date().toLocaleString('uz-UZ')}\n🤖 Bot: Faol\n✅ Ulanish: Muvaffaqiyatli`;

            await this.bot.telegram.sendMessage(config.chatId, testMessage, {
                parse_mode: 'HTML'
            });

            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                error: error instanceof Error ? error.message : 'Noma\'lum xatolik' 
            };
        }
    }
}