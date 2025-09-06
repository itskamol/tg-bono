import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { formatCurrency } from 'src/utils/format.utils';
import { safeEditMessageText, safeReplyOrEdit } from 'src/utils/telegram.utils';

interface AddSideSceneState {
    categoryId: string;
    name?: string;
    price?: number;
    awaitingName?: boolean;
    awaitingPrice?: boolean;
}

@Scene('add-side-scene')
export class AddSideScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddSideSceneState;

        if (!sceneState.categoryId) {
            await safeReplyOrEdit(ctx, "❌ Kategoriya ma'lumotlari topilmadi.");
            await ctx.scene.leave();
            return;
        }

        const category = await this.prisma.category.findUnique({
            where: { id: sceneState.categoryId },
        });

        if (!category) {
            await safeReplyOrEdit(ctx, '❌ Kategoriya topilmadi.');
            await ctx.scene.leave();
            return;
        }

        sceneState.awaitingName = true;

        await safeReplyOrEdit(
            ctx,
            `🔲 "<b>${category.name}</b>" kategoriyasiga yangi tomon qo'shish\n\n📝 Tomon nomini kiriting (masalan: "Oldi", "Orqa", "Ikki tomon"):`,
            Markup.inlineKeyboard([Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE')]),
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as AddSideSceneState;

        if (sceneState.awaitingName) {
            const trimmedName = text.trim();

            if (trimmedName.length < 2) {
                await safeReplyOrEdit(ctx, "❌ Tomon nomi kamida 2 ta belgidan iborat bo'lishi kerak.");
                return;
            }

            if (trimmedName.length > 50) {
                await safeReplyOrEdit(ctx, "❌ Tomon nomi 50 ta belgidan ko'p bo'lmasligi kerak.");
                return;
            }

            const existingSide = await this.prisma.side.findFirst({
                where: {
                    name: { equals: trimmedName, mode: 'insensitive' },
                    category_id: sceneState.categoryId,
                },
            });

            if (existingSide) {
                await safeReplyOrEdit(ctx, '❌ Bu nom bilan tomon allaqachon mavjud. Boshqa nom kiriting:');
                return;
            }

            sceneState.name = trimmedName;
            sceneState.awaitingName = false;
            sceneState.awaitingPrice = true;

            await safeReplyOrEdit(
                ctx,
                `✅ <b>Tomon nomi:</b> ${trimmedName}\n\n💰 Tomon narxini kiriting (so'mda):`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_NAME'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
                ]),
            );
            return;
        }

        if (sceneState.awaitingPrice) {
            const price = parseFloat(text);

            if (isNaN(price)) {
                await safeReplyOrEdit(ctx, "❌ Noto'g'ri narx formati. Faqat raqam kiriting:");
                return;
            }

            if (price <= 0) {
                await safeReplyOrEdit(ctx, "❌ Narx 0 dan katta bo'lishi kerak:");
                return;
            }

            if (price > 10000000) {
                await safeReplyOrEdit(ctx, "❌ Narx juda katta. Maksimal: 10,000,000 so'm");
                return;
            }

            if (price !== Math.floor(price)) {
                await safeReplyOrEdit(ctx, '❌ Faqat butun sonlar qabul qilinadi:');
                return;
            }

            sceneState.price = price;
            sceneState.awaitingPrice = false;

            await safeReplyOrEdit(
                ctx,
                `📋 <b>Yangi tomon ma'lumotlari:</b>\n\n📝 <b>Nomi:</b> ${sceneState.name}\n💰 <b>Narxi:</b> ${formatCurrency(price)} \n\nTasdiqlaysizmi?`,
                Markup.inlineKeyboard(
                    [
                        Markup.button.callback("✅ Ha, qo'shish", 'CONFIRM_ADD_SIDE'),
                        Markup.button.callback('🔙 Orqaga', 'BACK_TO_PRICE'),
                        Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
                    ],
                    { columns: 1 },
                ),
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

        await safeEditMessageText(
            ctx,
            "🔲 <b>Yangi tomon qo'shish</b>\n\n📝 Tomon nomini kiriting:",
            Markup.inlineKeyboard([Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE')]),
        );
    }

    @Action('BACK_TO_PRICE')
    async onBackToPrice(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddSideSceneState;
        sceneState.awaitingPrice = true;
        sceneState.price = undefined;

        await safeEditMessageText(
            ctx,
            `✅ <b>Tomon nomi:</b> ${sceneState.name}\n\n💰 Tomon narxini kiriting (so'mda):`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_NAME'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
            ]),
        );
    }

    @Action('CONFIRM_ADD_SIDE')
    async onConfirmAddSide(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as AddSideSceneState;

        if (!sceneState.name || !sceneState.price) {
            await safeEditMessageText(ctx, "❌ Ma'lumotlar noto'g'ri.");
            await ctx.scene.leave();
            return;
        }

        try {
            const newSide = await this.prisma.side.create({
                data: {
                    name: sceneState.name,
                    price: sceneState.price,
                    category_id: sceneState.categoryId,
                },
            });

            await safeEditMessageText(
                ctx,
                `✅ <b>Yangi tomon muvaffaqiyatli qo'shildi!</b>\n\n📝 <b>Nomi:</b> ${newSide.name}\n💰 <b>Narxi:</b> ${formatCurrency(newSide.price)}`,
            );
            await ctx.scene.leave();
        } catch (error) {
            let errorMessage = "❌ Tomon qo'shishda xatolik yuz berdi.";

            if (error instanceof Error) {
                if (error.message.includes('duplicate')) {
                    errorMessage = '❌ Bu nom bilan tomon allaqachon mavjud.';
                } else if (error.message.includes('validation')) {
                    errorMessage = "❌ Ma'lumotlar noto'g'ri.";
                }
            }

            await safeEditMessageText(
                ctx,
                `${errorMessage}\n\nQaytadan urinib ko'ring.`,
                Markup.inlineKeyboard([
                    Markup.button.callback('🔄 Qaytadan', 'RETRY_ADD_SIDE'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_ADD_SIDE'),
                ]),
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

        await this.onSceneEnter(ctx)
    }

    @Action('CANCEL_ADD_SIDE')
    async onCancelAddSide(@Ctx() ctx: Context) {
        await safeEditMessageText(ctx, "❌ Tomon qo'shish bekor qilindi.");
        await ctx.scene.leave();
    }
}
