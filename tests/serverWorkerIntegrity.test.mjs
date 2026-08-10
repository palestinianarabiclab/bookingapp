import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../apps-script/booking-sync.gs", import.meta.url), "utf8");

test("background worker processes targeted due consumption records", () => {
    assert.match(source, /fieldPath: 'consumptionDueAt'/);
    assert.match(source, /processDueLessonConsumption_\(config\)/);
});

test("lesson consumption uses a Firestore transaction and deterministic ledger", () => {
    assert.match(source, /:beginTransaction/);
    assert.match(source, /lessonTransactions\/booking_/);
    assert.match(source, /currentDocument: \{ exists: false \}/);
});

test("external Calendar deletion releases authoritative entitlement", () => {
    assert.match(source, /studentEntitlements\//);
    assert.match(source, /releaseStudentReservationAdmin_/);
    assert.doesNotMatch(source, /firestorePatchAdmin_\(config, 'users\/' \+ encodeURIComponent\(studentUid\), \{\s*reservedLessonCredits/);
});

test("unchanged Calendar mirrors do not create recurring Firestore writes", () => {
    assert.match(source, /if \(!changed && matches\.length === 1\) return/);
    assert.match(source, /everyMinutes\(10\)/);
    assert.match(source, /Date\.now\(\) \+ 120 \* 24 \* 60 \* 60 \* 1000/);
});
