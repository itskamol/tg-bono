import { Context } from '../interfaces/context.interface';

/**
 * Safely edit message text with error handling for "message is not modified" error
 */
export async function safeEditMessageText(
    ctx: Context,
    text: string,
    extra?: any,
    fallbackCbQueryText?: string,
): Promise<void> {
    try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra });
    } catch (error) {
        if (error.message?.includes('message is not modified')) {
            // Message content is the same, just acknowledge the callback query
            await ctx.answerCbQuery(fallbackCbQueryText || "Ma'lumot");
        } else if (error.message?.includes("message can't be edited")) {
            await ctx.reply(text, { parse_mode: 'HTML', ...extra });
        } else {
            throw error;
        }
    }
}

/**
 * Safely reply or edit message - tries to edit first, falls back to reply
 */
export async function safeReplyOrEdit(
    ctx: Context,
    text: string,
    extra?: any,
    fallbackCbQueryText?: string,
): Promise<void> {
    try {
        // Try to edit if there's a callback query (button press)
        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, { parse_mode: 'HTML', ...extra });
        } else {
            await ctx.reply(text, { parse_mode: 'HTML', ...extra });
        }
    } catch (error) {
        if (error.message?.includes('message is not modified')) {
            // Message content is the same, just acknowledge the callback query
            await ctx.answerCbQuery(fallbackCbQueryText || "Ma'lumot");
        } else if (error.message?.includes("message can't be edited")) {
            await ctx.reply(text, { parse_mode: 'HTML', ...extra });
        } else {
            throw error;
        }
    }
}

/**
 * Safely edit message reply markup with error handling
 */
export async function safeEditMessageReplyMarkup(
    ctx: Context,
    replyMarkup: any,
    fallbackCbQueryText?: string,
): Promise<void> {
    try {
        await ctx.editMessageReplyMarkup(replyMarkup);
    } catch (error) {
        if (error.message?.includes('message is not modified')) {
            await ctx.answerCbQuery(fallbackCbQueryText || "Ma'lumot");
        } else {
            throw error;
        }
    }
}
