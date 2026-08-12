import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const rules = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../js/booking-app.js", import.meta.url), "utf8");

test("student profile and entitlement can be created atomically", () => {
    const entitlementRules = rules.slice(rules.indexOf("match /studentEntitlements/{uid}"), rules.indexOf("match /studentAccounting/{uid}"));
    assert.match(entitlementRules, /getAfter\(userDocPath\(uid\)\)/);
    assert.doesNotMatch(entitlementRules, /get\(userDocPath\(uid\)\)/);
});

test("failed sign-up cleans up an orphaned Firebase Auth account", () => {
    assert.match(app, /let newlyCreatedUser = null/);
    assert.match(app, /await newlyCreatedUser\.delete\(\)\.catch/);
});

test("an orphaned Auth account can complete its missing student documents", () => {
    assert.match(app, /auth\/email-already-in-use/);
    assert.match(app, /signInWithEmailAndPassword\(email, password\)/);
    assert.match(app, /if \(existingProfile\.exists\)/);
    assert.match(app, /Recover an Auth account left behind/);
});

test("legacy failed consumption is re-queued without changing balances directly", () => {
    const start = app.indexOf("async function repairLegacyFailedConsumption");
    const end = app.indexOf("async function rotateFuturePricingVersions", start);
    const repair = app.slice(start, end);
    assert.match(repair, /consumptionState: "pending"/);
    assert.match(repair, /pricingVersion: repair\.pricingVersion/);
    assert.doesNotMatch(repair, /lessonCredits:/);
    assert.doesNotMatch(repair, /balance:/);
});

test("legacy future lessons are reserved once without consuming money or credits", () => {
    const start = app.indexOf("async function reconcileLegacyFutureReservations");
    const end = app.indexOf("async function rotateFuturePricingVersions", start);
    const repair = app.slice(start, end);
    assert.match(repair, /legacyFutureReservationsV1/);
    assert.match(repair, /reservedLessonCredits: Math\.max\(currentReserved, activeReservations\)/);
    assert.match(repair, /reservationStatus: "reserved"/);
    assert.doesNotMatch(repair, /reservedAt:/);
    assert.doesNotMatch(repair, /lessonCredits:/);
    assert.doesNotMatch(repair, /balance:/);
});

test("legacy financial migration creates a unique immutable price snapshot per student", () => {
    const start = app.indexOf("async function migrateLegacyStudentFinancialData");
    const end = app.indexOf("async function migrateLegacyFinancialPrivacy", start);
    const migration = app.slice(start, end);
    assert.match(migration, /`legacy_migration_\$\{doc\.id\}_\$\{Date\.now\(\)\}`/);
    assert.doesNotMatch(migration, /String\(existingEntitlement\.pricingVersion/);
    assert.match(migration, /if \(Object\.keys\(deletions\)\.length\) batch\.update/);
});

test("consumption refund records the provided student id and remains idempotent", () => {
    const start = app.indexOf("async function refundBookingConsumption");
    const end = app.indexOf("async function openStudentLessonsModal", start);
    const refund = app.slice(start, end);
    assert.match(refund, /if \(operationSnap\.exists\) return/);
    assert.match(refund, /studentUid: studentId/);
    assert.doesNotMatch(refund, /studentUid, bookingId/);
    assert.match(refund, /booking\.studentUid && booking\.studentUid !== studentId/);
});

test("student lessons modal moves focus before becoming aria-hidden", () => {
    const start = app.indexOf("function closeStudentLessonsModal");
    const end = app.indexOf("function renderStudentLessonRecords", start);
    const close = app.slice(start, end);
    assert.ok(close.indexOf("studentLessonsModalReturnFocus.focus()") < close.indexOf('setAttribute("aria-hidden", "true")'));
    assert.match(close, /modal\.inert = true/);
    const openStart = app.indexOf("async function openStudentLessonsModal");
    const openEnd = app.indexOf("function confirmStudentCancellation", openStart);
    const open = app.slice(openStart, openEnd);
    assert.match(open, /modal\.inert = false/);
    assert.match(open, /modal\.querySelector\("\.modal__close"\)\?\.focus\(\)/);
});

test("active students combines registered and uniquely taught students", () => {
    const start = app.indexOf("function updateTeacherOverviewStats");
    const end = app.indexOf("function parseProfileCounter", start);
    const overview = app.slice(start, end);
    assert.match(overview, /activeStudentsEl\.textContent = getActiveStudentCount\(\)\.toLocaleString\(\)/);
    assert.doesNotMatch(overview, /Math\.max\(registeredCount, baseStudents/);
    assert.match(app, /knownStudentKeys/);
    assert.match(app, /knownPlatformStudentKeys/);
    assert.match(app, /async function syncPublicStudentCounts/);
    assert.match(app, /currentRegistered === registeredCount && currentActive === activeCount/);
});
