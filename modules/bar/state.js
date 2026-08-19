'use strict';

const BarState = (() => {

  const KEY = 'ff_bar_reviews';
  let _reviews = {};

  // Загрузить из localStorage
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      _reviews = raw ? JSON.parse(raw) : {};
    } catch (_) {
      _reviews = {};
    }
  }

  // Сохранить в localStorage
  function _save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(_reviews));
    } catch (_) {}
  }

  // Установить данные из Firebase
  function setReviews(reviews) {
    _reviews = reviews;
    _save();
  }

  // Получить все данные по коктейлю
  function get(cocktailId) {
    return _reviews[cocktailId] || { ratings: {}, comments: [] };
  }

  // Посчитать среднюю оценку
  function getAvgRating(cocktailId) {
    const r = get(cocktailId).ratings || {};
    const vals = Object.values(r).filter(v => typeof v === 'number');
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  // Оценка конкретного пользователя
  function getUserRating(cocktailId, uid) {
    return (get(cocktailId).ratings || {})[uid] || 0;
  }

  // Комментарии
  function getComments(cocktailId) {
    return get(cocktailId).comments || [];
  }

  // Локально сохранить оценку (оптимистичное обновление)
  function setRating(cocktailId, uid, rating) {
    if (!_reviews[cocktailId]) _reviews[cocktailId] = { ratings: {}, comments: [] };
    if (!_reviews[cocktailId].ratings) _reviews[cocktailId].ratings = {};
    _reviews[cocktailId].ratings[uid] = rating;
    _save();
  }

  // Локально добавить комментарий (оптимистичное обновление)
  function pushComment(cocktailId, comment) {
    if (!_reviews[cocktailId]) _reviews[cocktailId] = { ratings: {}, comments: [] };
    if (!_reviews[cocktailId].comments) _reviews[cocktailId].comments = [];
    _reviews[cocktailId].comments.push(comment);
    _save();
  }

  return { load, setReviews, get, getAvgRating, getUserRating, getComments, setRating, pushComment };
})();
