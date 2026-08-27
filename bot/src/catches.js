'use strict';

// Улов (`trips/{tripId}/catches/{autoId}`).

import { db } from './firestore.js';
import { todayStr } from './dates.js';

export const FISH_GROUPS = [
  {
    label: 'Рыба',
    items: ['Сима', 'Горбуша', 'Кета', 'Кижуч', 'Кунджа', 'Голец', 'Хариус',
            'Таймень', 'Треска', 'Навага', 'Камбала', 'Терпуг'],
  },
  {
    label: 'Моллюски и гады',
    items: ['Краб', 'Морской ёж', 'Трепанг', 'Гребешок', 'Мидия', 'Трубач'],
  },
  {
    label: 'Другое',
    items: ['Другое'],
  },
];

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
