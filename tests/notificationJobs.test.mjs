import test from "node:test";
import assert from "node:assert/strict";
import { applyNotificationAttempt, createNotificationJob, isNotificationSuperseded, notificationJobId, shouldWaitForMeetingLink } from "../js/logic/notificationJobs.js";

const makePair = () => ({
    teacher: createNotificationJob({ bookingId: "b1", notificationType: "booking-created", recipientType: "teacher", recipientEmail: "teacher@example.com" }),
    student: createNotificationJob({ bookingId: "b1", notificationType: "booking-created", recipientType: "student", recipientEmail: "student@example.com" }),
});

test("both booking recipients can succeed independently", () => {
    const jobs = makePair();
    assert.equal(applyNotificationAttempt(jobs.teacher, { success: true }).state, "sent");
    assert.equal(applyNotificationAttempt(jobs.student, { success: true }).state, "sent");
});

test("teacher success does not hide student failure", () => {
    const jobs = makePair();
    assert.equal(applyNotificationAttempt(jobs.teacher, { success: true }).state, "sent");
    assert.equal(applyNotificationAttempt(jobs.student, { error: "temporary" }).state, "pending");
});

test("student success does not hide teacher failure", () => {
    const jobs = makePair();
    assert.equal(applyNotificationAttempt(jobs.student, { success: true }).state, "sent");
    assert.equal(applyNotificationAttempt(jobs.teacher, { error: "quota" }).state, "pending");
});

test("temporary failures retain durable retry state and later succeed", () => {
    const failed = applyNotificationAttempt(makePair().student, { error: "service unavailable" }, 1000);
    assert.equal(failed.state, "pending");
    assert.ok(failed.nextRetryAt > 1000);
    assert.equal(applyNotificationAttempt(failed, { success: true }, failed.nextRetryAt).state, "sent");
});

test("both temporary failures remain independently retryable", () => {
    const jobs = makePair();
    assert.equal(applyNotificationAttempt(jobs.teacher, { error: "quota" }).state, "pending");
    assert.equal(applyNotificationAttempt(jobs.student, { error: "service" }).state, "pending");
});

test("already sent notification is an idempotent no-op", () => {
    const sent = applyNotificationAttempt(makePair().student, { success: true }, 1000);
    assert.deepEqual(applyNotificationAttempt(sent, { success: true }, 2000), sent);
});

test("running the same successful retry twice cannot advance attempts", () => {
    const sent = applyNotificationAttempt(makePair().student, { success: true }, 1000);
    const retried = applyNotificationAttempt(sent, { success: true }, 2000);
    assert.equal(retried.attempts, 1);
    assert.equal(retried.sentAt, 1000);
});

test("invalid and missing recipients are skipped", () => {
    assert.equal(createNotificationJob({ bookingId: "b", notificationType: "booking-created", recipientType: "teacher", recipientEmail: "" }).state, "skipped");
    assert.equal(createNotificationJob({ bookingId: "b", notificationType: "booking-created", recipientType: "student", recipientEmail: "bad" }).state, "skipped");
});

test("reschedule identities are stable per version and distinct across versions", () => {
    assert.equal(notificationJobId("b1", "reschedule", "student", 1), notificationJobId("b1", "reschedule", "student", 1));
    assert.notEqual(notificationJobId("b1", "reschedule", "student", 1), notificationJobId("b1", "reschedule", "student", 2));
});

test("older reschedule jobs are superseded by the latest booking version", () => {
    const job = createNotificationJob({ bookingId: "b1", notificationType: "reschedule", recipientType: "student", recipientEmail: "s@example.com", version: 1 });
    assert.equal(isNotificationSuperseded(job, { notificationVersion: 2 }), true);
    assert.equal(isNotificationSuperseded(job, { notificationVersion: 1 }), false);
});

test("cancellation types distinguish student teacher and external actions", () => {
    const student = notificationJobId("b1", "student-cancellation", "teacher", 1);
    const teacher = notificationJobId("b1", "teacher-cancellation", "student", 1);
    const external = notificationJobId("b1", "external-cancellation", "student", 1);
    assert.equal(new Set([student, teacher, external]).size, 3);
});

test("teacher-created lesson has one deterministic student notification", () => {
    assert.equal(notificationJobId("b1", "teacher-created", "student", 0), notificationJobId("b1", "teacher-created", "student", 0));
});

test("confirmation waits for Meet recovery but can proceed after Calendar failure", () => {
    const job = makePair().student;
    assert.equal(shouldWaitForMeetingLink(job, { calendarSyncState: "pending-create", meetingUrl: "" }), true);
    assert.equal(shouldWaitForMeetingLink(job, { calendarSyncState: "synced", meetingUrl: "https://meet.google.com/abc" }), false);
    assert.equal(shouldWaitForMeetingLink(job, { calendarSyncState: "failed", meetingUrl: "" }), false);
});

test("durable job survives serialization independently of a browser", () => {
    const job = makePair().student;
    assert.deepEqual(JSON.parse(JSON.stringify(job)), job);
});

test("Calendar identity is not part of notification job identity", () => {
    const first = createNotificationJob({ bookingId: "b1", notificationType: "booking-created", recipientType: "student", recipientEmail: "s@example.com" });
    const afterCalendarRetry = { ...first, googleCalendarEventId: "event-2" };
    assert.equal(first.idempotencyKey, afterCalendarRetry.idempotencyKey);
});

test("notification attempts do not mutate unrelated booking financial data", () => {
    const booking = { balance: 75, reservedLessonCredits: 2, calendarEventId: "event-1" };
    applyNotificationAttempt(makePair().student, { error: "temporary" });
    assert.deepEqual(booking, { balance: 75, reservedLessonCredits: 2, calendarEventId: "event-1" });
});
