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
    RecipesFirebase.subscribeCustom(() => RecipesRender.refresh());
  }

  function close() {
    RecipesFirebase.unsubscribe();
    RecipesFirebase.unsubscribeCustom();
    if (typeof onNavigate === 'function') onNavigate('home');
  }

  return { show, close };
})();
