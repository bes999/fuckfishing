'use strict';

const RecipesData = (() => {

  const categories = [
    {
      id: 'fish',
      label: 'Из рыбы',
      cocktails: [
        {
          id: 'fish_salted',
          pack: 'base',
          name: 'Малосольная рыба',
          sub: '8-12 ч без огня',
          time: '15 мин актив.',
          ingredients: [
            { name: 'Соль крупная', qty: '2 ст.л.', category: 'Соусы и специи' },
            { name: 'Сахар', qty: '1 ст.л.', category: 'Соусы и специи' },
            { name: 'Перец + укроп', qty: 'по вкусу', category: 'Овощи и фрукты' },
          ],
          method: 'Не мыть — обсушить. Натереть смесью, в пакет, под гнёт в тень/реку на 8-12 ч. Нарезать тонко поперёк волокна.',
          serveWith: 'Джин-тоник'
        },
        {
          id: 'fish_caviar',
          pack: 'base',
          name: 'Икра пятиминутка',
          sub: '5 мин',
          time: '5 мин',
          ingredients: [
            { name: 'Соль', qty: '1 ст.л. на стакан воды', category: 'Соусы и специи' },
            { name: 'Хлеб', qty: 'по вкусу', category: 'Крупы и паста' },
            { name: 'Масло сливочное', qty: 'по вкусу', category: 'Молочное и яйца' },
          ],
          method: 'Освободить от плёнок. Залить рассолом (1 ст.л. соли на стакан воды) на 5-7 мин. Слить, промыть. На хлеб с маслом.',
          serveWith: null
        },
        {
          id: 'fish_riet',
          pack: 'base',
          name: 'Риет из рыбы',
          sub: 'Лучший завтрак',
          time: '20 мин',
          ingredients: [
            { name: 'Сливочное масло', qty: '80-100 г', category: 'Молочное и яйца' },
            { name: 'Каперсы', qty: '1 ст.л.', category: 'Соусы и специи' },
            { name: 'Лимон, соль, перец', qty: 'по вкусу', category: 'Овощи и фрукты' },
          ],
          method: 'Горячую рыбу разобрать на волокна. Масло тает — мешать вилкой. Каперсы, лимон. Утрамбовать, в реку на 2+ ч.',
          serveWith: "Bee's Knees"
        },
        {
          id: 'fish_butterfly',
          pack: 'base',
          name: 'Рыба бабочкой на костре',
          sub: null,
          time: '35 мин',
          ingredients: [
            { name: 'Соль', qty: 'по вкусу', category: 'Соусы и специи' },
            { name: 'Чеснок', qty: '2-3 зубчика', category: 'Овощи и фрукты' },
          ],
          method: 'Выпотрошить, раскрыть бабочкой. Посолить, натереть чесноком. Зафиксировать прутьями. Над углями (не огнём) 25-30 мин.',
          serveWith: 'Негрони'
        },
        {
          id: 'fish_he',
          pack: 'base',
          name: 'Хе из рыбы',
          sub: 'Корейское, острое',
          time: '40 мин',
          ingredients: [
            { name: 'Уксус / лимон', qty: '3 ст.л.', category: 'Овощи и фрукты' },
            { name: 'Соевый соус', qty: '2 ст.л.', category: 'Соусы и специи' },
            { name: 'Чеснок, хлопья перца', qty: 'по вкусу', category: 'Овощи и фрукты' },
          ],
          method: 'Смешать, мариновать 30 мин — рыба побелеет.',
          serveWith: 'Jäger Tonic'
        },
        {
          id: 'fish_sugudai',
          pack: 'base',
          name: 'Сугудай',
          sub: 'Мягче хе',
          time: '20 мин',
          ingredients: [
            { name: 'Лук', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Уксус', qty: '2 ст.л.', category: 'Соусы и специи' },
            { name: 'Масло растительное', qty: '2 ст.л.', category: 'Соусы и специи' },
            { name: 'Соль, перец', qty: 'по вкусу', category: 'Соусы и специи' },
          ],
          method: 'Рыба кубиками + лук + соль + перец + уксус + масло. Перемешать, 15-20 мин.',
          serveWith: null
        },
        {
          id: 'fish_sashimi',
          pack: 'base',
          name: 'Сашими',
          sub: 'Только свежепойманная',
          time: '10 мин',
          ingredients: [
            { name: 'Соевый соус', qty: 'по вкусу', category: 'Соусы и специи' },
            { name: 'Васаби', qty: 'по вкусу', category: 'Соусы и специи' },
            { name: 'Имбирь маринованный', qty: 'по вкусу', category: 'Овощи и фрукты' },
          ],
          method: 'Поперёк волокна под 45°, ломти ~5 мм. Соевый + васаби + имбирь.',
          serveWith: 'French 75'
        },
        {
          id: 'fish_pelmeni',
          pack: 'base',
          name: 'Пельмени из рыбы на сочнях',
          sub: null,
          time: '45 мин',
          ingredients: [
            { name: 'Сочни/тесто', qty: '1 уп', category: 'Крупы и паста' },
            { name: 'Лук', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Соль, перец', qty: 'по вкусу', category: 'Соусы и специи' },
          ],
          method: 'Свежее филе порубить кусочками 3-5 мм (не фарш!). Лук, соль, перец. На сочень — начинку, залепить. Варить 7-8 мин после всплытия.',
          serveWith: null
        },
        {
          id: 'fish_fried_pan',
          pack: 'base',
          name: 'Рыба жареная на сковороде',
          sub: 'Простой ужин',
          time: '15 мин',
          ingredients: [
            { name: 'Мука', qty: '2 ст.л.', category: 'Соусы и специи' },
            { name: 'Масло растительное', qty: '3 ст.л.', category: 'Соусы и специи' },
            { name: 'Соль, перец', qty: 'по вкусу', category: 'Соусы и специи' },
            { name: 'Лимон', qty: 'по вкусу', category: 'Овощи и фрукты' },
          ],
          method: 'Филе посолить, поперчить, обвалять в муке. На раскалённой сковороде в масле 3-4 мин с каждой стороны до корочки. Лимон при подаче.',
          serveWith: null
        },
      ]
    },
    {
      id: 'delicacies',
      label: 'Деликатесы',
      cocktails: [
        {
          id: 'del_oysters',
          pack: 'coastal',
          name: 'Устрицы на костре с сыром',
          sub: null,
          time: '10 мин',
          ingredients: [
            { name: 'Сливочное масло', qty: '50 г', category: 'Молочное и яйца' },
            { name: 'Сыр тёртый', qty: '50 г', category: 'Молочное и яйца' },
            { name: 'Лимон', qty: '1 шт', category: 'Овощи и фрукты' },
          ],
          method: 'На решётку выпуклой стороной вниз. Когда откроются (~7 мин) — снять крышку. Масло + тёртый сыр. Ещё 2 мин. Лимон.',
          serveWith: 'French 75'
        },
        {
          id: 'del_scallop',
          pack: 'coastal',
          name: 'Гребешок на сковороде',
          sub: '2 минуты',
          time: '5 мин',
          ingredients: [
            { name: 'Сливочное масло', qty: '50 г', category: 'Молочное и яйца' },
            { name: 'Чеснок', qty: '2 зубчика', category: 'Овощи и фрукты' },
            { name: 'Соль, перец', qty: 'по вкусу', category: 'Соусы и специи' },
          ],
          method: 'Сковорода очень горячая. Масло. 1-1.5 мин с каждой стороны. Соль, перец, масло + чеснок. Внутри должен быть нежным!',
          serveWith: 'Белое сухое'
        },
        {
          id: 'del_crab',
          pack: 'coastal',
          name: 'Краб варёный',
          sub: null,
          time: '25 мин',
          ingredients: [
            { name: 'Соль', qty: 'для воды', category: 'Соусы и специи' },
            { name: 'Сливочное масло', qty: '50 г', category: 'Молочное и яйца' },
          ],
          method: 'Кипящая солёная вода. Варить 15-20 мин. Разломить, обмакнуть в растопленное масло.',
          serveWith: 'Белое сухое или Spritz'
        },
        {
          id: 'del_urchin',
          pack: 'coastal',
          name: 'Морской ёж',
          sub: 'Деликатес прямо из воды',
          time: '5 мин',
          ingredients: [
            { name: 'Соевый соус', qty: 'по желанию', category: 'Соусы и специи' },
          ],
          method: 'Разрезать ножницами по экватору. Достать оранжевые языки. Съесть так или с соевым.',
          serveWith: 'Брют — обязательно'
        },
        {
          id: 'del_mussels',
          pack: 'coastal',
          name: 'Мидии на костре',
          sub: 'Открываются сами',
          time: '10 мин',
          ingredients: [
            { name: 'Лимон', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Соевый соус', qty: 'по вкусу', category: 'Соусы и специи' },
          ],
          method: 'На решётку над углями. Когда раковины откроются — готово. Не открылись — выбросить. Лимон + соевый.',
          serveWith: null
        },
      ]
    },
    {
      id: 'breakfast',
      label: 'Завтраки',
      cocktails: [
        {
          id: 'br_eggs_poached',
          pack: 'base',
          name: 'Яйца пашот',
          sub: 'Основа главного блюда',
          time: '10 мин',
          ingredients: [
            { name: 'Яйца', qty: '4 шт', category: 'Молочное и яйца' },
            { name: 'Уксус', qty: '2 ст.л. на литр воды', category: 'Соусы и специи' },
          ],
          method: 'Воду почти до кипения + уксус (2 ст.л./л). Яйцо разбить в кружку, плавно опустить. Огонь минимальный. 3-3.5 мин. На хлеб: гравлакс → пашот → голландский → икра → перец.',
          serveWith: null
        },
        {
          id: 'br_hollandaise',
          pack: 'base',
          name: 'Голландский соус',
          sub: 'Слабый огонь!',
          time: '15 мин',
          ingredients: [
            { name: 'Сливочное масло', qty: '150 г', category: 'Молочное и яйца' },
            { name: 'Желтки', qty: '4 шт', category: 'Молочное и яйца' },
            { name: 'Лимонный сок', qty: '2 ст.л.', category: 'Овощи и фрукты' }
          ],
          method: 'Масло растопить, не кипятить. Желтки + лимон взбить. Кружку над паром. Тонкой струйкой масло — постоянно мешать.',
          serveWith: null
        },
        {
          id: 'br_shakshuka',
          pack: 'base',
          name: 'Шакшука',
          sub: null,
          time: '20 мин',
          ingredients: [
            { name: 'Яйца', qty: '4 шт', category: 'Молочное и яйца' },
            { name: 'Лук', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Чеснок', qty: '2 зубчика', category: 'Овощи и фрукты' },
            { name: 'Томатная паста', qty: '3 ст.л.', category: 'Крупы и паста' },
            { name: 'Паприка, тмин', qty: 'по вкусу', category: 'Соусы и специи' },
          ],
          method: 'Лук + чеснок обжарить. Томатная паста + вода + паприка + тмин, 5 мин. Углубления → вбить яйца. Накрыть, 4-5 мин.',
          serveWith: null
        },
        {
          id: 'br_omelette',
          pack: 'base',
          name: 'Омлет с бужениной',
          sub: null,
          time: '15 мин',
          ingredients: [
            { name: 'Яйца', qty: '3 шт', category: 'Молочное и яйца' },
            { name: 'Буженина', qty: '80 г', category: 'Мясо и консервы' },
            { name: 'Сыр', qty: '40 г', category: 'Молочное и яйца' },
            { name: 'Соль, перец', qty: 'по вкусу', category: 'Соусы и специи' }
          ],
          method: 'Буженину обжарить. Яйца взбить, вылить на сковороду. Сыр + буженина. Сложить пополам. Огонь средний.',
          serveWith: null
        },
        {
          id: 'br_porridge',
          pack: 'base',
          name: 'Каша быстрая',
          sub: 'Стартовый завтрак',
          time: '5 мин',
          ingredients: [
            { name: 'Овсянка быстрая', qty: '100 г', category: 'Крупы и паста' },
            { name: 'Масло сливочное', qty: '20 г', category: 'Молочное и яйца' },
            { name: 'Мёд', qty: '1 ст.л.', category: 'Соусы и специи' },
            { name: 'Орехи, сухофрукты', qty: 'по вкусу', category: 'Перекусы и сладкое' },
          ],
          method: 'Овсянка + кипяток + соль + масло + мёд. Накрыть на 3 мин. Орехи + сухофрукты.',
          serveWith: null
        },
        {
          id: 'br_tvorog_banana',
          pack: 'personal',
          name: 'Творог с бананом и протеином',
          sub: 'Классика без готовки',
          time: '3 мин',
          ingredients: [
            { name: 'Творог', qty: '200 г', category: 'Молочное и яйца' },
            { name: 'Банан', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Протеин порошок', qty: '1 мерная ложка', category: null },
          ],
          method: 'Смешать творог с протеином. Банан порезать или размять сверху.',
          serveWith: null
        },
        {
          id: 'br_granola',
          pack: 'base',
          name: 'Гранола',
          sub: 'Быстрый завтрак',
          time: '2 мин',
          ingredients: [
            { name: 'Гранола', qty: '80 г', category: 'Перекусы и сладкое' },
            { name: 'Молоко / йогурт', qty: '150 мл', category: 'Напитки' },
          ],
          method: 'Залить гранолу молоком или йогуртом. Дать постоять пару минут по вкусу.',
          serveWith: null
        },
      ]
    },
    {
      id: 'soups',
      label: 'Супы',
      cocktails: [
        {
          id: 'soup_ukha',
          pack: 'base',
          name: 'Уха рыбацкая',
          sub: 'С традицией',
          time: '40 мин',
          ingredients: [
            { name: 'Картофель', qty: '3 шт', category: 'Овощи и фрукты' },
            { name: 'Лавровый лист', qty: '2-3 шт', category: 'Соусы и специи' },
            { name: 'Водка', qty: '50 мл', category: 'Бар' },
          ],
          method: 'Головы+хвосты варить 20 мин. Процедить. Картошка + куски филе + лавровый лист — 7-10 мин. Традиция: 50 мл водки и горящая веточка в котелок.',
          serveWith: null
        },
        {
          id: 'soup_ramen',
          pack: 'base',
          name: 'Походный рамен',
          sub: 'Из того что есть',
          time: '20 мин',
          ingredients: [
            { name: 'Лапша быстрого приготовления', qty: '2 пачки', category: 'Крупы и паста' },
            { name: 'Яйца варёные', qty: '2 шт', category: 'Молочное и яйца' },
            { name: 'Соевый соус', qty: '2 ст.л.', category: 'Соусы и специи' },
            { name: 'Чеснок, имбирь', qty: 'по вкусу', category: 'Овощи и фрукты' }
          ],
          method: 'Бульон сварить с чесноком и имбирём. Лапша по инструкции. Яйцо пополам, соевый, зелень.',
          serveWith: null
        },
        {
          id: 'soup_borsch',
          pack: 'base',
          name: 'Борщ полевой',
          sub: 'Если есть свёкла',
          time: '50 мин',
          ingredients: [
            { name: 'Свёкла', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Капуста', qty: '200 г', category: 'Овощи и фрукты' },
            { name: 'Картошка', qty: '2 шт', category: 'Овощи и фрукты' },
            { name: 'Тушёнка', qty: '1 банка', category: 'Мясо и консервы' }
          ],
          method: 'Свёклу натереть, обжарить с маслом. Картошка + капуста в кипяток 15 мин. Тушёнка + свёкла. Ещё 5 мин. Уксус.',
          serveWith: null
        },
        {
          id: 'soup_collagen',
          pack: 'personal',
          name: 'Бульон коллагеновый',
          sub: 'На перекус/обед в лодке',
          time: '3 мин',
          ingredients: [
            { name: 'Бульон коллагеновый (готовый)', qty: '1 пакет', category: 'Напитки' },
          ],
          method: 'Залить кипятком по инструкции на упаковке. Дать раствориться, размешать.',
          serveWith: null
        },
      ]
    },
    {
      id: 'main',
      label: 'Горячее',
      cocktails: [
        {
          id: 'main_carbonara',
          pack: 'base',
          name: 'Карбонара с бужениной',
          sub: 'Вместо гуанчиале — буженина',
          time: '25 мин',
          ingredients: [
            { name: 'Спагетти', qty: '300 г', category: 'Крупы и паста' },
            { name: 'Желтки', qty: '4 шт', category: 'Молочное и яйца' },
            { name: 'Пармезан', qty: '80 г', category: 'Молочное и яйца' },
            { name: 'Буженина кубиками', qty: '150 г', category: 'Мясо и консервы' },
            { name: 'Чёрный перец (много!)', qty: 'по вкусу', category: 'Соусы и специи' }
          ],
          method: 'Сварить пасту. Обжарить буженину. Желтки + сыр + перец смешать. Горячую пасту снять с огня, влить смесь, быстро перемешать. НЕ ставить на огонь!',
          serveWith: null
        },
        {
          id: 'main_fettuccine',
          pack: 'base',
          name: 'Феттучини с рыбой',
          sub: null,
          time: '25 мин',
          ingredients: [
            { name: 'Паста', qty: '300 г', category: 'Крупы и паста' },
            { name: 'Сливки', qty: '150 мл', category: 'Молочное и яйца' },
            { name: 'Чеснок, лимон, укроп', qty: 'по вкусу', category: 'Овощи и фрукты' },
          ],
          method: 'Рыбу обжарить 2-3 мин. Сливки + чеснок, тушить 3-4 мин. Смешать с пастой.',
          serveWith: 'Wine Spritzer'
        },
        {
          id: 'main_grill',
          pack: 'base',
          name: 'Рыбные стейки на решётке',
          sub: 'Классика костра',
          time: '20 мин',
          ingredients: [
            { name: 'Соль, перец', qty: 'по вкусу', category: 'Соусы и специи' },
            { name: 'Лимон', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Масло сливочное', qty: '50 г', category: 'Молочное и яйца' },
          ],
          method: 'Стейки посолить, дать 10 мин. Решётку раскалить над углями. 4-5 мин с каждой стороны. Масло + лимон при подаче.',
          serveWith: 'Белое сухое'
        },
        {
          id: 'main_stew',
          pack: 'base',
          name: 'Мясное рагу',
          sub: 'Сытный ужин в одном котелке',
          time: '40 мин',
          ingredients: [
            { name: 'Мясо (тушёнка или свежее)', qty: '400 г', category: 'Мясо и консервы' },
            { name: 'Картофель', qty: '3 шт', category: 'Овощи и фрукты' },
            { name: 'Морковь', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Лук', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Томатная паста', qty: '2 ст.л.', category: 'Крупы и паста' },
          ],
          method: 'Лук с морковью обжарить. Картофель кубиками, залить водой почти вровень. Томатная паста, мясо. Тушить 25-30 мин до готовности картофеля.',
          serveWith: null
        },
      ]
    },
    {
      id: 'sides',
      label: 'Гарниры',
      cocktails: [
        {
          id: 'side_buckwheat',
          pack: 'base',
          name: 'Гречка с луком',
          sub: 'Базовый гарнир',
          time: '20 мин',
          ingredients: [
            { name: 'Гречка', qty: '200 г', category: 'Крупы и паста' },
            { name: 'Лук', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Масло', qty: '30 г', category: null }
          ],
          method: 'Лук обжарить до золота. Гречку промыть, варить 15 мин. Смешать с луком и маслом.',
          serveWith: null
        },
        {
          id: 'side_pasta',
          pack: 'base',
          name: 'Паста простая',
          sub: 'Масло + сыр + перец',
          time: '15 мин',
          ingredients: [
            { name: 'Паста', qty: '300 г', category: 'Крупы и паста' },
            { name: 'Сливочное масло', qty: '30 г', category: 'Молочное и яйца' },
            { name: 'Сыр тёртый', qty: '50 г', category: 'Молочное и яйца' },
            { name: 'Чёрный перец', qty: 'по вкусу', category: 'Соусы и специи' },
          ],
          method: 'Варить по инструкции. Слить, оставить стакан воды. Масло + тёртый сыр + перец + вода. Перемешать быстро.',
          serveWith: null
        },
        {
          id: 'side_potato',
          pack: 'base',
          name: 'Картошка в углях',
          sub: 'Лучший гарнир у костра',
          time: '45 мин',
          ingredients: [
            { name: 'Картофель', qty: '6-8 шт', category: 'Овощи и фрукты' },
            { name: 'Соль', qty: 'по вкусу', category: 'Соусы и специи' },
            { name: 'Фольга', qty: '1 рулон', category: null },
            { name: 'Сливочное масло', qty: '30 г', category: 'Молочное и яйца' },
          ],
          method: 'Каждую картошку посолить, завернуть в фольгу. Закопать в угли на 30-40 мин. Масло + соль при подаче.',
          serveWith: null
        },
        {
          id: 'side_rice',
          pack: 'base',
          name: 'Рис быстрый',
          sub: null,
          time: '15 мин',
          ingredients: [
            { name: 'Рис быстрого приготовления', qty: '1 пакет', category: 'Крупы и паста' },
            { name: 'Масло сливочное', qty: '20 г', category: 'Молочное и яйца' },
            { name: 'Соль', qty: 'по вкусу', category: 'Соусы и специи' },
          ],
          method: 'Пакетик в кипяток 12-15 мин. Масло, соль.',
          serveWith: null
        },
        {
          id: 'side_mash',
          pack: 'base',
          name: 'Картофельное пюре',
          sub: null,
          time: '25 мин',
          ingredients: [
            { name: 'Картофель', qty: '4 шт', category: 'Овощи и фрукты' },
            { name: 'Молоко', qty: '100 мл', category: 'Напитки' },
            { name: 'Масло сливочное', qty: '30 г', category: 'Молочное и яйца' },
          ],
          method: 'Картофель отварить до мягкости, слить воду. Размять с тёплым молоком и маслом.',
          serveWith: null
        },
      ]
    },
    {
      id: 'snacks',
      label: 'Закуски',
      cocktails: [
        {
          id: 'snack_rich_syrup',
          pack: 'base',
          name: 'Рич сироп (2:1)',
          sub: 'Основа коктейлей',
          time: '5 мин',
          ingredients: [
            { name: 'Сахар', qty: '200 г', category: 'Соусы и специи' },
            { name: 'Вода', qty: '100 мл', category: 'Напитки' },
          ],
          method: '2 части сахара + 1 часть горячей воды. Мешать до растворения. Остудить. Хранится несколько дней.',
          serveWith: null
        },
        {
          id: 'snack_bread',
          pack: 'base',
          name: 'Бутерброды с малосольной',
          sub: 'Быстрый перекус',
          time: '5 мин',
          ingredients: [
            { name: 'Хлеб', qty: '6 ломтиков', category: 'Крупы и паста' },
            { name: 'Масло сливочное', qty: '50 г', category: 'Молочное и яйца' },
            { name: 'Укроп', qty: 'по вкусу', category: 'Овощи и фрукты' },
          ],
          method: 'Хлеб + масло + малосольная рыба + укроп. Икра сверху если есть.',
          serveWith: null
        },
        {
          id: 'snack_gravlax_toast',
          pack: 'base',
          name: 'Тост с риетом',
          sub: null,
          time: '5 мин',
          ingredients: [
            { name: 'Хлеб', qty: '4 ломтика', category: 'Крупы и паста' },
            { name: 'Каперсы', qty: '1 ст.л.', category: 'Соусы и специи' },
            { name: 'Лимон', qty: 'по вкусу', category: 'Овощи и фрукты' },
          ],
          method: 'Хлеб подсушить на сковороде. Риет из рыбы + каперсы + лимон.',
          serveWith: null
        },
      ]
    },
    {
      id: 'desserts',
      label: 'Десерты',
      cocktails: [
        {
          id: 'des_smores',
          pack: 'base',
          name: 'Зефир на костре',
          sub: 'S\'mores по-русски',
          time: '5 мин',
          ingredients: [
            { name: 'Зефир', qty: '1 пачка', category: 'Перекусы и сладкое' },
            { name: 'Печенье', qty: '1 пачка', category: 'Перекусы и сладкое' },
            { name: 'Шоколад', qty: '1 плитка', category: 'Перекусы и сладкое' },
          ],
          method: 'Зефир на прутик. Над углями до золотистой корочки. Между печеньями с шоколадкой.',
          serveWith: null
        },
        {
          id: 'des_banana',
          pack: 'base',
          name: 'Банан в фольге',
          sub: 'С шоколадом',
          time: '15 мин',
          ingredients: [
            { name: 'Банан', qty: '4 шт', category: 'Овощи и фрукты' },
            { name: 'Шоколад', qty: '1 плитка', category: 'Перекусы и сладкое' },
          ],
          method: 'Банан надрезать, вложить кусочки шоколада. Завернуть в фольгу. В угли на 10 мин. Есть ложкой.',
          serveWith: null
        },
        {
          id: 'des_condensed',
          pack: 'base',
          name: 'Сгущёнка с хлебом',
          sub: 'Классика',
          time: '1 мин',
          ingredients: [
            { name: 'Сгущённое молоко', qty: '1 банка', category: 'Молочное и яйца' },
            { name: 'Хлеб', qty: 'по вкусу', category: 'Крупы и паста' },
          ],
          method: 'Открыть банку. Намазать на хлеб. Съесть.',
          serveWith: null
        },
      ]
    },
    {
      id: 'drinks',
      label: 'Напитки',
      cocktails: [
        {
          id: 'dr_drip',
          pack: 'base',
          name: 'Дрип кофе',
          sub: 'Утренний ритуал',
          time: '10 мин',
          ingredients: [
            { name: 'Кофе молотый', qty: '15 г', category: 'Напитки' },
          ],
          method: 'Фильтр промыть кипятком. Кофе засыпать. Залить 50 мл — дать 30 сек цвести. Долить остаток тонкой струйкой за 2-3 мин.',
          serveWith: null
        },
        {
          id: 'dr_bumble',
          pack: 'base',
          name: 'Бамбл би',
          sub: 'Если есть лёд',
          time: '5 мин',
          ingredients: [
            { name: 'Дрип крепкий', qty: '150 мл', category: null },
            { name: 'Мёд', qty: '1 ст.л.', category: 'Соусы и специи' },
            { name: 'Лимонный сок', qty: '30 мл', category: 'Овощи и фрукты' },
            { name: 'Лёд', qty: 'полный стакан', category: null }
          ],
          method: 'Мёд растворить в горячем кофе. Стакан со льдом. Лимонный сок слоем, затем кофе с мёдом.',
          serveWith: null
        },
        {
          id: 'dr_raf',
          pack: 'base',
          name: 'Раф с халвой',
          sub: 'Если холодно',
          time: '5 мин',
          ingredients: [
            { name: 'Дрип крепкий', qty: '100 мл', category: null },
            { name: 'Сливки / сгуха', qty: '80 мл', category: 'Молочное и яйца' },
            { name: 'Халва', qty: '1-2 ст.л.', category: 'Перекусы и сладкое' }
          ],
          method: 'Растворить халву в горячем кофе. Добавить сливки. Взболтать.',
          serveWith: null
        },
        {
          id: 'dr_tea',
          pack: 'base',
          name: 'Чай из трав',
          sub: 'С берега реки',
          time: '5 мин',
          ingredients: [
            { name: 'Мёд', qty: 'по вкусу', category: 'Соусы и специи' },
          ],
          method: 'Мята + листья смородины (с берега). Кипяток. Настоять 5 мин. Мёд по вкусу.',
          serveWith: null
        },
        {
          id: 'dr_lemonade',
          pack: 'base',
          name: 'Лимонад походный',
          sub: null,
          time: '5 мин',
          ingredients: [
            { name: 'Лимон', qty: '1 шт', category: 'Овощи и фрукты' },
            { name: 'Мёд / сахар', qty: '2 ст.л.', category: 'Соусы и специи' },
            { name: 'Вода холодная', qty: '500 мл', category: 'Напитки' },
            { name: 'Мята', qty: 'по вкусу', category: 'Овощи и фрукты' }
          ],
          method: 'Лимон выжать. Мёд растворить. Мяту помять. Всё смешать, из реки охладить.',
          serveWith: null
        },
        {
          id: 'dr_negroni_coffee',
          pack: 'base',
          name: 'Кофейный негрони',
          sub: 'Кампари через дрип',
          time: '15 мин',
          ingredients: [
            { name: 'Кампари нагреть до ~70°', qty: 'через дрип', category: 'Бар' },
            { name: 'Джин', qty: '30 мл', category: 'Бар' },
            { name: 'Вермут красный', qty: '30 мл', category: 'Бар' }
          ],
          method: 'Нагреть Кампари, не кипятить. Пролить через дрип медленно. Смешать с джином и вермутом.',
          serveWith: null
        },
      ]
    },
  ];

  function getCategories() { return categories; }

  function getRecipeById(id) {
    for (const cat of categories) {
      const r = cat.cocktails.find(r => r.id === id);
      if (r) return r;
    }
    return null;
  }

  return { getCategories, getRecipeById };
})();
