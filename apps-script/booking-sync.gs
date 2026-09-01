function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isTransientGoogleError_(err) {
  const message = String(err && err.message ? err.message : err || '').toLowerCase();
  return message.indexOf('service is currently unavailable') !== -1 ||
    message.indexOf('server error occurred') !== -1 ||
    message.indexOf('error code internal') !== -1 ||
    message.indexOf('internal error') !== -1 ||
    message.indexOf('backend error') !== -1 ||
    message.indexOf('timed out') !== -1 ||
    message.indexOf('rate limit') !== -1 ||
    message.indexOf('too many requests') !== -1;
}

function isRetryableHttpStatus_(status) {
  return status === 429 || status >= 500;
}

function withGoogleRetry_(label, fn) {
  const delays = [500, 1500, 3500];
  let lastErr = null;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientGoogleError_(err) || attempt === delays.length) {
        break;
      }
      Utilities.sleep(delays[attempt]);
    }
  }
  throw new Error(label + ' failed after retry: ' + (lastErr && lastErr.message ? lastErr.message : lastErr));
}

function getScriptProperty_(props, name, fallback) {
  const value = withGoogleRetry_('Read script property ' + name, function () {
    return props.getProperty(name);
  });
  return value || fallback || '';
}

function getDefaultNotificationEmail_() {
  try {
    return normalizeEmail_(Session.getEffectiveUser().getEmail());
  } catch (err) {
    return '';
  }
}

function getConfig_() {
  const props = withGoogleRetry_('Read script properties', function () {
    return PropertiesService.getScriptProperties();
  });
  const preplyRaw = getScriptProperty_(props, 'PREPLY_CALENDAR_ID', '');
  const additionalRaw = getScriptProperty_(props, 'ADDITIONAL_CALENDAR_IDS', '');
  const firebaseTeacherEmail = normalizeEmail_(getScriptProperty_(props, 'FIREBASE_TEACHER_EMAIL', 'farouqmurtaja96@gmail.com'));
  const firebaseTeacherEmails = String(getScriptProperty_(props, 'FIREBASE_TEACHER_EMAILS', 'farouqmurtaja96@gmail.com,farouqmoh@hotmail.com'))
    .split(',').map(normalizeEmail_).filter(Boolean);
  if (firebaseTeacherEmail && firebaseTeacherEmails.indexOf(firebaseTeacherEmail) === -1) firebaseTeacherEmails.push(firebaseTeacherEmail);
  const notificationEmail = normalizeEmail_(
    getScriptProperty_(props, 'NOTIFICATION_EMAIL', '') ||
    getDefaultNotificationEmail_() ||
    firebaseTeacherEmail
  );
  return {
    firebaseApiKey: getScriptProperty_(props, 'FIREBASE_API_KEY', 'AIzaSyCfhVE4hdR5P7YW6JOAnSC5az7s-J8zEsc'),
    firebaseProjectId: getScriptProperty_(props, 'FIREBASE_PROJECT_ID', 'farouqapp-7ea93'),
    firebaseTeacherEmail: firebaseTeacherEmail,
    firebaseTeacherEmails: firebaseTeacherEmails,
    primaryCalendarId: getScriptProperty_(props, 'PRIMARY_CALENDAR_ID', 'primary'),
    preplyCalendarId: normalizeCalendarId_(preplyRaw),
    additionalCalendarIds: parseCalendarIds_(additionalRaw),
    defaultTimeZone: getScriptProperty_(props, 'DEFAULT_TIMEZONE', '') || Session.getScriptTimeZone() || 'Africa/Cairo',
    notificationEmail: notificationEmail,
    siteUrl: getScriptProperty_(props, 'SITE_URL', 'https://palestinianarabiclab.vercel.app/'),
    teacherName: getScriptProperty_(props, 'TEACHER_NAME', 'Farouq'),
  };
}

const STUDENT_CHANGE_CUTOFF_MS_ = 12 * 60 * 60 * 1000;

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail_(value));
}

function sendPlainEmail_(recipient, subject, body) {
  const email = normalizeEmail_(recipient);
  if (!email) return false;
  MailApp.sendEmail(email, subject, body);
  return true;
}

function escapeEmailHtml_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function safeEmailUrl_(value) {
  const url = String(value || '').trim();
  return /^https:\/\//i.test(url) ? url : '';
}

function sendRichEmail_(recipient, subject, textBody, htmlBody, senderName) {
  const email = normalizeEmail_(recipient);
  if (!email) return false;
  MailApp.sendEmail({ to: email, subject: subject, body: textBody, htmlBody: htmlBody, name: senderName || 'Lesson Booking' });
  return true;
}

function getEmailQuotaPayload_() {
  const remaining = MailApp.getRemainingDailyQuota();
  return {
    success: true,
    message: 'Email quota loaded.',
    emailQuotaRemaining: remaining,
    quotaType: 'remaining_daily_recipients',
    resetWindow: 'Google resets quotas about 24 hours after the first send.',
  };
}

function sendBookingNotificationEmail_(recipient, details) {
  const subject = 'New lesson booking: ' + (details.name || 'Student');
  const body = [
    'A new lesson booking was created.',
    '',
    'Student: ' + (details.name || ''),
    'Email: ' + (details.email || ''),
    'Phone: ' + (details.phone || ''),
    'Slot: ' + (details.slotLabel || ''),
    'Timezone: ' + (details.timeZone || ''),
    'Duration: ' + (details.durationMinutes || 50) + ' minutes',
    'Lesson type: ' + (details.isFreeTrial ? 'Free trial' : 'Paid lesson'),
    'Booking ID: ' + (details.bookingId || ''),
    details.meetingUrl ? 'Google Meet: ' + details.meetingUrl : '',
    '',
    'Notes:',
    details.notes || 'None'
  ].join('\n');
  return sendPlainEmail_(recipient, subject, body);
}

function sendBookingCancellationEmail_(recipient, details) {
  const subject = 'Lesson booking canceled: ' + (details.name || 'Student');
  const body = [
    'A lesson booking was canceled.',
    '',
    'Canceled by: ' + (details.canceledBy || 'Student'),
    'Student: ' + (details.name || ''),
    'Email: ' + (details.email || ''),
    'Phone: ' + (details.phone || ''),
    'Slot: ' + (details.slotLabel || ''),
    'Timezone: ' + (details.timeZone || ''),
    'Booking ID: ' + (details.bookingId || ''),
    '',
    'Notes:',
    details.notes || 'None'
  ].join('\n');
  return sendPlainEmail_(recipient, subject, body);
}

function formatEmailSlot_(slot, timeZone) {
  if (!slot) return '';
  try {
    return Utilities.formatDate(new Date(slot), timeZone || 'UTC', 'EEE, MMM d, yyyy · h:mm a');
  } catch (error) {
    return Utilities.formatDate(new Date(slot), 'UTC', 'EEE, MMM d, yyyy · h:mm a') + ' UTC';
  }
}

function buildGoogleCalendarUrl_(details) {
  const slot = Number(details.slot || 0);
  const durationMinutes = Math.max(1, Number(details.durationMinutes || 50));
  if (!slot) return '';
  const start = Utilities.formatDate(new Date(slot), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const end = Utilities.formatDate(new Date(slot + durationMinutes * 60000), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const teacherName = details.teacherName || 'Your teacher';
  const description = ['Your Arabic lesson with ' + teacherName + '.', details.meetingUrl ? 'Join Google Meet: ' + details.meetingUrl : '', details.siteUrl ? 'Open your student account: ' + details.siteUrl : '', details.bookingId ? 'Booking ID: ' + details.bookingId : ''].filter(Boolean).join('\n\n');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text=' + encodeURIComponent('Arabic lesson with ' + teacherName) +
    '&dates=' + encodeURIComponent(start + '/' + end) +
    '&details=' + encodeURIComponent(description) +
    (details.meetingUrl ? '&location=' + encodeURIComponent(details.meetingUrl) : '');
}

function sendStudentConfirmationEmailLegacy_(recipient, details) {
  const teacherName = details.teacherName || 'Your teacher';
  const studentName = details.name || 'Student';
  const studentTimeZone = details.studentTimeZone || details.timeZone || 'UTC';
  const studentSlotLabel = details.studentSlotLabel || formatEmailSlot_(details.slot, studentTimeZone);
  const teacherSlotLabel = details.teacherSlotLabel || formatEmailSlot_(details.slot, details.timeZone || 'UTC');
  const calendarUrl = safeEmailUrl_(buildGoogleCalendarUrl_(details));
  const meetingUrl = safeEmailUrl_(details.meetingUrl);
  const siteUrl = safeEmailUrl_(details.siteUrl);
  const subject = 'Your Arabic lesson with ' + teacherName + ' is confirmed';
  const body = ['Hi ' + studentName + ',', '', 'Great news—your Arabic lesson is confirmed!', '', 'Your local date & time: ' + studentSlotLabel, 'Your timezone: ' + studentTimeZone, 'Duration: ' + (details.durationMinutes || 50) + ' minutes', details.timeZone && details.timeZone !== studentTimeZone ? 'Teacher time: ' + teacherSlotLabel + ' (' + details.timeZone + ')' : '', calendarUrl ? 'Add to Google Calendar: ' + calendarUrl : '', meetingUrl ? 'Join lesson: ' + meetingUrl : '', siteUrl ? 'Open your student account: ' + siteUrl : '', '', 'Keep showing up, keep speaking, and enjoy every step of your Arabic journey.', 'See you soon!', teacherName].filter(Boolean).join('\n');
  const button = function (url, label, background) {
    return url ? '<a href="' + escapeEmailHtml_(url) + '" style="display:inline-block;margin:6px 6px 6px 0;padding:14px 20px;border-radius:10px;background:' + background + ';color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;">' + label + '</a>' : '';
  };
  const html = '<div style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,sans-serif;color:#172033;"><div style="max-width:640px;margin:auto;overflow:hidden;border:1px solid #ded8ca;border-radius:20px;background:#ffffff;box-shadow:0 10px 30px rgba(23,32,51,.10);"><div style="padding:34px 28px;background:linear-gradient(145deg,#111827 0%,#0f766e 52%,#15803d 78%,#b91c1c 100%);color:#ffffff;text-align:center;"><div style="font-size:13px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;opacity:.88;">Booking confirmed</div><div style="margin-top:10px;font-size:30px;font-weight:800;line-height:1.2;">Your Arabic lesson is ready</div><div style="width:72px;height:4px;margin:19px auto 0;border-radius:4px;background:#ffffff;"></div></div><div style="padding:30px;"><p style="margin:0 0 15px;font-size:18px;">Hi <strong>' + escapeEmailHtml_(studentName) + '</strong>,</p><p style="margin:0 0 20px;line-height:1.7;color:#475569;">Great news—your lesson with <strong>' + escapeEmailHtml_(teacherName) + '</strong> is confirmed. Every lesson is another step toward speaking Arabic with more confidence.</p><div style="padding:19px;border-radius:14px;background:#f0fdfa;border:1px solid #99f6e4;border-left:5px solid #0f766e;"><div style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0f766e;">Your local lesson time</div><div style="margin-top:7px;font-size:21px;font-weight:800;color:#172033;">' + escapeEmailHtml_(studentSlotLabel) + '</div><div style="margin-top:6px;color:#64748b;">' + escapeEmailHtml_(studentTimeZone) + ' · ' + escapeEmailHtml_(String(details.durationMinutes || 50)) + ' minutes</div></div>' + (details.timeZone && details.timeZone !== studentTimeZone ? '<p style="margin:11px 2px 0;color:#64748b;font-size:13px;">Teacher time: ' + escapeEmailHtml_(teacherSlotLabel) + ' (' + escapeEmailHtml_(details.timeZone) + ')</p>' : '') + '<div style="margin-top:22px;">' + button(calendarUrl, 'Add to Google Calendar', '#2563eb') + button(meetingUrl, 'Join Google Meet', '#0f766e') + button(siteUrl, 'Open Student Website', '#c2410c') + '</div><p style="margin:25px 0 0;line-height:1.7;color:#475569;">Keep showing up, keep speaking, and enjoy every step of your Arabic journey. We look forward to seeing you!</p><p style="margin:18px 0 0;color:#475569;">Warmly,<br><strong>' + escapeEmailHtml_(teacherName) + '</strong></p></div><div style="padding:16px 30px;background:#f8fafc;color:#64748b;font-size:12px;text-align:center;">Palestinian Arabic · Real conversations · Learning with confidence</div></div></div>';
  return sendRichEmail_(recipient, subject, body, html, teacherName + ' Arabic Lessons');
}


function sendStudentConfirmationEmail_(recipient, details) {
  const teacherName = details.teacherName || 'Your teacher';
  const studentName = details.name || 'Student';
  const studentTimeZone = details.studentTimeZone || details.timeZone || 'UTC';
  const studentSlotLabel = details.studentSlotLabel || formatEmailSlot_(details.slot, studentTimeZone);
  const teacherSlotLabel = details.teacherSlotLabel || formatEmailSlot_(details.slot, details.timeZone || 'UTC');
  const calendarUrl = safeEmailUrl_(buildGoogleCalendarUrl_(details));
  const meetingUrl = safeEmailUrl_(details.meetingUrl);
  const siteUrl = safeEmailUrl_(details.siteUrl);
  const subject = 'Your Arabic lesson with ' + teacherName + ' is confirmed';
  const body = [
    'Hi ' + studentName + ',', '',
    'Great news - your Arabic lesson is confirmed!', '',
    'Your local date and time: ' + studentSlotLabel,
    'Your timezone: ' + studentTimeZone,
    'Duration: ' + (details.durationMinutes || 50) + ' minutes',
    details.timeZone && details.timeZone !== studentTimeZone ? 'Teacher time: ' + teacherSlotLabel + ' (' + details.timeZone + ')' : '',
    calendarUrl ? 'Google Calendar: ' + calendarUrl : '',
    meetingUrl ? 'Join lesson: ' + meetingUrl : '',
    siteUrl ? 'Student website: ' + siteUrl : '', '',
    'Keep showing up, keep speaking, and enjoy every step of your Arabic journey.',
    'See you soon!', teacherName
  ].filter(Boolean).join('\n');
  const actionButton = function (url, label, background) {
    return url ? '<a href="' + escapeEmailHtml_(url) + '" style="display:inline-block;margin:0 6px 8px 0;padding:13px 18px;border-radius:8px;background-color:' + background + ';color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">' + label + '</a>' : '';
  };
  const teacherTimeRow = details.timeZone && details.timeZone !== studentTimeZone
    ? '<tr><td style="padding:0 0 18px;color:#64748b;font-family:Arial,sans-serif;font-size:13px;">Teacher time: ' + escapeEmailHtml_(teacherSlotLabel) + ' (' + escapeEmailHtml_(details.timeZone) + ')</td></tr>'
    : '';
  const html = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f1ea" style="width:100%;margin:0;background-color:#f4f1ea;"><tr><td align="center" style="padding:20px 10px;">' +
    '<table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:620px;background-color:#ffffff;border:1px solid #ded8ca;">' +
    '<tr><td style="height:5px;line-height:5px;font-size:0;background-color:#111827;">&nbsp;</td></tr>' +
    '<tr><td align="center" bgcolor="#0f766e" style="padding:25px 22px;background-color:#0f766e;color:#ffffff;font-family:Arial,sans-serif;">' +
    '<div style="font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">Booking confirmed</div>' +
    '<div style="padding-top:8px;font-size:27px;font-weight:bold;line-height:1.25;">Your Arabic lesson is ready</div>' +
    '<div style="padding-top:8px;font-size:15px;">Arabic - conversation - confidence</div></td></tr>' +
    '<tr><td style="height:5px;line-height:5px;font-size:0;background-color:#b91c1c;">&nbsp;</td></tr>' +
    '<tr><td style="padding:28px 26px;font-family:Arial,sans-serif;color:#172033;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td style="padding:0 0 14px;font-size:18px;">Hi <strong>' + escapeEmailHtml_(studentName) + '</strong>,</td></tr>' +
    '<tr><td style="padding:0 0 20px;color:#475569;font-size:16px;line-height:1.65;">Great news - your lesson with <strong>' + escapeEmailHtml_(teacherName) + '</strong> is confirmed. Every lesson is another step toward speaking Arabic with more confidence.</td></tr>' +
    '<tr><td bgcolor="#f0fdfa" style="padding:18px;background-color:#f0fdfa;border:1px solid #99f6e4;border-left:5px solid #0f766e;">' +
    '<div style="color:#0f766e;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Your local lesson time</div>' +
    '<div style="padding-top:7px;color:#172033;font-size:21px;font-weight:bold;line-height:1.35;">' + escapeEmailHtml_(studentSlotLabel) + '</div>' +
    '<div style="padding-top:6px;color:#64748b;font-size:14px;">' + escapeEmailHtml_(studentTimeZone) + ' | ' + escapeEmailHtml_(String(details.durationMinutes || 50)) + ' minutes</div></td></tr>' +
    '<tr><td style="height:11px;line-height:11px;font-size:0;">&nbsp;</td></tr>' + teacherTimeRow +
    '<tr><td style="padding:0 0 8px;">' + actionButton(calendarUrl, 'Add to Google Calendar', '#2563eb') + actionButton(meetingUrl, 'Join Google Meet', '#0f766e') + actionButton(siteUrl, 'Open Student Website', '#c2410c') + '</td></tr>' +
    '<tr><td style="padding:8px 0 0;color:#475569;font-size:15px;line-height:1.65;">Use <strong>Add to Google Calendar</strong> above if you would like this lesson saved to your calendar.</td></tr>' +
    '<tr><td style="padding:20px 0 0;color:#475569;font-size:15px;line-height:1.65;">Keep showing up, keep speaking, and enjoy every step of your Arabic journey. We look forward to seeing you!</td></tr>' +
    '<tr><td style="padding:17px 0 0;color:#475569;font-size:15px;">Warmly,<br><strong>' + escapeEmailHtml_(teacherName) + '</strong></td></tr>' +
    '</table></td></tr>' +
    '<tr><td align="center" bgcolor="#f8fafc" style="padding:15px 20px;background-color:#f8fafc;color:#64748b;font-family:Arial,sans-serif;font-size:12px;">Palestinian Arabic | Real conversations | Learning with confidence</td></tr>' +
    '</table></td></tr></table>';
  return sendRichEmail_(recipient, subject, body, html, teacherName + ' Arabic Lessons');
}

function sendStudentScheduleUpdateEmail_(recipient, details) {
  const subject = 'Your lesson schedule was updated';
  const body = [
    'Hello ' + (details.name || 'Student') + ',',
    '',
    'Your teacher updated your lesson schedule.',
    '',
    'New date & time: ' + (details.slotLabel || ''),
    'Duration: ' + (details.durationMinutes || 50) + ' minutes',
    'Teacher timezone: ' + (details.timeZone || ''),
    details.meetingUrl ? 'Join lesson: ' + details.meetingUrl : '',
    '',
    'The updated lesson is also visible in your student account.',
    '',
    'Thank you.'
  ].join('\n');
  return sendPlainEmail_(recipient, subject, body);
}

function sendReviewRequestEmail_(recipient, details) {
  const subject = 'Farouq would appreciate your lesson review';
  const body = [
    'Hello ' + (details.name || 'Student') + ',',
    '',
    'Farouq has invited you to share feedback about your Arabic lessons.',
    '',
    'Please open the student website, sign in, and complete the teacher review form:',
    details.siteUrl || '',
    '',
    'Your honest feedback helps future students understand the learning experience.',
    '',
    'Thank you.'
  ].join('\n');
  return sendPlainEmail_(recipient, subject, body);
}

function sendNewStudentSignupEmail_(recipient, details) {
  const teacherName = details.teacherName || 'Farouq';
  const subject = 'New student account: ' + (details.name || 'Student');
  const dashboardUrl = safeEmailUrl_(details.dashboardUrl);
  const body = ['Hello ' + teacherName + ',', '', 'A new student created an account on your lesson website.', '', 'Student: ' + (details.name || 'Student'), 'Email: ' + (details.email || ''), details.phone ? 'Phone: ' + details.phone : '', '', dashboardUrl ? 'Open teacher dashboard: ' + dashboardUrl : ''].filter(Boolean).join('\n');
  const html = '<div style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,sans-serif;color:#172033;"><div style="max-width:620px;margin:auto;overflow:hidden;border:1px solid #ded8ca;border-radius:18px;background:#fff;box-shadow:0 8px 28px rgba(23,32,51,.08);"><div style="padding:25px 28px;background:#0f766e;color:#fff;"><div style="font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;opacity:.85;">New student</div><h1 style="margin:8px 0 0;font-size:26px;">A student joined your website</h1></div><div style="padding:28px;"><p style="margin:0 0 18px;line-height:1.6;">Hello <strong>' + escapeEmailHtml_(teacherName) + '</strong>, a new student has successfully created an account.</p><div style="padding:17px;border-radius:12px;background:#f8fafc;border-left:4px solid #0f766e;"><strong style="font-size:18px;">' + escapeEmailHtml_(details.name || 'Student') + '</strong><div style="margin-top:7px;color:#475569;">' + escapeEmailHtml_(details.email || '') + '</div>' + (details.phone ? '<div style="margin-top:5px;color:#475569;">' + escapeEmailHtml_(details.phone) + '</div>' : '') + '</div>' + (dashboardUrl ? '<a href="' + escapeEmailHtml_(dashboardUrl) + '" style="display:inline-block;margin-top:22px;padding:13px 20px;border-radius:10px;background:#0f766e;color:#fff;text-decoration:none;font-weight:700;">Open Teacher Dashboard</a>' : '') + '</div></div></div>';
  return sendRichEmail_(recipient, subject, body, html, teacherName + ' Arabic Lessons');
}

function sendStudentBookingInvitationEmail_(recipient, details) {
  const teacherName = details.teacherName || 'Farouq';
  const studentName = details.name || 'Student';
  const siteUrl = safeEmailUrl_(details.siteUrl);
  const subject = 'Ready for your next Arabic lesson, ' + studentName + '?';
  const body = ['Hi ' + studentName + ',', '', 'I hope you are doing well. It has been a little while since your last booking, and I would love to continue building on your Arabic progress.', 'When you are ready, choose a lesson time that works for you using the link below.', '', siteUrl, '', 'Hope to see you soon!', teacherName].join('\n');
  const html = '<div style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,sans-serif;color:#172033;"><div style="max-width:620px;margin:auto;overflow:hidden;border:1px solid #ded8ca;border-radius:18px;background:#fff;box-shadow:0 8px 28px rgba(23,32,51,.08);"><div style="padding:28px;background:linear-gradient(135deg,#0f766e,#115e59);color:#fff;"><div style="font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;opacity:.85;">Your Arabic journey</div><h1 style="margin:8px 0 0;font-size:27px;line-height:1.25;">Let\'s keep your progress moving</h1></div><div style="padding:30px;"><p style="margin:0 0 15px;font-size:17px;">Hi <strong>' + escapeEmailHtml_(studentName) + '</strong>,</p><p style="margin:0 0 15px;line-height:1.7;color:#475569;">I hope you\'re doing well. It\'s been a little while since your last booking, and I\'d love to continue building on your Arabic progress.</p><p style="margin:0 0 22px;line-height:1.7;color:#475569;">When you\'re ready, choose a time that works for you below. Hope to see you soon!</p>' + (siteUrl ? '<a href="' + escapeEmailHtml_(siteUrl) + '" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#0f766e;color:#fff;text-decoration:none;font-weight:700;">Schedule Your Next Lesson</a>' : '') + '<p style="margin:26px 0 0;line-height:1.6;color:#475569;">Warmly,<br><strong>' + escapeEmailHtml_(teacherName) + '</strong></p></div><div style="padding:15px 30px;background:#f8fafc;color:#64748b;font-size:12px;">You received this personal invitation from your Arabic teacher.</div></div></div>';
  return sendRichEmail_(recipient, subject, body, html, teacherName + ' Arabic Lessons');
}

function sendStudentWelcomeEmail_(recipient, details) {
  const teacherName = details.teacherName || 'Teacher';
  const studentName = details.name || 'Student';
  const siteUrl = safeEmailUrl_(details.siteUrl);
  const subject = 'Welcome to your Arabic learning journey, ' + studentName + '!';
  const body = ['Hi ' + studentName + ',', '', 'Ahlan wa sahlan! I am very happy to welcome you.', 'Learning Palestinian Arabic is more than learning words. It is a way to connect with people, stories, culture, and everyday life.', 'Whenever you are ready, visit the website and choose a lesson time that works for you.', '', siteUrl, '', 'I look forward to meeting you!', teacherName].join('\n');
  const html = '<div style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,sans-serif;color:#172033;"><div style="max-width:620px;margin:auto;overflow:hidden;border:1px solid #ded8ca;border-radius:18px;background:#fff;box-shadow:0 8px 28px rgba(23,32,51,.08);"><div style="padding:34px 28px;background:linear-gradient(145deg,#111827 0%,#0f766e 48%,#15803d 75%,#b91c1c 100%);color:#fff;text-align:center;"><div style="font-size:30px;font-weight:800;direction:rtl;">أهلاً وسهلاً</div><div style="margin-top:7px;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Welcome to Palestinian Arabic</div><div style="width:72px;height:4px;margin:18px auto 0;border-radius:4px;background:#fff;"></div></div><div style="padding:30px;"><p style="margin:0 0 15px;font-size:17px;">Hi <strong>' + escapeEmailHtml_(studentName) + '</strong>,</p><p style="margin:0 0 15px;line-height:1.7;color:#475569;"><strong>Ahlan wa sahlan!</strong> I\'m very happy to welcome you. Learning Palestinian Arabic is more than learning words—it\'s a way to connect with people, stories, culture, and everyday life.</p><p style="margin:0 0 22px;line-height:1.7;color:#475569;">Whenever you\'re ready, visit the website and choose a lesson time that works for you. We\'ll take it step by step and build your confidence together.</p>' + (siteUrl ? '<a href="' + escapeEmailHtml_(siteUrl) + '" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#0f766e;color:#fff;text-decoration:none;font-weight:700;">Explore Lessons & Schedule</a>' : '') + '<p style="margin:26px 0 0;line-height:1.6;color:#475569;">I look forward to meeting you!<br><strong>' + escapeEmailHtml_(teacherName) + '</strong></p></div><div style="padding:15px 30px;background:#f8fafc;color:#64748b;font-size:12px;text-align:center;">Palestinian Arabic • Real conversations • Learning with confidence</div></div></div>';
  return sendRichEmail_(recipient, subject, body, html, teacherName + ' Arabic Lessons');
}

function sendLessonReminderEmail_(recipient, details) {
  const teacherName = details.teacherName || 'Farouq';
  const subject = 'Your Arabic lesson with ' + teacherName + ' starts soon';
  const meetingUrl = safeEmailUrl_(details.meetingUrl);
  const siteUrl = safeEmailUrl_(details.siteUrl);
  const body = [
    'Hello ' + (details.name || 'Student') + ',', '',
    'Your Arabic lesson with ' + teacherName + ' starts in about 15 minutes.',
    'You are making great progress. Get comfortable, bring your questions, and let us make this lesson count!', '',
    'Date & time: ' + (details.slotLabel || ''), 'Timezone: ' + (details.timeZone || ''),
    meetingUrl ? 'Join lesson: ' + meetingUrl : '', siteUrl ? 'Open your student account: ' + siteUrl : '', '',
    'See you in class!', teacherName
  ].filter(Boolean).join('\n');
  const button = function (url, label, background) {
    return url ? '<a href="' + escapeEmailHtml_(url) + '" style="display:inline-block;margin:6px 6px 6px 0;padding:13px 20px;border-radius:10px;background:' + background + ';color:#ffffff;text-decoration:none;font-weight:700;">' + label + '</a>' : '';
  };
  const html = '<div style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,sans-serif;color:#172033;">' +
    '<div style="max-width:620px;margin:auto;overflow:hidden;border:1px solid #ded8ca;border-radius:18px;background:#ffffff;box-shadow:0 8px 28px rgba(23,32,51,.08);">' +
    '<div style="padding:26px;background:linear-gradient(135deg,#0f766e,#115e59);color:#ffffff;"><div style="font-size:13px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;opacity:.85;">Lesson reminder</div><h1 style="margin:8px 0 0;font-size:27px;line-height:1.2;">Your Arabic lesson starts soon</h1></div>' +
    '<div style="padding:28px;"><p style="margin:0 0 14px;font-size:17px;">Hello <strong>' + escapeEmailHtml_(details.name || 'Student') + '</strong>,</p>' +
    '<p style="margin:0 0 18px;line-height:1.65;color:#475569;">Your lesson with <strong>' + escapeEmailHtml_(teacherName) + '</strong> starts in about 15 minutes. You are making great progress—bring your questions and let\'s make today\'s lesson count!</p>' +
    '<div style="margin:18px 0;padding:16px;border-radius:12px;background:#f8fafc;border-left:4px solid #0f766e;"><strong style="display:block;font-size:17px;">' + escapeEmailHtml_(details.slotLabel || '') + '</strong><span style="display:block;margin-top:5px;color:#64748b;">Timezone: ' + escapeEmailHtml_(details.timeZone || '') + '</span></div>' +
    '<div style="margin-top:20px;">' + button(meetingUrl, 'Join Google Meet', '#0f766e') + button(siteUrl, 'Open Student Website', '#c2410c') + '</div>' +
    '<p style="margin:24px 0 0;color:#475569;line-height:1.6;">Take a breath, get comfortable, and be ready a few minutes early. See you in class!</p></div>' +
    '<div style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;">This reminder was sent automatically for your scheduled lesson.</div></div></div>';
  return sendRichEmail_(recipient, subject, body, html, teacherName + ' Arabic Lessons');
}

function sendTeacherLessonReminderEmail_(recipient, details) {
  return sendPlainEmail_(recipient, 'Reminder: lesson with ' + (details.name || 'Student') + ' starts soon', [
    'Your lesson starts in about 15 minutes.', '',
    'Student: ' + (details.name || ''), 'Student email: ' + (details.email || ''),
    'Date & time: ' + (details.slotLabel || ''), 'Timezone: ' + (details.timeZone || ''),
    'Booking ID: ' + (details.bookingId || ''),
    details.meetingUrl ? 'Join lesson: ' + details.meetingUrl : '', '',
    'Open the teacher dashboard for the current lesson details.'
  ].join('\n'));
}

/**
 * Run manually from the Apps Script editor to preview the student reminder.
 * Sends one email to NOTIFICATION_EMAIL and does not create or change a booking.
 */
function sendTestLessonReminderEmail() {
  const config = getConfig_();
  const recipient = normalizeEmail_(config.notificationEmail);
  if (!isValidEmail_(recipient)) {
    throw new Error('Set a valid NOTIFICATION_EMAIL in Script Properties first.');
  }
  const testStart = new Date(Date.now() + 15 * 60 * 1000);
  const sent = sendLessonReminderEmail_(recipient, {
    bookingId: 'PREVIEW-ONLY',
    name: 'Farouq',
    slotLabel: Utilities.formatDate(testStart, config.defaultTimeZone, 'yyyy-MM-dd HH:mm'),
    timeZone: config.defaultTimeZone,
    meetingUrl: 'https://meet.google.com/',
    siteUrl: config.siteUrl,
    teacherName: config.teacherName,
  });
  return {
    success: sent === true,
    recipient: recipient,
    message: sent ? 'Student reminder preview sent.' : 'Preview email was not sent.',
  };
}

function normalizeCalendarId_(value) {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (raw.indexOf('calendar.google.com') === -1) return raw;
  const srcMatch = raw.match(/[?&]src=([^&]+)/i);
  return srcMatch && srcMatch[1] ? decodeURIComponent(srcMatch[1]) : raw;
}

function parseEventDetails_(event, config) {
  const description = event.getDescription() || '';
  function pick(label) {
    const match = description.match(new RegExp('^' + label + ':\\s*(.*)$', 'mi'));
    return match && match[1] ? match[1].trim() : '';
  }
  return {
    bookingId: pick('Booking ID'),
    name: pick('Student') || event.getTitle().replace(/^Lesson with\s+/i, ''),
    email: pick('Email'),
    phone: pick('Phone'),
    timeZone: pick('Timezone') || config.defaultTimeZone,
    slotLabel: Utilities.formatDate(event.getStartTime(), pick('Timezone') || config.defaultTimeZone, 'yyyy-MM-dd HH:mm'),
  };
}

function getReminderKey_(event, details) {
  return String(details.bookingId || event.getId());
}

function getReminderHistory_(props) {
  try {
    const parsed = JSON.parse(props.getProperty('LESSON_REMINDER_HISTORY') || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

function saveReminderHistory_(props, history) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = Object.keys(history || {})
    .map(function (key) { return [key, Number(history[key] || 0)]; })
    .filter(function (entry) { return entry[1] >= cutoff; })
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 250);
  const compact = {};
  recent.forEach(function (entry) { compact[entry[0]] = entry[1]; });
  props.setProperty('LESSON_REMINDER_HISTORY', JSON.stringify(compact));
}

function cleanupLegacyScriptProperties() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  let removedReminderKeys = 0;
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('lesson_reminder_15_') === 0) {
      props.deleteProperty(key);
      removedReminderKeys += 1;
    }
  });
  props.deleteProperty('FIREBASE_TEACHER_PASSWORD');
  saveReminderHistory_(props, getReminderHistory_(props));
  return {
    success: true,
    removedReminderKeys: removedReminderKeys,
    message: 'Legacy reminder properties and the obsolete stored teacher password were removed.'
  };
}

function sendUpcomingLessonReminders() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'sendUpcomingLessonReminders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  return {
    success: true,
    message: 'Legacy email reminder trigger removed. Google Calendar sends the built-in 15-minute reminder.',
    sentCount: 0,
    skippedCount: 0,
    failedCount: 0,
    checkedCount: 0,
  };
}

function installLessonReminderTrigger() {
  return {
    success: true,
    manualSetupRequired: false,
    message: 'No reminder trigger is required. Google Calendar sends the built-in 15-minute reminder.',
  };
}

function reconcileStudentBalancesFromFirestore() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'reconcileStudentBalancesFromFirestore') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  console.log('Legacy standalone balance trigger removed. The unified five-minute worker handles atomic lesson consumption.');
  return {
    success: true,
    skipped: true,
    message: 'Legacy standalone balance reconciliation is no longer required; processCalendarSynchronization handles it.'
  };
}

function getLessonReminderTriggerStatus_() {
  return {
    success: true,
    message: 'Reminder trigger status must be checked from the Apps Script Triggers page.',
    triggerInstalled: null,
    triggerCount: null,
  };
}

function verifyFirebaseCaller_(config, authToken) {
  const token = String(authToken || '').trim();
  if (!token) {
    throw new Error('Authentication required.');
  }
  const response = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(config.firebaseApiKey),
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({ idToken: token }),
    }
  );
  const data = JSON.parse(response.getContentText() || '{}');
  const account = data.users && data.users[0];
  if (response.getResponseCode() >= 300 || !account || !account.localId) {
    throw new Error('Invalid or expired authentication.');
  }
  return {
    token: token,
    uid: String(account.localId),
    email: normalizeEmail_(account.email || ''),
  };
}

function getCallerRole_(config, caller) {
  try {
    const userDoc = firestoreFetch_(config, caller.token, '/users/' + encodeURIComponent(caller.uid), { method: 'get' });
    return fsString_(userDoc, 'role') || 'student';
  } catch (err) {
    return 'student';
  }
}

function getCallerRoleCheck_(config, caller) {
  try {
    const userDoc = firestoreFetch_(config, caller.token, '/users/' + encodeURIComponent(caller.uid), { method: 'get' });
    return { role: fsString_(userDoc, 'role') || 'student', error: '' };
  } catch (err) {
    return { role: 'student', error: err && err.message ? err.message : String(err) };
  }
}

function requireTeacherCaller_(config, authToken) {
  const caller = verifyFirebaseCaller_(config, authToken);
  const configuredTeacherEmails = Array.isArray(config.firebaseTeacherEmails)
    ? config.firebaseTeacherEmails
    : [config.firebaseTeacherEmail].filter(Boolean);
  if (configuredTeacherEmails.indexOf(caller.email) !== -1) return caller;
  const roleCheck = getCallerRoleCheck_(config, caller);
  const hasTeacherRole = roleCheck.role === 'teacher';
  const matchesConfiguredTeacher = configuredTeacherEmails.indexOf(caller.email) !== -1;
  if (!hasTeacherRole && !matchesConfiguredTeacher) {
    throw new Error(
      'Teacher access required. Signed in as "' + caller.email +
      '", configured teachers are "' + (configuredTeacherEmails.join(', ') || 'not configured') +
      '", Firestore role is "' + roleCheck.role + '"' +
      (roleCheck.error ? ', role lookup failed: ' + roleCheck.error : '') + '.'
    );
  }
  return caller;
}

function requireBookingCaller_(config, authToken, bookingId, slot) {
  if (!bookingId) {
    throw new Error('Missing booking ID.');
  }
  const caller = verifyFirebaseCaller_(config, authToken);
  const bookingDoc = firestoreFetch_(
    config,
    caller.token,
    '/bookings/' + encodeURIComponent(bookingId),
    { method: 'get' }
  );
  const bookingSlot = fsNumber_(bookingDoc, 'slot');
  if (slot && bookingSlot && Number(slot) !== bookingSlot) {
    throw new Error('Booking slot does not match.');
  }
  const callerRole = getCallerRole_(config, caller);
  const studentUid = fsString_(bookingDoc, 'studentUid');
  if (callerRole !== 'teacher' && studentUid !== caller.uid) {
    throw new Error('Booking access denied.');
  }
  return { caller: caller, role: callerRole, booking: bookingDoc };
}

function enforceCallerRateLimit_(caller, action, maxRequests, windowSeconds) {
  const cache = CacheService.getScriptCache();
  const key = ['rate', action, caller.uid].join(':');
  const current = Number(cache.get(key) || 0);
  if (current >= maxRequests) {
    throw new Error('Too many requests. Please wait and try again.');
  }
  cache.put(key, String(current + 1), windowSeconds);
}

function firestoreBaseUrl_(projectId) {
  return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/databases/(default)/documents';
}

function firestoreFetch_(config, token, path, options) {
  const res = withGoogleRetry_('Firestore request ' + path, function () {
    const response = UrlFetchApp.fetch(firestoreBaseUrl_(config.firebaseProjectId) + path, Object.assign({
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token },
    }, options || {}));
    if (isRetryableHttpStatus_(response.getResponseCode())) {
      throw new Error('Firestore request returned HTTP ' + response.getResponseCode() + ': ' + response.getContentText());
    }
    return response;
  });
  const text = res.getContentText();
  const data = text ? JSON.parse(text) : {};
  if (res.getResponseCode() >= 300) {
    const errorPayload = Array.isArray(data) ? data.find(function (item) { return item && item.error; }) : data;
    throw new Error(errorPayload && errorPayload.error && errorPayload.error.message
      ? errorPayload.error.message
      : 'Firestore request failed with HTTP ' + res.getResponseCode() + '.');
  }
  return data;
}

function fsField_(doc, name) {
  return doc && doc.fields ? doc.fields[name] : null;
}

function fsString_(doc, name) {
  const value = fsField_(doc, name);
  return value ? String(value.stringValue || '') : '';
}

function fsNumber_(doc, name) {
  const value = fsField_(doc, name);
  if (!value) return 0;
  if (value.integerValue !== undefined) return Number(value.integerValue || 0);
  if (value.doubleValue !== undefined) return Number(value.doubleValue || 0);
  return 0;
}

function parseCalendarIds_(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map(function (item) {
      return normalizeCalendarId_(item);
    })
    .filter(function (item, index, list) {
      return item && list.indexOf(item) === index;
    });
}

function getBusyCalendarIds_(config) {
  const ids = [config.primaryCalendarId || 'primary'];
  if (config.preplyCalendarId) ids.push(config.preplyCalendarId);
  (config.additionalCalendarIds || []).forEach(function (id) {
    if (ids.indexOf(id) === -1) ids.push(id);
  });
  return ids;
}

function hashCalendarStudent_(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return '';
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    normalized,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (item) {
    const valueByte = item < 0 ? item + 256 : item;
    return ('0' + valueByte.toString(16)).slice(-2);
  }).join('');
}

function extractPreplyStudentKey_(title) {
  let value = String(title || '').trim();
  if (!value) return '';
  if (/^(busy|time off|available|availability|google calendar|holiday|vacation)$/i.test(value)) {
    return '';
  }
  value = value
    .replace(/^(trial\s+)?lesson\s+with\s+/i, '')
    .replace(/^(trial\s+)?lesson\s*[-:]\s*/i, '')
    .replace(/^preply\s*[-:]\s*/i, '')
    .replace(/\s+\|\s+.*$/, '')
    .replace(/\s+\([^)]*\)\s*$/, '')
    .trim();
  if (!value || /^(lesson|trial lesson|busy)$/i.test(value)) return '';
  return hashCalendarStudent_(value);
}

function getPreplyStatistics_(config, days) {
  if (!config.preplyCalendarId) {
    return {
      success: false,
      message: 'PREPLY_CALENDAR_ID is not configured in Apps Script properties.',
    };
  }
  const calendar = CalendarApp.getCalendarById(config.preplyCalendarId);
  if (!calendar) {
    return {
      success: false,
      message: 'The configured Preply calendar could not be opened.',
    };
  }
  const safeDays = Math.max(30, Math.min(1825, Number(days || 730)));
  const end = new Date();
  const start = new Date(end.getTime() - safeDays * 24 * 60 * 60 * 1000);
  const now = Date.now();
  const completedEvents = calendar.getEvents(start, end)
    .filter(function (event) {
      return event.getEndTime().getTime() <= now &&
        !event.isAllDayEvent() &&
        extractPreplyStudentKey_(event.getTitle());
    })
    .map(function (event) {
      return {
        eventId: String(event.getId() || event.getEventSeriesId() || ''),
        studentKey: extractPreplyStudentKey_(event.getTitle()),
        start: event.getStartTime().getTime(),
        end: event.getEndTime().getTime(),
      };
    })
    .filter(function (event) {
      return event.eventId && event.studentKey;
    });
  const uniqueEvents = {};
  completedEvents.forEach(function (event) {
    uniqueEvents[event.eventId] = event;
  });
  const events = Object.keys(uniqueEvents)
    .map(function (eventId) { return uniqueEvents[eventId]; })
    .sort(function (a, b) { return a.start - b.start; })
    .slice(-5000);
  const studentKeys = events.map(function (event) {
    return event.studentKey;
  }).filter(function (studentKey, index, list) {
    return list.indexOf(studentKey) === index;
  });
  return {
    success: true,
    message: 'Preply statistics loaded.',
    eventIds: events.map(function (event) { return event.eventId; }),
    studentKeys: studentKeys,
    completedLessons: events.length,
    uniqueStudents: studentKeys.length,
    rangeDays: safeDays,
    syncedAt: Date.now(),
  };
}

function extractJsonArrayAfterMarker_(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) throw new Error('Preply reviews data was not found.');
  const arrayStart = start + marker.length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = arrayStart; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') { depth -= 1; if (depth === 0) return text.substring(arrayStart, i + 1); }
  }
  throw new Error('Preply reviews data was incomplete.');
}

function getPreplyReviews_() {
  const response = UrlFetchApp.fetch('https://preply.com/en/tutor/7213118', { muteHttpExceptions: true, followRedirects: true });
  if (response.getResponseCode() !== 200) throw new Error('Preply returned HTTP ' + response.getResponseCode() + '.');
  const raw = JSON.parse(extractJsonArrayAfterMarker_(response.getContentText(), '"reviews":['));
  const reviews = raw.map(function (review, index) {
    const createdAt = new Date(review.created || 0).getTime() || 0;
    const name = String((review.user || {}).firstName || 'Preply student').trim();
    return { id: 'preply-' + String(review.id), preplyReviewId: String(review.id), name: name, country: 'Verified student', rating: Math.max(1, Math.min(5, Number(review.score || 5))), tag: 'Preply student', date: Utilities.formatDate(new Date(createdAt), 'UTC', 'MMMM d, yyyy') + (review.isEdited ? ' (edited)' : ''), text: String(review.content || '').trim(), avatar: name.substring(0, 2).toUpperCase(), source: 'Preply', createdAt: createdAt, preplyOrder: index };
  }).filter(function (review) { return review.text; });
  return { success: true, message: 'Preply reviews loaded.', reviews: reviews, count: reviews.length };
}

function parseRequest_(e) {
  let body = {};
  try {
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (err) {}
  const params = (e && e.parameter) || {};
  return Object.assign({}, params, body);
}

function listEvents_(calendarId, start, end) {
  const cal = CalendarApp.getCalendarById(calendarId);
  if (!cal) return [];
  return cal.getEvents(start, end).map(function (event) {
    return {
      id: event.getId(),
      title: event.getTitle(),
      description: event.getDescription() || '',
      start: event.getStartTime().getTime(),
      end: event.getEndTime().getTime(),
      calendarId: calendarId,
    };
  });
}

function hasConflictingEvent_(calendarIds, start, end) {
  for (var i = 0; i < calendarIds.length; i += 1) {
    const events = listEvents_(calendarIds[i], start, end);
    for (var j = 0; j < events.length; j += 1) {
      const event = events[j];
      if (start.getTime() < Number(event.end || 0) && end.getTime() > Number(event.start || 0)) {
        return true;
      }
    }
  }
  return false;
}

function hasConflictingEventExcept_(calendarIds, start, end, excludedEventId) {
  for (var i = 0; i < calendarIds.length; i += 1) {
    const events = listEvents_(calendarIds[i], start, end);
    for (var j = 0; j < events.length; j += 1) {
      const event = events[j];
      if (excludedEventId && event.id === excludedEventId) continue;
      if (start.getTime() < Number(event.end || 0) && end.getTime() > Number(event.start || 0)) {
        return true;
      }
    }
  }
  return false;
}

function isSameCalendarEventId_(left, right) {
  if (!left || !right) return false;
  return left === right || String(left).split('@')[0] === String(right).split('@')[0];
}

function hasConflictingStudentLesson_(calendar, start, end, excludedEventId) {
  const events = calendar.getEvents(start, end);
  for (var i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (isSameCalendarEventId_(event.getId(), excludedEventId)) continue;
    if ((event.getDescription() || '').indexOf('Booking ID:') === -1) continue;
    if (start.getTime() < event.getEndTime().getTime() && end.getTime() > event.getStartTime().getTime()) {
      return true;
    }
  }
  return false;
}

function findBookingEvent_(cal, eventId, bookingId, slot) {
  if (eventId) {
    try {
      const event = cal.getEventById(eventId);
      if (event) return event;
    } catch (err) {}
  }
  if (!bookingId) return null;

  const center = slot ? new Date(Number(slot)) : new Date();
  const start = new Date(center.getTime() - 14 * 24 * 60 * 60 * 1000);
  const end = new Date(center.getTime() + 180 * 24 * 60 * 60 * 1000);
  const needle = 'Booking ID: ' + bookingId;
  let events = [];
  try {
    events = cal.getEvents(start, end, { search: needle });
  } catch (err) {
    events = cal.getEvents(start, end);
  }

  for (var i = 0; i < events.length; i += 1) {
    const description = events[i].getDescription() || '';
    if (description.indexOf(needle) !== -1) {
      return events[i];
    }
  }
  return null;
}

function ensureBookingMeetingLink_(config, bookingId, slot) {
  if (!bookingId || !slot) return { eventId: '', meetingUrl: '' };
  const center = new Date(Number(slot));
  const options = {
    timeMin: new Date(center.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(center.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    q: 'Booking ID: ' + bookingId,
    singleEvents: true,
    maxResults: 20,
  };
  const response = Calendar.Events.list(config.primaryCalendarId, options);
  const items = (response && response.items) || [];
  const needle = 'Booking ID: ' + bookingId;
  const apiEvent = items.filter(function (item) {
    return String(item.description || '').indexOf(needle) !== -1;
  })[0];
  if (!apiEvent) return { eventId: '', meetingUrl: '' };
  if (apiEvent.hangoutLink) {
    return { eventId: apiEvent.id || apiEvent.iCalUID || '', meetingUrl: apiEvent.hangoutLink };
  }
  const patched = Calendar.Events.patch({
    conferenceData: {
      createRequest: {
        requestId: 'recover-' + bookingId + '-' + Date.now(),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  }, config.primaryCalendarId, apiEvent.id, {
    conferenceDataVersion: 1,
    sendUpdates: 'all'
  });
  const meetingUrl = patched.hangoutLink ||
    ((((patched.conferenceData || {}).entryPoints || []).filter(function (entry) {
      return entry.entryPointType === 'video';
    })[0] || {}).uri || '');
  return { eventId: patched.id || patched.iCalUID || apiEvent.id || '', meetingUrl: meetingUrl };
}

function buildBusyBlocks_(events, timeZone, includeTitles) {
  return events
    .slice()
    .sort(function (a, b) {
      return Number(a.start || 0) - Number(b.start || 0);
    })
    .map(function (event) {
      const start = new Date(event.start);
      const end = new Date(event.end);
      return {
        startMs: start.getTime(),
        endMs: end.getTime(),
        date: Utilities.formatDate(start, timeZone, 'yyyy-MM-dd'),
        start: Utilities.formatDate(start, timeZone, 'HH:mm'),
        end: Utilities.formatDate(end, timeZone, 'HH:mm'),
        note: includeTitles ? (event.title || 'Busy') : 'Busy',
        sourceEventId: event.id || '',
        bookingId: ((String(event.description || '').match(/^Booking ID:\s*(.+)$/mi) || [])[1] || '').trim(),
        sourceType: 'calendar',
        calendarId: event.calendarId || '',
      };
    });
}

function getBusyCacheKey_(calendarIds, days, timeZone) {
  return [
    'busy',
    String(days || 0),
    String(timeZone || ''),
    calendarIds.join('|')
  ].join('::');
}

function firestoreAdminFetch_(config, path, options) {
  const token = ScriptApp.getOAuthToken();
  return firestoreFetch_(config, token, path, options);
}

function fsBool_(doc, name) {
  const value = fsField_(doc, name);
  return value ? value.booleanValue === true : false;
}

function fsArray_(doc, name) {
  const value = fsField_(doc, name);
  return value && value.arrayValue && Array.isArray(value.arrayValue.values) ? value.arrayValue.values : [];
}

function fsHistoryHasAction_(doc, action) {
  return fsArray_(doc, 'history').some(function (value) {
    return value && value.mapValue && value.mapValue.fields && value.mapValue.fields.action &&
      String(value.mapValue.fields.action.stringValue || '') === action;
  });
}

function firestoreValue_(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue_) } };
  if (typeof value === 'object') {
    const fields = {};
    Object.keys(value).forEach(function (key) { fields[key] = firestoreValue_(value[key]); });
    return { mapValue: { fields: fields } };
  }
  return { stringValue: String(value) };
}

function firestoreDocumentName_(config, path) {
  return 'projects/' + config.firebaseProjectId + '/databases/(default)/documents/' + path;
}

function firestoreBatchGetAdmin_(config, documentNames, transaction) {
  const rows = firestoreAdminFetch_(config, ':batchGet', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ documents: documentNames, transaction: transaction })
  });
  return Array.isArray(rows) ? rows : [];
}

function batchGetFound_(rows, documentName) {
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i].found && rows[i].found.name === documentName) return rows[i].found;
  }
  return null;
}

function cloneFirestoreFields_(doc) {
  return JSON.parse(JSON.stringify((doc && doc.fields) || {}));
}

function appendFirestoreArrayValue_(fields, fieldName, value) {
  const current = fields[fieldName] && fields[fieldName].arrayValue && Array.isArray(fields[fieldName].arrayValue.values)
    ? fields[fieldName].arrayValue.values.slice() : [];
  current.push(value);
  fields[fieldName] = { arrayValue: { values: current } };
}

function firestoreWriteExisting_(doc, fields) {
  return { update: { name: doc.name, fields: fields }, currentDocument: { updateTime: doc.updateTime } };
}

function queryDueConsumptionBookingsAdmin_(config, now, limit) {
  const result = firestoreAdminFetch_(config, ':runQuery', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'bookings' }],
      where: { fieldFilter: { field: { fieldPath: 'consumptionDueAt' }, op: 'LESS_THAN_OR_EQUAL', value: firestoreValue_(now) } },
      orderBy: [{ field: { fieldPath: 'consumptionDueAt' }, direction: 'ASCENDING' }],
      limit: Math.max(1, Math.min(100, Number(limit || 50)))
    } })
  });
  return Array.isArray(result) ? result.map(function (row) { return row.document; }).filter(Boolean) : [];
}

function consumeOneBookingAdmin_(config, candidate, now) {
  const bookingId = firestoreDocId_(candidate);
  const bookingName = firestoreDocumentName_(config, 'bookings/' + bookingId);
  const begin = firestoreAdminFetch_(config, ':beginTransaction', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ options: { readWrite: {} } })
  });
  const transaction = begin.transaction;
  try {
    const bookingRows = firestoreBatchGetAdmin_(config, [bookingName], transaction);
    const booking = batchGetFound_(bookingRows, bookingName);
    if (!booking) return { consumed: false, reason: 'missing-booking' };
    if (fsNumber_(booking, 'balanceChargedAt') || fsBool_(booking, 'balanceCharged')) {
      const fields = cloneFirestoreFields_(booking);
      fields.consumptionDueAt = firestoreValue_(null);
      fields.consumptionState = firestoreValue_('consumed');
      firestoreAdminFetch_(config, ':commit', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction, writes: [firestoreWriteExisting_(booking, fields)] }) });
      return { consumed: false, reason: 'already-consumed' };
    }
    const studentUid = fsString_(booking, 'studentUid');
    let pricingVersion = fsString_(booking, 'pricingVersion');
    if (fsBool_(booking, 'isFreeTrial')) {
      const fields = cloneFirestoreFields_(booking);
      fields.consumptionDueAt = firestoreValue_(null);
      fields.consumptionState = firestoreValue_('not-required');
      firestoreAdminFetch_(config, ':commit', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction, writes: [firestoreWriteExisting_(booking, fields)] }) });
      return { consumed: false, reason: 'free-trial' };
    }
    if (!studentUid) {
      const fields = cloneFirestoreFields_(booking);
      fields.consumptionDueAt = firestoreValue_(null);
      fields.consumptionState = firestoreValue_('failed');
      fields.consumptionLastError = firestoreValue_('Missing student or historical pricing snapshot.');
      firestoreAdminFetch_(config, ':commit', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction, writes: [firestoreWriteExisting_(booking, fields)] }) });
      return { consumed: false, reason: 'missing-accounting' };
    }
    const accountingName = firestoreDocumentName_(config, 'studentAccounting/' + studentUid);
    const entitlementName = firestoreDocumentName_(config, 'studentEntitlements/' + studentUid);
    const ledgerName = firestoreDocumentName_(config, 'lessonTransactions/booking_' + bookingId + '_consume');
    const rows = firestoreBatchGetAdmin_(config, [accountingName, entitlementName, ledgerName], transaction);
    const accounting = batchGetFound_(rows, accountingName);
    const entitlement = batchGetFound_(rows, entitlementName);
    const ledger = batchGetFound_(rows, ledgerName);
    if (ledger) {
      const fields = cloneFirestoreFields_(booking);
      fields.consumptionDueAt = firestoreValue_(null);
      fields.consumptionState = firestoreValue_('consumed');
      firestoreAdminFetch_(config, ':commit', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction, writes: [firestoreWriteExisting_(booking, fields)] }) });
      return { consumed: false, reason: 'ledger-exists' };
    }
    if (!accounting || !entitlement) throw new Error('Missing accounting or entitlement for ' + bookingId + '.');
    if (!pricingVersion || pricingVersion === 'legacy-unpriced') pricingVersion = fsString_(entitlement, 'pricingVersion');
    if (!pricingVersion || pricingVersion === 'legacy-unpriced' || pricingVersion === 'unconfigured') {
      const fields = cloneFirestoreFields_(booking);
      fields.consumptionDueAt = firestoreValue_(null);
      fields.consumptionState = firestoreValue_('failed');
      fields.consumptionLastError = firestoreValue_('Missing historical and student pricing snapshot.');
      firestoreAdminFetch_(config, ':commit', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction, writes: [firestoreWriteExisting_(booking, fields)] }) });
      return { consumed: false, reason: 'missing-accounting' };
    }
    const pricingName = firestoreDocumentName_(config, 'pricingSnapshots/' + pricingVersion);
    const pricingRows = firestoreBatchGetAdmin_(config, [pricingName], transaction);
    const pricing = batchGetFound_(pricingRows, pricingName);
    if (!pricing) throw new Error('Missing pricing snapshot for ' + bookingId + '.');
    const lessonPrice = fsNumber_(pricing, 'effectivePrice');
    if (!(lessonPrice > 0)) throw new Error('Invalid historical lesson price for ' + bookingId + '.');
    const status = fsString_(booking, 'status') || 'booked';
    const canceledAt = fsNumber_(booking, 'canceledAt');
    const lateCanceled = status === 'canceled' && !fsHistoryHasAction_(booking, 'calendar-conflict') && fsString_(booking, 'canceledBy') === 'student' && canceledAt && fsNumber_(booking, 'slot') - canceledAt < 12 * 60 * 60 * 1000;
    if (status === 'canceled' && !lateCanceled) {
      const fields = cloneFirestoreFields_(booking);
      fields.consumptionDueAt = firestoreValue_(null);
      fields.consumptionState = firestoreValue_('not-required');
      firestoreAdminFetch_(config, ':commit', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction, writes: [firestoreWriteExisting_(booking, fields)] }) });
      return { consumed: false, reason: 'non-chargeable-cancellation' };
    }
    const reason = lateCanceled ? 'late-cancel' : 'lesson';
    const reservationStatus = fsString_(booking, 'reservationStatus');
    const wasReserved = reservationStatus === 'reserved' || reservationStatus === 'pending-late-consumption' || (!reservationStatus && fsNumber_(entitlement, 'reservedLessonCredits') > 0);
    const accountingFields = cloneFirestoreFields_(accounting);
    const entitlementFields = cloneFirestoreFields_(entitlement);
    const bookingFields = cloneFirestoreFields_(booking);
    const newBalance = fsNumber_(accounting, 'balance') - lessonPrice;
    appendFirestoreArrayValue_(accountingFields, 'transactions', firestoreValue_({
      id: 'tx_' + bookingId + '_charge', at: now, amount: -lessonPrice, type: reason,
      description: lateCanceled ? 'Late cancellation lesson charge' : 'Lesson deduction', newBalance: newBalance
    }));
    accountingFields.balance = firestoreValue_(newBalance);
    accountingFields.financeUpdatedAt = firestoreValue_(now);
    entitlementFields.lessonCredits = firestoreValue_(Math.max(0, fsNumber_(entitlement, 'lessonCredits') - 1));
    entitlementFields.reservedLessonCredits = firestoreValue_(Math.max(0, fsNumber_(entitlement, 'reservedLessonCredits') - (wasReserved ? 1 : 0)));
    entitlementFields.entitlementUpdatedAt = firestoreValue_(now);
    bookingFields.balanceChargedAt = firestoreValue_(now);
    bookingFields.chargeReason = firestoreValue_(reason);
    bookingFields.reservationStatus = firestoreValue_('consumed');
    bookingFields.consumedAt = firestoreValue_(now);
    bookingFields.consumptionTransactionId = firestoreValue_('booking_' + bookingId + '_consume');
    bookingFields.consumptionDueAt = firestoreValue_(null);
    bookingFields.consumptionState = firestoreValue_('consumed');
    bookingFields.consumptionLastError = firestoreValue_('');
    bookingFields.pricingVersion = firestoreValue_(pricingVersion);
    bookingFields.updatedAt = firestoreValue_(now);
    appendFirestoreArrayValue_(bookingFields, 'history', firestoreValue_({ at: now, action: 'lesson-consumed', by: 'system', reason: reason }));
    const ledgerFields = {
      studentUid: firestoreValue_(studentUid), bookingId: firestoreValue_(bookingId), type: firestoreValue_('consume'),
      lessonDelta: firestoreValue_(-1), moneyDelta: firestoreValue_(-lessonPrice),
      priceSnapshot: { mapValue: { fields: cloneFirestoreFields_(pricing) } }, createdAt: firestoreValue_(now),
      effectiveAt: firestoreValue_(fsNumber_(booking, 'consumeAfter') || fsNumber_(booking, 'consumptionDueAt'))
    };
    firestoreAdminFetch_(config, ':commit', {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ transaction: transaction, writes: [
        firestoreWriteExisting_(accounting, accountingFields), firestoreWriteExisting_(entitlement, entitlementFields),
        firestoreWriteExisting_(booking, bookingFields),
        { update: { name: ledgerName, fields: ledgerFields }, currentDocument: { exists: false } }
      ] })
    });
    return { consumed: true, reason: reason };
  } catch (err) {
    try { firestoreAdminFetch_(config, ':rollback', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction }) }); } catch (ignored) {}
    throw err;
  }
}

function processDueLessonConsumption_(config) {
  const due = queryDueConsumptionBookingsAdmin_(config, Date.now(), 20);
  let consumed = 0;
  let skipped = 0;
  let failed = 0;
  due.forEach(function (doc) {
    try {
      const result = consumeOneBookingAdmin_(config, doc, Date.now());
      if (result.consumed) consumed += 1; else skipped += 1;
    } catch (err) {
      failed += 1;
      try {
        firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(firestoreDocId_(doc)), {
          consumptionState: 'retrying', consumptionAttempts: fsNumber_(doc, 'consumptionAttempts') + 1,
          consumptionLastError: String(err && err.message || err).slice(0, 500), updatedAt: Date.now()
        });
      } catch (patchErr) {}
      console.error('Lesson consumption failed for ' + firestoreDocId_(doc) + ': ' + String(err && err.message || err));
    }
  });
  return { consumed: consumed, skipped: skipped, failed: failed, checked: due.length };
}

function releaseStudentReservationAdmin_(config, studentUid) {
  const name = firestoreDocumentName_(config, 'studentEntitlements/' + studentUid);
  const begin = firestoreAdminFetch_(config, ':beginTransaction', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ options: { readWrite: {} } }) });
  const transaction = begin.transaction;
  try {
    const doc = batchGetFound_(firestoreBatchGetAdmin_(config, [name], transaction), name);
    if (!doc) return;
    const fields = cloneFirestoreFields_(doc);
    fields.reservedLessonCredits = firestoreValue_(Math.max(0, fsNumber_(doc, 'reservedLessonCredits') - 1));
    fields.entitlementUpdatedAt = firestoreValue_(Date.now());
    firestoreAdminFetch_(config, ':commit', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction, writes: [firestoreWriteExisting_(doc, fields)] }) });
  } catch (err) {
    try { firestoreAdminFetch_(config, ':rollback', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction }) }); } catch (ignored) {}
    throw err;
  }
}

function cancelExternalBookingAdmin_(config, bookingId, studentUid) {
  const bookingName = firestoreDocumentName_(config, 'bookings/' + bookingId);
  const entitlementName = studentUid ? firestoreDocumentName_(config, 'studentEntitlements/' + studentUid) : '';
  const begin = firestoreAdminFetch_(config, ':beginTransaction', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ options: { readWrite: {} } }) });
  const transaction = begin.transaction;
  try {
    const names = entitlementName ? [bookingName, entitlementName] : [bookingName];
    const rows = firestoreBatchGetAdmin_(config, names, transaction);
    const booking = batchGetFound_(rows, bookingName);
    const entitlement = entitlementName ? batchGetFound_(rows, entitlementName) : null;
    if (!booking || fsString_(booking, 'status') === 'canceled') {
      firestoreAdminFetch_(config, ':rollback', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction }) });
      return false;
    }
    const now = Date.now();
    const bookingFields = cloneFirestoreFields_(booking);
    bookingFields.status = firestoreValue_('canceled'); bookingFields.canceledAt = firestoreValue_(now);
    bookingFields.canceledBy = firestoreValue_('external-calendar'); bookingFields.reservationStatus = firestoreValue_('released');
    bookingFields.reservationReleasedAt = firestoreValue_(now); bookingFields.consumptionDueAt = firestoreValue_(null);
    bookingFields.consumptionState = firestoreValue_('released'); bookingFields.calendarSynced = firestoreValue_(false);
    bookingFields.calendarSyncState = firestoreValue_('externally-deleted');
    bookingFields.calendarSyncLastError = firestoreValue_('The platform Calendar event was deleted directly in Google Calendar.');
    bookingFields.calendarLastCheckedAt = firestoreValue_(now); bookingFields.updatedAt = firestoreValue_(now);
    const notificationVersion = fsNumber_(booking, 'notificationVersion') + 1;
    const studentEmail = normalizeEmail_(fsString_(booking, 'email'));
    const validStudentEmail = isValidEmail_(studentEmail);
    const jobId = 'booking_' + bookingId.replace(/[^a-zA-Z0-9_-]/g, '_') + '_external-cancellation_' + notificationVersion + '_student';
    const jobName = firestoreDocumentName_(config, 'notificationJobs/' + jobId);
    bookingFields.notificationVersion = firestoreValue_(notificationVersion);
    bookingFields.studentNotificationStatus = firestoreValue_(validStudentEmail ? 'pending' : 'skipped');
    bookingFields.studentNotificationAttempts = firestoreValue_(0);
    bookingFields.studentNotificationLastError = firestoreValue_(validStudentEmail ? '' : 'Missing or invalid student email.');
    const writes = [firestoreWriteExisting_(booking, bookingFields)];
    if (entitlement && fsString_(booking, 'reservationStatus') === 'reserved') {
      const entitlementFields = cloneFirestoreFields_(entitlement);
      entitlementFields.reservedLessonCredits = firestoreValue_(Math.max(0, fsNumber_(entitlement, 'reservedLessonCredits') - 1));
      entitlementFields.entitlementUpdatedAt = firestoreValue_(now);
      writes.push(firestoreWriteExisting_(entitlement, entitlementFields));
    }
    writes.push({
      update: { name: jobName, fields: {
        id: firestoreValue_(jobId), bookingId: firestoreValue_(bookingId), recipientType: firestoreValue_('student'),
        recipientEmail: firestoreValue_(studentEmail), notificationType: firestoreValue_('external-cancellation'),
        version: firestoreValue_(notificationVersion), state: firestoreValue_(validStudentEmail ? 'pending' : 'skipped'),
        attempts: firestoreValue_(0), createdAt: firestoreValue_(now), createdBy: firestoreValue_('external-calendar'),
        sentAt: firestoreValue_(null), lastAttemptAt: firestoreValue_(null), nextRetryAt: firestoreValue_(validStudentEmail ? now : 0),
        lastError: firestoreValue_(validStudentEmail ? '' : 'Missing or invalid student email.'), idempotencyKey: firestoreValue_(jobId)
      } }, currentDocument: { exists: false }
    });
    firestoreAdminFetch_(config, ':commit', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction, writes: writes }) });
    return true;
  } catch (err) {
    try { firestoreAdminFetch_(config, ':rollback', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ transaction: transaction }) }); } catch (ignored) {}
    throw err;
  }
}

function firestorePatchAdmin_(config, documentPath, values) {
  const fields = {};
  const masks = [];
  Object.keys(values).forEach(function (key) {
    fields[key] = firestoreValue_(values[key]);
    masks.push('updateMask.fieldPaths=' + encodeURIComponent(key));
  });
  return firestoreAdminFetch_(config, '/' + documentPath + '?' + masks.join('&'), {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify({ fields: fields }),
  });
}

function firestoreDeleteAdmin_(config, documentPath) {
  try { firestoreAdminFetch_(config, '/' + documentPath, { method: 'delete' }); } catch (err) {}
}

function queryBookingsAdmin_(config, filters, limit) {
  const fieldFilters = (filters || []).map(function (filter) {
    return { fieldFilter: { field: { fieldPath: filter.field }, op: filter.op || 'EQUAL', value: firestoreValue_(filter.value) } };
  });
  const where = fieldFilters.length === 1 ? fieldFilters[0] : { compositeFilter: { op: 'AND', filters: fieldFilters } };
  const result = firestoreAdminFetch_(config, ':runQuery', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'bookings' }], where: where, limit: Math.max(1, Math.min(500, Number(limit || 50))) } }),
  });
  return Array.isArray(result) ? result.map(function (row) { return row.document; }).filter(Boolean) : [];
}

function queryNotificationJobsAdmin_(config, state, limit) {
  const result = firestoreAdminFetch_(config, ':runQuery', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'notificationJobs' }],
      where: { fieldFilter: { field: { fieldPath: 'state' }, op: 'EQUAL', value: firestoreValue_(state) } },
      limit: Math.max(1, Math.min(100, Number(limit || 50)))
    } }),
  });
  return Array.isArray(result) ? result.map(function (row) { return row.document; }).filter(Boolean) : [];
}

function sanitizeNotificationError_(err) {
  return String(err && err.message ? err.message : err || 'Unknown email error')
    .replace(/(token|authorization|api[_ -]?key)\s*[:=]\s*[^\s,;]+/ig, '$1=[redacted]')
    .slice(0, 500);
}

function notificationRetryAt_(attempts) {
  return Date.now() + Math.min(24 * 60 * 60 * 1000, Math.pow(2, Math.min(Math.max(1, Number(attempts || 1)), 10)) * 5 * 60000);
}

function sendTeacherScheduleUpdateEmail_(recipient, details) {
  return sendPlainEmail_(recipient, 'Lesson schedule updated: ' + (details.name || 'Student'), [
    'A platform lesson was rescheduled.', '', 'Student: ' + (details.name || ''),
    'Email: ' + (details.email || ''), 'New date & time: ' + (details.slotLabel || ''),
    'Duration: ' + (details.durationMinutes || 50) + ' minutes',
    'Booking ID: ' + (details.bookingId || ''), details.meetingUrl ? 'Google Meet: ' + details.meetingUrl : ''
  ].filter(Boolean).join('\n'));
}

function sendStudentCancellationConfirmationEmail_(recipient, details) {
  const external = details.notificationType === 'external-cancellation';
  return sendPlainEmail_(recipient, external ? 'Your lesson Calendar event was removed' : 'Your lesson was canceled', [
    'Hello ' + (details.name || 'Student') + ',', '',
    external ? 'The Calendar event for your lesson was removed and the platform booking was canceled safely.' : 'Your teacher canceled this lesson.',
    '', 'Date & time: ' + (details.slotLabel || ''), 'Booking ID: ' + (details.bookingId || ''),
    'No student late-cancellation classification was applied.'
  ].join('\n'));
}

function notificationBookingStatusFields_(recipientType, state, attempts, error, sentAt, nextRetryAt, notificationType) {
  const reminder = notificationType === 'reminder';
  const prefix = reminder
    ? (recipientType === 'teacher' ? 'teacherReminderNotification' : 'studentReminderNotification')
    : (recipientType === 'teacher' ? 'teacherNotification' : 'studentNotification');
  const values = {};
  values[prefix + 'Status'] = state;
  values[prefix + 'Attempts'] = attempts;
  values[prefix + 'LastAttemptAt'] = Date.now();
  values[prefix + 'NextRetryAt'] = Number(nextRetryAt || 0);
  values[prefix + 'LastError'] = error || '';
  if (sentAt) values[prefix + 'SentAt'] = sentAt;
  return values;
}

function processOneNotificationJob_(config, jobDoc) {
  const jobId = firestoreDocId_(jobDoc);
  const bookingId = fsString_(jobDoc, 'bookingId');
  const recipientType = fsString_(jobDoc, 'recipientType');
  let recipientEmail = normalizeEmail_(fsString_(jobDoc, 'recipientEmail'));
  const notificationType = fsString_(jobDoc, 'notificationType');
  const version = fsNumber_(jobDoc, 'version');
  const attempts = fsNumber_(jobDoc, 'attempts');
  if (fsString_(jobDoc, 'state') !== 'pending' || fsNumber_(jobDoc, 'nextRetryAt') > Date.now()) return { state: fsString_(jobDoc, 'state') || 'skipped' };
  let booking;
  try { booking = firestoreAdminFetch_(config, '/bookings/' + encodeURIComponent(bookingId), { method: 'get' }); }
  catch (err) {
    firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), { state: 'failed', lastError: 'Booking no longer exists.', lastAttemptAt: Date.now(), nextRetryAt: 0 });
    return { state: 'failed' };
  }
  if (notificationType === 'reschedule' && version !== fsNumber_(booking, 'notificationVersion')) {
    firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), { state: 'skipped', lastError: 'Superseded by a newer reschedule.', lastAttemptAt: Date.now(), nextRetryAt: 0 });
    return { state: 'skipped' };
  }
  if (notificationType === 'reminder') {
    const bookingStatus = fsString_(booking, 'status') || 'booked';
    if (bookingStatus === 'canceled' || bookingStatus === 'completed' || version !== fsNumber_(booking, 'slot') || Date.now() >= fsNumber_(booking, 'slot')) {
      firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), { state: 'skipped', lastError: 'Lesson was canceled, completed, or rescheduled.', lastAttemptAt: Date.now(), nextRetryAt: 0 });
      return { state: 'skipped' };
    }
    if (recipientType === 'teacher') {
      firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), { state: 'skipped', lastError: 'Teacher reminder is handled by Google Calendar.', lastAttemptAt: Date.now(), nextRetryAt: 0 });
      return { state: 'skipped' };
    }
  }
  if (!isValidEmail_(recipientEmail) && recipientType === 'teacher') recipientEmail = normalizeEmail_(config.notificationEmail);
  if (!isValidEmail_(recipientEmail)) {
    const invalidError = 'Missing or invalid ' + recipientType + ' email.';
    firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), { state: 'skipped', lastError: invalidError, lastAttemptAt: Date.now(), nextRetryAt: 0 });
    firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(bookingId), notificationBookingStatusFields_(recipientType, 'skipped', attempts, invalidError, 0, 0, notificationType));
    return { state: 'skipped' };
  }
  const meetingUrl = fsString_(booking, 'meetingUrl');
  if ((notificationType === 'booking-created' || notificationType === 'teacher-created') && !meetingUrl && fsString_(booking, 'calendarSyncState') !== 'failed') {
    firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), { nextRetryAt: Date.now() + 5 * 60 * 1000, lastError: 'Waiting for Google Meet link.' });
    return { state: 'pending' };
  }
  const nextAttempts = attempts + 1;
  firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), { state: 'processing', attempts: nextAttempts, lastAttemptAt: Date.now(), deliveryStartedAt: Date.now(), lastError: '' });
  const details = {
    bookingId: bookingId, name: fsString_(booking, 'name'), email: fsString_(booking, 'email'), phone: fsString_(booking, 'phone'),
    notes: fsString_(booking, 'notes'), timeZone: fsString_(booking, 'timezone') || config.defaultTimeZone,
    slotLabel: Utilities.formatDate(new Date(fsNumber_(booking, 'slot')), fsString_(booking, 'timezone') || config.defaultTimeZone, 'yyyy-MM-dd HH:mm'),
    slot: fsNumber_(booking, 'slot'),
    studentTimeZone: fsString_(booking, 'studentTimeZone') || fsString_(booking, 'timezone') || config.defaultTimeZone,
    studentSlotLabel: formatEmailSlot_(fsNumber_(booking, 'slot'), fsString_(booking, 'studentTimeZone') || fsString_(booking, 'timezone') || config.defaultTimeZone),
    teacherSlotLabel: formatEmailSlot_(fsNumber_(booking, 'slot'), fsString_(booking, 'timezone') || config.defaultTimeZone),
    durationMinutes: fsNumber_(booking, 'durationMinutes') || 50, meetingUrl: meetingUrl,
    isFreeTrial: fsBool_(booking, 'isFreeTrial'), notificationType: notificationType,
    siteUrl: config.siteUrl, teacherName: config.teacherName,
  };
  try {
    if (notificationType === 'booking-created' && recipientType === 'teacher') sendBookingNotificationEmail_(recipientEmail, details);
    else if ((notificationType === 'booking-created' || notificationType === 'teacher-created') && recipientType === 'student') sendStudentConfirmationEmail_(recipientEmail, details);
    else if (notificationType === 'reschedule' && recipientType === 'teacher') sendTeacherScheduleUpdateEmail_(recipientEmail, details);
    else if (notificationType === 'reschedule' && recipientType === 'student') sendStudentScheduleUpdateEmail_(recipientEmail, details);
    else if (notificationType === 'student-cancellation' && recipientType === 'teacher') sendBookingCancellationEmail_(recipientEmail, Object.assign({}, details, { canceledBy: 'Student' }));
    else if (notificationType === 'student-cancellation' && recipientType === 'student') sendStudentCancellationConfirmationEmail_(recipientEmail, details);
    else if ((notificationType === 'teacher-cancellation' || notificationType === 'external-cancellation') && recipientType === 'student') sendStudentCancellationConfirmationEmail_(recipientEmail, details);
    else if (notificationType === 'reminder' && recipientType === 'teacher') sendTeacherLessonReminderEmail_(recipientEmail, details);
    else if (notificationType === 'reminder' && recipientType === 'student') sendLessonReminderEmail_(recipientEmail, details);
    else throw new Error('Unsupported notification job type.');
    const sentAt = Date.now();
    try {
      firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), { state: 'sent', sentAt: sentAt, lastAttemptAt: sentAt, nextRetryAt: 0, lastError: '' });
      firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(bookingId), notificationBookingStatusFields_(recipientType, 'sent', nextAttempts, '', sentAt, 0, notificationType));
    } catch (markerErr) {
      console.error('Email was accepted but its durable sent marker could not be written for ' + jobId + ': ' + sanitizeNotificationError_(markerErr));
      return { state: 'processing', error: 'Delivery accepted; sent-marker write requires manual reconciliation.' };
    }
    return { state: 'sent' };
  } catch (err) {
    const error = sanitizeNotificationError_(err);
    const permanent = /invalid|malformed|recipient|address not found/i.test(error) || nextAttempts >= 8;
    const state = permanent ? 'failed' : 'pending';
    const nextRetryAt = permanent ? 0 : notificationRetryAt_(nextAttempts);
    firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), { state: state, attempts: nextAttempts, lastAttemptAt: Date.now(), nextRetryAt: nextRetryAt, lastError: error, deliveryStartedAt: 0 });
    firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(bookingId), notificationBookingStatusFields_(recipientType, state, nextAttempts, error, 0, nextRetryAt, notificationType));
    return { state: state, error: error };
  }
}

function processPendingNotificationJobs_(config, bookingId) {
  queryNotificationJobsAdmin_(config, 'processing', 50).forEach(function (doc) {
    if (bookingId && fsString_(doc, 'bookingId') !== bookingId) return;
    if (fsNumber_(doc, 'deliveryStartedAt') && fsNumber_(doc, 'deliveryStartedAt') < Date.now() - 15 * 60 * 1000) {
      const jobId = firestoreDocId_(doc);
      const error = 'Delivery result is ambiguous after an interrupted execution; manual retry is required to avoid an automatic duplicate.';
      firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), { state: 'failed', nextRetryAt: 0, lastError: error, lastAttemptAt: Date.now() });
      firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(fsString_(doc, 'bookingId')), notificationBookingStatusFields_(fsString_(doc, 'recipientType'), 'failed', fsNumber_(doc, 'attempts'), error, 0, 0, fsString_(doc, 'notificationType')));
    }
  });
  const jobs = queryNotificationJobsAdmin_(config, 'pending', 100).filter(function (doc) {
    return !bookingId || fsString_(doc, 'bookingId') === bookingId;
  });
  const results = jobs.map(function (job) { return processOneNotificationJob_(config, job); });
  return { processed: results.length, sent: results.filter(function (result) { return result.state === 'sent'; }).length };
}

function retryFailedNotificationJobs_(config) {
  const failed = queryNotificationJobsAdmin_(config, 'failed', 50);
  failed.forEach(function (job) {
    firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(firestoreDocId_(job)), {
      state: 'pending', attempts: 0, nextRetryAt: Date.now(), lastError: 'Manual retry requested.'
    });
  });
  return { success: true, retried: failed.length, message: 'Failed notification jobs queued for retry.' };
}

function ensureLegacyPendingNotificationJobs_(config, booking) {
  const bookingId = firestoreDocId_(booking);
  const slot = fsNumber_(booking, 'slot');
  if (!bookingId || slot + (fsNumber_(booking, 'durationMinutes') || 50) * 60000 < Date.now()) return;
  const source = fsString_(booking, 'source') || 'student';
  const definitions = source === 'teacher'
    ? [{ recipientType: 'student', recipientEmail: fsString_(booking, 'email'), notificationType: 'teacher-created' }]
    : [
        { recipientType: 'teacher', recipientEmail: config.notificationEmail, notificationType: 'booking-created' },
        { recipientType: 'student', recipientEmail: fsString_(booking, 'email'), notificationType: 'booking-created' }
      ];
  definitions.forEach(function (definition) {
    const currentStatus = fsString_(booking, definition.recipientType === 'teacher' ? 'teacherNotificationStatus' : 'studentNotificationStatus');
    if (currentStatus) return;
    const jobId = 'booking_' + bookingId.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + definition.notificationType + '_0_' + definition.recipientType;
    try { firestoreAdminFetch_(config, '/notificationJobs/' + encodeURIComponent(jobId), { method: 'get' }); return; } catch (err) {}
    const valid = isValidEmail_(definition.recipientEmail);
    firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), {
      id: jobId, bookingId: bookingId, recipientType: definition.recipientType,
      recipientEmail: normalizeEmail_(definition.recipientEmail), notificationType: definition.notificationType,
      version: 0, state: valid ? 'pending' : 'skipped', attempts: 0, createdAt: Date.now(), createdBy: 'legacy-recovery',
      sentAt: null, lastAttemptAt: null, nextRetryAt: valid ? Date.now() : 0,
      lastError: valid ? '' : 'Missing or invalid ' + definition.recipientType + ' email.', idempotencyKey: jobId
    });
    const values = {};
    values[definition.recipientType === 'teacher' ? 'teacherNotificationStatus' : 'studentNotificationStatus'] = valid ? 'pending' : 'skipped';
    firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(bookingId), values);
  });
}

function createNotificationJobAdmin_(config, bookingId, notificationType, recipientType, recipientEmail, version, createdBy, dueAt) {
  const jobId = 'booking_' + bookingId.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + notificationType + '_' + version + '_' + recipientType;
  try { firestoreAdminFetch_(config, '/notificationJobs/' + encodeURIComponent(jobId), { method: 'get' }); return jobId; } catch (err) {}
  const email = normalizeEmail_(recipientEmail);
  const valid = isValidEmail_(email) || (recipientType === 'teacher' && isValidEmail_(config.notificationEmail));
  firestorePatchAdmin_(config, 'notificationJobs/' + encodeURIComponent(jobId), {
    id: jobId, bookingId: bookingId, recipientType: recipientType, recipientEmail: email,
    notificationType: notificationType, version: version, state: valid ? 'pending' : 'skipped', attempts: 0,
    createdAt: Date.now(), createdBy: createdBy || 'system', sentAt: null, lastAttemptAt: null,
    nextRetryAt: valid ? Math.max(Date.now(), Number(dueAt || Date.now())) : 0, lastError: valid ? '' : 'Missing or invalid ' + recipientType + ' email.', idempotencyKey: jobId
  });
  return jobId;
}

function ensureUpcomingReminderJobsAdmin_(config, bookingId, booking, now) {
  const status = fsString_(booking, 'status') || 'booked';
  const slot = fsNumber_(booking, 'slot');
  if (!slot || status === 'canceled' || status === 'completed') return;
  if (slot < now + 4 * 60000 || slot > now + 26 * 60000) return;
  const dueAt = slot - 15 * 60000;
  createNotificationJobAdmin_(config, bookingId, 'reminder', 'student', fsString_(booking, 'email'), slot, 'reminder-worker', dueAt);
}

function firestoreDocId_(doc) {
  const parts = String(doc && doc.name || '').split('/');
  return parts[parts.length - 1] || '';
}

function getSlotClaimIds_(slot, durationMinutes) {
  const bucketMs = 15 * 60 * 1000;
  const first = Math.floor(Number(slot || 0) / bucketMs);
  const last = Math.ceil((Number(slot || 0) + Math.max(15, Number(durationMinutes || 50)) * 60000) / bucketMs) - 1;
  const ids = [];
  for (let index = first; index <= last; index += 1) ids.push('slot_' + index);
  return ids;
}

function patchCalendarSyncResult_(config, bookingId, values) {
  values.calendarLastCheckedAt = Date.now();
  firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(bookingId), values);
}

function ensureCalendarEventForFirestoreBooking_(config, doc) {
  const bookingId = firestoreDocId_(doc);
  const slot = fsNumber_(doc, 'slot');
  const durationMinutes = Math.max(15, fsNumber_(doc, 'durationMinutes') || 50);
  const cal = CalendarApp.getCalendarById(config.primaryCalendarId);
  if (!cal || !bookingId || !slot) throw new Error('Booking or primary calendar is unavailable.');
  let event = findBookingEvent_(cal, fsString_(doc, 'googleCalendarEventId'), bookingId, slot);
  if (!event) {
    const start = new Date(slot);
    const end = new Date(slot + durationMinutes * 60000);
    if (hasConflictingEvent_(getBusyCalendarIds_(config), start, end)) throw new Error('Calendar conflict prevents retry.');
    event = cal.createEvent('Lesson with ' + (fsString_(doc, 'name') || 'Student'), start, end, {
      description: ['Booked from Farouq Booking', 'Booking ID: ' + bookingId, 'Student: ' + fsString_(doc, 'name'), 'Email: ' + fsString_(doc, 'email'), 'Phone: ' + fsString_(doc, 'phone'), 'Notes: ' + fsString_(doc, 'notes'), 'Timezone: ' + (fsString_(doc, 'timezone') || config.defaultTimeZone)].join('\n')
    });
  }
  let meeting = { eventId: event.getId(), meetingUrl: '' };
  try { meeting.meetingUrl = event.getHangoutLink() || ''; } catch (err) {}
  if (!meeting.meetingUrl) meeting = ensureBookingMeetingLink_(config, bookingId, slot);
  patchCalendarSyncResult_(config, bookingId, {
    calendarSynced: true, calendarSyncState: 'synced', calendarSyncLastError: '',
    calendarLastSyncedAt: Date.now(), googleCalendarEventId: meeting.eventId || event.getId(), meetingUrl: meeting.meetingUrl || '',
  });
  firestorePatchAdmin_(config, 'publicBookings/' + encodeURIComponent(bookingId), { calendarSynced: true, updatedAt: Date.now() });
}

function deleteCalendarEventForFirestoreBooking_(config, doc) {
  const bookingId = firestoreDocId_(doc);
  const cal = CalendarApp.getCalendarById(config.primaryCalendarId);
  const event = cal && findBookingEvent_(cal, fsString_(doc, 'googleCalendarEventId'), bookingId, fsNumber_(doc, 'slot'));
  if (event) event.deleteEvent();
  patchCalendarSyncResult_(config, bookingId, { calendarDeletePending: false, calendarSyncState: 'synced', calendarSyncLastError: '', calendarLastSyncedAt: Date.now() });
}

function reconcilePlatformCalendarEvents_(config) {
  const cal = CalendarApp.getCalendarById(config.primaryCalendarId);
  if (!cal) throw new Error('Primary calendar not found.');
  const now = Date.now();
  const properties = PropertiesService.getScriptProperties();
  const lastExtendedAt = Number(properties.getProperty('CALENDAR_EXTENDED_RECONCILE_AT') || 0);
  const includeSecondMonth = now - lastExtendedAt >= 24 * 60 * 60 * 1000;
  const start = new Date(now - 24 * 60 * 60 * 1000);
  const end = new Date(now + (includeSecondMonth ? 60 : 31) * 24 * 60 * 60 * 1000);
  const events = cal.getEvents(start, end);
  const byBookingId = {};
  events.forEach(function (event) {
    const details = parseEventDetails_(event, config);
    if (!details.bookingId) return;
    if (!byBookingId[details.bookingId]) byBookingId[details.bookingId] = [];
    byBookingId[details.bookingId].push(event);
  });
  Object.keys(byBookingId).forEach(function (bookingId) {
    const matches = byBookingId[bookingId];
    const event = matches[0];
    let doc;
    try { doc = firestoreAdminFetch_(config, '/bookings/' + encodeURIComponent(bookingId), { method: 'get' }); } catch (err) { return; }
    const oldSlot = fsNumber_(doc, 'slot');
    const oldDuration = fsNumber_(doc, 'durationMinutes') || 50;
    const newSlot = event.getStartTime().getTime();
    const newDuration = Math.max(15, Math.round((event.getEndTime().getTime() - newSlot) / 60000));
    let meetingUrl = '';
    try { meetingUrl = event.getHangoutLink() || ''; } catch (err) {}
    const changed = oldSlot !== newSlot || oldDuration !== newDuration || (meetingUrl && meetingUrl !== fsString_(doc, 'meetingUrl'));
    if (!changed && matches.length === 1) return;
    if (!changed && matches.length > 1 && fsString_(doc, 'calendarSyncState') === 'failed' &&
        /duplicate calendar events/i.test(fsString_(doc, 'calendarSyncLastError'))) return;
    const values = {
      calendarLastCheckedAt: Date.now(), googleCalendarEventId: event.getId(),
      calendarSyncState: matches.length > 1 ? 'failed' : (changed ? 'externally-modified' : 'synced'),
      calendarSyncLastError: matches.length > 1 ? 'Duplicate Calendar events detected for this Booking ID.' : '',
    };
    if (changed) {
      const conflictingClaim = getSlotClaimIds_(newSlot, newDuration).some(function (id) {
        try {
          const claim = firestoreAdminFetch_(config, '/bookingSlotClaims/' + id, { method: 'get' });
          return fsString_(claim, 'bookingId') && fsString_(claim, 'bookingId') !== bookingId;
        } catch (err) { return false; }
      });
      if (conflictingClaim) {
        event.setTime(new Date(oldSlot), new Date(oldSlot + oldDuration * 60000));
        firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(bookingId), {
          calendarSyncState: 'conflict', calendarSyncLastError: 'Direct Calendar move overlaps another platform booking.', calendarLastCheckedAt: Date.now()
        });
        return;
      }
      const notificationVersion = fsNumber_(doc, 'notificationVersion') + 1;
      values.slot = newSlot; values.durationMinutes = newDuration; values.consumeAfter = newSlot + newDuration * 60000;
      values.consumptionDueAt = fsBool_(doc, 'isFreeTrial') ? null : values.consumeAfter;
      values.consumptionState = fsBool_(doc, 'isFreeTrial') ? 'not-required' : 'pending';
      values.meetingUrl = meetingUrl; values.updatedAt = Date.now(); values.rescheduledFrom = oldSlot; values.rescheduledAt = Date.now();
      values.notificationVersion = notificationVersion;
      values.teacherNotificationStatus = 'pending'; values.studentNotificationStatus = 'pending';
      createNotificationJobAdmin_(config, bookingId, 'reschedule', 'teacher', config.notificationEmail, notificationVersion, 'calendar-reconciliation');
      createNotificationJobAdmin_(config, bookingId, 'reschedule', 'student', fsString_(doc, 'email'), notificationVersion, 'calendar-reconciliation');
      firestorePatchAdmin_(config, 'publicBookings/' + encodeURIComponent(bookingId), { slot: newSlot, durationMinutes: newDuration, status: 'rescheduled', updatedAt: Date.now(), calendarSynced: true });
      getSlotClaimIds_(oldSlot, oldDuration).forEach(function (id) { firestoreDeleteAdmin_(config, 'bookingSlotClaims/' + id); });
      getSlotClaimIds_(newSlot, newDuration).forEach(function (id) { firestorePatchAdmin_(config, 'bookingSlotClaims/' + id, { bookingId: bookingId, studentUid: fsString_(doc, 'studentUid'), slot: newSlot, durationMinutes: newDuration, status: 'active', updatedAt: Date.now() }); });
    }
    firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(bookingId), values);
  });
  const syncedBookingMap = {};
  const reconciliationStart = now - 24 * 60 * 60 * 1000;
  const reconciliationEnd = end.getTime();
  const reconciliationWindow = 30 * 24 * 60 * 60 * 1000;
  for (var windowStart = reconciliationStart; windowStart < reconciliationEnd; windowStart += reconciliationWindow) {
    queryBookingsAdmin_(config, [
      { field: 'slot', op: 'GREATER_THAN_OR_EQUAL', value: windowStart },
      { field: 'slot', op: 'LESS_THAN', value: Math.min(reconciliationEnd, windowStart + reconciliationWindow) }
    ], 500).forEach(function (bookingDoc) { syncedBookingMap[firestoreDocId_(bookingDoc)] = bookingDoc; });
  }
  const syncedBookings = Object.keys(syncedBookingMap).map(function (id) { return syncedBookingMap[id]; });
  syncedBookings.forEach(function (doc) {
    const bookingId = firestoreDocId_(doc);
    const status = fsString_(doc, 'status') || 'booked';
    const slot = fsNumber_(doc, 'slot');
    const duration = fsNumber_(doc, 'durationMinutes') || 50;
    ensureUpcomingReminderJobsAdmin_(config, bookingId, doc, now);
    if (!fsBool_(doc, 'calendarSynced') || status === 'canceled' || slot + duration * 60000 <= Date.now() || byBookingId[bookingId]) return;
    const studentUid = fsString_(doc, 'studentUid');
    if (!cancelExternalBookingAdmin_(config, bookingId, studentUid)) return;
    firestorePatchAdmin_(config, 'publicBookings/' + encodeURIComponent(bookingId), { status: 'canceled', calendarSynced: false, updatedAt: Date.now() });
    getSlotClaimIds_(slot, duration).forEach(function (id) { firestoreDeleteAdmin_(config, 'bookingSlotClaims/' + id); });
  });
  if (includeSecondMonth) properties.setProperty('CALENDAR_EXTENDED_RECONCILE_AT', String(now));
  return byBookingId;
}

function processCalendarSynchronization() {
  const config = getConfig_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let processed = 0;
  let failed = 0;
  let consumptionResult = { consumed: 0, skipped: 0, failed: 0, checked: 0 };
  try {
    const pendingCreates = queryBookingsAdmin_(config, [{ field: 'calendarSynced', value: false }], 50);
    pendingCreates.forEach(function (doc) {
      ensureLegacyPendingNotificationJobs_(config, doc);
      const bookingId = firestoreDocId_(doc);
      if (fsString_(doc, 'calendarSyncState') === 'externally-deleted' || fsNumber_(doc, 'calendarNextRetryAt') > Date.now()) return;
      const attempts = fsNumber_(doc, 'calendarSyncAttempts') + 1;
      try {
        if (fsString_(doc, 'status') === 'canceled' || fsBool_(doc, 'calendarDeletePending')) deleteCalendarEventForFirestoreBooking_(config, doc);
        else ensureCalendarEventForFirestoreBooking_(config, doc);
        patchCalendarSyncResult_(config, bookingId, { calendarSyncAttempts: attempts, calendarNextRetryAt: 0 });
        processed += 1;
      } catch (err) {
        patchCalendarSyncResult_(config, bookingId, { calendarSyncState: 'failed', calendarSyncAttempts: attempts, calendarSyncLastError: String(err && err.message || err), calendarNextRetryAt: Date.now() + Math.min(6 * 60 * 60 * 1000, Math.pow(2, Math.min(attempts, 8)) * 60000) });
        failed += 1;
      }
    });
    reconcilePlatformCalendarEvents_(config);
    consumptionResult = processDueLessonConsumption_(config);
    processed += consumptionResult.consumed;
    failed += consumptionResult.failed;
    const notificationResult = processPendingNotificationJobs_(config, '');
    processed += notificationResult.processed;
  } finally { lock.releaseLock(); }
  return { success: failed === 0, processed: processed, failed: failed, consumption: consumptionResult, message: 'Calendar, notification, and lesson-consumption background synchronization finished.' };
}

function installCalendarSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'processCalendarSynchronization') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('processCalendarSynchronization').timeBased().everyMinutes(10).create();
  return { success: true, message: 'Automatic Calendar synchronization installed (every 10 minutes).' };
}

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  try {
    const req = parseRequest_(e);
    const action = req.action || 'test';
    const config = getConfig_();

    if (action === 'test') {
      const primary = CalendarApp.getCalendarById(config.primaryCalendarId);
      return jsonOut({
        success: !!primary,
        message: primary ? 'Apps Script backend is reachable.' : 'Primary calendar not found.',
        timeZone: config.defaultTimeZone,
        preplyCalendarId: config.preplyCalendarId || '',
        additionalCalendarCount: (config.additionalCalendarIds || []).length,
      });
    }

    if (action === 'getEmailQuota') {
      requireTeacherCaller_(config, req.authToken);
      return jsonOut(getEmailQuotaPayload_());
    }

    if (action === 'installCalendarSync') {
      requireTeacherCaller_(config, req.authToken);
      return jsonOut(installCalendarSyncTrigger());
    }

    if (action === 'runCalendarSync') {
      requireTeacherCaller_(config, req.authToken);
      return jsonOut(processCalendarSynchronization());
    }

    if (action === 'runLessonConsumption') {
      requireTeacherCaller_(config, req.authToken);
      return jsonOut({ success: true, consumption: processDueLessonConsumption_(config) });
    }

    if (action === 'retryFailedNotifications') {
      requireTeacherCaller_(config, req.authToken);
      return jsonOut(retryFailedNotificationJobs_(config));
    }

    if (action === 'getBusy') {
      const days = Math.max(1, Math.min(90, Number(req.days || 30)));
      const timeZone = req.timeZone || config.defaultTimeZone;
      const calendarIds = getBusyCalendarIds_(config);
      const cache = CacheService.getScriptCache();
      const cacheKey = getBusyCacheKey_(calendarIds, days, timeZone);
      const cached = String(req.fresh || '').toLowerCase() === 'true' ? null : cache.get(cacheKey);
      if (cached) {
        return ContentService
          .createTextOutput(cached)
          .setMimeType(ContentService.MimeType.JSON);
      }
      const start = new Date();
      const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
      let events = [];
      calendarIds.forEach(function (calendarId) {
        events = events.concat(listEvents_(calendarId, start, end));
      });
      const payload = {
        success: true,
        message: 'Busy times loaded.',
        busyBlocks: buildBusyBlocks_(events, timeZone),
        counts: {
          total: events.length,
          preplyEnabled: !!config.preplyCalendarId,
          calendarsChecked: calendarIds.length,
          additionalCalendars: (config.additionalCalendarIds || []).length,
        }
      };
      // Keep cancellations responsive; the client refreshes availability every minute.
      cache.put(cacheKey, JSON.stringify(payload), 30);
      return jsonOut(payload);
    }

    if (action === 'getTeacherBusy') {
      requireTeacherCaller_(config, req.authToken);
      const days = Math.max(1, Math.min(90, Number(req.days || 30)));
      const timeZone = req.timeZone || config.defaultTimeZone;
      const calendarIds = getBusyCalendarIds_(config);
      const start = new Date();
      const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
      let events = [];
      calendarIds.forEach(function (calendarId) {
        events = events.concat(listEvents_(calendarId, start, end));
      });
      return jsonOut({
        success: true,
        message: 'Teacher calendar details loaded.',
        busyBlocks: buildBusyBlocks_(events, timeZone, true),
      });
    }

    if (action === 'getPreplyStatistics') {
      const caller = requireTeacherCaller_(config, req.authToken);
      enforceCallerRateLimit_(caller, 'getPreplyStatistics', 30, 3600);
      return jsonOut(getPreplyStatistics_(config, req.days));
    }

    if (action === 'getPreplyReviews') {
      const caller = requireTeacherCaller_(config, req.authToken);
      enforceCallerRateLimit_(caller, 'getPreplyReviews', 12, 3600);
      return jsonOut(getPreplyReviews_());
    }

    if (action === 'createBusyBlock') {
      const caller = requireTeacherCaller_(config, req.authToken);
      enforceCallerRateLimit_(caller, 'createBusyBlock', 120, 3600);
      const slot = Number(req.slot || 0);
      const durationMinutes = Math.max(15, Math.min(720, Number(req.durationMinutes || 60)));
      const title = String(req.title || 'Busy').slice(0, 120);
      if (!slot || slot <= Date.now()) {
        return jsonOut({ success: false, message: 'Choose a future busy time.' });
      }
      const cal = CalendarApp.getCalendarById(config.primaryCalendarId);
      if (!cal) {
        return jsonOut({ success: false, message: 'Primary calendar not found.' });
      }
      const start = new Date(slot);
      const end = new Date(slot + durationMinutes * 60 * 1000);
      if (hasConflictingEvent_(getBusyCalendarIds_(config), start, end)) {
        return jsonOut({ success: false, message: 'That time is already occupied.' });
      }
      const event = cal.createEvent(title, start, end, {
        description: 'Teacher busy block created from the lesson dashboard.'
      });
      return jsonOut({
        success: true,
        message: 'Busy time added to Google Calendar.',
        eventId: event.getId(),
      });
    }

    if (action === 'sendReviewRequest') {
      const caller = requireTeacherCaller_(config, req.authToken);
      enforceCallerRateLimit_(caller, 'sendReviewRequest', 60, 3600);
      const studentId = String(req.studentId || '');
      if (!studentId) {
        return jsonOut({ success: false, message: 'Choose a student first.' });
      }
      const studentDoc = firestoreFetch_(
        config,
        caller.token,
        '/users/' + encodeURIComponent(studentId),
        { method: 'get' }
      );
      const email = fsString_(studentDoc, 'email');
      const name = fsString_(studentDoc, 'name') || 'Student';
      const requestedUrl = String(req.siteUrl || '');
      const siteUrl = /^https?:\/\//i.test(requestedUrl) ? requestedUrl.slice(0, 500) : '';
      if (!isValidEmail_(email)) {
        return jsonOut({ success: false, message: 'The student does not have a valid email.' });
      }
      const sent = sendReviewRequestEmail_(email, {
        name: name,
        siteUrl: siteUrl,
      });
      return jsonOut({
        success: sent,
        message: sent ? 'Review request email sent.' : 'Review request email was not sent.',
      });
    }

    if (action === 'notifyNewStudentSignup') {
      const caller = verifyFirebaseCaller_(config, req.authToken);
      const studentId = String(req.studentId || '');
      if (!studentId || studentId !== caller.uid) return jsonOut({ success: false, message: 'Student account mismatch.' });
      enforceCallerRateLimit_(caller, 'notifyNewStudentSignup', 10, 3600);
      const studentDoc = firestoreAdminFetch_(config, '/users/' + encodeURIComponent(studentId), { method: 'get' });
      if ((fsString_(studentDoc, 'role') || 'student') !== 'student') return jsonOut({ success: false, message: 'Only a student account can send this notification.' });
      if (fsNumber_(studentDoc, 'teacherSignupNotificationSentAt')) return jsonOut({ success: true, alreadySent: true, message: 'Teacher was already notified.' });
      const teacherEmail = normalizeEmail_(config.notificationEmail || config.firebaseTeacherEmail);
      if (!isValidEmail_(teacherEmail)) return jsonOut({ success: false, message: 'Teacher notification email is not configured.' });
      const sent = sendNewStudentSignupEmail_(teacherEmail, {
        name: fsString_(studentDoc, 'name') || 'Student', email: fsString_(studentDoc, 'email') || caller.email,
        phone: fsString_(studentDoc, 'phone'), teacherName: config.teacherName,
        dashboardUrl: config.siteUrl + (config.siteUrl.indexOf('?') === -1 ? '?teacher=1' : '&teacher=1')
      });
      if (sent) firestorePatchAdmin_(config, 'users/' + encodeURIComponent(studentId), { teacherSignupNotificationSentAt: Date.now(), updatedAt: Date.now() });
      return jsonOut({ success: sent, message: sent ? 'Teacher notified about the new account.' : 'Teacher notification was not sent.' });
    }

    if (action === 'sendStudentBookingInvitation') {
      const caller = requireTeacherCaller_(config, req.authToken);
      enforceCallerRateLimit_(caller, 'sendStudentBookingInvitation', 60, 3600);
      const studentId = String(req.studentId || '');
      if (!studentId) return jsonOut({ success: false, message: 'Choose a student first.' });
      const studentDoc = firestoreAdminFetch_(config, '/users/' + encodeURIComponent(studentId), { method: 'get' });
      const email = fsString_(studentDoc, 'email');
      const name = fsString_(studentDoc, 'name') || 'Student';
      const template = String(req.template || 'book-more');
      if (template !== 'welcome' && template !== 'book-more') return jsonOut({ success: false, message: 'Unknown email template.' });
      if (!isValidEmail_(email)) return jsonOut({ success: false, message: 'The student does not have a valid email.' });
      const emailDetails = { name: name, teacherName: config.teacherName, siteUrl: config.siteUrl };
      const sent = template === 'welcome'
        ? sendStudentWelcomeEmail_(email, emailDetails)
        : sendStudentBookingInvitationEmail_(email, emailDetails);
      if (sent) firestorePatchAdmin_(config, 'users/' + encodeURIComponent(studentId), { lastBookingInvitationEmailAt: Date.now(), lastBookingInvitationEmailBy: caller.uid, updatedAt: Date.now() });
      return jsonOut({ success: sent, message: sent ? (template === 'welcome' ? 'Welcome email sent.' : 'Lesson invitation email sent.') : 'The student email was not sent.' });
    }

    if (action === 'createBooking') {
      const slot = Number(req.slot || 0);
      const durationMinutes = Math.max(15, Math.min(240, Number(req.durationMinutes || 50)));
      let timeZone = req.timeZone || config.defaultTimeZone;
      let name = req.name || 'Student';
      let email = req.email || '';
      let phone = req.phone || '';
      let notes = req.notes || '';
      const bookingId = req.bookingId || '';
      const teacherEmail = normalizeEmail_(config.notificationEmail);
      if (!slot) {
        return jsonOut({ success: false, message: 'Missing slot timestamp.' });
      }
      const bookingAccess = requireBookingCaller_(config, req.authToken, bookingId, slot);
      enforceCallerRateLimit_(
        bookingAccess.caller,
        'createBooking',
        bookingAccess.role === 'teacher' ? 60 : 6,
        3600
      );
      name = fsString_(bookingAccess.booking, 'name') || name;
      email = fsString_(bookingAccess.booking, 'email') || email;
      phone = fsString_(bookingAccess.booking, 'phone') || phone;
      notes = fsString_(bookingAccess.booking, 'notes') || notes;
      timeZone = fsString_(bookingAccess.booking, 'timezone') || timeZone;
      const start = new Date(slot);
      const end = new Date(slot + durationMinutes * 60 * 1000);
      const cal = CalendarApp.getCalendarById(config.primaryCalendarId);
      if (!cal) {
        return jsonOut({ success: false, message: 'Primary calendar not found.' });
      }
      const description = [
        'Booked from Farouq Booking',
        'Booking ID: ' + bookingId,
        'Student: ' + name,
        'Email: ' + email,
        'Phone: ' + phone,
        'Notes: ' + notes,
        'Timezone: ' + timeZone
      ].join('\n');
      // Send the Meet URL in our own confirmation email, but do not add the
      // student as a Calendar attendee. Calendar guests may be treated as
      // trusted invitees and bypass the teacher's "Ask to join" approval.
      var calendarInviteSent = false;
      var calendarInviteError = '';
      const eventResource = {
        summary: 'Lesson with ' + name,
        description: description,
        start: {
          dateTime: start.toISOString(),
          timeZone: timeZone
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: timeZone
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 15 },
            { method: 'email', minutes: 15 }
          ]
        },
        conferenceData: {
          createRequest: {
            requestId: 'farouq-' + (bookingId || Utilities.getUuid()) + '-' + start.getTime(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      };
      const bookingLock = LockService.getScriptLock();
      bookingLock.waitLock(20000);
      let event;
      try {
        const existingEvent = findBookingEvent_(cal, '', bookingId, slot);
        if (existingEvent) {
          let existingMeetingUrl = '';
          try {
            existingMeetingUrl = existingEvent.getHangoutLink() || '';
          } catch (hangoutErr) {}
          let recoveredMeeting = { eventId: existingEvent.getId(), meetingUrl: existingMeetingUrl };
          if (!existingMeetingUrl) {
            recoveredMeeting = ensureBookingMeetingLink_(config, bookingId, slot);
          }
          let recoveryWarning = '';
          let notifiedBooking = null;
          try {
            firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(bookingId), {
              googleCalendarEventId: recoveredMeeting.eventId || existingEvent.getId(), meetingUrl: recoveredMeeting.meetingUrl || '',
              calendarSynced: true, calendarSyncState: 'synced', calendarLastSyncedAt: Date.now()
            });
            processPendingNotificationJobs_(config, bookingId);
            notifiedBooking = firestoreAdminFetch_(config, '/bookings/' + encodeURIComponent(bookingId), { method: 'get' });
          } catch (postCalendarErr) {
            recoveryWarning = postCalendarErr && postCalendarErr.message ? postCalendarErr.message : String(postCalendarErr);
            console.warn('Calendar event recovered, but the server-side Firestore follow-up was deferred: ' + recoveryWarning);
          }
          return jsonOut({
            success: true,
            message: recoveredMeeting.meetingUrl
              ? 'Booking exists in Google Calendar and its Meet link is ready.'
              : 'Booking exists in Google Calendar, but a Meet link could not be created.',
            eventId: recoveredMeeting.eventId || existingEvent.getId(),
            meetingUrl: recoveredMeeting.meetingUrl || '',
            calendarInviteSent: false,
            notificationSent: notifiedBooking ? fsString_(notifiedBooking, 'teacherNotificationStatus') === 'sent' : false,
            studentConfirmationSent: notifiedBooking ? fsString_(notifiedBooking, 'studentNotificationStatus') === 'sent' : false,
            followUpPending: !!recoveryWarning,
            followUpError: recoveryWarning,
          });
        }
        const hasConflict = bookingAccess.role === 'teacher'
          ? hasConflictingStudentLesson_(cal, start, end, '')
          : hasConflictingEvent_(getBusyCalendarIds_(config), start, end);
        if (hasConflict) {
          return jsonOut({
            success: false,
            message: 'That slot is no longer available. Please choose another time.'
          });
        }
        event = Calendar.Events.insert(
          eventResource,
          config.primaryCalendarId,
          {
            conferenceDataVersion: 1,
            sendUpdates: 'none'
          }
        );
      } finally {
        bookingLock.releaseLock();
      }
      const meetingUrl = event.hangoutLink ||
        (((event.conferenceData || {}).entryPoints || []).filter(function (entry) {
          return entry.entryPointType === 'video';
        })[0] || {}).uri || '';
      var followUpError = '';
      var notifiedBooking = null;
      try {
        firestorePatchAdmin_(config, 'bookings/' + encodeURIComponent(bookingId), {
          googleCalendarEventId: event.iCalUID || event.id, meetingUrl: meetingUrl,
          calendarSynced: true, calendarSyncState: 'synced', calendarLastSyncedAt: Date.now()
        });
        processPendingNotificationJobs_(config, bookingId);
        notifiedBooking = firestoreAdminFetch_(config, '/bookings/' + encodeURIComponent(bookingId), { method: 'get' });
      } catch (postCalendarErr) {
        followUpError = postCalendarErr && postCalendarErr.message ? postCalendarErr.message : String(postCalendarErr);
        console.warn('Calendar event created, but the server-side Firestore follow-up was deferred: ' + followUpError);
      }
      var notificationSent = notifiedBooking ? fsString_(notifiedBooking, 'teacherNotificationStatus') === 'sent' : false;
      var studentConfirmationSent = notifiedBooking ? fsString_(notifiedBooking, 'studentNotificationStatus') === 'sent' : false;
      var notificationError = notifiedBooking ? fsString_(notifiedBooking, 'teacherNotificationLastError') : '';
      var studentConfirmationError = notifiedBooking ? fsString_(notifiedBooking, 'studentNotificationLastError') : '';
      return jsonOut({
        success: true,
        message: 'Booking added to Google Calendar.',
        eventId: event.iCalUID || event.id,
        meetingUrl: meetingUrl,
        calendarInviteSent: calendarInviteSent,
        calendarInviteError: calendarInviteError,
        notificationSent: notificationSent,
        studentConfirmationSent: studentConfirmationSent,
        notificationError: notificationError,
        studentConfirmationError: studentConfirmationError,
        followUpPending: !!followUpError,
        followUpError: followUpError,
      });
    }

    if (action === 'deleteBooking') {
      const eventId = req.eventId || '';
      const bookingId = req.bookingId || '';
      const slot = Number(req.slot || 0);
      const timeZone = req.timeZone || config.defaultTimeZone;
      const teacherEmail = normalizeEmail_(config.notificationEmail);
      let name = req.name || 'Student';
      let email = req.email || '';
      let phone = req.phone || '';
      let notes = req.notes || '';
      const canceledBy = req.canceledBy || 'Student';
      if (!eventId && !bookingId) {
        return jsonOut({ success: false, message: 'Missing Google Calendar event ID or booking ID.' });
      }
      const bookingAccess = requireBookingCaller_(config, req.authToken, bookingId, slot);
      name = fsString_(bookingAccess.booking, 'name') || name;
      email = fsString_(bookingAccess.booking, 'email') || email;
      phone = fsString_(bookingAccess.booking, 'phone') || phone;
      notes = fsString_(bookingAccess.booking, 'notes') || notes;
      const cal = CalendarApp.getCalendarById(config.primaryCalendarId);
      if (!cal) {
        return jsonOut({ success: false, message: 'Primary calendar not found.' });
      }
      var event = null;
      var alreadyDeleted = false;
      var ignoredError = '';
      try {
        event = findBookingEvent_(cal, eventId, bookingId, slot);
      } catch (eventLookupErr) {
        alreadyDeleted = true;
        ignoredError = eventLookupErr && eventLookupErr.message ? eventLookupErr.message : String(eventLookupErr);
      }
      if (!event) {
        alreadyDeleted = true;
      } else {
        try {
          event.deleteEvent();
        } catch (deleteErr) {
          alreadyDeleted = true;
          ignoredError = deleteErr && deleteErr.message ? deleteErr.message : String(deleteErr);
        }
      }
      var cancellationNotificationSent = false;
      var cancellationNotificationError = '';
      processPendingNotificationJobs_(config, bookingId);
      const canceledBookingState = firestoreAdminFetch_(config, '/bookings/' + encodeURIComponent(bookingId), { method: 'get' });
      cancellationNotificationSent = fsString_(canceledBookingState, canceledBy === 'Student' ? 'teacherNotificationStatus' : 'studentNotificationStatus') === 'sent';
      cancellationNotificationError = fsString_(canceledBookingState, canceledBy === 'Student' ? 'teacherNotificationLastError' : 'studentNotificationLastError');
      return jsonOut({
        success: true,
        message: alreadyDeleted ? 'Calendar event was already removed.' : 'Calendar event deleted.',
        alreadyDeleted: alreadyDeleted,
        ignoredError: ignoredError,
        cancellationNotificationSent: cancellationNotificationSent,
        cancellationNotificationError: cancellationNotificationError
      });
    }

    if (action === 'rescheduleBooking') {
      const bookingId = req.bookingId || '';
      const eventId = req.eventId || '';
      const oldSlot = Number(req.oldSlot || 0);
      const newSlot = Number(req.newSlot || 0);
      const requestedDurationMinutes = Number(req.durationMinutes || 0);
      if (!bookingId || !oldSlot || !newSlot || newSlot <= Date.now()) {
        return jsonOut({ success: false, message: 'Invalid reschedule request.' });
      }
      const bookingAccess = requireBookingCaller_(config, req.authToken, bookingId, 0);
      enforceCallerRateLimit_(
        bookingAccess.caller,
        'rescheduleBooking',
        bookingAccess.role === 'teacher' ? 120 : 12,
        3600
      );
      const cal = CalendarApp.getCalendarById(config.primaryCalendarId);
      if (!cal) {
        return jsonOut({ success: false, message: 'Primary calendar not found.' });
      }
      const event = findBookingEvent_(cal, eventId, bookingId, oldSlot);
      if (!event) {
        return jsonOut({ success: false, message: 'Calendar event was not found.' });
      }
      const durationMs = requestedDurationMinutes
        ? Math.max(15, Math.min(240, requestedDurationMinutes)) * 60 * 1000
        : Math.max(
            15 * 60 * 1000,
            event.getEndTime().getTime() - event.getStartTime().getTime()
          );
      const newStart = new Date(newSlot);
      const newEnd = new Date(newSlot + durationMs);
      const eventLock = LockService.getScriptLock();
      eventLock.waitLock(20000);
      try {
        const hasConflict = bookingAccess.role === 'teacher'
          ? hasConflictingStudentLesson_(cal, newStart, newEnd, event.getId())
          : hasConflictingEventExcept_(
            getBusyCalendarIds_(config),
            newStart,
            newEnd,
            event.getId()
          );
        if (hasConflict) {
          return jsonOut({
            success: false,
            message: 'That slot is no longer available. Please choose another time.'
          });
        }
        event.setTime(newStart, newEnd);
      } finally {
        eventLock.releaseLock();
      }
      let meetingUrl = '';
      try {
        meetingUrl = event.getHangoutLink() || '';
      } catch (hangoutErr) {}
      let studentNotificationSent = false;
      return jsonOut({
        success: true,
        message: 'Google Calendar event rescheduled.',
        eventId: event.getId(),
        meetingUrl: meetingUrl,
        studentNotificationSent: studentNotificationSent,
      });
    }

    if (action === 'installReminderTrigger') {
      requireTeacherCaller_(config, req.authToken);
      return jsonOut(installLessonReminderTrigger());
    }

    if (action === 'getReminderTriggerStatus') {
      requireTeacherCaller_(config, req.authToken);
      return jsonOut(getLessonReminderTriggerStatus_());
    }

    if (action === 'sendReminderCheck') {
      requireTeacherCaller_(config, req.authToken);
      return jsonOut(sendUpcomingLessonReminders());
    }

    return jsonOut({ success: false, message: 'Unknown action.' });
  } catch (err) {
    return jsonOut({ success: false, message: err.message || String(err) });
  }
}
