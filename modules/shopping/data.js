'use strict';

const ShoppingData = (() => {

  const UNITS = ['кг','г','шт','л','мл','уп','пачек','банок','бутылок','головок','зубчиков','пучков','долек'];

  const _defaults = [
    {
      id: 'vegetables',
      title: 'Овощи и фрукты',
      icon: 'ti-leaf',
      items: [
        { id: 'v1', name: 'Огурцы',           qty: '1 кг',     bought: false },
        { id: 'v2', name: 'Помидоры',          qty: '1 кг',     bought: false },
        { id: 'v3', name: 'Картофель',         qty: '2 кг',     bought: false },
        { id: 'v4', name: 'Лук репчатый',      qty: '3 шт',     bought: false },
        { id: 'v5', name: 'Чеснок',            qty: '2 головки',bought: false },
        { id: 'v6', name: 'Лимоны / лаймы',   qty: '8 шт',     bought: false },
        { id: 'v7', name: 'Яблоки / апельсины',qty: '3–4 шт',  bought: false },
      ]
    },
    {
      id: 'meat',
      title: 'Мясо и консервы',
      icon: 'ti-meat',
      items: [
        { id: 'm1', name: 'Тушёнка Кронидов', qty: '6 банок',  bought: false },
        { id: 'm2', name: 'Буженина',          qty: '500 г',   bought: false },
        { id: 'm3', name: 'Колбаса с/к',       qty: '2 пачки', bought: false },
        { id: 'm4', name: 'Сосиски',           qty: '2 пачки', bought: false },
        { id: 'm5', name: 'Сало',              qty: '300 г',   bought: false },
        { id: 'm6', name: 'Сардины в масле',   qty: '4 банки', bought: false },
      ]
    },
    {
      id: 'dairy',
      title: 'Молочное и яйца',
      icon: 'ti-egg',
      items: [
        { id: 'd1', name: 'Яйца',              qty: '20 шт',   bought: false },
        { id: 'd2', name: 'Масло сливочное',   qty: '400 г',   bought: false },
        { id: 'd3', name: 'Сыр твёрдый',       qty: '300 г',   bought: false },
        { id: 'd4', name: 'Сливки 20%',        qty: '200 мл',  bought: false },
        { id: 'd5', name: 'Сгущёнка',          qty: '2 банки', bought: false },
      ]
    },
    {
      id: 'grains',
      title: 'Крупы и паста',
      icon: 'ti-grain',
      items: [
        { id: 'g1', name: 'Гречка',            qty: '500 г',   bought: false },
        { id: 'g2', name: 'Рис',               qty: '500 г',   bought: false },
        { id: 'g3', name: 'Овсянка быстрая',   qty: '500 г',   bought: false },
        { id: 'g4', name: 'Спагетти',          qty: '500 г',   bought: false },
        { id: 'g5', name: 'Феттучини',         qty: '500 г',   bought: false },
        { id: 'g6', name: 'Хлеб / лаваш',     qty: '3 шт',    bought: false },
        { id: 'g7', name: 'Сухари',            qty: '1 уп',    bought: false },
      ]
    },
    {
      id: 'sauces',
      title: 'Соусы и специи',
      icon: 'ti-bottle',
      items: [
        { id: 's1', name: 'Соль',              qty: '500 г',   bought: false },
        { id: 's2', name: 'Перец чёрный',      qty: '1 уп',    bought: false },
        { id: 's3', name: 'Масло растительное',qty: '500 мл',  bought: false },
        { id: 's4', name: 'Соевый соус',       qty: '200 мл',  bought: false },
        { id: 's5', name: 'Табаско',           qty: '1 бут.',  bought: false },
        { id: 's6', name: 'Лавровый лист',     qty: '1 уп',    bought: false },
        { id: 's7', name: 'Уксус',             qty: '200 мл',  bought: false },
        { id: 's8', name: 'Мёд',               qty: '200 г',   bought: false },
        { id: 's9', name: 'Сахар',             qty: '300 г',   bought: false },
      ]
    },
    {
      id: 'snacks',
      title: 'Перекусы и сладкое',
      icon: 'ti-cookie',
      items: [
        { id: 'sn1', name: 'Орехи смесь',     qty: '500 г',   bought: false },
        { id: 'sn2', name: 'Сухофрукты',      qty: '300 г',   bought: false },
        { id: 'sn3', name: 'Шоколад',         qty: '4 плитки',bought: false },
        { id: 'sn4', name: 'Печенье',         qty: '2 пачки', bought: false },
        { id: 'sn5', name: 'Зефир',           qty: '1 пачка', bought: false },
        { id: 'sn6', name: 'Халва',           qty: '200 г',   bought: false },
      ]
    },
    {
      id: 'drinks',
      title: 'Напитки',
      icon: 'ti-droplet',
      items: [
        { id: 'dr1', name: 'Кофе молотый',    qty: '250 г',   bought: false },
        { id: 'dr2', name: 'Чай',             qty: '1 уп',    bought: false },
        { id: 'dr3', name: 'Тоник',           qty: '6 банок', bought: false },
        { id: 'dr4', name: 'Ginger beer',     qty: '6 банок', bought: false },
        { id: 'dr5', name: 'Содовая',         qty: '6 банок', bought: false },
        { id: 'dr6', name: 'Апельсиновый сок',qty: '1 л',     bought: false },
        { id: 'dr7', name: 'Ананасовый сок',  qty: '1 л',     bought: false },
        { id: 'dr8', name: 'Томатный сок',    qty: '1 л',     bought: false },
      ]
    },
    {
      id: 'bar',
      title: 'Бар',
      icon: 'ti-glass-full',
      items: [
        { id: 'b1',  name: 'Джин',                  qty: '1 бут.',  bought: false },
        { id: 'b2',  name: 'Виски / бурбон',        qty: '1 бут.',  bought: false },
        { id: 'b3',  name: 'Ром тёмный',            qty: '1 бут.',  bought: false },
        { id: 'b4',  name: 'Водка',                 qty: '1 бут.',  bought: false },
        { id: 'b5',  name: 'Просекко / брют',       qty: '3 бут.',  bought: false },
        { id: 'b6',  name: 'Егерь',                 qty: '1 бут.',  bought: false },
        { id: 'b7',  name: 'Кампари',               qty: '1 бут.',  bought: false },
        { id: 'b8',  name: 'Вермут красный',        qty: '1 бут.',  bought: false },
        { id: 'b9',  name: 'Ликёр смородиновый',   qty: '1 бут.',  bought: false },
        { id: 'b10', name: 'St-Germain (бузина)',   qty: '1 бут.',  bought: false },
        { id: 'b11', name: 'Кофейный ликёр',        qty: '1 бут.',  bought: false },
        { id: 'b12', name: 'Апероль',               qty: '1 бут.',  bought: false },
        { id: 'b13', name: 'Angostura биттер',      qty: '1 бут.',  bought: false },
      ]
    },
    {
      id: 'market',
      title: 'Маркетплейсы',
      icon: 'ti-package',
      items: [
        { id: 'mp1', name: 'Дрип-пакеты кофе',     qty: '30 шт',   bought: false },
        { id: 'mp2', name: 'Фильтры для кофе',      qty: '1 уп',    bought: false },
        { id: 'mp3', name: 'Вакуумные пакеты',      qty: '1 уп',    bought: false },
        { id: 'mp4', name: 'Каперсы',               qty: '1 банка', bought: false },
        { id: 'mp5', name: 'Кокосовые сливки',      qty: '1 банка', bought: false },
        { id: 'mp6', name: 'Ваниль / корица',       qty: '1 уп',    bought: false },
      ]
    },
  ];

  function getDefaults() {
    return JSON.parse(JSON.stringify(_defaults));
  }

  function getUnits() { return UNITS; }

  return { getDefaults, getUnits };
})();
