const defaultAppConfig = {
    firebase: {
        apiKey: "AIzaSyB0TR0uOS7-cOAQxtSUYpY2ikvqwDsy2YM",
        authDomain: "farouqapp-7ea93.firebaseapp.com",
        projectId: "farouqapp-7ea93",
        storageBucket: "farouqapp-7ea93.firebasestorage.app",
        messagingSenderId: "362146773658",
        appId: "1:362146773658:web:b00d9acd346b3b17b6fd23",
        measurementId: "G-E7G0SC7KZ6",
    },
    googleCalendar: {
        clientId: "150890105689-h8s7ls7oss9jknlcjoftr4f9kv0f5jvs.apps.googleusercontent.com",
        apiKey: "AIzaSyBfAEADLGP5-9FrFxCT2zkqeGi--jBoCUQ",
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
        scopes: "https://www.googleapis.com/auth/calendar.events",
        redirectUri: window.location.origin + "/",
    },
};

const appConfig = window.__APP_CONFIG__ || defaultAppConfig;
const firebaseConfig = appConfig.firebase || {};
const hasFirebaseConfig = Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
);

window.firebaseConfig = hasFirebaseConfig ? firebaseConfig : null;
window.googleCalendarConfig = {
    clientId: appConfig.googleCalendar?.clientId || "",
    apiKey: appConfig.googleCalendar?.apiKey || "",
    discoveryDocs: appConfig.googleCalendar?.discoveryDocs || [
        "https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest",
    ],
    scopes:
        appConfig.googleCalendar?.scopes ||
        "https://www.googleapis.com/auth/calendar.events",
    redirectUri:
        appConfig.googleCalendar?.redirectUri || window.location.origin + "/",
};
