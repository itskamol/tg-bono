import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

interface EditSideSceneState {
    sideId: string;
    sideName: string;
    sidePrice: number;
    newName?: string;
    newPrice?: number;
    editingName?: boolean;
    editingPrice?: boolean;
}

@Scene('edit-side-scene')
export class EditSideScene {
    constructor(private readonly prisma: PrismaService) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;
        if (!sceneState.sideId) {
            await ctx.reply('❌ Tomon ma\'lumotlari topilmadi.');
            await ctx.scene.leave();
            return;
        }

        const side = await this.prisma.side.findUnique({
            where: { id: sceneState.sideId },
        });

        if (!side) {
            await ctx.reply('❌ Tomon topilmadi.');
            await ctx.scene.leave();
            return;
        }

        sceneState.sideName = side.name;
        sceneState.sidePrice = side.price;

        await ctx.reply(
            `✏️ Tomon tahrirlash\n\n📝 Joriy nomi: ${side.name}\n💰 Joriy narxi: ${side.price} so'm\n\nNimani tahrirlashni xohlaysiz?`,
            Markup.inlineKeyboard([
                Markup.button.callback('📝 Nomini o\'zgartirish', 'EDIT_SIDE_NAME'),
                Markup.button.callback('💰 Narxini o\'zgartirish', 'EDIT_SIDE_PRICE'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
            ], { columns: 1 })
        );
    }

    @Action('EDIT_SIDE_NAME')
    async onEditSideName(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;
        sceneState.editingName = true;

        await ctx.editMessageText(
            `📝 Yangi nom kiriting:\n\n🔸 Joriy nom: ${sceneState.sideName}`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
            ])
        );
    }

    @Action('EDIT_SIDE_PRICE')
    async onEditSidePrice(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;
        sceneState.editingPrice = true;

        await ctx.editMessageText(
            `💰 Yangi narx kiriting (so'mda):\n\n🔸 Joriy narx: ${sceneState.sidePrice} so'm`,
            Markup.inlineKeyboard([
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
            ])
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as EditSideSceneState;

        // Nom tahrirlash
        if (sceneState.editingName) {
            const trimmedName = text.trim();
            
            if (trimmedName.length < 2) {
                await ctx.reply('❌ Tomon nomi kamida 2 ta belgidan iborat bo\'lishi kerak.');
                return;
            }

            if (trimmedName.length > 50) {
                await ctx.reply('❌ Tomon nomi 50 ta belgidan ko\'p bo\'lmasligi kerak.');
                return;
            }

            // Agar nom o'zgarmagan bo'lsa
            if (trimmedName.toLowerCase() === sceneState.sideName.toLowerCase()) {
                await ctx.reply('❌ Yangi nom joriy nom bilan bir xil. Boshqa nom kiriting:');
                return;
            }

            // Tomon nomi mavjudligini tekshirish
            const existingSide = await this.prisma.side.findFirst({
                where: { 
                    name: { equals: trimmedName, mode: 'insensitive' },
                    id: { not: sceneState.sideId }
                },
            });

            if (existingSide) {
                await ctx.reply('❌ Bu nom bilan tomon allaqachon mavjud. Boshqa nom kiriting:');
                return;
            }

            sceneState.newName = trimmedName;
            sceneState.editingName = false;

            // Tasdiqlash
            await ctx.reply(
                `📋 Nom o'zgarishi:\n\n🔸 Eski nom: ${sceneState.sideName}\n🔹 Yangi nom: ${trimmedName}\n\nTasdiqlaysizmi?`,
                Markup.inlineKeyboard([
                    Markup.button.callback('✅ Ha, o\'zgartirish', 'CONFIRM_NAME_CHANGE'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
                ], { columns: 1 })
            );
            return;
        }

        // Narx tahrirlash
        if (sceneState.editingPrice) {
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

            if (price === sceneState.sidePrice) {
                await ctx.reply('❌ Yangi narx joriy narx bilan bir xil. Boshqa narx kiriting:');
                return;
            }

            sceneState.newPrice = price;
            sceneState.editingPrice = false;

            // Tasdiqlash
            await ctx.reply(
                `📋 Narx o'zgarishi:\n\n🔸 Eski narx: ${sceneState.sidePrice} so'm\n🔹 Yangi narx: ${price} so'm\n\nTasdiqlaysizmi?`,
                Markup.inlineKeyboard([
                    Markup.button.callback('✅ Ha, o\'zgartirish', 'CONFIRM_PRICE_CHANGE'),
                    Markup.button.callback('🔙 Orqaga', 'BACK_TO_EDIT_MENU'),
                    Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
                ], { columns: 1 })
            );
            return;
        }
    }

    @Action('CONFIRM_NAME_CHANGE')
    async onConfirmNameChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;

        if (!sceneState.newName) {
            await ctx.editMessageText('❌ Yangi nom topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.side.update({
                where: { id: sceneState.sideId },
                data: { name: sceneState.newName },
            });

            await ctx.editMessageText(
                `✅ Tomon nomi muvaffaqiyatli o'zgartirildi!\n\n🔸 Eski nom: ${sceneState.sideName}\n🔹 Yangi nom: ${sceneState.newName}`
            );
            await ctx.scene.leave();
        } catch (error) {
            console.error('Side name update error:', error);
            await ctx.editMessageText('❌ Nom o\'zgartirishda xatolik yuz berdi.');
            await ctx.scene.leave();
        }
    }

    @Action('CONFIRM_PRICE_CHANGE')
    async onConfirmPriceChange(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as EditSideSceneState;

        if (!sceneState.newPrice) {
            await ctx.editMessageText('❌ Yangi narx topilmadi.');
            await ctx.scene.leave();
            return;
        }

        try {
            await this.prisma.side.update({
                where: { id: sceneState.sideId },
                data: { price: sceneState.newPrice },
            });

            await ctx.editMessageText(
                `✅ Tomon narxi muvaffaqiyatli o'zgartirildi!\n\n🔸 Eski narx: ${sceneState.sidePrice} so'm\n🔹 Yangi narx: ${sceneState.newPrice} so'm`
            );
            await ctx.scene.leave();
        } catch (error) {
            console.error('Side price update error:', error);
            await ctx.editMessageText('❌ Narx o\'zgartirishda xatolik yuz berdi.');
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

        await ctx.editMessageText(
            `✏️ Tomon tahrirlash\n\n📝 Joriy nomi: ${sceneState.sideName}\n💰 Joriy narxi: ${sceneState.sidePrice} so'm\n\nNimani tahrirlashni xohlaysiz?`,
            Markup.inlineKeyboard([
                Markup.button.callback('📝 Nomini o\'zgartirish', 'EDIT_SIDE_NAME'),
                Markup.button.callback('💰 Narxini o\'zgartirish', 'EDIT_SIDE_PRICE'),
                Markup.button.callback('❌ Bekor qilish', 'CANCEL_EDIT_SIDE'),
            ], { columns: 1 })
        );
    }

    @Action('CANCEL_EDIT_SIDE')
    async onCancelEditSide(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Tomon tahrirlash bekor qilindi.');
        await ctx.scene.leave();
    }
}