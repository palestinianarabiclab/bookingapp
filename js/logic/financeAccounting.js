export function packageCreditValue({ lessons, effectivePrice }) {
    const lessonCount = Math.max(0, Math.floor(Number(lessons || 0)));
    const price = Number(effectivePrice || 0);
    return Number.isFinite(price) && price > 0 ? Math.round(lessonCount * price * 100) / 100 : 0;
}

export function refundedLessonCount({ amount, effectivePrice }) {
    const money = Number(amount || 0);
    const price = Number(effectivePrice || 0);
    if (!(money > 0) || !(price > 0)) return null;
    const raw = money / price;
    const whole = Math.round(raw);
    return whole >= 1 && Math.abs(raw - whole) <= 0.0001 ? whole : null;
}

export function applyFinanceDelta(current, delta) {
    const base = Number(current || 0);
    const change = Number(delta || 0);
    return Math.round((base + change) * 100) / 100;
}

export function deterministicConsumptionOperationId(bookingId, type = "consume") {
    return `booking_${String(bookingId || "").replace(/[^a-zA-Z0-9_-]/g, "_")}_${type}`;
}
