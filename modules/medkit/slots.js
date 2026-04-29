/* ===== MEDKIT SLOTS ===== */

var MEDKIT_SLOTS = {

  common: [
    { id: 'red_bag',  label: 'Красная аптечка',  icon: '🔴' },
    { id: 'car_kit',  label: 'Аптечка в машине', icon: '🚗' },
    { id: 'camp',     label: 'Лагерь / тент',     icon: '⛺' }
  ],

  personal: [
    { id: 'personal_bag', label: 'Личный несессер', icon: '🎒' },
    { id: 'backpack',     label: 'Рюкзак',           icon: '🏕️' },
    { id: 'dry_bag',      label: 'Гермосумка',        icon: '💧' },
    { id: 'jacket',       label: 'Карман куртки',     icon: '🧥' }
  ]

};

function getSlotsFor(mode) {
  return MEDKIT_SLOTS[mode] || [];
}

function getSlotById(mode, slotId) {
  var slots = getSlotsFor(mode);
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].id === slotId) return slots[i];
  }
  return null;
}

function validateSlot(mode, slotId) {
  return !!getSlotById(mode, slotId);
}

function addCustomSlot(mode, label) {
  if (!label || !label.trim()) return null;
  var id = 'custom_' + Date.now();
  var slot = { id: id, label: label.trim(), icon: '📦', custom: true };
  MEDKIT_SLOTS[mode].push(slot);
  return slot;
}

function deleteCustomSlot(mode, slotId) {
  MEDKIT_SLOTS[mode] = MEDKIT_SLOTS[mode].filter(function(s) {
    return s.id !== slotId;
  });
}