export const PRICING_CURRENCY = "USD";

export function validPrice(value) {
    const price = Number(value);
    return Number.isFinite(price) && price > 0 && price <= 10000 ? Math.round(price * 100) / 100 : null;
}

export function resolvePriceSnapshot({ defaultPrice, customPrice, version, capturedAt = Date.now() } = {}) {
    const normalizedDefault = validPrice(defaultPrice);
    const normalizedCustom = validPrice(customPrice);
    if (normalizedDefault === null && normalizedCustom === null) return null;
    return Object.freeze({
        version: String(version || ""),
        effectivePrice: normalizedCustom ?? normalizedDefault,
        currency: PRICING_CURRENCY,
        source: normalizedCustom === null ? "default" : "custom",
        defaultPrice: normalizedDefault,
        customPrice: normalizedCustom,
        capturedAt: Number(capturedAt) || Date.now(),
    });
}

export function pricingDifference(snapshot) {
    const effective = validPrice(snapshot?.effectivePrice);
    const defaultPrice = validPrice(snapshot?.defaultPrice);
    if (effective === null || defaultPrice === null) return null;
    const amount = Math.round((defaultPrice - effective) * 100) / 100;
    return { amount: Math.abs(amount), kind: amount > 0 ? "discount" : amount < 0 ? "adjustment" : "none" };
}

export function historicalPriceLabel(snapshot) {
    const price = validPrice(snapshot?.effectivePrice);
    if (price === null) return "Unavailable (legacy)";
    return `${snapshot?.currency || PRICING_CURRENCY} ${price.toFixed(2)}`;
}
