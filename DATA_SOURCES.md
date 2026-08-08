# Authoritative data sources

- Platform lesson: `bookings/{bookingId}`; `publicBookings` and slot claims are conflict/availability projections.
- Student entitlement and reservations: `studentEntitlements/{uid}`.
- Teacher-only student money and current custom price: `studentAccounting/{uid}`.
- Global default price: `teacherAccounting/global`.
- Historical price: immutable `pricingSnapshots/{pricingVersion}`, referenced by the booking and copied into its one-time `lessonTransactions` consumption record.
- Consumption: immutable deterministic `lessonTransactions/booking_{bookingId}_consume`.
- Calendar identity and Meet link: booking Calendar sync metadata reconciled with Google.
- External Google/Preply entries: busy blocks only; they are never platform bookings.
- Notification delivery: `notificationJobs`.

The one-time `privacyMigrationV1` runs at the first teacher sign-in after deployment. It copies legacy financial values before removing them from student-readable profiles/bookings and records completion in `teacherAccounting/privacyMigrationV1`.
