import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface AddSideSceneState {
    name?: string;
    price?: number;
    awaitingName?: boolean;
    awaitingPrice?: boolean;
}

@Scene('add-side-scene')
export class AddSideScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddSideSceneState;
        sceneState.awaitingName = true;

        await ctx.reply(
            '🍕 Yangi tomon qo\'shish\n\n📝 Tomon nomini kiriting:',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
            ]),
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as AddSideSceneState;

        // Step 1: Tomon nomi
        if (sceneState.awaitingName) {
            const trimmedName = text.trim();
            
            if (trimmedName.length < 2) {
                await ctx.reply('❌ Tomon nomi kamida 2 ta belgidan iborat bo\'lishi kerak.');
                return;
            }

            if (trimmedName.length > 50) {
                await ctx.reply('❌ Tomon nomi 50 ta belgidan ko\'p bo\'lmasligi kerak.');
                return;
            }

            // Tomon nomi mavjudligini tekshirish
            const existingSide = await this.prisma.side.findFirst({
                where: { name: { equals: trimmedName, mode: 'insensitive' } },
            });

            if (existingSide) {
                await ctx.reply('❌ Bu nom bilan tomon allaqachon mavjud. Boshqa nom kiriting:');
                return;
            }

            sceneState.name = trimmedName;
            sceneState.awaitingName = false;
            sceneState.awaitingPrice = true;

            await ctx.reply(
                `✅ Tomon nomi: ${trimmedName}\n\n💰 Tomon narxini kiriting (so'mda):`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_NAME'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
                ])
            );
            return;
        }

        // Step 2: Tomon narxi
        if (sceneState.awaitingPrice) {
            const price = parseFloat(text);
            
            if (isNaN(price)) {
                await ctx.reply('❌ Noto\'g\'ri narx formati. Faqat raqam kiriting:');
                return;
            }

            if (price <= 0) {
                await ctx.reply('❌ Narx 0 dan katta bo\'lishi kerak:');
                return;
            }

            if (price > 10000000) { // 10 million limit
                await ctx.reply('❌ Narx juda katta. Maksimal: 10,000,000 so\'m');
                return;
            }

            if (price !== Math.floor(price)) {
                await ctx.reply('❌ Faqat butun sonlar qabul qilinadi:');
                return;
            }

            sceneState.price = price;
            sceneState.awaitingPrice = false;

            // Tasdiqlash
            await ctx.reply(
                `📋 Yangi tomon ma'lumotlari:\n\n📝 Nomi: ${sceneState.name}\n💰 Narxi: ${price} so'm\n\nTasdiqlaysizmi?`,
                Markup.inlineKeyboard([
                    Markup.button.callback('✅ Ha, qo\'shish', 'CONFIRM_ADD_SIDE'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_PRICE'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
                ], { columns: 1 })
            );
            return;
        }
    }

    @Action('BACK_TO_NAME')
    async onBackToName(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddSideSceneState;
        sceneState.awaitingName = true;
        sceneState.awaitingPrice = false;
        sceneState.name = undefined;

        await ctx.editMessageText(
            '🍕 Yangi tomon qo\'shish\n\n📝 Tomon nomini kiriting:',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
            ])
        );
    }

    @Action('BACK_TO_PRICE')
    async onBackToPrice(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddSideSceneState;
        sceneState.awaitingPrice = true;
        sceneState.price = undefined;

        await ctx.editMessageText(
            `✅ Tomon nomi: ${sceneState.name}\n\n💰 Tomon narxini kiriting (so'mda):`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_NAME'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
            ])
        );
    }

    @Action('CONFIRM_ADD_SIDE')
    async onConfirmAddSide(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddSideSceneState;

        if (!sceneState.name || !sceneState.price) {
            await ctx.editMessageText('❌ Ma\'lumotlar noto\'g\'ri.');
            await ctx.scene.leave();
            return;
        }

        try {
            const newSide = await this.prisma.side.create({
                data: {
                    name: sceneState.name,
                    price: sceneState.price,
                },
            });

            await ctx.editMessageText(
                `✅ Yangi tomon muvaffaqiyatli qo'shildi!\n\n📝 Nomi: ${newSide.name}\n💰 Narxi: ${newSide.price} so'm`
            );
            await ctx.scene.leave();
        } catch (error) {
            console.error('Side creation error:', error);
            
            let errorMessage = '❌ Tomon qo\'shishda xatolik yuz berdi.';
            
            if (error instanceof Error) {
                if (error.message.includes('duplicate')) {
                    errorMessage = '❌ Bu nom bilan tomon allaqachon mavjud.';
                } else if (error.message.includes('validation')) {
                    errorMessage = '❌ Ma\'lumotlar noto\'g\'ri.';
                }
            }

            await ctx.editMessageText(
                `${errorMessage}\n\nQaytadan urinib ko'ring.`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🔄 Qaytadan', 'RETRY_ADD_SIDE'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
                ])
            );
        }
    }

    @Action('RETRY_ADD_SIDE')
    async onRetryAddSide(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddSideSceneState;
        sceneState.awaitingName = true;
        sceneState.awaitingPrice = false;
        sceneState.name = undefined;
        sceneState.price = undefined;

        await ctx.editMessageText(
            '🍕 Yangi tomon qo\'shish\n\n📝 Tomon nomini kiriting:',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
            ])
        );
    }

    @Action('CANCEL_ADD_SIDE')
    async onCancelAddSide(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Tomon qo\'shish bekor qilindi.');
        await ctx.scene.leave();
    }
}