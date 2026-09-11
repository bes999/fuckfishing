'use strict';

const RecipesIndex = (() => {

  let _el = null;
  let _initialized = false;

  function show(el) {
    _el = el;
    if (!_initialized) {
      RecipesState.load();
      _initialized = true;
    }
    RecipesRender.render(_el);
    RecipesFirebase.subscribe(() => RecipesRender.refresh());
    // Каталог/свои рецепты подписаны глобально в index.html (Меню читает
    // их синхронно независимо от того, был ли открыт этот экран) — здесь
    // только рейтинги/комментарии, привязанные к жизни именно этого экрана.
  }

  function close() {
    RecipesFirebase.unsubscribe();
    if (typeof onNavigate === 'function') onNavigate('home');
  }

  return { show, close };
})();
