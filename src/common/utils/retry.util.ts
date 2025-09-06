import { Logger } from '@nestjs/common';

export interface RetryOptions {
    maxAttempts?: number;
    delay?: number;
    backoff?: boolean;
    onRetry?: (attempt: number, error: any) => void;
}

export async function withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxAttempts = 3,
        delay = 1000,
        backoff = true,
        onRetry
    } = options;

    const logger = new Logger('RetryUtil');
    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            if (attempt === maxAttempts) {
                logger.error(`Operation failed after ${maxAttempts} attempts:`, error);
                throw error;
            }

            const currentDelay = backoff ? delay * Math.pow(2, attempt - 1) : delay;
            
            if (onRetry) {
                onRetry(attempt, error);
            }
            
            logger.warn(`Attempt ${attempt} failed, retrying in ${currentDelay}ms:`, error.message);
            
            await new Promise(resolve => setTimeout(resolve, currentDelay));
        }
    }

    throw lastError;
}

export function isRetryableError(error: any): boolean {
    // Network errors
    if (error?.code === 'ETIMEDOUT' || 
        error?.code === 'ENOTFOUND' || 
        error?.code === 'ECONNRESET' ||
        error?.code === 'ECONNREFUSED') {
        return true;
    }

    // Timeout errors
    if (error?.name === 'TimeoutError' || 
        error?.message?.includes('timed out')) {
        return true;
    }

    // HTTP 5xx errors
    if (error?.response?.status >= 500) {
        return true;
    }

    // Rate limiting
    if (error?.response?.status === 429) {
        return true;
    }

    return false;
}