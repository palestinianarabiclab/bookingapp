import test from "node:test";
import assert from "node:assert/strict";

import {
    getAvailableLessonCredits,
    getBookingSlotClaimIds,
    getLegacyLessonCredits,
    getLessonConsumeAfter,
    isConsumptionEligible,
    isLessonHistorical,
    makeBookingOperationId,
} from "../js/logic/bookingBalance.js";

test("legacy money-only students retain their lesson entitlement", () => {
    assert.equal(getLegacyLessonCredits({ balance: 75 }, 15), 5);
});

test("same-slot and overlapping lessons share atomic claim buckets", () => {
    const start = Date.UTC(2026, 7, 10, 14, 0);
    const first = getBookingSlotClaimIds(start, 50);
    const same = getBookingSlotClaimIds(start, 50);
    const overlap = getBookingSlotClaimIds(start + 30 * 60000, 50);
    assert.deepEqual(first, same);
    assert.equal(first.some((id) => overlap.includes(id)), true);
});

test("non-overlapping variable-duration lessons do not share claim buckets", () => {
    const start = Date.UTC(2026, 7, 10, 14, 0);
    const thirty = getBookingSlotClaimIds(start, 30);
    const next = getBookingSlotClaimIds(start + 30 * 60000, 60);
    assert.equal(thirty.some((id) => next.includes(id)), false);
});

for (const duration of [30, 50, 60]) {
    test(`${duration}-minute lesson becomes historical at its real end`, () => {
        const booking = { slot: 1_000_000, durationMinutes: duration, status: "booked" };
        const end = booking.slot + duration * 60000;
        assert.equal(isLessonHistorical(booking, end - 1), false);
        assert.equal(isLessonHistorical(booking, end), true);
    });
}

test("package students use lesson credits without double-counting total paid", () => {
    assert.equal(getLegacyLessonCredits({ balance: 75, lessonCredits: 5, totalPaid: 75 }, 15), 5);
});

test("upcoming reservations reduce available-to-book but not purchased credits", () => {
    const profile = { balance: 75, lessonCredits: 5, totalPaid: 75, reservedLessonCredits: 2 };
    assert.equal(getLegacyLessonCredits(profile, 15), 5);
    assert.equal(getAvailableLessonCredits(profile, 15), 3);
});

test("legacy students use the observed reservation count until initialized", () => {
    assert.equal(getAvailableLessonCredits({ balance: 30 }, 15, 1), 1);
});

test("one available lesson permits one reservation and zero permits none", () => {
    assert.equal(getAvailableLessonCredits({ lessonCredits: 1, totalPaid: 15, balance: 15, reservedLessonCredits: 0 }, 15), 1);
    assert.equal(getAvailableLessonCredits({ lessonCredits: 1, totalPaid: 15, balance: 15, reservedLessonCredits: 1 }, 15), 0);
});

test("same student and slot always produce the same booking operation id", () => {
    const first = makeBookingOperationId("student-1", 1780000000000);
    const retry = makeBookingOperationId("student-1", 1780000000000);
    assert.equal(first, retry);
});

test("different slots produce different booking operation ids", () => {
    assert.notEqual(makeBookingOperationId("student-1", 1780000000000), makeBookingOperationId("student-1", 1780000060000));
});

test("rebooking after a cancellation uses a new deterministic generation", () => {
    const original = makeBookingOperationId("student-1", 1780000000000);
    const retry = makeBookingOperationId("student-1", 1780000000000, "after_1780000000100");
    assert.notEqual(original, retry);
    assert.equal(retry, makeBookingOperationId("student-1", 1780000000000, "after_1780000000100"));
});

test("lesson becomes consumable only after its scheduled end", () => {
    const booking = { slot: 1_000_000, durationMinutes: 50, status: "booked", isFreeTrial: false };
    const end = getLessonConsumeAfter(booking);
    assert.equal(isConsumptionEligible(booking, end - 1), false);
    assert.equal(isConsumptionEligible(booking, end), true);
});

test("completed legacy bookings remain eligible after lesson end", () => {
    const booking = { slot: 1_000_000, durationMinutes: 50, status: "completed", isFreeTrial: false };
    assert.equal(isConsumptionEligible(booking, getLessonConsumeAfter(booking)), true);
});

test("consumed and canceled bookings cannot be consumed again", () => {
    const base = { slot: 1_000_000, durationMinutes: 50, isFreeTrial: false };
    assert.equal(isConsumptionEligible({ ...base, status: "booked", balanceChargedAt: 2_000_000 }, 9_000_000), false);
    assert.equal(isConsumptionEligible({ ...base, status: "canceled" }, 9_000_000), false);
});
