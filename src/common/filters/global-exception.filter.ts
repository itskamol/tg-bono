import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { TelegrafArgumentsHost } from 'nestjs-telegraf';
import { Context } from '../../interfaces/context.interface';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: any, host: ArgumentsHost) {
        const telegrafHost = TelegrafArgumentsHost.create(host);
        const ctx = telegrafHost.getContext<Context>();

        // Log the error
        this.logger.error('Global exception caught:', exception);

        // Handle different types of errors
        if (this.isNetworkError(exception)) {
            this.handleNetworkError(ctx, exception);
        } else if (this.isTimeoutError(exception)) {
            this.handleTimeoutError(ctx, exception);
        } else if (exception instanceof HttpException) {
            this.handleHttpException(ctx, exception);
        } else {
            this.handleGenericError(ctx, exception);
        }
    }

    private isNetworkError(exception: any): boolean {
        return exception?.code === 'ETIMEDOUT' || 
               exception?.type === 'system' ||
               exception?.message?.includes('network') ||
               exception?.message?.includes('ENOTFOUND') ||
               exception?.message?.includes('ECONNRESET');
    }

    private isTimeoutError(exception: any): boolean {
        return exception?.name === 'TimeoutError' ||
               exception?.message?.includes('timed out') ||
               exception?.code === 'ETIMEDOUT';
    }

    private async handleNetworkError(ctx: Context, exception: any) {
        this.logger.warn('Network error occurred, but continuing operation');
        
        // Don't send error message to user for network issues
        // Just log and continue
        try {
            // Only send message if it's a critical user-facing operation
            if (ctx?.reply && this.shouldNotifyUser(exception)) {
                await ctx.reply('⚠️ Tarmoq bilan bog\'liq muammo. Qaytadan urinib ko\'ring.');
            }
        } catch (replyError) {
            this.logger.error('Failed to send error message to user:', replyError);
        }
    }

    private async handleTimeoutError(ctx: Context, exception: any) {
        this.logger.warn('Timeout error occurred, but continuing operation');
        
        try {
            if (ctx?.reply && this.shouldNotifyUser(exception)) {
                await ctx.reply('⏱️ Vaqt tugadi. Qaytadan urinib ko\'ring.');
            }
        } catch (replyError) {
            this.logger.error('Failed to send timeout message to user:', replyError);
        }
    }

    private async handleHttpException(ctx: Context, exception: HttpException) {
        this.logger.error('HTTP exception:', exception.getResponse());
        
        try {
            if (ctx?.reply) {
                await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
            }
        } catch (replyError) {
            this.logger.error('Failed to send HTTP error message to user:', replyError);
        }
    }

    private async handleGenericError(ctx: Context, exception: any) {
        this.logger.error('Generic error:', exception);
        
        try {
            if (ctx?.reply) {
                await ctx.reply('❌ Kutilmagan xatolik. Administratorga murojaat qiling.');
            }
        } catch (replyError) {
            this.logger.error('Failed to send generic error message to user:', replyError);
        }
    }

    private shouldNotifyUser(exception: any): boolean {
        // Don't notify user for background operations like Google Sheets
        const backgroundOperations = [
            'GoogleSheetsService',
            'writeOrderToSheets',
            'appendData'
        ];
        
        const stack = exception?.stack || '';
        return !backgroundOperations.some(op => stack.includes(op));
    }
}