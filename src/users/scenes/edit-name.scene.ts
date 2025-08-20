import { Scene, SceneEnter, On, Message, Ctx } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { Context } from '../../interfaces/context.interface';

@Scene('edit-name-scene')
export class EditNameScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onSceneEnter(@Ctx() ctx: Context) {
    const sceneState = ctx.scene.state as any;
    const user = await this.prisma.user.findUnique({
      where: { id: sceneState.userId }
    });
    
    if (!user) {
      await ctx.reply('❌ Foydalanuvchi topilmadi.');
      await ctx.scene.leave();
      return;
    }
    
    await ctx.reply(`👤 Hozirgi ism: ${user.full_name}\n\nYangi to'liq ismni kiriting:`);
  }

  @On('text')
  async onText(@Ctx() ctx: Context, @Message('text') text: string) {
    const sceneState = ctx.scene.state as any;
    
    try {
      await this.prisma.user.update({
        where: { id: sceneState.userId },
        data: { full_name: text }
      });
      
      await ctx.reply(`✅ To'liq ism "${text}" ga o'zgartirildi.`);
      await ctx.scene.leave();
    } catch (error) {
      await ctx.reply('❌ Ismni o\'zgartirishda xatolik yuz berdi.');
      await ctx.scene.leave();
    }
  }
}