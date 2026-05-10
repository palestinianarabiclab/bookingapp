# حل خطأ Google OAuth 403

الخطأ:

```text
Access blocked: Farouq Firebase Project has not completed the Google verification process
Error 403: access_denied
```

## السبب

هذا الخطأ لا يأتي من كود Firebase ولا من Firestore rules. يظهر من Google OAuth لأن تطبيق Google Cloud ما زال في وضع `Testing`، وحساب Google الذي تحاول الدخول به غير موجود ضمن قائمة `Test users`.

المشروع يطلب صلاحية Google Calendar:

```text
https://www.googleapis.com/auth/calendar.events
```

وهذه صلاحية حساسة، لذلك Google يسمح بها أثناء الاختبار فقط للحسابات المضافة يدويا في OAuth consent screen.

## الحل السريع لحساب Farouq

1. افتح Google Cloud Console:
   `https://console.cloud.google.com/`
2. اختر مشروع:
   `farouqapp-7ea93` أو `Farouq Firebase Project`
3. اذهب إلى:
   `APIs & Services` > `OAuth consent screen`
4. تأكد أن التطبيق على `External` و `Testing`.
5. افتح قسم `Test users`.
6. أضف البريد:
   `farouqmurtaja96@gmail.com`
7. احفظ التغييرات، ثم جرّب الربط من جديد.

ملاحظة: خيار `Internal` متاح فقط لمشاريع Google Workspace، وليس لحساب Gmail عادي. لذلك لا تعتمد عليه إذا كان المشروع مربوطا بحساب شخصي.

## تأكد أيضا من OAuth Client

من:

`APIs & Services` > `Credentials` > OAuth 2.0 Client IDs

افتح الـ Web client وتأكد من الآتي:

- `Authorized JavaScript origins` يحتوي رابط الموقع الذي تعمل عليه، مثل:
  `http://localhost:8000`
- إذا كان الموقع منشورا على GitHub Pages أضف:
  `https://farouqmurtaja96-source.github.io`
- إذا كان التطبيق يستخدم redirect URI، أضف الرابط الكامل، مثل:
  `http://localhost:8000/`
  أو رابط GitHub Pages الكامل.

## إذا سيستخدمه أكثر من Test Users

لو التطبيق سيستخدمه طلاب أو مستخدمون خارج قائمة الاختبار، لا يكفي وضع `Testing`. عندها يجب نقل التطبيق إلى `Production` وإكمال Google verification، خصوصا لأن صلاحيات Calendar حساسة.

## إعدادات المشروع الحالية

ملف الإعدادات المحلي هو:

`js/config.runtime.js`

وفيه:

- Firebase project: `farouqapp-7ea93`
- Google OAuth client ID مخصص للمشروع الجديد
- Calendar scope: `https://www.googleapis.com/auth/calendar.events`

لا تنشر هذا الملف في مستودع عام إذا كانت القيم الحقيقية لا تريد ظهورها للناس.
