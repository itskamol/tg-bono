import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';
import { Role } from '@prisma/client';
import { safeEditMessageText } from '../utils/telegram.utils';

@Update()

export class BranchesUpdate {
    constructor(private readonly prisma: PrismaService) { }

    @Command('branches')
    @Roles(Role.SUPER_ADMIN)
    async listBranches(@Ctx() ctx: Context) {
        const branches = await this.prisma.branch.findMany({
            include: {
                _count: {
                    select: { users: true },
                },
            },
        });

        if (branches.length === 0) {
            await safeEditMessageText(
                ctx,
                '❌ Hech qanday filial mavjud emas.',
                Markup.inlineKeyboard([
                    Markup.button.callback('➕ Filial qo\'shish', 'ADD_BRANCH'),
                ]),
                'Filiallar yo\'q'
            );
            return;
        }

        const branchButtons = branches.map((branch) =>
            Markup.button.callback(
                `🏪 ${branch.name}`,
                `VIEW_BRANCH_${branch.id}`,
            ),
        );

        await safeEditMessageText(
            ctx,
            `🏪 Filiallar ro'yxati (${branches.length} ta):`,
            Markup.inlineKeyboard([
                ...branchButtons,
                Markup.button.callback('➕ Yangi filial', 'ADD_BRANCH'),
            ], { columns: 2 }),
            'Filiallar ro\'yxati'
        );
    }

    @Action('ADD_BRANCH')
    @Roles(Role.SUPER_ADMIN)
    async onAddBranch(@Ctx() ctx: Context) {
        await ctx.scene.enter('add-branch-scene');
    }

    @Action(/^VIEW_BRANCH_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onViewBranch(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const branchData = ctx.callbackQuery.data;

        // Regex orqali branchId'ni olish
        const match = branchData.match(/^VIEW_BRANCH_(.+)$/);
        if (!match) {
            await safeEditMessageText(ctx, '❌ Noto\'g\'ri ma\'lumot.', undefined, 'Xatolik');
            return;
        }

        const branchId = match[1];

        const branch = await this.prisma.branch.findUnique({
            where: { id: branchId },
            include: {
                _count: {
                    select: { users: true },
                },
            },
        });

        if (!branch) {
            await safeEditMessageText(ctx, '❌ Filial topilmadi.', undefined, 'Filial topilmadi');
            return;
        }

        const branchDetails = `
🏪 Filial ma'lumotlari:

🏪 Nomi: ${branch.name}
📍 Manzil: ${branch.address}
👥 Foydalanuvchilar: ${branch._count.users} ta
📅 Yaratilgan: ${branch.created_at.toLocaleDateString('uz-UZ')}

Nima qilmoqchisiz?
        `;

        await safeEditMessageText(
            ctx,
            branchDetails,
            Markup.inlineKeyboard([
                Markup.button.callback('✏️ Tahrirlash', `EDIT_BRANCH_${branch.id}`),
                Markup.button.callback('🗑️ O\'chirish', `DELETE_BRANCH_${branch.id}`),
                Markup.button.callback('🔙 Orqaga', 'BACK_TO_BRANCHES'),
            ], { columns: 2 }),
            'Filial ma\'lumotlari'
        );
    }

    @Action(/^EDIT_BRANCH_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onEditBranch(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const branchData = ctx.callbackQuery.data;

        // Regex orqali branchId'ni olish
        const match = branchData.match(/^EDIT_BRANCH_(.+)$/);
        if (!match) {
            await safeEditMessageText(ctx, '❌ Noto\'g\'ri ma\'lumot.', undefined, 'Xatolik');
            return;
        }

        const branchId = match[1];

        const branch = await this.prisma.branch.findUnique({
            where: { id: branchId },
        });

        if (!branch) {
            await safeEditMessageText(ctx, '❌ Filial topilmadi.', undefined, 'Filial topilmadi');
            return;
        }

        // Scene state'ga branch ma'lumotlarini saqlash
        ctx.scene.state = {
            branchId,
            branchName: branch.name,
            branchAddress: branch.address
        };
        await ctx.scene.enter('edit-branch-scene', ctx.scene.state);
    }

    @Action(/^DELETE_BRANCH_(.+)$/)
    @Roles(Role.SUPER_ADMIN)
    async onDeleteBranch(@Ctx() ctx: Context) {
        if (!('data' in ctx.callbackQuery)) {
            return;
        }
        const branchData = ctx.callbackQuery.data;

        // Regex orqali branchId'ni olish
        const match = branchData.match(/^DELETE_BRANCH_(.+)$/);
        if (!match) {
            await safeEditMessageText(ctx, '❌ Noto\'g\'ri ma\'lumot.', undefined, 'Xatolik');
            return;
        }

        const branchId = match[1];

        // Scene state'ga branch ID'ni saqlash
        ctx.scene.state = { branchId };
        await ctx.scene.enter('delete-branch-scene', ctx.scene.state);
    }

    @Action('BACK_TO_BRANCHES')
    @Roles(Role.SUPER_ADMIN)
    async onBackToBranches(@Ctx() ctx: Context) {
        // Filiallar ro'yxatini qayta ko'rsatish
        const branches = await this.prisma.branch.findMany({
            include: {
                _count: {
                    select: { users: true },
                },
            },
        });

        if (branches.length === 0) {
            await safeEditMessageText(
                ctx,
                '❌ Hech qanday filial mavjud emas.',
                Markup.inlineKeyboard([
                    Markup.button.callback('➕ Filial qo\'shish', 'ADD_BRANCH'),
                ]),
                'Filiallar yo\'q'
            );
            return;
        }

        const branchButtons = branches.map((branch) =>
            Markup.button.callback(
                `🏪 ${branch.name}`,
                `VIEW_BRANCH_${branch.id}`,
            ),
        );

        await safeEditMessageText(
            ctx,
            `🏪 Filiallar ro'yxati (${branches.length} ta):`,
            Markup.inlineKeyboard([
                ...branchButtons,
                Markup.button.callback('➕ Yangi filial', 'ADD_BRANCH'),
            ], { columns: 2 }),
            'Filiallar ro\'yxati'
        );
    }
}
