import { Scene, SceneEnter, On, Message, Ctx, Action } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulerService } from '../../scheduler/scheduler.service';
import { Context } from '../../interfaces/context.interface';
import { Markup } from 'telegraf';

@Scene('schedule-settings-scene')
export class ScheduleSettingsScene {
    private readonly schedules = {
        'Har daqiqa': { cron: '* * * * *' },
        'Har 5 daqiqada': { cron: '*/5 * * * *' },
        'Har 15 daqiqada': { cron: '*/15 * * * *' },
        'Har 30 daqiqada': { cron: '*/30 * * * *' },
        'Soatlik': { cron: '0 * * * *' },
        'Har 2 soatda': { cron: '0 */2 * * *' },
        'Har 4 soatda': { cron: '0 */4 * * *' },
        'Har 6 soatda': { cron: '0 */6 * * *' },
        'Har 12 soatda': { cron: '0 */12 * * *' },
        'Kundalik': { cron: '0 0 * * *' },
        'Haftalik': { cron: '0 0 * * 0' },
        'Oylik': { cron: '0 0 1 * *' },
    };

    constructor(
        private readonly prisma: PrismaService,
        private readonly schedulerService: SchedulerService,
    ) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply('Rejalashtirilgan hisobotlar sozlamalarini boshlash...');

        const existingSetting = await this.prisma.setting.findUnique({
            where: { key: 'schedule_config' },
        });

        if (existingSetting) {
            const config = JSON.parse(existingSetting.value);
            const status = config.enabled ? 'yoqilgan' : 'o\'chirilgan';
            await ctx.reply(`Joriy jadval: \`${config.cron}\`, Holat: *${status}*`, {
                parse_mode: 'Markdown',
            });
        }

        const buttons = Object.entries(this.schedules).map(([label, { cron }]) =>
            Markup.button.callback(label, `set_cron_${cron}`),
        );

        buttons.push(Markup.button.callback('❌ Bekor qilish', 'cancel_schedule_config'));

        await ctx.reply(
            'Jadvalni tanlang yoki maxsus cron qatorini kiriting:',
            Markup.inlineKeyboard(buttons, { columns: 2 }),
        );
    }

    @Action(/set_cron_(.+)/)
    async onSetCron(@Ctx() ctx: Context) {
        const cron = (ctx.callbackQuery as any).data.replace('set_cron_', '');
        const sceneState = ctx.scene.state as any;
        sceneState.cron = cron;
        
        await ctx.editMessageText(
            `Cron qatori \`${cron}\` ga o'rnatildi. Agar maxsus cron qatori kerak bo'lsa, uni hozir yozing. Aks holda, bu jadvalni yoqishni yoki o'chirishni xohlaysizmi?`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            Markup.button.callback('✅ Yoqish', 'schedule_enable'),
                            Markup.button.callback('❌ O\'chirish', 'schedule_disable')
                        ],
                        [
                            Markup.button.callback('⬅️ Orqaga', 'back_to_schedule_selection'),
                            Markup.button.callback('❌ Bekor qilish', 'cancel_schedule_config')
                        ]
                    ]
                }
            }
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        if (!sceneState.cron) {
            // Basic validation for cron string
            const cronParts = text.split(' ');
            if (cronParts.length !== 5) {
                await ctx.reply('Noto\'g\'ri cron qatori. U 5 ta qismdan iborat bo\'lishi kerak. Iltimos, qayta urinib ko\'ring.');
                return;
            }
            sceneState.cron = text;
            await ctx.reply(
                `Cron jadvali \`${text}\` ga o'rnatildi. Bu jadvalni yoqishni yoki o'chirishni xohlaysizmi?`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                Markup.button.callback('✅ Yoqish', 'schedule_enable'),
                                Markup.button.callback('❌ O\'chirish', 'schedule_disable')
                            ],
                            [
                                Markup.button.callback('⬅️ Orqaga', 'back_to_schedule_selection'),
                                Markup.button.callback('❌ Bekor qilish', 'cancel_schedule_config')
                            ]
                        ]
                    }
                }
            );
            return;
        }
    }

    @Action(/schedule_(enable|disable)/)
    async onEnableDisable(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        const action = (ctx.callbackQuery as any).data.split('_')[1];
        const enabled = action === 'enable';

        if (enabled && !sceneState.destination) {
            // Ask for destination if enabling
            await ctx.editMessageText(
                `Cron jadvali \`${sceneState.cron}\` ga o'rnatildi. Hisobotlarni qayerga yuborishni tanlang:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                Markup.button.callback('📧 Email', 'dest_email'),
                                Markup.button.callback('📊 Google Sheets', 'dest_sheets')
                            ],
                            [
                                Markup.button.callback('📧📊 Ikkalasiga ham', 'dest_both')
                            ],
                            [
                                Markup.button.callback('⬅️ Orqaga', 'back_to_schedule_selection'),
                                Markup.button.callback('❌ Bekor qilish', 'cancel_schedule_config')
                            ]
                        ]
                    }
                }
            );
            return;
        }

        const scheduleConfig = {
            cron: sceneState.cron,
            enabled: enabled,
            destination: sceneState.destination || 'email',
        };

        await this.prisma.setting.upsert({
            where: { key: 'schedule_config' },
            update: { value: JSON.stringify(scheduleConfig) },
            create: {
                key: 'schedule_config',
                value: JSON.stringify(scheduleConfig),
            },
        });

        // Update the running cron job
        await this.schedulerService.updateCronJobFromSettings();

        const status = enabled ? 'yoqildi' : 'o\'chirildi';
        const emoji = enabled ? '✅' : '❌';
        const destText = sceneState.destination ? ` (${this.getDestinationName(sceneState.destination)})` : '';
        await ctx.editMessageText(`${emoji} Rejalashtirilgan hisobotlar ${status}${destText}.`);
        await ctx.scene.leave();
    }

    @Action(/dest_(.+)/)
    async onDestinationSelect(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        const destination = (ctx.callbackQuery as any).data.replace('dest_', '');
        sceneState.destination = destination;

        const scheduleConfig = {
            cron: sceneState.cron,
            enabled: true,
            destination: destination,
        };

        await this.prisma.setting.upsert({
            where: { key: 'schedule_config' },
            update: { value: JSON.stringify(scheduleConfig) },
            create: {
                key: 'schedule_config',
                value: JSON.stringify(scheduleConfig),
            },
        });

        // Update the running cron job
        await this.schedulerService.updateCronJobFromSettings();

        const destName = this.getDestinationName(destination);
        await ctx.editMessageText(`✅ Rejalashtirilgan hisobotlar yoqildi (${destName}).`);
        await ctx.scene.leave();
    }

    private getDestinationName(destination: string): string {
        const names = {
            'email': 'Email',
            'sheets': 'Google Sheets',
            'both': 'Email va Google Sheets'
        };
        return names[destination] || destination;
    }

    @Action('back_to_schedule_selection')
    async onBackToScheduleSelection(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.cron;

        const buttons = Object.entries(this.schedules).map(([label, { cron }]) =>
            Markup.button.callback(label, `set_cron_${cron}`),
        );

        buttons.push(Markup.button.callback('❌ Bekor qilish', 'cancel_schedule_config'));

        await ctx.editMessageText(
            'Jadvalni tanlang yoki maxsus cron qatorini kiriting:',
            Markup.inlineKeyboard(buttons, { columns: 2 }),
        );
    }

    @Action('cancel_schedule_config')
    async onCancel(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Jadval sozlamalari bekor qilindi.');
        await ctx.scene.leave();
    }
}