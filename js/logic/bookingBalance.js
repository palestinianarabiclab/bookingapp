export function toFiniteMoney(value) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? amount : 0;
}

export function getLegacyLessonCredits(profile = {}, lessonPrice = 0) {
    const price = toFiniteMoney(lessonPrice);
    const balance = toFiniteMoney(profile.balance);
    if (Number.isFinite(Number(profile.lessonCredits))) {
        const credits = Math.max(0, Math.floor(Number(profile.lessonCredits || 0)));
        const totalPaid = toFiniteMoney(profile.totalPaid);
        const extraCredits = price > 0
            ? Math.max(0, Math.floor((balance - totalPaid) / price))
            : 0;
        return credits + extraCredits;
    }
    return price > 0 ? Math.max(0, Math.floor(balance / price)) : 0;
}

export function getAvailableLessonCredits(profile = {}, lessonPrice = 0, legacyReserved = 0) {
    const purchased = getLegacyLessonCredits(profile, lessonPrice);
    const reserved = Number.isFinite(Number(profile.reservedLessonCredits))
        ? Math.max(0, Math.floor(Number(profile.reservedLessonCredits)))
        : Math.max(0, Math.floor(Number(legacyReserved || 0)));
    return Math.max(0, purchased - reserved);
}

export function makeBookingOperationId(studentUid, slot, generation = "") {
    const safeUid = String(studentUid || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeSlot = Math.floor(Number(slot || 0));
    if (!safeUid || !safeSlot) throw new Error("A student and lesson time are required.");
    const safeGeneration = String(generation || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    return `student_${safeUid}_${safeSlot}${safeGeneration ? `_${safeGeneration}` : ""}`;
}

export function isFreeTrialEligible(profile = {}, bookings = []) {
    if (profile.trialUsed === true) return false;
    return !bookings.some((booking) => booking?.isFreeTrial === true || Boolean(booking));
}

export function getLessonConsumeAfter(booking = {}) {
    const slot = Number(booking.slot || 0);
    const duration = Math.max(15, Number(booking.durationMinutes || booking.slotMinutes || 50));
    return slot + duration * 60000;
}

export function getBookingSlotClaimIds(slot, durationMinutes, bucketMinutes = 15) {
    const start = Number(slot || 0);
    const duration = Math.max(15, Number(durationMinutes || 50));
    const bucketMs = Math.max(5, Number(bucketMinutes || 15)) * 60000;
    if (!Number.isFinite(start) || start <= 0) return [];
    const first = Math.floor(start / bucketMs);
    const last = Math.ceil((start + duration * 60000) / bucketMs) - 1;
    return Array.from({ length: last - first + 1 }, (_, index) => `slot_${first + index}`);
}

export function isLessonHistorical(booking = {}, now = Date.now()) {
    return getLessonConsumeAfter(booking) <= now;
}

export function isConsumptionEligible(booking = {}, now = Date.now()) {
    const status = String(booking.status || "booked").toLowerCase();
    if (booking.isFreeTrial === true || booking.balanceChargedAt || booking.balanceCharged) return false;
    if (!["booked", "rescheduled", "completed"].includes(status)) return false;
    return status === "completed" || getLessonConsumeAfter(booking) <= now;
}
