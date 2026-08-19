'use strict';

const RecipesState = (() => {

  const KEY = 'ff_recipes_reviews';
  let _reviews = {};

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      _reviews = raw ? JSON.parse(raw) : {};
    } catch (_) { _reviews = {}; }
  }

  function _save() {
    try { localStorage.setItem(KEY, JSON.stringify(_reviews)); } catch (_) {}
  }

  function setReviews(reviews) { _reviews = reviews; _save(); }

  function get(id) { return _reviews[id] || { ratings: {}, comments: [] }; }

  function getAvgRating(id) {
    const vals = Object.values(get(id).ratings || {}).filter(v => typeof v === 'number');
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  function getUserRating(id, uid) { return (get(id).ratings || {})[uid] || 0; }

  function getComments(id) { return get(id).comments || []; }

  function setRating(id, uid, rating) {
    if (!_reviews[id]) _reviews[id] = { ratings: {}, comments: [] };
    if (!_reviews[id].ratings) _reviews[id].ratings = {};
    _reviews[id].ratings[uid] = rating;
    _save();
  }

  function pushComment(id, comment) {
    if (!_reviews[id]) _reviews[id] = { ratings: {}, comments: [] };
    if (!_reviews[id].comments) _reviews[id].comments = [];
    _reviews[id].comments.push(comment);
    _save();
  }

  return { load, setReviews, get, getAvgRating, getUserRating, getComments, setRating, pushComment };
})();
