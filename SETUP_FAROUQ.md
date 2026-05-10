# 🔧 إعداد المشروع لـ Farouq - دليل شامل

## المرحلة الأولى: إنشاء مشروع Firebase جديد

### الخطوة 1: الوصول إلى Firebase Console
1. اذهب إلى: **https://console.firebase.google.com/**
2. ادخل باستخدام حساب Google (يفضل البريد الخاص بـ Farouq)
3. انقر على **"Create a project"** أو **"Add project"**

### الخطوة 2: ملء بيانات المشروع
- **Project name**: `farouqapp` (أو اسم مناسب)
- اختر الدول/المنطقة
- قراءة الشروط وانقر **"Create project"**

### الخطوة 3: الحصول على بيانات Firebase
بعد إنشاء المشروع:

1. انقر على **⚙️ Project Settings** (الترس بالأعلى)
2. اختر tab **"Your apps"** أو **"General"**
3. انقر **"Add app"** ثم اختر **"Web"** (الرمز `</>`).
4. أدخل اسم التطبيق: `Farouq Booking App`
5. انقر **"Register app"**
6. ستظهر بيانات Firebase - **انسخ الكود كاملاً** أو انسخ هذه البيانات:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",               // ← انسخ هذا
  authDomain: "farouqapp-7ea93.firebaseapp.com",  // ← و هذا
  projectId: "farouqapp-7ea93",            // ← و هذا
  storageBucket: "farouqapp-7ea93.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123...",
  measurementId: "G-XXXXX"
};
```

### الخطوة 4: تفعيل Authentication
1. من الجانب الأيسر: **Authentication** > **Get Started**
2. اختر **Email/Password**
3. فعّل **"Enable"** ثم **"Save"**

### الخطوة 5: إعداد Firestore Database
1. من الجانب الأيسر: **Firestore Database**
2. انقر **"Create Database"**
3. اختر **"Start in production mode"**
4. اختر الموقع (يفضل الأقرب لك)
5. بعد الإنشاء، اذهب إلى **"Rules"**
6. استبدل القواعس بهذا المحتوى:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // السماح للجميع بقراءة والكتابة للمستخدمين المسجلين
    match /{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

ثم انقر **"Publish"**

---

## المرحلة الثانية: إعداد Google Calendar API

### الخطوة 1: الوصول إلى Google Cloud Console
1. اذهب إلى: **https://console.cloud.google.com/**
2. إذا كنت لم تختر المشروع سابقاً، اختر **"Farouq Firebase Project"** من الأعلى

### الخطوة 2: تفعيل Calendar API
1. استخدم شريط البحث أعلى الصفحة وابحث عن: **"Google Calendar API"**
2. اختر **"Google Calendar API"** من النتائج
3. انقر **"Enable"**

### الخطوة 3: إنشاء OAuth 2.0 Credentials
1. انقر على **"Create Credentials"**
2. اختر **"OAuth client ID"**
3. إذا ظهرت رسالة "Configure OAuth consent screen":
   - اختر **"External"** إذا كان الحساب Gmail عادي، ثم أضف بريد Farouq ضمن **Test users**
   - خيار **"Internal"** متاح فقط لحسابات Google Workspace
   - املأ البيانات الأساسية (الاسم والبريد الإلكتروني)
   - اضغط **"Save and Continue"**
4. عند العودة، اختر **"Web application"**
5. أضف الـ authorized redirect URLs:
   - `http://localhost:8000` (للتطوير المحلي)
   - `http://localhost:3000` (إذا كنت تستخدم server آخر)
   - أو رابط التطبيق الفعلي الخاص بك

6. انقر **"Create"**

### الخطوة 4: نسخ بيانات OAuth
1. ستظهر نافذة بـ **Client ID** و **Client Secret**
2. انسخ **Client ID** فقط (ستحتاج لـ API Key أيضاً)

### الخطوة 5: الحصول على API Key
1. من **Google Cloud Console**، اذهب إلى **APIs & Services** > **Credentials**
2. انقر **"Create Credentials"** > **"API Key"**
3. انسخ **API Key**

---

## المرحلة الثالثة: تحديث المشروع

### الملف: `js/config.runtime.js`

استبدل البيانات القديمة بالجديدة:

```javascript
window.__APP_CONFIG__ = {
    firebase: {
        apiKey: "YOUR_NEW_API_KEY",
        authDomain: "farouqapp-7ea93.firebaseapp.com",
        projectId: "farouqapp-7ea93",
        storageBucket: "farouqapp-7ea93.firebasestorage.app",
        messagingSenderId: "YOUR_NEW_SENDER_ID",
        appId: "YOUR_NEW_APP_ID",
        measurementId: "YOUR_NEW_MEASUREMENT_ID",
    },
    googleCalendar: {
        clientId: "YOUR_NEW_CLIENT_ID.apps.googleusercontent.com",
        apiKey: "YOUR_NEW_API_KEY",
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
        scopes: "https://www.googleapis.com/auth/calendar.events",
        redirectUri: window.location.origin + "/",
    },
    emailjs: {
        publicKey: "BI-fovMoNHHS7lue5",  // (اختياري - يمكنك تركه كما هو أو تغييره)
        serviceId: "service_46tij1f",
        templateId: "template_aokcxf5",
    },
};
```

---

## المرحلة الرابعة: الاختبار

### 1. تشغيل التطبيق محلياً
```bash
# إذا كنت تستخدم Python
python -m http.server 8000

# أو Node.js
npm install -g http-server
http-server . -p 8000
```

### 2. اختبار التسجيل
1. افتح: `http://localhost:8000`
2. اختر **"Teacher Login"**
3. سجل حساب جديد لـ Farouq
4. تحقق من أن البيانات تُحفظ في Firebase

### 3. اختبار Google Calendar
1. في لوحة المعلم، اضغط **"Connect Google Calendar"**
2. اتبع خطوات الربط
3. تحقق من أن الأحداث تظهر في التقويم

---

## ملخص البيانات المطلوبة

✅ **من Firebase:**
- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`
- `measurementId`

✅ **من Google Cloud:**
- `clientId` (من OAuth 2.0)
- `apiKey` (من API Key)

---

## المشاكل الشائعة والحلول

### ❌ "CORS error" عند الاتصال بـ Google Calendar
**الحل:** تأكد من إضافة رابط التطبيق إلى **Authorized redirect URIs** في Google Cloud Console

### ❌ "Missing or insufficient permissions" من Firestore
**الحل:** تأكد من نشر قواعد Firestore والتي تسمح بالقراءة للجميع والكتابة للمسجلين

### ❌ Firebase Credentials غير صحيحة
**الحل:** تأكد من أن البيانات في `config.runtime.js` متطابقة تماماً مع البيانات من Firebase Console

---

## 🚨 حل مشكلة "Google verification process" 

### المشكلة:
```
Access blocked: Farouq Firebase Project has not completed the Google verification process
Error 403: access_denied
```

### الحل السريع (موصى به):

#### الطريقة 1: إضافة بريد Farouq كـ Test User (الأسرع)
1. اذهب إلى: **https://console.cloud.google.com/**
2. اختر مشروع Farouq
3. اذهب إلى **APIs & Services** > **OAuth consent screen**
4. أبقِ التطبيق على **"External"** و **"Testing"**
5. أضف بريد Farouq كـ **Test user**: `farouqmurtaja96@gmail.com`
6. احفظ التغييرات

#### الطريقة 2: إضافة Test Users
1. اذهب إلى **OAuth consent screen**
2. في قسم **"Test users"**، انقر **"Add users"**
3. أضف بريد Farouq: `farouqmurtaja96@gmail.com`
4. احفظ التغييرات

#### الطريقة 3: إعادة إنشاء OAuth Credentials
1. احذف OAuth client الحالي
2. أعد إنشاء OAuth client جديد مع إعداد OAuth consent screen على **External / Testing**
3. حدّث `clientId` في `js/config.runtime.js`

### بعد الحل:
- أعد تشغيل التطبيق
- اربط Google Calendar مرة أخرى
- يجب أن يعمل الآن بدون مشاكل

---

احفظ هذا الملف واتبع الخطوات بترتيب. بعدما تنهي، أخبرني بالبيانات الجديدة وسأحدث ملف الإعدادات للك! 🚀
