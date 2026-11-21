// club-config.js – Verbindung zur Buchclub-Datenbank (Google Firebase)
//
// Nach der Einrichtung (siehe ANLEITUNG.md, Abschnitt „Buchclub“) hier die Werte
// aus der Firebase-Konsole eintragen. Diese Werte sind nicht geheim: Sie sagen der
// App nur, wo eure Club-Datenbank liegt. Wer mitlesen darf, regeln die Sicherheitsregeln.
//
// Eingetragen am 21.11.2026 (Projekt buchclub-lsf).

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAISzNhzSSKL0mI5fBFbtJN7KFxBo8LTMo",
  authDomain: "buchclub-lsf.firebaseapp.com",
  projectId: "buchclub-lsf",
  storageBucket: "buchclub-lsf.firebasestorage.app",
  messagingSenderId: "565281258778",
  appId: "1:565281258778:web:b91e595fca9d237a1580a3",
};

/* So sieht es danach aus (Werte aus Firebase → Projekteinstellungen → Meine Apps):

export const FIREBASE_CONFIG = {
  apiKey: "AIza…",
  authDomain: "lesejournal-club.firebaseapp.com",
  projectId: "lesejournal-club",
  storageBucket: "lesejournal-club.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
};
*/
