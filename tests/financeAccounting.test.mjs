import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyFinanceDelta, deterministicConsumptionOperationId, packageCreditValue, refundedLessonCount } from "../js/logic/financeAccounting.js";

const app = fs.readFileSync(new URL("../js/booking-app.js", import.meta.url), "utf8");

test("discounted package credits full lesson value while preserving paid amount separately", () => {
    assert.equal(packageCreditValue({ lessons: 10, effectivePrice: 10 }), 100);
});

test("custom-priced package uses the student's effective price", () => {
    assert.equal(packageCreditValue({ lessons: 10, effectivePrice: 20 }), 200);
});

test("refund converts only an exact whole lesson amount", () => {
    assert.equal(refundedLessonCount({ amount: 10, effectivePrice: 10 }), 1);
    assert.equal(refundedLessonCount({ amount: 20, effectivePrice: 10 }), 2);
    assert.equal(refundedLessonCount({ amount: 10, effectivePrice: 15 }), null);
});

test("finance deltas apply to the latest transactional value", () => {
    assert.equal(applyFinanceDelta(70, 10), 80);
});

test("manual payments add whole lesson credits using the effective lesson price", () => {
    assert.match(app, /const paymentLessons = isPayment && effectivePrice > 0/);
    assert.match(app, /lessonDelta:\s*isPayment \? paymentLessons : restoredLessons/);
});

test("approved package credit repair adds missing lessons without adding another payment", () => {
    assert.match(app, /function repairApprovedPackageCredits/);
    assert.match(app, /data-student-action="repair-package-credits"/);
    assert.match(app, /paymentAmount:\s*0/);
});

test("consumption operation identity is deterministic", () => {
    assert.equal(deterministicConsumptionOperationId("abc", "consume"), "booking_abc_consume");
    assert.equal(deterministicConsumptionOperationId("abc", "consume"), deterministicConsumptionOperationId("abc", "consume"));
});
