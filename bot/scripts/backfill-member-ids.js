'use strict';

// Разовый бэкфилл trip.memberIds для поездок, созданных/отредактированных
// до того как участники стали выбираться из пикера зарегистрированных
// (см. modules/trips/index.js:_showMemberPicker) — сопоставляет participants
// по displayName той же логикой, что и веб-версия (_matchMemberIds), плюс
// всегда добавляет владельца поездки (ownerId).
//
// По умолчанию dry-run — только печатает, что изменится. Запись — только
// с флагом --apply, после того как несопоставленные имена просмотрены руками.
//
// Запуск: cd bot && node scripts/backfill-member-ids.js [--apply]

import { db } from '../src/firestore.js';

const APPLY = process.argv.includes('--apply');

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

async function main() {
  const membersSnap = await db.collection('members').get();
  const byName = new Map();
  membersSnap.forEach((doc) => {
    const data = doc.data() || {};
    if (data.displayName) byName.set(norm(data.displayName), doc.id);
  });

  const tripsSnap = await db.collection('trips').get();

  let changed = 0;
  const unmatchedReport = [];

  for (const doc of tripsSnap.docs) {
    const trip = doc.data() || {};
    const participants = trip.participants || [];
    const matched = [];
    const unmatched = [];
    participants.forEach((name) => {
      const uid = byName.get(norm(name));
      if (uid) matched.push(uid);
      else unmatched.push(name);
    });

    const owner = trip.ownerId || null;
    const newMemberIds = [...new Set([...matched, ...(owner ? [owner] : [])])];
    const oldMemberIds = trip.memberIds || [];

    const sameSet = oldMemberIds.length === newMemberIds.length
      && oldMemberIds.every((id) => newMemberIds.includes(id));

    if (unmatched.length) {
      unmatchedReport.push({ id: doc.id, name: trip.name, unmatched });
    }

    if (!sameSet) {
      changed++;
      console.log(`\n${doc.id} — «${trip.name}»`);
      console.log(`  было:   [${oldMemberIds.join(', ')}]`);
      console.log(`  станет: [${newMemberIds.join(', ')}]`);
      if (APPLY) {
        await db.collection('trips').doc(doc.id).update({ memberIds: newMemberIds });
      }
    }
  }

  console.log(`\n— — —`);
  console.log(`Всего поездок: ${tripsSnap.size}`);
  console.log(`${APPLY ? 'Обновлено' : 'Будет обновлено (dry-run — для записи запусти с --apply)'}: ${changed}`);

  if (unmatchedReport.length) {
    console.log(`\nНесопоставленные имена участников (проверить вручную):`);
    unmatchedReport.forEach(({ id, name, unmatched }) => {
      console.log(`  ${id} — «${name}»: ${unmatched.join(', ')}`);
    });
  } else {
    console.log('\nВсе имена участников сопоставлены с зарегистрированными.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Ошибка бэкфилла:', err);
  process.exit(1);
});
