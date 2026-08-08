export const NOTIFICATION_MAX_ATTEMPTS = 8;

export function notificationJobId(bookingId, notificationType, recipientType, version = 0) {
    return `booking_${String(bookingId || "").replace(/[^a-zA-Z0-9_-]/g, "_")}_${String(notificationType || "notification").replace(/[^a-zA-Z0-9_-]/g, "_")}_${Math.max(0, Number(version || 0))}_${recipientType}`;
}

export function isValidNotificationEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase());
}

export function notificationRetryAt(attempts, now = Date.now()) {
    const count = Math.max(1, Number(attempts || 1));
    return now + Math.min(24 * 60 * 60 * 1000, Math.pow(2, Math.min(count, 10)) * 5 * 60000);
}

export function createNotificationJob({
    bookingId,
    notificationType,
    recipientType,
    recipientEmail,
    version = 0,
    createdAt = Date.now(),
    createdBy = "system",
    deferInvalid = false,
}) {
    const email = String(recipientEmail || "").trim().toLowerCase();
    const valid = isValidNotificationEmail(email);
    return {
        id: notificationJobId(bookingId, notificationType, recipientType, version),
        bookingId,
        recipientType,
        recipientEmail: email,
        notificationType,
        version: Math.max(0, Number(version || 0)),
        state: valid || deferInvalid ? "pending" : "skipped",
        attempts: 0,
        createdAt,
        createdBy,
        sentAt: null,
        lastAttemptAt: null,
        nextRetryAt: valid || deferInvalid ? createdAt : 0,
        lastError: valid ? "" : deferInvalid ? `Waiting for configured ${recipientType} email.` : `Missing or invalid ${recipientType} email.`,
        idempotencyKey: notificationJobId(bookingId, notificationType, recipientType, version),
    };
}

export function applyNotificationAttempt(job, { success = false, error = "", permanent = false } = {}, now = Date.now()) {
    if (["sent", "skipped"].includes(job.state)) return { ...job };
    const attempts = Number(job.attempts || 0) + 1;
    if (success) return { ...job, state: "sent", attempts, sentAt: now, lastAttemptAt: now, nextRetryAt: 0, lastError: "" };
    const exhausted = attempts >= NOTIFICATION_MAX_ATTEMPTS;
    return {
        ...job,
        state: permanent || exhausted ? "failed" : "pending",
        attempts,
        lastAttemptAt: now,
        nextRetryAt: permanent || exhausted ? 0 : notificationRetryAt(attempts, now),
        lastError: String(error || "Email delivery failed."),
    };
}

export function shouldWaitForMeetingLink(job, booking) {
    return ["booking-created", "teacher-created"].includes(job.notificationType)
        && !booking?.meetingUrl
        && booking?.calendarSyncState !== "failed";
}

export function isNotificationSuperseded(job, booking) {
    return job.notificationType === "reschedule" && Number(job.version || 0) !== Number(booking?.notificationVersion || 0);
}
