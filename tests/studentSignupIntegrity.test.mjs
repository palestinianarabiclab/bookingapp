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
