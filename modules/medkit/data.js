/* ===== MEDKIT DATA ===== */

// Стандартные категории ниже помечены personalOptional: true — раньше в
// "Личной" аптечке они были обязательными (isGroupEnabled без этого флага
// всегда включает группу) и показывались ВСЕМ участникам как чек-лист по
// конкретным препаратам одного человека (изначально куратора приложения),
// хотя реально у каждого свой набор лекарств. В "Общей" аптечке (флаг
// commonOptional не трогаем) они остаются обязательными как были — это
// действительно общий сбор группы. В личной — теперь опционально, как уже
// давно устроены "Ампулы"/"БАДы", включаются по кнопке 👁 самим человеком.
var MEDKIT_BASE = [
  {
    id: 'painkillers',
    label: 'Обезбол',
    icon: '💊',
    availableIn: ['common', 'personal'],
    personalOptional: true,
    items: [
      { id: 'pain_ibuprofen',  name: 'Ибупрофен / Нурофен' },
      { id: 'pain_ketanov',    name: 'Кетанов' },
      { id: 'pain_nimesulide', name: 'Нимесулид' },
      { id: 'wound_voltaren',  name: 'Вольтарен гель' }
    ]
  },
  {
    id: 'cold',
    label: 'Простуда / температура',
    icon: '🤧',
    availableIn: ['common', 'personal'],
    personalOptional: true,
    items: [
      { id: 'cold_paracetamol', name: 'Парацетамол' },
      { id: 'cold_aciclovir',   name: 'Ацикловир' },
      { id: 'cold_nazivin',     name: 'Називин / Нафтизин' },
      { id: 'cold_strepsils',   name: 'Стрепсилс / Лизобакт' }
    ]
  },
  {
    id: 'gi',
    label: 'ЖКТ',
    icon: '🫃',
    availableIn: ['common', 'personal'],
    personalOptional: true,
    items: [
      { id: 'gi_smecta',      name: 'Смекта' },
      { id: 'gi_loperamide',  name: 'Лоперамид' },
      { id: 'gi_maalox',      name: 'Маалокс' },
      { id: 'gi_pancreatin',  name: 'Панкреатин' }
    ]
  },
  {
    id: 'allergy',
    label: 'Аллергия',
    icon: '🌿',
    availableIn: ['common', 'personal'],
    personalOptional: true,
    items: [
      { id: 'allergy_suprastin', name: 'Супрастин' }
    ]
  },
  {
    id: 'wounds',
    label: 'Раны / перевязка',
    icon: '🩹',
    availableIn: ['common', 'personal'],
    personalOptional: true,
    items: [
      { id: 'wound_peroxide',   name: 'Перекись водорода' },
      { id: 'wound_iodine',     name: 'Йод / зелёнка' },
      { id: 'wound_bandage',    name: 'Бинт стерильный' },
      { id: 'wound_plaster',    name: 'Пластырь' }
    ]
  },
  {
    id: 'eyes',
    label: 'Глаза / нос',
    icon: '👁',
    availableIn: ['common', 'personal'],
    personalOptional: true,
    items: [
      { id: 'eye_albucid',   name: 'Альбуцид' },
      { id: 'eye_vizin',     name: 'Визин' }
    ]
  },
  {
    id: 'sleep',
    label: 'Сон',
    icon: '😴',
    availableIn: ['common', 'personal'],
    personalOptional: true,
    items: [
      { id: 'sleep_melaxen', name: 'Мелаксен' },
      { id: 'sleep_velson',  name: 'Вэлсон' }
    ]
  },
  {
    id: 'injections',
    label: 'Ампулы / уколы',
    icon: '💉',
    availableIn: ['common', 'personal'],
    personalOptional: true,
    commonOptional: true,
    items: [
      { id: 'inj_dexamethasone', name: 'Дексаметазон (ампулы)' },
      { id: 'inj_ketorol',       name: 'Кеторол / кеторолак (ампулы)' },
      { id: 'inj_suprastin',     name: 'Супрастин (ампулы)' },
      { id: 'inj_cerucal',       name: 'Церукал (ампулы)' }
    ]
  },
  {
    id: 'supplements',
    label: 'БАДы / витамины',
    icon: '🌿',
    availableIn: ['personal'],
    personalOptional: true,
    items: [
      { id: 'supp_vitc',        name: 'Витамин С' },
      { id: 'supp_magnesium',   name: 'Магний' },
      { id: 'supp_electrolytes', name: 'Электролиты / регидрон' }
    ]
  }
];

// Пользовательская категория поверх базового каталога — тот же паттерн,
// что addCustomSlot в slots.js: живёт только в памяти (сбрасывается при
// перезагрузке), без нового поля в Firestore. Предметы внутри неё добавляются
// уже существующим addMedkitCustomItem (groupId ничем не валидируется).
function addCustomGroup(label) {
  if (!label || !label.trim()) return null;
  var group = {
    id: 'custom_group_' + Date.now(),
    label: label.trim(),
    icon: '📦',
    availableIn: ['common', 'personal'],
    items: [],
    custom: true
  };
  MEDKIT_BASE.push(group);
  return group;
}