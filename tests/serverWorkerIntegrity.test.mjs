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

test("Firestore transaction document names use resource names rather than REST URLs", () => {
    assert.match(source, /return 'projects\/' \+ config\.firebaseProjectId \+ '\/databases\/\(default\)\/documents\/' \+ path/);
    assert.doesNotMatch(source, /return firestoreBaseUrl_\(config\.firebaseProjectId\) \+ '\/' \+ path/);
});

test("external Calendar deletion releases authoritative entitlement", () => {
    assert.match(source, /studentEntitlements\//);
    assert.match(source, /releaseStudentReservationAdmin_/);
    assert.doesNotMatch(source, /firestorePatchAdmin_\(config, 'users\/' \+ encodeURIComponent\(studentUid\), \{\s*reservedLessonCredits/);
});

test("unchanged Calendar mirrors do not create recurring Firestore writes", () => {
    assert.match(source, /if \(!changed && matches\.length === 1\) return/);
    assert.match(source, /everyMinutes\(10\)/);
    assert.match(source, /includeSecondMonth \? 60 : 31/);
    assert.match(source, /CALENDAR_EXTENDED_RECONCILE_AT/);
});
