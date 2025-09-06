/**
 * Format number with thousand separators (123,456)
 */
export function formatNumber(num: number | null | undefined): string {
    if (num === null || num === undefined || isNaN(num)) {
        return '0';
    }
    return num.toLocaleString('en-US');
}

/**
 * Format currency with thousand separators and currency symbol
 */
export function formatCurrency(amount: number | null | undefined, currency: string = "so'm"): string {
    if (amount === null || amount === undefined || isNaN(amount)) {
        return `0 ${currency}`;
    }
    return `${formatNumber(amount)} ${currency}`;
}

/**
 * Format percentage with one decimal place
 */
export function formatPercentage(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) {
        return '0.0%';
    }
    return `${value.toFixed(1)}%`;
}

/**
 * Format large numbers with K, M suffixes
 */
export function formatCompactNumber(num: number | null | undefined): string {
    if (num === null || num === undefined || isNaN(num)) {
        return '0';
    }
    
    if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
}

/**
 * Format date for Uzbek locale
 */
export function formatDate(date: Date | string, includeTime: boolean = false): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    
    if (includeTime) {
        return d.toLocaleString('uz-UZ', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    return d.toLocaleDateString('uz-UZ', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}
