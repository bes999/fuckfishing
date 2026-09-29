'use strict';

// Улов (`trips/{tripId}/catches/{autoId}`).

import { db } from './firestore.js';
import { todayStr } from './dates.js';

// Каталог видов зависит от региона поездки — зеркалит
// modules/catches/data.js на сайте (держать в синхроне при правке).
const CATALOGS = {
  farEast: {
    keywords: ['сахалин', 'камчат', 'примор', 'хабаровск', 'магадан', 'курил', 'чукотк', 'амур', 'владивосток'],
    groups: [
      { label: 'Рыба', items: ['Сима', 'Горбуша', 'Кета', 'Кижуч', 'Кунджа', 'Голец', 'Хариус',
                                'Таймень', 'Треска', 'Навага', 'Камбала', 'Терпуг'] },
      { label: 'Моллюски и гады', items: ['Краб', 'Морской ёж', 'Трепанг', 'Гребешок', 'Мидия', 'Трубач'] },
      { label: 'Другое', items: ['Другое'] },
    ],
  },
  northwest: {
    keywords: ['кольск', 'карел', 'мурманск', 'кола', 'белое море'],
    groups: [
      { label: 'Рыба', items: ['Сёмга', 'Кумжа', 'Форель', 'Голец', 'Хариус', 'Сиг', 'Щука', 'Окунь', 'Налим', 'Ряпушка'] },
      { label: 'Другое', items: ['Другое'] },
    ],
  },
};

const DEFAULT_GROUPS = [
  { label: 'Рыба', items: ['Щука', 'Судак', 'Окунь', 'Голавль', 'Язь', 'Лещ', 'Плотва',
                            'Карп', 'Сом', 'Ёрш', 'Уклейка', 'Линь', 'Жерех', 'Красноперка', 'Форель'] },
  { label: 'Другое', items: ['Другое'] },
];

export function pickFishGroups(trip) {
  const regionText = (trip?.importData?.rivers || trip?.rivers || [])
    .map((r) => (r && r.region) || '')
    .join(' ');
  const haystack = (regionText + ' ' + (trip?.name || '')).toLowerCase();

  for (const key of Object.keys(CATALOGS)) {
    if (CATALOGS[key].keywords.some((kw) => haystack.includes(kw))) {
      return CATALOGS[key].groups;
    }
  }
  return DEFAULT_GROUPS;
}

// Раньше писало улов без всякой проверки — Firestore разрешает писать в
// подколлекцию НЕСУЩЕСТВУЮЩЕГО документа (родитель для подколлекций не
// обязан существовать), так что сценарий "начал вводить улов → организатор
// удалил поездку → закончил ввод" тихо создавал запись под уже удалённой
// поездкой, а бот отвечал "Записано". Реальный баг, найден внешним ревью
// 2026-09-27. Транзакция проверяет существование поездки и что uid всё ещё
// в её участниках атомарно с самой записью — не отдельным "get" до, между
// которым и записью могло бы успеть измениться то же самое.
export async function addCatch(tripId, { fish, count, kept, river, comment, member, uid }) {
  const tripRef = db.collection('trips').doc(tripId);
  const catchRef = tripRef.collection('catches').doc();
  const data = {
    fish,
    count,
    kept: !!kept,
    river: river || '',
    comment: comment || '',
    member,
    date: todayStr(),
    createdAt: new Date().toISOString(),
    createdBy: uid,
  };
  await db.runTransaction(async (tx) => {
    const tripSnap = await tx.get(tripRef);
    if (!tripSnap.exists) throw new Error('trip-not-found');
    const memberIds = tripSnap.data().memberIds || [];
    if (uid && !memberIds.includes(uid)) throw new Error('not-a-member');
    tx.set(catchRef, data);
  });
  return { id: catchRef.id, ...data };
}
