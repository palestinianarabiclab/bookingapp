import test from "node:test";
import assert from "node:assert/strict";
import { dedupeCalendarBusyBlocks, describeCalendarReconciliation, getNextCalendarRetryAt } from "../js/logic/calendarSyncState.js";

test("new busy events appear and removed events disappear on snapshot replacement", () => {
    const initial = dedupeCalendarBusyBlocks([{ startMs: 1, endMs: 2 }]);
    const refreshed = dedupeCalendarBusyBlocks([{ startMs: 3, endMs: 4 }]);
    assert.deepEqual(initial.map((b) => b.startMs), [1]);
    assert.deepEqual(refreshed.map((b) => b.startMs), [3]);
});

test("platform Calendar mirror is not displayed as a second busy event", () => {
    const blocks = dedupeCalendarBusyBlocks([{ bookingId: "b1", startMs: 1, endMs: 2 }, { startMs: 3, endMs: 4 }], new Set(["b1"]));
    assert.deepEqual(blocks.map((b) => b.startMs), [3]);
});

test("same retry count has a deterministic bounded next-at delay", () => {
    assert.equal(getNextCalendarRetryAt(2, 1000), getNextCalendarRetryAt(2, 1000));
    assert.ok(getNextCalendarRetryAt(20, 1000) <= 1000 + 6 * 60 * 60 * 1000);
});

test("direct Google move and duration change update consumeAfter", () => {
    const result = describeCalendarReconciliation({ slot: 1000, durationMinutes: 50 }, { startMs: 2000, endMs: 2000 + 60 * 60000 });
    assert.equal(result.type, "externally-modified");
    assert.equal(result.durationMinutes, 60);
    assert.equal(result.consumeAfter, 2000 + 60 * 60000);
});

test("missing platform event is classified as externally deleted", () => {
    assert.deepEqual(describeCalendarReconciliation({ slot: 1000, durationMinutes: 50 }, null), { type: "externally-deleted" });
});

test("unchanged existing Calendar event is reused", () => {
    assert.deepEqual(describeCalendarReconciliation({ slot: 1000, durationMinutes: 50 }, { startMs: 1000, endMs: 1000 + 50 * 60000 }), { type: "synced" });
});
