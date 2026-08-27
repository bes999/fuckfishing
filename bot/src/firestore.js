'use strict';

// Инициализация firebase-admin. Работает в обход security rules Firestore —
// бот пишет от имени привязанного участника, но фактически с сервисным
// аккаунтом, поэтому все проверки прав (совпадение uid и т.п.) на совести
// вызывающего кода в src/*.js.

import 'dotenv/config';
import admin from 'firebase-admin';

let _db = null;

function init() {
  if (_db) return _db;
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    }
    _db = admin.firestore();
    return _db;
  } catch (err) {
    console.error('❌ Не удалось инициализировать Firebase Admin SDK.');
    console.error('   Проверьте GOOGLE_APPLICATION_CREDENTIALS в bot/.env и наличие файла serviceAccount.json (см. bot/README.md).');
    console.error('   ' + (err && err.message ? err.message : err));
    process.exit(1);
  }
}

export const db = init();
export const FieldValue = admin.firestore.FieldValue;
