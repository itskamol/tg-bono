import { Scene, SceneEnter, On, Message, Action, Ctx } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { Role } from '../../auth/enums/role.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

@Scene('add-user-scene')
export class AddUserScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.reply('❌ Telegram ID topilmadi.');
      await ctx.scene.leave();
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { telegram_id: telegramId },
      include: { branch: true }
    });

    if (!user) {
      await ctx.reply('❌ Siz tizimda ro\'yxatdan o\'tmagansiz.');
      await ctx.scene.leave();
      return;
    }

    const sceneState = ctx.scene.state as any;

    if (user.role === Role.SUPER_ADMIN) {
      // Super Admin can choose role with inline keyboard
      await ctx.reply(
        '👤 Yangi foydalanuvchi uchun rolni tanlang:',
        Markup.inlineKeyboard([
          Markup.button.callback('👨‍💼 Admin', 'ROLE_admin'),
          Markup.button.callback('💰 Kassir', 'ROLE_kassir'),
        ])
      );
    } else if (user.role === Role.ADMIN) {
      // Admin can only create Kassir
      sceneState.role = Role.KASSIR;
      await ctx.reply(
        '💰 Siz yangi Kassir yaratyapsiz.\n\n📱 Yangi foydalanuvchining Telegram ID raqamini kiriting:',
      );
    }
  }

  @Action(/ROLE_(.+)/)
  async onRoleSelect(@Ctx() ctx: Context) {
    const roleData = (ctx.callbackQuery as any).data;
    const role = roleData.split('_')[1];
    const sceneState = ctx.scene.state as any;
    
    sceneState.role = role === 'admin' ? Role.ADMIN : Role.KASSIR;
    
    const roleText = role === 'admin' ? '👨‍💼 Admin' : '💰 Kassir';
    
    await ctx.editMessageText(
      `✅ Rol tanlandi: ${roleText}\n\n📱 Yangi foydalanuvchining Telegram ID raqamini kiriting:`
    );
  }

  @Action(/BRANCH_(.+)/)
  async onBranchSelect(@Ctx() ctx: Context) {
    const branchData = (ctx.callbackQuery as any).data;
    const branchId = branchData.split('_')[1];
    const sceneState = ctx.scene.state as any;
    
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId }
    });
    
    if (!branch) {
      await ctx.editMessageText('❌ Filial topilmadi.');
      await ctx.scene.leave();
      return;
    }
    
    try {
      await this.prisma.user.create({
        data: {
          telegram_id: sceneState.telegramId,
          full_name: sceneState.fullName,
          role: sceneState.role,
          branch_id: branchId,
        },
      });
      
      const roleText = sceneState.role === Role.ADMIN ? '👨‍💼 Admin' : '💰 Kassir';
      
      await ctx.editMessageText(
        `✅ ${roleText} "${sceneState.fullName}" muvaffaqiyatli yaratildi!\n\n🏪 Filial: ${branch.name}`
      );
      await ctx.scene.leave();
    } catch (error) {
      await ctx.editMessageText('❌ Foydalanuvchi yaratishda xatolik yuz berdi.');
      await ctx.scene.leave();
    }
  }

  @On('text')
  async onText(@Ctx() ctx: Context, @Message('text') text: string) {
    const sceneState = ctx.scene.state as any;
    
    // Get user from database since ctx.user might not be available in scenes
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.reply('❌ Telegram ID topilmadi.');
      await ctx.scene.leave();
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { telegram_id: telegramId },
      include: { branch: true }
    });

    if (!user) {
      await ctx.reply('❌ Siz tizimda ro\'yxatdan o\'tmagansiz.');
      await ctx.scene.leave();
      return;
    }

    // Role should be set via inline keyboard, skip text-based role selection
    if (!sceneState.role) {
      await ctx.reply('❌ Avval rolni tanlang.');
      return;
    }

    // Step 1: Set Telegram ID
    if (!sceneState.telegramId) {
      const telegramIdInput = parseInt(text, 10);
      if (isNaN(telegramIdInput)) {
        await ctx.reply('❌ Noto\'g\'ri Telegram ID. Raqam kiriting.');
        return;
      }
      
      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { telegram_id: telegramIdInput }
      });
      
      if (existingUser) {
        await ctx.reply('❌ Bu Telegram ID allaqachon tizimda mavjud.');
        return;
      }
      
      sceneState.telegramId = telegramIdInput;
      await ctx.reply('✅ Telegram ID saqlandi.\n\n👤 To\'liq ismni kiriting:');
      return;
    }

    // Step 2: Set Full Name and complete user creation
    if (!sceneState.fullName) {
      sceneState.fullName = text;
      
      if (user.role === Role.SUPER_ADMIN) {
        // Show branch selection for Super Admin
        const branches = await this.prisma.branch.findMany();
        if (branches.length === 0) {
          await ctx.reply('❌ Hech qanday filial topilmadi. Avval filial yarating.');
          await ctx.scene.leave();
          return;
        }
        
        const branchButtons = branches.map(branch => 
          Markup.button.callback(branch.name, `BRANCH_${branch.id}`)
        );
        
        await ctx.reply(
          '✅ To\'liq ism saqlandi.\n\n🏪 Foydalanuvchini qaysi filialga tayinlaysiz?',
          Markup.inlineKeyboard(branchButtons)
        );
        return;
      } else { // Admin creating a Kassir
        try {
          await this.prisma.user.create({
            data: {
              telegram_id: sceneState.telegramId,
              full_name: sceneState.fullName,
              role: sceneState.role,
              branch_id: user.branch_id,
            },
          });
          await ctx.reply(`✅ Kassir "${sceneState.fullName}" muvaffaqiyatli yaratildi!`);
          await ctx.scene.leave();
        } catch (error) {
          await ctx.reply('❌ Foydalanuvchi yaratishda xatolik yuz berdi.');
          await ctx.scene.leave();
        }
      }
      return;
    }
  }
}