import { Scene, SceneEnter, On, Message, Ctx, Action } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption.service';
import { GoogleSheetsService } from '../../sheets/google-sheets.service';
import { Context } from '../../interfaces/context.interface';
import { Markup } from 'telegraf';

@Scene('g-sheets-settings-scene')
export class GoogleSheetsSettingsScene {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
        private readonly googleSheetsService: GoogleSheetsService,
    ) { }

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await ctx.reply(
            'Google Sheets eksport sozlamalarini boshlash...',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'cancel_sheets_config')
            ])
        );
        await ctx.reply('Google Sheet ID sini kiriting.');
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        if (!sceneState.sheetId) {
            sceneState.sheetId = text;
            await ctx.reply(
                `Sheet ID o'rnatildi. Endi Service Account JSON faylining to'liq mazmunini joylashtiring.`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_sheet_id'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_sheets_config')
                ])
            );
            return;
        }

        if (!sceneState.serviceAccountJson) {
            try {
                // Validate that the input is a valid JSON
                const parsedJson = JSON.parse(text);
                if (parsedJson.type !== 'service_account' || !parsedJson.private_key) {
                    await ctx.reply(
                        'Noto\'g\'ri Service Account JSON. Unda "type": "service_account" va "private_key" bo\'lishi kerak. Iltimos, qayta urinib ko\'ring.',
                    );
                    return;
                }
                sceneState.serviceAccountJson = text;

                const gSheetsConfig = {
                    sheetId: sceneState.sheetId,
                    credentials: text,
                };

                // Test connection before saving
                await ctx.reply('🔄 Google Sheets ulanishini tekshiryapman...');
                
                const testResult = await this.googleSheetsService.testConnection(
                    sceneState.sheetId,
                    text
                );
                
                if (!testResult.success) {
                    await ctx.reply(`❌ Google Sheets ulanish xatosi:\n\n${testResult.error}`, {
                        parse_mode: 'HTML'
                    });
                    return;
                }

                const encryptedConfig = this.encryptionService.encrypt(
                    JSON.stringify(gSheetsConfig),
                );

                await this.prisma.setting.upsert({
                    where: { key: 'g_sheets_config' },
                    update: { value: encryptedConfig },
                    create: { key: 'g_sheets_config', value: encryptedConfig },
                });

                await ctx.reply('✅ Google Sheets eksport sozlamalari muvaffaqiyatli saqlandi va ulanish tekshirildi!');
                await ctx.scene.leave();
            } catch (e) {
                await ctx.reply(
                    'Siz kiritgan matn to\'g\'ri JSON obyekt emas. Iltimos, JSON faylining aniq mazmunini joylashtiring.',
                    Markup.inlineKeyboard([
                        Markup.button.callback('⬅️ Orqaga', 'back_to_sheet_id'),
                        Markup.button.callback('❌ Bekor qilish', 'cancel_sheets_config')
                    ])
                );
                return;
            }
        }
    }

    @Action('back_to_sheet_id')
    async onBackToSheetId(@Ctx() ctx: Context) {
        const sceneState = ctx.scene.state as any;
        delete sceneState.sheetId;
        delete sceneState.serviceAccountJson;
        await ctx.editMessageText('Google Sheet ID sini kiriting.');
    }

    @Action('cancel_sheets_config')
    async onCancel(@Ctx() ctx: Context) {
        await ctx.editMessageText('❌ Google Sheets sozlamalari bekor qilindi.');
        await ctx.scene.leave();
    }
}