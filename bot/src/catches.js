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

export async function addCatch(tripId, { fish, count, kept, river, member, uid }) {
  const data = {
    fish,
    count,
    kept: !!kept,
    river: river || '',
    member,
    date: todayStr(),
    createdAt: new Date().toISOString(),
    createdBy: uid,
  };
  const ref = await db.collection('trips').doc(tripId).collection('catches').add(data);
  return { id: ref.id, ...data };
}
