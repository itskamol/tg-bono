/**
 * Format number with thousand separators (123,456)
 */
export function formatNumber(num: number): string {
    return num.toLocaleString('en-US');
}

/**
 * Format currency with thousand separators and currency symbol
 */
export function formatCurrency(amount: number, currency: string = "so'm"): string {
    return `${formatNumber(amount)} ${currency}`;
}
