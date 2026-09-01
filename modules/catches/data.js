'use strict';

const CatchesData = (() => {

  // Один и тот же список видов на все поездки не годится — Дальний Восток
  // (лосось, крабы) и средняя полоса (щука, судак) не пересекаются вообще.
  // Каталог выбирается по региону рек поездки (см. _pickCatalog); если
  // ничего не совпало (обычная рыбалка без явного региона) — берём
  // пресноводный список средней полосы как самый частый случай.
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

  const DEFAULT_CATALOG = {
    groups: [
      { label: 'Рыба', items: ['Щука', 'Судак', 'Окунь', 'Голавль', 'Язь', 'Лещ', 'Плотва',
                                'Карп', 'Сом', 'Ёрш', 'Уклейка', 'Линь', 'Жерех', 'Красноперка', 'Форель'] },
      { label: 'Другое', items: ['Другое'] },
    ],
  };

  // Регион смотрим в реках поездки (importData для экспедиций либо plain
  // rivers для обычной рыбалки), плюс название поездки как слабый сигнал —
  // "Кольский 2025" без явного region в реках всё равно попадёт в northwest.
  function _pickCatalog(trip) {
    const regionText = (trip?.importData?.rivers || trip?.rivers || [])
      .map(r => (r && r.region) || '')
      .join(' ');
    const haystack = (regionText + ' ' + (trip?.name || '')).toLowerCase();

    for (const key of Object.keys(CATALOGS)) {
      if (CATALOGS[key].keywords.some(kw => haystack.includes(kw))) {
        return CATALOGS[key].groups;
      }
    }
    return DEFAULT_CATALOG.groups;
  }

  function getFishGroups(trip) {
    return _pickCatalog(trip);
  }

  function getAllFish(trip) {
    return _pickCatalog(trip).flatMap(g => g.items);
  }

  function normalizeCatch(data, id) {
    return {
      _id:       id,
      fish:      data.fish      || 'Другое',
      count:     parseInt(data.count) || 1,
      kept:      data.kept !== undefined ? !!data.kept : true,
      river:     data.river     || '',
      member:    data.member    || '',
      date:      data.date      || new Date().toISOString().split('T')[0],
      createdAt: data.createdAt || new Date().toISOString(),
      createdBy: data.createdBy || null,
    };
  }

  return { getFishGroups, getAllFish, normalizeCatch };
})();
