import { Scene, SceneEnter, On, Message, Ctx, Action } from 'nestjs-telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../encryption.service';
import { GoogleSheetsService } from '../../sheets/google-sheets.service';
import { Context } from '../../interfaces/context.interface';
import { Markup } from 'telegraf';
import { safeReplyOrEdit } from '../../utils/telegram.utils';

@Scene('g-sheets-settings-scene')
export class GoogleSheetsSettingsScene {
    constructor(
        private readonly prisma: PrismaService,
        private readonly encryptionService: EncryptionService,
        private readonly googleSheetsService: GoogleSheetsService,
    ) {}

    @SceneEnter()
    async onSceneEnter(@Ctx() ctx: Context) {
        await safeReplyOrEdit(
            ctx,
            '📊 Google Sheets eksport sozlamalarini boshlash...\n\nGoogle Sheet ID sini kiriting.',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'cancel_sheets_config'),
            ]),
            'Google Sheets sozlamalari',
        );
    }

    @On('text')
    async onText(@Ctx() ctx: Context, @Message('text') text: string) {
        const sceneState = ctx.scene.state as any;

        if (!sceneState.sheetId) {
            sceneState.sheetId = text;
            await safeReplyOrEdit(
                ctx,
                `✅ Sheet ID o'rnatildi.\n\nEndi Service Account JSON faylining to'liq mazmunini joylashtiring.`,
                Markup.inlineKeyboard([
                    Markup.button.callback('⬅️ Orqaga', 'back_to_sheet_id'),
                    Markup.button.callback('❌ Bekor qilish', 'cancel_sheets_config'),
                ]),
                'Sheet ID saqlandi',
            );
            return;
        }

        if (!sceneState.serviceAccountJson) {
            try {
                // Validate that the input is a valid JSON
                const parsedJson = JSON.parse(text);
                if (parsedJson.type !== 'service_account' || !parsedJson.private_key) {
                    await safeReplyOrEdit(
                        ctx,
                        '❌ Noto\'g\'ri Service Account JSON.\nUnda "type": "service_account" va "private_key" bo\'lishi kerak.\nIltimos, qayta urinib ko\'ring.',
                        undefined,
                        "Noto'g'ri JSON",
                    );
                    return;
                }
                sceneState.serviceAccountJson = text;

                const gSheetsConfig = {
                    sheetId: sceneState.sheetId,
                    credentials: text,
                };

                // Test connection before saving
                await safeReplyOrEdit(
                    ctx,
                    '🔄 Google Sheets ulanishini tekshiryapman...',
                    undefined,
                    'Tekshirilmoqda',
                );

                const testResult = await this.googleSheetsService.testConnection(
                    sceneState.sheetId,
                    text,
                );

                if (!testResult.success) {
                    await safeReplyOrEdit(
                        ctx,
                        `❌ Google Sheets ulanish xatosi:\n\n${testResult.error}`,
                        undefined,
                        'Ulanish xatosi',
                    );
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

                await safeReplyOrEdit(
                    ctx,
                    '✅ Google Sheets eksport sozlamalari muvaffaqiyatli saqlandi va ulanish tekshirildi!',
                    undefined,
                    'Sozlamalar saqlandi',
                );
                await ctx.scene.leave();
            } catch (e) {
                await safeReplyOrEdit(
                    ctx,
                    "❌ Siz kiritgan matn to'g'ri JSON obyekt emas.\nIltimos, JSON faylining aniq mazmunini joylashtiring.",
                    Markup.inlineKeyboard([
                        Markup.button.callback('⬅️ Orqaga', 'back_to_sheet_id'),
                        Markup.button.callback('❌ Bekor qilish', 'cancel_sheets_config'),
                    ]),
                    "Noto'g'ri JSON",
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
        await safeReplyOrEdit(
            ctx,
            '📊 Google Sheets eksport sozlamalarini boshlash...\n\nGoogle Sheet ID sini kiriting.',
            Markup.inlineKeyboard([
                Markup.button.callback('❌ Bekor qilish', 'cancel_sheets_config'),
            ]),
            'Sheet ID qaytarish',
        );
    }

    @Action('cancel_sheets_config')
    async onCancel(@Ctx() ctx: Context) {
        await safeReplyOrEdit(
            ctx,
            '❌ Google Sheets sozlamalari bekor qilindi.',
            undefined,
            'Bekor qilindi',
        );
        await ctx.scene.leave();
    }
}
