import { UseGuards } from '@nestjs/common';
import { Update, Command, Ctx, Action } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { AuthGuard } from '../auth/guards/auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { Context } from '../interfaces/context.interface';

@Update()
@UseGuards(AuthGuard)
export class BranchesUpdate {
    constructor(private readonly prisma: PrismaService) {}

    @Command('list_branches')
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
            return 'Hech qanday filial topilmadi.';
        }

        const branchList = branches
            .map(
                (branch) =>
                    `🏪 ${branch.name}\n📍 ${branch.address}\n👥 Foydalanuvchilar: ${branch._count.users}\n`,
            )
            .join('\n');

        return `Filiallar ro'yxati:\n\n${branchList}`;
    }

    @Command('add_branch')
    @Roles(Role.SUPER_ADMIN)
    async onAddBranch(@Ctx() ctx: Context) {
        await ctx.scene.enter('add-branch-scene');
    }

    @Command('edit_branch')
    @Roles(Role.SUPER_ADMIN)
    async onEditBranch(@Ctx() ctx: Context) {
        const branches = await this.prisma.branch.findMany();

        if (branches.length === 0) {
            await ctx.reply('❌ Tahrirlanadigan filiallar topilmadi.');
            return;
        }

        const branchButtons = branches.map((branch) =>
            Markup.button.callback(`${branch.name}`, `EDIT_BRANCH_${branch.id}`),
        );

        await ctx.reply(
            '✏️ Qaysi filialni tahrirlashni xohlaysiz?',
            Markup.inlineKeyboard(branchButtons),
        );
    }

    @Command('delete_branch')
    @Roles(Role.SUPER_ADMIN)
    async onDeleteBranch(@Ctx() ctx: Context) {
        await ctx.scene.enter('delete-branch-scene');
    }

    @Action(/^EDIT_BRANCH_[^_]+$/)
    async onEditBranchSelect(@Ctx() ctx: Context) {
        const branchData = (ctx.callbackQuery as any).data;
        const branchId = branchData.replace('EDIT_BRANCH_', '');

        const branch = await this.prisma.branch.findUnique({
            where: { id: branchId },
            include: {
                _count: {
                    select: { users: true },
                },
            },
        });

        if (!branch) {
            await ctx.editMessageText('❌ Filial topilmadi.');
            return;
        }

        await ctx.editMessageText(
            `✏️ "${branch.name}" filialini tahrirlash:\n\n` +
                `🏪 Nomi: ${branch.name}\n` +
                `📍 Manzil: ${branch.address}\n` +
                `👥 Foydalanuvchilar: ${branch._count.users}\n\n` +
                `Nimani o'zgartirmoqchisiz?`,
            Markup.inlineKeyboard([
                Markup.button.callback('🏪 Nomi', `EDIT_BRANCH_NAME_${branchId}`),
                Markup.button.callback('📍 Manzil', `EDIT_BRANCH_ADDRESS_${branchId}`),
                Markup.button.callback('❌ Bekor', 'CANCEL_BRANCH_EDIT'),
            ]),
        );
    }

    @Action('CANCEL_BRANCH_EDIT')
    async onCancelBranchEdit(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Tahrirlash bekor qilindi.');
    }

    @Action(/^EDIT_BRANCH_NAME_(.+)$/)
    async onEditBranchName(@Ctx() ctx: Context) {
        const branchData = (ctx.callbackQuery as any).data;
        const branchId = branchData.replace('EDIT_BRANCH_NAME_', '');

        await ctx.scene.enter('edit-branch-name-scene', { branchId });
    }

    @Action(/^EDIT_BRANCH_ADDRESS_(.+)$/)
    async onEditBranchAddress(@Ctx() ctx: Context) {
        const branchData = (ctx.callbackQuery as any).data;
        const branchId = branchData.replace('EDIT_BRANCH_ADDRESS_', '');

        await ctx.scene.enter('edit-branch-address-scene', { branchId });
    }
}
