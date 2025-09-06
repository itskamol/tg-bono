import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';
import { formatCurrency } from 'src/utils/format.utils';
import { safeEditMessageText, safeReplyOrEdit } from 'src/utils/telegram.utils';

interface EditSideSceneState {
    sideId: string;
    sideName: string;
    sidePrice: number;
    categoryId: string;
    newName?: string;
    newPrice?: number;
    editingName?: boolean;
    editingPrice?: boolean;
}

@Scene('edit-side-scene')
export class EditSideScene {
    constructor(private readonly prisma: PrismaService) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;
        if (!sceneState.sideId) {
            await safeReplyOrEdit(ctx, "❌ Tomon ma'lumotlari topilmadi.");
            await ctx.scene.leave();
            return;
        }

        const side = await this.prisma.side.findUnique({
            where: { id: sceneState.sideId },
        });

        if (!side) {
            await safeReplyOrEdit(ctx, '❌ Tomon topilmadi.');
            await ctx.scene.leave();
            return;
        }

        sceneState.sideName = side.name;
        sceneState.sidePrice = side.price;
        sceneState.categoryId = side.category_id;

        await safeReplyOrEdit(
            ctx,
            `✏️ <b>Tomon tahrirlash</b>\n\n📝 <b>Joriy nomi:</b> ${side.name}\n💰 <b>Joriy narxi:</b> ${formatCurrency(side.price)} \n\nNimani tahrirlashni xohlaysiz?`,
            Markup.inlineKeyboard(
                [
                    Markup.button.callback("📝 Nomini o'zgartirish", 'EDIT_SIDE_NAME'),
                    Markup.button.callback("💰 Narxini o'zgartirish", 'EDIT_SIDE_PRICE'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
                ],
                { columns: 1 },
            ),
        );
    }

    @Action('EDIT_SIDE_NAME')
    async onEditSideName(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;
        sceneState.editingName = true;

        await safeEditMessageText(
            ctx,
            `📝 <b>Yangi nom kiriting:</b>\n\n🔸 <b>Joriy nom:</b> ${sceneState.sideName}`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
            ]),
        );
    }

    @Action('EDIT_SIDE_PRICE')
    async onEditSidePrice(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;
        sceneState.editingPrice = true;

        await safeEditMessageText(
            ctx,
            `💰 <b>Yangi narx kiriting (so'mda):</b>\n\n🔸 <b>Joriy narx:</b> ${formatCurrency(sceneState.sidePrice)}`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
            ]),
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EditSideSceneState;

        if (sceneState.editingName) {
            const trimmedName = text.trim();

            if (trimmedName.length < 2) {
                await ctx.reply("❌ Tomon nomi kamida 2 ta belgidan iborat bo'lishi kerak.", { parse_mode: 'HTML' });
                return;
            }

            if (trimmedName.length > 50) {
                await ctx.reply("❌ Tomon nomi 50 ta belgidan ko'p bo'lmasligi kerak.", { parse_mode: 'HTML' });
                return;
            }

            if (trimmedName.toLowerCase() === sceneState.sideName.toLowerCase()) {
                await ctx.reply('❌ Yangi nom joriy nom bilan bir xil. Boshqa nom kiriting:', { parse_mode: 'HTML' });
                return;
            }

            const existingSide = await this.prisma.side.findFirst({
                where: {
                    name: { equals: trimmedName, mode: 'insensitive' },
                    category_id: sceneState.categoryId,
                    id: { not: sceneState.sideId },
                },
            });

            if (existingSide) {
                await ctx.reply('❌ Bu nom bilan tomon allaqachon mavjud. Boshqa nom kiriting:', { parse_mode: 'HTML' });
                return;
            }

            sceneState.newName = trimmedName;
            sceneState.editingName = false;

            await ctx.reply(
                `📋 <b>Nom o'zgarishi:</b>\n\n🔸 <b>Eski nom:</b> ${sceneState.sideName}\n🔹 <b>Yangi nom:</b> ${trimmedName}\n\nTasdiqlaysizmi?`,
                {
                    parse_mode: 'HTML', ...Markup.inlineKeyboard(
                        [
                            Markup.button.callback("✅ Ha, o'zgartirish", 'CONFIRM_NAME_CHANGE'),
                            Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                            Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
                        ],
                        { columns: 1 },
                    )
                },
            );
            return;
        }

        if (sceneState.editingPrice) {
            const price = parseFloat(text);

            if (isNaN(price)) {
                await ctx.reply("❌ Noto'g'ri narx formati. Faqat raqam kiriting:", { parse_mode: 'HTML' });
                return;
            }

            if (price <= 0) {
                await ctx.reply("❌ Narx 0 dan katta bo'lishi kerak:", { parse_mode: 'HTML' });
                return;
            }

            if (price > 10000000) {
                await ctx.reply("❌ Narx juda katta. Maksimal: 10,000,000 so'm", { parse_mode: 'HTML' });
                return;
            }

            if (price !== Math.floor(price)) {
                await ctx.reply('❌ Faqat butun sonlar qabul qilinadi:', { parse_mode: 'HTML' });
                return;
            }

            if (price === sceneState.sidePrice) {
                await ctx.reply('❌ Yangi narx joriy narx bilan bir xil. Boshqa narx kiriting:', { parse_mode: 'HTML' });
                return;
            }

            sceneState.newPrice = price;
            sceneState.editingPrice = false;

            await ctx.reply(
                `📋 <b>Narx o'zgarishi:</b>\n\n🔸 <b>Eski narx:</b> ${formatCurrency(sceneState.sidePrice)} \n🔹 <b>Yangi narx:</b> ${formatCurrency(price)} \n\nTasdiqlaysizmi?`,
                {
                    parse_mode: 'HTML', ...Markup.inlineKeyboard(
                        [
                            Markup.button.callback("✅ Ha, o'zgartirish", 'CONFIRM_PRICE_CHANGE'),
                            Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                            Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
                        ],
                        { columns: 1 },
                    )
                },
            );
            return;
        }
    }

    @Action('CONFIRM_NAME_CHANGE')
    async onConfirmNameChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;

        if (!sceneState.newName) {
            await safeEditMessageText(ctx, '❌ Yangi nom topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.side.update({
                where: { id: sceneState.sideId },
                data: { name: sceneState.newName },
            });

            await safeEditMessageText(
                ctx,
                `✅ <b>Tomon nomi muvaffaqiyatli o'zgartirildi!</b>\n\n🔸 <b>Eski nom:</b> ${sceneState.sideName}\n🔹 <b>Yangi nom:</b> ${sceneState.newName}`,
            );
            await ctx.scene.leave();
        } catch (error) {
            await safeEditMessageText(ctx, "❌ Nom o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('CONFIRM_PRICE_CHANGE')
    async onConfirmPriceChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;

        if (!sceneState.newPrice) {
            await safeEditMessageText(ctx, '❌ Yangi narx topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.side.update({
                where: { id: sceneState.sideId },
                data: { price: sceneState.newPrice },
            });

            await safeEditMessageText(
                ctx,
                `✅ <b>Tomon narxi muvaffaqiyatli o'zgartirildi!</b>\n\n🔸 <b>Eski narx:</b> ${formatCurrency(sceneState.sidePrice)} \n🔹 <b>Yangi narx:</b> ${formatCurrency(sceneState.newPrice)}`,
            );
            await ctx.scene.leave();
        } catch (error) {
            await safeEditMessageText(ctx, "❌ Narx o'zgartirishda xatolik yuz berdi.");
            await ctx.scene.leave();
        }
    }

    @Action('BACK_TO_EDIT_MENU')
    async onBackToEditMenu(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;
        sceneState.editingName = false;
        sceneState.editingPrice = false;
        sceneState.newName = undefined;
        sceneState.newPrice = undefined;

        await this.onSceneEnter(ctx);
    }

    @Action('CANCEL_EDIT_SIDE')
    async onCancelEditSide(@Ctx() ctx: Context) {
        await safeEditMessageText(ctx, '❌ Tomon tahrirlash bekor qilindi.');
        await ctx.scene.leave();
    }
}
