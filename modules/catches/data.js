'use strict';

const CatchesData = (() => {

  const FISH_GROUPS = [
    {
      label: 'Рыба',
      items: ['Сима','Горбуша','Кета','Кижуч','Кунджа','Голец','Хариус',
              'Таймень','Треска','Навага','Камбала','Терпуг']
    },
    {
      label: 'Моллюски и гады',
      items: ['Краб','Морской ёж','Трепанг','Гребешок','Мидия','Трубач']
    },
    {
      label: 'Другое',
      items: ['Другое']
    }
  ];

  function getFishGroups() {
    return FISH_GROUPS;
  }

  function getAllFish() {
    return FISH_GROUPS.flatMap(g => g.items);
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
    };
  }

  return { getFishGroups, getAllFish, normalizeCatch };
})();
