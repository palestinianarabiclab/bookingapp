export function dedupeCalendarBusyBlocks(blocks = [], platformBookingIds = new Set()) {
    const seen = new Set();
    return blocks.filter((block) => {
        if (block?.bookingId && platformBookingIds.has(String(block.bookingId))) return false;
        const key = `${Number(block?.startMs || 0)}:${Number(block?.endMs || 0)}:${String(block?.calendarId || "")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function getNextCalendarRetryAt(attempts, now = Date.now()) {
    return now + Math.min(6 * 60 * 60 * 1000, Math.pow(2, Math.min(Math.max(1, Number(attempts || 1)), 8)) * 60000);
}

export function describeCalendarReconciliation(booking, event) {
    if (!event) return { type: "externally-deleted" };
    const slot = Number(event.startMs || 0);
    const durationMinutes = Math.max(15, Math.round((Number(event.endMs || 0) - slot) / 60000));
    const changed = slot !== Number(booking.slot || 0)
        || durationMinutes !== Number(booking.durationMinutes || booking.slotMinutes || 50)
        || (!!event.meetingUrl && event.meetingUrl !== String(booking.meetingUrl || ""));
    return changed
        ? { type: "externally-modified", slot, durationMinutes, consumeAfter: slot + durationMinutes * 60000, meetingUrl: event.meetingUrl || "" }
        : { type: "synced" };
}
