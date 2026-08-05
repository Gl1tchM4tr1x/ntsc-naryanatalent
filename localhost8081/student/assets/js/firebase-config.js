// Firebase Realtime Database config for global sync.
// Firebase Console > Project settings > Your apps > Web app config paste karo.
// Realtime Database create karo, aur testing ke liye rules temporarily:
// {
//   "rules": {
//     "portal_data": { ".read": true, ".write": true }
//   }
// }
// Production mein rules secure rakhna.
window.NTSC_FIREBASE_CONFIG = {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    DATA_PATH: "portal_data/main"
};