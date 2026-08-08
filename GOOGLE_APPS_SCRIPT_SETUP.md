# Google Apps Script Setup

This is the stable path for:
- importing busy times from Google / Preply
- sending guest bookings to Google Calendar
- working without keeping the teacher dashboard open

## 1. Create the Apps Script

1. Open `https://script.google.com`
2. Create a new project
3. Replace the default file with the contents of:
   - `apps-script/booking-sync.gs`
4. Open `Project Settings`
5. Enable `Show "appsscript.json" manifest file in editor`
6. Open `appsscript.json` and replace it with:
   - `apps-script/appsscript.json`

## 2. Set Script Properties

In Apps Script:
1. `Project Settings`
2. `Script properties`
3. Add:

`PRIMARY_CALENDAR_ID`
: usually `primary`

`PREPLY_CALENDAR_ID`
: your Preply Google calendar ID

`ADDITIONAL_CALENDAR_IDS`
: optional. Add any other Google Calendar IDs that should block student booking times. Separate multiple IDs with commas or new lines.

`DEFAULT_TIMEZONE`
: for example `Africa/Cairo`

`FIREBASE_API_KEY`
: your Firebase Web API key. For this app it is the `apiKey` from `js/config.js`.

`FIREBASE_PROJECT_ID`
: for this app, use `farouqapp-7ea93`.

## 3. Deploy as Web App

1. Click `Deploy`
2. `New deployment`
3. Type: `Web app`
4. Execute as: `Me`
5. Who has access: `Anyone`
6. Deploy
7. Copy the `Web app URL`

## 4. Add it to the Teacher Dashboard

In your site:
1. Open Teacher Dashboard
2. Paste the Web App URL into `Apps Script Web App URL`
3. Click `Save Apps Script URL`
4. Click `Test Apps Script`
5. Click `Refresh Calendar Now` to verify Calendar and Preply access.

## 5. Enable automatic Calendar synchronization (required once)

The deploying Google account must have access to the Firebase project and the configured calendars.

1. Deploy the latest `booking-sync.gs` and `appsscript.json` and approve the requested Calendar and Datastore permissions.
2. In Apps Script, select the function `installCalendarSyncTrigger` and click **Run** once.
3. Approve permissions when prompted.
4. Open **Triggers** and verify `processCalendarSynchronization` is scheduled every five minutes.
5. Run `processCalendarSynchronization` once manually and confirm its execution succeeds.

This worker retries pending Calendar creates/deletes and reconciles direct Google changes without requiring a browser tab.
It also processes deterministic pending email notification jobs independently from Calendar state. No additional email trigger is required.

After changing `apps-script/booking-sync.gs`, create a new Apps Script deployment version, then keep the same Web App URL in the dashboard unless Google gives you a new one.

## 6. Lesson Reminders

The script supports two reminder paths:

- New Google Calendar events get a 15-minute popup/email reminder.
- A time trigger checks every 5 minutes for lessons starting in about 15 minutes and sends one reminder email to the student.

To enable the automatic email reminders:

1. Deploy the latest `apps-script/booking-sync.gs`.
2. In Apps Script, open `Triggers` from the left sidebar.
3. Click `Add Trigger`.
4. Choose function: `sendUpcomingLessonReminders`.
5. Event source: `Time-driven`.
6. Type: `Minutes timer`.
7. Interval: `Every 5 minutes`.
8. Save and approve Google permissions.
9. Optional: open the teacher dashboard and click `Check Reminders Now` to run one manual check.

If Google shows a permission error for `ScriptApp.getProjectTriggers`, ignore the dashboard install button and use the manual trigger steps above. Manual triggers do not need the website to call `ScriptApp`.

The script stores sent reminder markers in Apps Script properties so the same booking does not receive duplicate reminder emails.

## 7. Automatic Balance Deductions

The script can deduct student balances in the background without the teacher dashboard being open.

It charges:

- Completed lessons after the lesson time has passed.
- Student cancellations inside the 12-hour window.

It does not charge:

- Teacher cancellations.
- Lessons that were already charged.
- Lessons where the student has no lesson price set.

To enable it:

Balance deductions run from the authenticated teacher dashboard. No Firebase teacher email or password is stored in Apps Script.

To test manually, open the teacher dashboard and click `Check Balance Deductions`.

## 8. Optional

If you also want Preply busy times:
1. Save your Preply calendar ID in Apps Script properties
2. Also save it in the teacher dashboard for easier testing

If you also have busy events on another Google Calendar:
1. Open that calendar settings in Google Calendar
2. Copy its `Calendar ID`
3. Add it to `ADDITIONAL_CALENDAR_IDS`
4. Deploy a new Apps Script version

## Notes

- This removes the dependency on the teacher page staying open.
- It does not use the browser Google token for booking sync.
- If Apps Script cannot access the Preply calendar, the Google account that owns the script likely does not have permission to that calendar.
- Reminder email sending uses your Apps Script / Gmail daily quota.

## Phase 4 financial privacy deployment order

1. Deploy the web application code while the current Firestore rules remain active.
2. Sign in once as the teacher and wait for the dashboard to finish loading. The resumable `privacyMigrationV1` copies legacy money and price values into teacher-only documents before removing those fields from student-readable profiles and bookings.
3. Confirm `teacherAccounting/privacyMigrationV1.completed == true` in Firestore.
4. Deploy the updated `firestore.rules`.

Do not deploy the stricter rules before the migration marker exists. Legacy bookings containing financial fields are intentionally not student-readable under the new rules.
