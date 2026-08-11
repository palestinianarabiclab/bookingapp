import { getBookingSlotClaimIds, getLessonConsumeAfter } from "./bookingBalance.js";
import { createNotificationJob } from "./notificationJobs.js";

export async function renderTeacherBookings({
    db,
    teacherBookingList,
    bookingCache,
    escapeHtml,
    formatSlotTime,
    snapshot = null,
}) {
    if (!teacherBookingList) return bookingCache;
    teacherBookingList.innerHTML = "<div class=\"small-note\">Loading bookings...</div>";
    bookingCache.clear();
    try {
        const now = Date.now();
        const calendarHistoryStart = Date.now() - 60 * 24 * 60 * 60 * 1000;
        let snap = snapshot;
        try {
            if (!snap) {
                snap = await db
                    .collection("bookings")
                    .where("slot", ">=", calendarHistoryStart)
                    .orderBy("slot")
                    .limit(100)
                    .get();
            }
        } catch (queryError) {
            const code = queryError?.code || "";
            const message = String(queryError?.message || "");
            const needsIndex = code === "failed-precondition" || message.toLowerCase().includes("index");
            if (!needsIndex) {
                throw queryError;
            }
            snap = await db
                .collection("bookings")
                .orderBy("slot")
                .limit(100)
                .get();
        }
        const items = [];
        snap.forEach((doc) => {
            const data = doc.data();
            if (!data || !data.slot) return;
            if (data.slot < calendarHistoryStart) return;
            items.push({ id: doc.id, ...data });
        });
        items.forEach((booking) => {
            bookingCache.set(booking.id, booking);
        });
        const managementItems = items.filter((booking) => getLessonConsumeAfter(booking) > now);
        if (!managementItems.length) {
            teacherBookingList.innerHTML = "<div class=\"small-note\">No upcoming bookings.</div>";
            return bookingCache;
        }
        teacherBookingList.innerHTML = managementItems
            .map((b) => {
                b = {
                    ...b,
                    name: escapeHtml(b.name || "Student"),
                    email: escapeHtml(b.email || ""),
                    phone: escapeHtml(b.phone || ""),
                };
                const status = b.status || "booked";
                const statusClass =
                    status === "canceled"
                        ? "booking-item__status booking-item__status--canceled"
                        : status === "rescheduled"
                            ? "booking-item__status booking-item__status--rescheduled"
                            : "booking-item__status";
                const statusLabel = status === "canceled"
                    ? "canceled"
                    : status === "rescheduled"
                        ? "rescheduled"
                        : "booked";
                const rescheduledFrom = b.rescheduledFrom
                    ? `<div class="booking-item__meta">From: ${escapeHtml(formatSlotTime(b.rescheduledFrom))}</div>`
                    : "";
                const notificationLabel = (recipient, value) => {
                    const normalized = String(value || "pending").toLowerCase();
                    return `${recipient} email: ${normalized === "sent" ? "Sent" : normalized === "skipped" ? "Skipped" : normalized === "failed" ? "Failed" : "Pending"}`;
                };
                const notificationStatus = `<div class="booking-item__meta" data-notification-status>${escapeHtml(notificationLabel("Student", b.studentNotificationStatus))} · ${escapeHtml(notificationLabel("Teacher", b.teacherNotificationStatus))}</div>`;
                const cutoffMs = 12 * 60 * 60 * 1000;
                const isLateCancel = (status !== "canceled" && status !== "completed") && (Number(b.slot || 0) - Date.now() < cutoffMs);
                const deadlineMs = Number(b.slot || 0) - cutoffMs;
                const formattedDeadline = formatSlotTime(deadlineMs);
                const lateLabel = isLateCancel
                    ? `<div style="font-size: 0.72rem; color: #991b1b; background: #fef2f2; border: 1px solid #fee2e2; padding: 4px 8px; border-radius: 4px; margin-top: 6px; line-height: 1.3; font-weight: 500;">⚠️ Within 12h Late-Cancellation Window<br><span style="font-size: 0.68rem; opacity: 0.85;">Deadline passed on ${escapeHtml(formattedDeadline)}</span></div>`
                    : (status !== "canceled" && status !== "completed") 
                        ? `<div style="font-size: 0.72rem; color: #166534; background: #f0fdf4; border: 1px solid #dcfce7; padding: 4px 8px; border-radius: 4px; margin-top: 6px; line-height: 1.3;">🕒 Reschedule Deadline: <strong>${escapeHtml(formattedDeadline)}</strong></div>`
                        : "";
                return `
                    <div class="booking-item" data-booking-id="${b.id}">
                        <div class="booking-item__main">
                            <div class="booking-item__title">${escapeHtml(b.name || "Student")}</div>
                            <div class="booking-item__meta">${b.email || ""} ${b.phone ? " | " + b.phone : ""}</div>
                            <div class="booking-item__time">${escapeHtml(formatSlotTime(b.slot))}</div>
                            ${rescheduledFrom}
                            <div class="${statusClass}">${escapeHtml(statusLabel)}</div>
                            ${notificationStatus}
                            ${lateLabel}
                        </div>
                        <div class="booking-item__actions" style="display: flex; flex-wrap: wrap; gap: 6px;">
                            <button class="btn btn--primary btn--small" data-action="classroom" data-booking-id="${b.id}">🎓 Enter Classroom / Video Call</button>
                            <button class="btn btn--ghost btn--small" data-action="complete" data-booking-id="${b.id}" ${status === "completed" || status === "canceled" ? "disabled" : ""}>✅ Completed</button>
                            <button class="btn btn--ghost btn--small" data-action="cancel" ${status === "canceled" ? "disabled" : ""}>Cancel</button>
                            <button class="btn btn--outline btn--small" data-action="reschedule" ${status === "canceled" ? "disabled" : ""}>Reschedule</button>
                        </div>
                        <div class="booking-item__resched"></div>
                    </div>
                `;
            })
            .join("");
        return bookingCache;
    } catch (error) {
        console.error("Could not load teacher bookings.", error);
        teacherBookingList.innerHTML = "<div class=\"small-note\">Unable to load bookings.</div>";
        return bookingCache;
    }
}

export async function openReschedulePanel({
    itemEl,
    booking,
    getAvailableSlots,
    escapeHtml,
}) {
    const resched = itemEl.querySelector(".booking-item__resched");
    if (!resched) return;
    if (resched.classList.contains("is-open")) {
        resched.classList.remove("is-open");
        resched.innerHTML = "";
        return;
    }
    resched.classList.add("is-open");
    resched.innerHTML = "<div class=\"small-note\">Loading slots...</div>";
    const slots = await getAvailableSlots(30, { excludeBookingId: booking.id });
    const options = slots.slice(0, 80).map((s) => {
        const ts = s.getTime();
        return `<option value="${ts}">${escapeHtml(s.toLocaleString())}</option>`;
    });
    if (!options.length) {
        resched.innerHTML = "<div class=\"small-note\">No available slots.</div>";
        return;
    }
    resched.innerHTML = `
        <select class="booking-resched-select">${options.join("")}</select>
        <button class="btn btn--primary btn--small" data-action="confirm-reschedule">Confirm</button>
        <button class="btn btn--ghost btn--small" data-action="close-reschedule">Close</button>
    `;
}

export async function cancelBooking({ db, firebase, bookingId }) {
    const bookingRef = db.collection("bookings").doc(bookingId);
    let booking = {};
    const canceledAt = Date.now();
    await db.runTransaction(async (transaction) => {
        const bookingSnap = await transaction.get(bookingRef);
        if (!bookingSnap.exists) throw new Error("Booking was not found.");
        booking = bookingSnap.data() || {};
        if (String(booking.status || "").toLowerCase() === "canceled") return;
        const userRef = booking.studentUid ? db.collection("users").doc(booking.studentUid) : null;
        const entitlementRef = booking.studentUid ? db.collection("studentEntitlements").doc(booking.studentUid) : null;
        const entitlementSnap = entitlementRef ? await transaction.get(entitlementRef) : null;
        const notificationVersion = Number(booking.notificationVersion || 0) + 1;
        transaction.set(
        bookingRef,
        {
            status: "canceled",
            calendarSynced: false,
            calendarDeletePending: true,
            updatedAt: canceledAt,
            canceledAt,
            canceledBy: "teacher",
            calendarSyncState: "pending-delete",
            calendarNextRetryAt: canceledAt,
            reservationStatus: "released",
            reservationReleasedAt: canceledAt,
            consumptionDueAt: null,
            consumptionState: "released",
            notificationVersion,
            studentNotificationStatus: "pending",
            history: firebase.firestore.FieldValue.arrayUnion({
                at: canceledAt,
                action: "canceled",
                by: "teacher",
            }),
        },
        { merge: true }
    );
    getBookingSlotClaimIds(booking.slot, booking.durationMinutes || booking.slotMinutes || 50)
        .forEach((id) => transaction.delete(db.collection("bookingSlotClaims").doc(id)));
    const cancelJob = createNotificationJob({ bookingId, notificationType: "teacher-cancellation", recipientType: "student", recipientEmail: booking.email || "", version: notificationVersion, createdAt: canceledAt, createdBy: "teacher" });
    transaction.set(db.collection("notificationJobs").doc(cancelJob.id), cancelJob);
        transaction.set(
        db.collection("publicBookings").doc(bookingId),
        {
            status: "canceled",
            updatedAt: canceledAt,
            calendarSynced: false,
        },
        { merge: true }
    );
    if (booking.isFreeTrial === true && booking.studentUid) {
        transaction.set(db.collection("users").doc(booking.studentUid), {
            trialUsed: false,
            trialUsedAt: firebase.firestore.FieldValue.delete(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.delete(db.collection("trialClaims").doc(booking.studentUid));
    } else if (entitlementRef && entitlementSnap?.exists && !booking.balanceChargedAt && !booking.balanceCharged &&
        !["released", "consumed", "not-required"].includes(String(booking.reservationStatus || ""))) {
        const current = Math.max(0, Number(entitlementSnap.data()?.reservedLessonCredits || 0));
        transaction.set(entitlementRef, {
            reservedLessonCredits: Math.max(0, current - 1),
            entitlementUpdatedAt: canceledAt,
        }, { merge: true });
    }
    });
}

export async function rescheduleBooking({
    db,
    firebase,
    bookingId,
    booking,
    newSlot,
    calendarSynced = false,
    googleCalendarEventId = null,
    meetingUrl = "",
    teacherEmail = "",
}) {
    const changedAt = Date.now();
    const durationMinutes = Number(booking.durationMinutes || booking.slotMinutes || 50);
    const notificationVersion = Number(booking.notificationVersion || 0) + 1;
    const oldClaimIds = getBookingSlotClaimIds(booking.slot, durationMinutes);
    const newClaimRefs = getBookingSlotClaimIds(newSlot, durationMinutes).map((id) => db.collection("bookingSlotClaims").doc(id));
    await db.runTransaction(async (transaction) => {
    const newClaims = await Promise.all(newClaimRefs.map((ref) => transaction.get(ref)));
    if (newClaims.some((claim) => claim.exists && claim.data()?.bookingId !== bookingId)) throw new Error("That time overlaps another platform lesson.");
    transaction.set(
        db.collection("bookings").doc(bookingId),
        {
            slot: newSlot,
            consumeAfter: newSlot + Number(booking.durationMinutes || booking.slotMinutes || 50) * 60000,
            consumptionDueAt: booking.isFreeTrial === true ? null : newSlot + Number(booking.durationMinutes || booking.slotMinutes || 50) * 60000,
            consumptionState: booking.isFreeTrial === true ? "not-required" : "pending",
            status: "rescheduled",
            rescheduledFrom: booking.slot,
            rescheduledAt: changedAt,
            calendarSynced,
            calendarSyncState: calendarSynced ? "synced" : "pending-update",
            calendarLastSyncedAt: calendarSynced ? changedAt : null,
            googleCalendarEventId,
            meetingUrl,
            notificationVersion,
            teacherNotificationStatus: "pending",
            studentNotificationStatus: "pending",
            studentNotice: "Your teacher changed the lesson time. Please review the updated schedule.",
            studentNoticeAt: Date.now(),
            history: firebase.firestore.FieldValue.arrayUnion({
                at: changedAt,
                action: "rescheduled",
                by: "teacher",
                from: booking.slot,
                to: newSlot,
            }),
        },
        { merge: true }
    );
    transaction.set(
        db.collection("publicBookings").doc(bookingId),
        {
            slot: newSlot,
            status: "rescheduled",
            updatedAt: changedAt,
            calendarSynced,
        },
        { merge: true }
    );
    oldClaimIds.filter((id) => !newClaimRefs.some((ref) => ref.id === id)).forEach((id) => transaction.delete(db.collection("bookingSlotClaims").doc(id)));
    newClaimRefs.forEach((ref) => transaction.set(ref, { bookingId, studentUid: booking.studentUid || "", slot: newSlot, durationMinutes, status: "active", updatedAt: changedAt }));
    [
        createNotificationJob({ bookingId, notificationType: "reschedule", recipientType: "teacher", recipientEmail: teacherEmail, version: notificationVersion, createdAt: changedAt, createdBy: "teacher", deferInvalid: true }),
        createNotificationJob({ bookingId, notificationType: "reschedule", recipientType: "student", recipientEmail: booking.email || "", version: notificationVersion, createdAt: changedAt, createdBy: "teacher" }),
    ].forEach((job) => transaction.set(db.collection("notificationJobs").doc(job.id), job));
    });
}

export async function resizeBookingDuration({
    db,
    firebase,
    bookingId,
    booking,
    durationMinutes,
}) {
    const updatedAt = Date.now();
    const previousDuration = Number(booking.durationMinutes || booking.slotMinutes || 50);
    const oldClaimIds = getBookingSlotClaimIds(booking.slot, previousDuration);
    const newClaimRefs = getBookingSlotClaimIds(booking.slot, durationMinutes).map((id) => db.collection("bookingSlotClaims").doc(id));
    await db.runTransaction(async (transaction) => {
    const claims = await Promise.all(newClaimRefs.map((ref) => transaction.get(ref)));
    if (claims.some((claim) => claim.exists && claim.data()?.bookingId !== bookingId)) throw new Error("The longer duration overlaps another platform lesson.");
    transaction.set(
        db.collection("bookings").doc(bookingId),
        {
            durationMinutes,
            consumeAfter: Number(booking.slot || 0) + durationMinutes * 60000,
            consumptionDueAt: booking.isFreeTrial === true ? null : Number(booking.slot || 0) + durationMinutes * 60000,
            consumptionState: booking.isFreeTrial === true ? "not-required" : "pending",
            updatedAt,
            studentNotice: `Your teacher changed the lesson duration to ${durationMinutes} minutes.`,
            studentNoticeAt: updatedAt,
            history: firebase.firestore.FieldValue.arrayUnion({
                at: updatedAt,
                action: "duration_changed",
                by: "teacher",
                from: previousDuration,
                to: durationMinutes,
            }),
        },
        { merge: true }
    );
    transaction.set(
        db.collection("publicBookings").doc(bookingId),
        {
            durationMinutes,
            updatedAt,
        },
        { merge: true }
    );
    oldClaimIds.filter((id) => !newClaimRefs.some((ref) => ref.id === id)).forEach((id) => transaction.delete(db.collection("bookingSlotClaims").doc(id)));
    newClaimRefs.forEach((ref) => transaction.set(ref, { bookingId, studentUid: booking.studentUid || "", slot: Number(booking.slot || 0), durationMinutes, status: "active", updatedAt }));
    });
}

export async function clearAllBookings({ db }) {
    let claimsSnap;
    do {
        claimsSnap = await db.collection("bookingSlotClaims").limit(300).get();
        if (!claimsSnap.empty) {
            const batch = db.batch();
            claimsSnap.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
        }
    } while (!claimsSnap.empty);
    let bookingSnap;
    do {
        bookingSnap = await db.collection("bookings").limit(300).get();
        if (!bookingSnap.empty) {
            const batch = db.batch();
            for (const doc of bookingSnap.docs) {
                batch.delete(db.collection("bookings").doc(doc.id));
            }
            await batch.commit();
        }
    } while (!bookingSnap.empty);

    let publicSnap;
    do {
        publicSnap = await db.collection("publicBookings").limit(300).get();
        if (!publicSnap.empty) {
            const batch = db.batch();
            for (const doc of publicSnap.docs) {
                batch.delete(db.collection("publicBookings").doc(doc.id));
            }
            await batch.commit();
        }
    } while (!publicSnap.empty);
}
