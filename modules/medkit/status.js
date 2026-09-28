/* ===== MEDKIT STATUS ===== */

function getMedkitItemStatus(itemState) {
  var status = { expiry: null, stock: null };

  // --- Срок годности ---
  if (itemState.expiry) {
    var now = new Date();
    var parts = itemState.expiry.split('.');
var exp = parts.length === 3
  ? new Date(2000 + parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
  : new Date(itemState.expiry + '-01');
    var monthsLeft =
      (exp.getFullYear() - now.getFullYear()) * 12 +
      (exp.getMonth() - now.getMonth());

    if (monthsLeft < 0)       status.expiry = 'expired';
    else if (monthsLeft <= 1) status.expiry = 'critical';
    else if (monthsLeft <= 3) status.expiry = 'warning';
  }

  // --- Остаток ---
  // parseFloat('1,5') === 1 (останавливается на запятой, не понимает её как
  // десятичный разделитель) — при остатке "1,5" и дозе "0,5" оба поля
  // допускали такой ввод, а left/dose тихо превращались в 1/0, dose>0
  // проваливался, и проверка остатка просто выключалась без предупреждения.
  // Реальный баг, найден внешним ревью 2026-09-27.
  if (itemState.left && itemState.dose) {
    var left = parseFloat(String(itemState.left).replace(',', '.'));
    var dose = parseFloat(String(itemState.dose).replace(',', '.'));
    if (!isNaN(left) && !isNaN(dose) && dose > 0) {
      var servings = left / dose;
      if (servings <= 0)      status.stock = 'empty';
      else if (servings <= 2) status.stock = 'critical';
      else if (servings <= 5) status.stock = 'warning';
    }
  }

  return status;
}

function getMedkitItemColor(status) {
  var levels = {
    expired:  4,
    empty:    4,
    critical: 3,
    warning:  2,
    null:     0
  };
  var worst = Math.max(
    levels[status.expiry] || 0,
    levels[status.stock]  || 0
  );
  if (worst >= 4) return 'danger';
  if (worst >= 3) return 'warn';
  if (worst >= 2) return 'yellow';
  return null;
}

function getMedkitStatusLabel(status) {
  if (status.stock === 'empty')    return 'кончился';
  if (status.stock === 'critical') return 'мало';
  if (status.expiry === 'expired') return 'истёк';
  if (status.expiry === 'critical') return 'истекает';
  if (status.stock === 'warning')  return 'мало';
  if (status.expiry === 'warning') return 'скоро истёк';
  return null;
}

function getMedkitStatusLegend(status) {
  var lines = [];

  if (status.expiry === 'expired')  lines.push({ color: 'danger', text: 'Срок годности истёк' });
  if (status.expiry === 'critical') lines.push({ color: 'warn',   text: 'Истекает меньше чем через месяц' });
  if (status.expiry === 'warning')  lines.push({ color: 'yellow', text: 'Истекает меньше чем через 3 месяца' });
  if (status.stock === 'empty')     lines.push({ color: 'danger', text: 'Закончился' });
  if (status.stock === 'critical')  lines.push({ color: 'warn',   text: 'Осталось меньше 2 приёмов' });
  if (status.stock === 'warning')   lines.push({ color: 'yellow', text: 'Осталось меньше 5 приёмов' });

  return lines;
}