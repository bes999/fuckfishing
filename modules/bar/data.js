'use strict';

const BarData = (() => {

  const categories = [
    {
      id: 'gin',
      label: 'Джин',
      icon: 'ti-glass-full',
      cocktails: [
        {
          id: 'gin_tonic',
          name: 'Gin & Tonic',
          sub: 'Джин · тоник · лайм',
          diff: 'easy',
          ingredients: [
            { name: 'Джин', qty: '50 мл' },
            { name: 'Тоник', qty: '120 мл' },
            { name: 'Лайм', qty: 'долька' },
            { name: 'Лёд', qty: 'много' }
          ],
          method: 'Бокал наполнить льдом. Джин, тоник, не мешать. Лайм отжать и бросить.'
        },
        {
          id: 'bramble',
          name: 'Bramble',
          sub: 'Джин · смородина · лайм',
          diff: 'med',
          ingredients: [
            { name: 'Джин', qty: '50 мл' },
            { name: 'Лимонный сок', qty: '25 мл' },
            { name: 'Сироп', qty: '15 мл' },
            { name: 'Смородиновый ликёр', qty: 'флоут' }
          ],
          method: 'Взболтать джин + лимон + сироп со льдом, процедить в бокал. Смородиновый ликёр налить поверх по ложке — слоем.'
        },
        {
          id: 'negroni',
          name: 'Negroni',
          sub: 'Джин · кампари · вермут',
          diff: 'easy',
          ingredients: [
            { name: 'Джин', qty: '30 мл' },
            { name: 'Кампари', qty: '30 мл' },
            { name: 'Вермут красный', qty: '30 мл' },
            { name: 'Апельсин (цедра)', qty: 'масло отжать' }
          ],
          method: 'Всё со льдом мешать 20 секунд. Процедить. Цедру апельсина отжать над бокалом и бросить.'
        },
        {
          id: 'negroni_sbagliato',
          name: 'Негрони Сбальято',
          sub: 'Кампари · вермут · брют',
          diff: 'easy',
          ingredients: [
            { name: 'Кампари', qty: '30 мл' },
            { name: 'Вермут красный', qty: '30 мл' },
            { name: 'Брют холодный', qty: '60 мл' },
            { name: 'Апельсин', qty: 'долька' }
          ],
          method: 'Кампари + вермут в бокал со льдом, долить брютом. Один оборот. Держать брют в реке заранее.'
        },
        {
          id: 'tom_collins',
          name: 'Том Коллинз',
          sub: 'Джин · лимон · содовая',
          diff: 'easy',
          ingredients: [
            { name: 'Джин', qty: '45 мл' },
            { name: 'Лимонный сок', qty: '30 мл' },
            { name: 'Сироп', qty: '15 мл' },
            { name: 'Содовая', qty: '80 мл' }
          ],
          method: 'Взболтать джин + лимон + сироп со льдом. Перелить в высокий бокал, долить содовой.'
        },
        {
          id: 'bees_knees',
          name: "Bee's Knees",
          sub: 'Джин · мёд · лимон',
          diff: 'easy',
          ingredients: [
            { name: 'Джин', qty: '50 мл' },
            { name: 'Лимонный сок', qty: '20 мл' },
            { name: 'Мёд (развести 1:1)', qty: '15 мл' }
          ],
          method: 'Взболтать со льдом, процедить. Мёд предварительно развести тёплой водой 1:1 чтобы растворился.'
        },
        {
          id: 'gin_mint_swizzle',
          name: 'Мятный свизл',
          sub: 'Джин · мята · лимон · содовая',
          diff: 'easy',
          ingredients: [
            { name: 'Джин', qty: '50 мл' },
            { name: 'Лимонный сок', qty: '15 мл' },
            { name: 'Сироп', qty: '20 мл' },
            { name: 'Мята (с берега!)', qty: '8–10 листов' },
            { name: 'Содовая', qty: '100 мл' }
          ],
          method: 'Мяту аккуратно помять с сиропом. Добавить джин + лимон + лёд. Долить содовой. Не мешать.'
        },
        {
          id: 'beyond_the_sea',
          name: 'Beyond the Sea',
          sub: 'Джин · огурец · вино флоут',
          diff: 'hard',
          ingredients: [
            { name: 'Джин', qty: '60 мл' },
            { name: 'Лимонный сок', qty: '30 мл' },
            { name: 'Рич сироп (2:1)', qty: '30 мл' },
            { name: 'Огурец', qty: '1 долька' },
            { name: 'Красное сухое (флоут)', qty: 'поверх' }
          ],
          method: 'Огурец мадлим. Взболтать со льдом. Процедить. Красное налить по ложке поверх — слоем.'
        },
      ]
    },
    {
      id: 'whisky',
      label: 'Виски',
      icon: 'ti-glass',
      cocktails: [
        {
          id: 'old_fashioned',
          name: 'Old Fashioned',
          sub: 'Виски · биттер · сахар',
          diff: 'easy',
          ingredients: [
            { name: 'Бурбон или ржаной виски', qty: '60 мл' },
            { name: 'Сироп', qty: '10 мл' },
            { name: 'Angostura биттер', qty: '2 дэша' },
            { name: 'Апельсин (цедра)', qty: 'масло отжать' }
          ],
          method: 'Сироп + биттер + цедра в бокал. Добавить виски и один большой кубик льда. Мешать 20 секунд.'
        },
        {
          id: 'whisky_sour',
          name: 'Whisky Sour',
          sub: 'Виски · лимон · сироп',
          diff: 'easy',
          ingredients: [
            { name: 'Бурбон', qty: '50 мл' },
            { name: 'Лимонный сок', qty: '25 мл' },
            { name: 'Сироп', qty: '20 мл' }
          ],
          method: 'Всё взболтать со льдом, процедить. Можно сухой шейк без льда сначала — будет пышнее.'
        },
        {
          id: 'manhattan',
          name: 'Manhattan',
          sub: 'Виски · вермут · биттер',
          diff: 'med',
          ingredients: [
            { name: 'Ржаной виски', qty: '60 мл' },
            { name: 'Вермут красный', qty: '30 мл' },
            { name: 'Angostura биттер', qty: '2 дэша' },
            { name: 'Вишня (гарнир)', qty: '1 шт.' }
          ],
          method: 'Всё со льдом мешать 30 секунд. Процедить в бокал без льда. Вишню на шпажку.'
        },
        {
          id: 'penicillin',
          name: 'Penicillin',
          sub: 'Скотч · имбирь · лимон · мёд',
          diff: 'hard',
          ingredients: [
            { name: 'Купажированный скотч', qty: '50 мл' },
            { name: 'Лимонный сок', qty: '25 мл' },
            { name: 'Мёд-имбирный сироп', qty: '20 мл' },
            { name: 'Айлейский скотч (флоут)', qty: '10 мл' }
          ],
          method: 'Взболтать скотч + лимон + сироп со льдом, процедить. Айлейский налить по ложке поверх — для дымного аромата.'
        },
        {
          id: 'highball',
          name: 'Whisky Highball',
          sub: 'Виски · содовая',
          diff: 'easy',
          ingredients: [
            { name: 'Японский виски', qty: '45 мл' },
            { name: 'Содовая холодная', qty: '120 мл' },
            { name: 'Лёд', qty: 'много' }
          ],
          method: 'Высокий бокал наполнить льдом. Виски, медленно долить содовую по стенке. Один оборот.'
        },
        {
          id: 'bobby_burns',
          name: 'Bobby Burns',
          sub: 'Скотч · вермут · бенедиктин',
          diff: 'med',
          ingredients: [
            { name: 'Скотч', qty: '50 мл' },
            { name: 'Вермут красный', qty: '25 мл' },
            { name: 'Бенедиктин', qty: '10 мл' }
          ],
          method: 'Всё со льдом мешать 20 секунд. Процедить. Цедру лимона над бокалом.'
        },
        {
          id: 'godfather',
          name: 'Godfather',
          sub: 'Виски · амаретто',
          diff: 'easy',
          ingredients: [
            { name: 'Скотч', qty: '50 мл' },
            { name: 'Амаретто', qty: '25 мл' },
            { name: 'Лёд', qty: 'крупный кубик' }
          ],
          method: 'Виски + амаретто в бокал с крупным льдом. Мешать 10 секунд. Пить медленно.'
        },
      ]
    },
    {
      id: 'rum',
      label: 'Ром',
      icon: 'ti-anchor',
      cocktails: [
        {
          id: 'mojito',
          name: 'Мохито',
          sub: 'Ром · мята · лайм · содовая',
          diff: 'easy',
          ingredients: [
            { name: 'Тёмный ром', qty: '50 мл' },
            { name: 'Лимонный сок', qty: '25 мл' },
            { name: 'Сироп', qty: '15 мл' },
            { name: 'Мята (с берега!)', qty: '8–10 листов' },
            { name: 'Содовая', qty: '80 мл' }
          ],
          method: 'Мяту аккуратно помять с сиропом — не растирать. Ром + лимон + лёд, долить содовой.'
        },
        {
          id: 'dark_stormy',
          name: 'Dark & Stormy',
          sub: 'Тёмный ром · имбирное пиво',
          diff: 'easy',
          ingredients: [
            { name: 'Тёмный ром', qty: '50 мл' },
            { name: 'Ginger beer', qty: '120 мл' },
            { name: 'Лайм', qty: '15 мл' }
          ],
          method: 'Ginger beer со льдом в бокал. Ром аккуратно налить сверху слоем. Лайм отжать.'
        },
        {
          id: 'cuba_libre',
          name: 'Куба Либре',
          sub: 'Ром · кола · лайм',
          diff: 'easy',
          ingredients: [
            { name: 'Тёмный ром', qty: '50 мл' },
            { name: 'Черноголовка / кола', qty: '150 мл' },
            { name: 'Лайм', qty: 'долька' }
          ],
          method: 'Лёд, ром, кола. Лайм отжать и бросить. Один оборот.'
        },
        {
          id: 'rum_old_fashioned',
          name: 'Rum Old Fashioned',
          sub: 'Тёмный ром · биттер · сахар',
          diff: 'med',
          ingredients: [
            { name: 'Тёмный ром', qty: '60 мл' },
            { name: 'Сироп', qty: '10 мл' },
            { name: 'Angostura биттер', qty: '2 дэша' },
            { name: 'Апельсин (цедра)', qty: 'масло отжать' }
          ],
          method: 'Сироп + биттер + цедра. Ром. Крупный лёд. Мешать 20 секунд.'
        },
        {
          id: 'jungle_bird',
          name: 'Jungle Bird',
          sub: 'Ром · кампари · ананас',
          diff: 'med',
          ingredients: [
            { name: 'Тёмный ром', qty: '45 мл' },
            { name: 'Кампари', qty: '20 мл' },
            { name: 'Ананасовый сок', qty: '45 мл' },
            { name: 'Лимонный сок', qty: '15 мл' },
            { name: 'Сироп', qty: '10 мл' }
          ],
          method: 'Всё со льдом взболтать, процедить. Звучит странно — работает.'
        },
        {
          id: 'painkiller',
          name: 'Painkiller',
          sub: 'Ром · ананас · кокос · апельсин',
          diff: 'easy',
          ingredients: [
            { name: 'Тёмный ром', qty: '60 мл' },
            { name: 'Ананасовый сок', qty: '120 мл' },
            { name: 'Кокосовые сливки', qty: '30 мл' },
            { name: 'Апельсиновый сок', qty: '30 мл' }
          ],
          method: 'Взболтать со льдом. Тёртый мускатный орех сверху если есть.'
        },
      ]
    },
    {
      id: 'vodka',
      label: 'Водка',
      icon: 'ti-droplet',
      cocktails: [
        {
          id: 'moscow_mule',
          name: 'Moscow Mule',
          sub: 'Водка · имбирное пиво · лайм',
          diff: 'easy',
          ingredients: [
            { name: 'Водка', qty: '50 мл' },
            { name: 'Ginger beer', qty: '120 мл' },
            { name: 'Лаймовый сок', qty: '15 мл' }
          ],
          method: 'Всё в бокал со льдом. Один оборот. Лайм обязателен.'
        },
        {
          id: 'bloody_mary',
          name: 'Bloody Mary',
          sub: 'Водка · томат · специи',
          diff: 'med',
          ingredients: [
            { name: 'Водка', qty: '50 мл' },
            { name: 'Томатный сок', qty: '120 мл' },
            { name: 'Лимонный сок', qty: '15 мл' },
            { name: 'Вустерширский соус', qty: '2 дэша' },
            { name: 'Табаско', qty: '2 дэша' },
            { name: 'Соль, перец', qty: 'по вкусу' }
          ],
          method: 'Всё перемешать в бокале со льдом. Стебель сельдерея если есть. Утренний коктейль на рыбалке.'
        },
        {
          id: 'espresso_martini',
          name: 'Espresso Martini',
          sub: 'Водка · кофе · ликёр',
          diff: 'med',
          ingredients: [
            { name: 'Водка', qty: '50 мл' },
            { name: 'Кофейный ликёр (Kahlúa)', qty: '20 мл' },
            { name: 'Эспрессо холодный', qty: '30 мл' },
            { name: 'Сироп', qty: '10 мл' }
          ],
          method: 'Всё со льдом взболтать энергично — нужна пенка. Процедить. 3 кофейных зерна сверху.'
        },
        {
          id: 'vodka_tonic',
          name: 'Vodka Tonic',
          sub: 'Водка · тоник · лайм',
          diff: 'easy',
          ingredients: [
            { name: 'Водка', qty: '50 мл' },
            { name: 'Тоник', qty: '120 мл' },
            { name: 'Лайм', qty: 'долька' }
          ],
          method: 'Лёд, водка, тоник. Не мешать. Лайм.'
        },
        {
          id: 'sea_breeze',
          name: 'Sea Breeze',
          sub: 'Водка · клюква · грейпфрут',
          diff: 'easy',
          ingredients: [
            { name: 'Водка', qty: '45 мл' },
            { name: 'Клюквенный сок', qty: '90 мл' },
            { name: 'Грейпфрутовый сок', qty: '30 мл' }
          ],
          method: 'Всё в высокий бокал со льдом. Один оборот. Лайм сверху.'
        },
        {
          id: 'white_russian',
          name: 'White Russian',
          sub: 'Водка · кофейный ликёр · сливки',
          diff: 'easy',
          ingredients: [
            { name: 'Водка', qty: '50 мл' },
            { name: 'Кофейный ликёр', qty: '25 мл' },
            { name: 'Сливки 20%', qty: 'поверх' }
          ],
          method: 'Водка + ликёр в бокал со льдом. Сливки налить по ложке поверх — слоем. Не мешать.'
        },
      ]
    },
    {
      id: 'spritz',
      label: 'Шприцы',
      icon: 'ti-bubble',
      cocktails: [
        {
          id: 'hugo',
          name: 'Hugo Spritz',
          sub: 'Просекко · бузина · мята',
          diff: 'easy',
          ingredients: [
            { name: 'Просекко / брют', qty: '100 мл' },
            { name: 'Ликёр бузины (St-Germain)', qty: '30 мл' },
            { name: 'Содовая', qty: '30 мл' },
            { name: 'Мята', qty: '2–3 листа' },
            { name: 'Лайм', qty: 'долька' }
          ],
          method: 'Бокал наполнить льдом. Ликёр + просекко + содовая. Один оборот. Мята и лайм.'
        },
        {
          id: 'aperol_spritz',
          name: 'Aperol Spritz',
          sub: 'Просекко · апероль · содовая',
          diff: 'easy',
          ingredients: [
            { name: 'Просекко', qty: '90 мл' },
            { name: 'Апероль', qty: '60 мл' },
            { name: 'Содовая', qty: '30 мл' },
            { name: 'Апельсин', qty: 'долька' }
          ],
          method: 'Формула 3-2-1: просекко + апероль + содовая. Лёд, апельсин. Не мешать.'
        },
        {
          id: 'campari_spritz',
          name: 'Campari Spritz',
          sub: 'Просекко · кампари · апельсин',
          diff: 'easy',
          ingredients: [
            { name: 'Брют', qty: '90 мл' },
            { name: 'Кампари', qty: '30 мл' },
            { name: 'Содовая', qty: '30 мл' },
            { name: 'Апельсин', qty: 'долька' }
          ],
          method: 'Кампари + брют + содовая. Лёд, апельсин. Горше апероля — на любителя.'
        },
        {
          id: 'bellini',
          name: 'Bellini',
          sub: 'Просекко · персиковое пюре',
          diff: 'easy',
          ingredients: [
            { name: 'Просекко холодное', qty: '120 мл' },
            { name: 'Персиковое пюре / сок', qty: '40 мл' }
          ],
          method: 'Пюре на дно бокала. Долить просекко по стенке. Не мешать — само смешается.'
        },
        {
          id: 'rossini',
          name: 'Rossini',
          sub: 'Просекко · клубничное пюре',
          diff: 'easy',
          ingredients: [
            { name: 'Просекко холодное', qty: '120 мл' },
            { name: 'Клубничное пюре', qty: '40 мл' }
          ],
          method: 'Клубнику размять с щепоткой сахара. На дно бокала, долить просекко.'
        },
        {
          id: 'kir_royale',
          name: 'Kir Royale',
          sub: 'Брют · смородиновый ликёр',
          diff: 'easy',
          ingredients: [
            { name: 'Брют холодный', qty: '120 мл' },
            { name: 'Ликёр чёрной смородины', qty: '15 мл' }
          ],
          method: 'Ликёр на дно бокала. Долить брютом по стенке. Не мешать.'
        },
        {
          id: 'french_75',
          name: 'French 75',
          sub: 'Джин · лимон · брют',
          diff: 'med',
          ingredients: [
            { name: 'Джин', qty: '40 мл' },
            { name: 'Лимонный сок', qty: '20 мл' },
            { name: 'Сироп', qty: '15 мл' },
            { name: 'Брют', qty: '60 мл' }
          ],
          method: 'Взболтать джин + лимон + сироп со льдом. Процедить в бокал. Долить брютом.'
        },
      ]
    },
    {
      id: 'jager',
      label: 'Егерь',
      icon: 'ti-leaf',
      cocktails: [
        {
          id: 'jager_tonic',
          name: 'Jäger Tonic',
          sub: 'Егерь · тоник · апельсин',
          diff: 'easy',
          ingredients: [
            { name: 'Егерь', qty: '40 мл' },
            { name: 'Тоник', qty: '120 мл' },
            { name: 'Апельсин', qty: 'долька' }
          ],
          method: 'Как джин-тоник. Лёд, егерь, тоник, апельсин. Многие удивляются — работает.'
        },
        {
          id: 'jager_sour',
          name: 'Jäger Sour',
          sub: 'Егерь · лимон · сироп',
          diff: 'easy',
          ingredients: [
            { name: 'Егерь', qty: '45 мл' },
            { name: 'Лимонный сок', qty: '25 мл' },
            { name: 'Сироп', qty: '15 мл' }
          ],
          method: 'Взболтать со льдом, процедить. Травяная горечь хорошо работает с лимоном.'
        },
        {
          id: 'jager_old_fashioned',
          name: 'Jäger Old Fashioned',
          sub: 'Егерь · биттер · апельсин',
          diff: 'med',
          ingredients: [
            { name: 'Егерь', qty: '60 мл' },
            { name: 'Сироп', qty: '10 мл' },
            { name: 'Angostura', qty: '2 дэша' },
            { name: 'Апельсин (цедра)', qty: 'масло отжать' }
          ],
          method: 'Сироп + биттер + цедра. Егерь. Крупный лёд. Мешать 20 секунд.'
        },
        {
          id: 'jager_mule',
          name: 'Jäger Mule',
          sub: 'Егерь · имбирное пиво · лимон',
          diff: 'easy',
          ingredients: [
            { name: 'Егерь', qty: '45 мл' },
            { name: 'Ginger beer', qty: '120 мл' },
            { name: 'Лимонный сок', qty: '15 мл' }
          ],
          method: 'Лёд, егерь, ginger beer, лимон. Имбирь усиливает травяной вкус.'
        },
        {
          id: 'jager_tarkhun',
          name: 'Егерь + Тархун',
          sub: 'Егерь · тархун · лимон',
          diff: 'easy',
          ingredients: [
            { name: 'Егерь', qty: '40 мл' },
            { name: 'Тархун (газировка)', qty: '120 мл' },
            { name: 'Лимон', qty: 'долька' }
          ],
          method: 'Травы + анисовый тархун — дикое сочетание, но работает. Лимон обязателен.'
        },
      ]
    },
  ];

  const diffLabel = { easy: 'простой', med: 'средний', hard: 'сложный' };
  const diffClass = { easy: 'diff-easy', med: 'diff-med', hard: 'diff-hard' };

  function getCategories() { return categories; }

  function getCocktailById(id) {
    for (const cat of categories) {
      const c = cat.cocktails.find(c => c.id === id);
      if (c) return c;
    }
    return null;
  }

  function getDiffLabel(diff) { return diffLabel[diff] || diff; }
  function getDiffClass(diff) { return diffClass[diff] || ''; }

  return { getCategories, getCocktailById, getDiffLabel, getDiffClass };
})();
