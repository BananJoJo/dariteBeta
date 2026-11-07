(() => {
  'use strict';
  const giftNames = Object.freeze({
    bouquet: 'Букет в нежных оттенках',
    basket: 'Корзина сладких радостей',
    strawberry: 'Клубника в шоколаде',
    rose: 'Роза для особенного человека'
  });

  function giftWord(number) {
    const lastHundred = number % 100;
    if (lastHundred >= 11 && lastHundred <= 14) return 'подарков';
    const lastDigit = number % 10;
    if (lastDigit === 1) return 'подарок';
    return lastDigit >= 2 && lastDigit <= 4 ? 'подарка' : 'подарков';
  }

  if (document.body.classList.contains('gift-page')) {
    const requested = new URLSearchParams(location.search).get('item') || 'basket';
    const valid = Object.hasOwn(giftNames, requested);
    document.querySelectorAll('[data-gift]').forEach(item => {
      item.hidden = !valid || item.dataset.gift !== requested;
    });
    const heading = document.getElementById('gift-page-title');
    if (valid) {
      document.body.classList.add('is-detail');
      heading.textContent = giftNames[requested];
      document.title = `${giftNames[requested]} — Дарите красиво`;
    } else {
      heading.textContent = 'Подарок не найден';
      document.getElementById('gift-not-found').hidden = false;
      document.title = 'Подарок не найден — Дарите красиво';
    }
  }

  // Without media-query or animation APIs, content and filters remain usable.
  let motionPreference = {matches: true};
  try {
    if (typeof window.matchMedia === 'function') {
      motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    }
  } catch (_) { /* Use immediate, reduced-motion behaviour. */ }
  const activeAnimations = new Set();
  const touchLayout = () => typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const alreadyRevealed = new WeakSet();
  const pageEntry = document.documentElement.classList.contains('page-enter');

  let revealObserver = null;
  let filterController = null;

  function stopMotion() {
    if (filterController) filterController.finishLatest();
    if (revealObserver) revealObserver.disconnect();
    revealObserver = null;
    activeAnimations.forEach(animation => {
      try { animation.finish(); } catch (_) { /* Base content remains visible. */ }
      animation.cancel();
    });
    activeAnimations.clear();

  }

  function animateOnce(element, keyframes, options) {
    if (!element || motionPreference.matches || alreadyRevealed.has(element) || element.closest('[hidden]')) return;
    alreadyRevealed.add(element);
    if (typeof element.animate !== 'function') return;
    try {
      const animation = element.animate(keyframes, options);
      activeAnimations.add(animation);
      const forget = () => activeAnimations.delete(animation);
      animation.addEventListener('finish', forget, {once: true});
      animation.addEventListener('cancel', forget, {once: true});
    } catch (_) {
      // No persistent opacity or hidden class was applied.
    }
  }

  function reveal(element, delay = 0) {
    animateOnce(element, [
      {opacity: .2, transform: 'scale(.96)', filter: 'blur(3px)'},
      {opacity: 1, transform: 'scale(1)', filter: 'blur(0px)'}
    ], {duration: 640, delay: Math.min(delay, 180), easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards'});
  }

  function setupCatalogFilters() {
    const group = document.querySelector('.catalog-filters');
    if (!group) return null;
    const grid = document.querySelector('.catalog-grid');
    const cards = Array.from(document.querySelectorAll('.catalog-item'));
    const cardSet = new Set(cards);
    const count = document.getElementById('catalog-count');
    const allowedFilters = ['all', 'sweets', 'flowers'];
    const running = new Set();
    let selected = 'all';
    let revision = 0;
    let changing = false;

    function matches(card, filter) {
      return filter === 'all' || card.dataset.category === filter;
    }
    function updateControls() {
      group.querySelectorAll('button[data-filter]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.filter === selected));
      });
      const total = cards.filter(card => matches(card, selected)).length;
      if (count) count.textContent = `${total} ${giftWord(total)} в подборке`;
    }
    function cancelRunning() {
      running.forEach(animation => {
        try { animation.cancel(); } catch (_) { /* No inline styles to restore. */ }
      });
      running.clear();
    }
    function commitSelection() {
      cards.forEach(card => { card.hidden = !matches(card, selected); });
      updateControls();
    }
    function detachCardReveals() {
      cards.forEach(card => {
        alreadyRevealed.add(card);
      });
      activeAnimations.forEach(animation => {
        if (!animation.effect || !cardSet.has(animation.effect.target)) return;
        try { animation.finish(); } catch (_) { /* Restore underlying CSS. */ }
        animation.cancel();
        activeAnimations.delete(animation);
      });
    }
    function play(element, keyframes, options) {
      if (!element || typeof element.animate !== 'function') return null;
      try {
        const animation = element.animate(keyframes, options);
        running.add(animation);
        return animation;
      } catch (_) { return null; }
    }
    function waitFor(animations) {
      return Promise.all(animations.filter(Boolean).map(animation => {
        return animation.finished.catch(() => undefined);
      }));
    }
    function release(animations) {
      animations.filter(Boolean).forEach(animation => {
        try { animation.cancel(); } catch (_) { /* Fall through to visible CSS. */ }
        running.delete(animation);
      });
    }
    function finishLatest() {
      revision += 1;
      cancelRunning();
      commitSelection();
      changing = false;
    }

    async function transition(token) {
      if (motionPreference.matches || !cards.every(card => typeof card.animate === 'function')) {
        if (token === revision) { commitSelection(); changing = false; }
        return;
      }
      const currentlyVisible = cards.filter(card => !card.hidden);
      const compactMotion = touchLayout();
      const exitAnimations = currentlyVisible.map(card => play(card, [
        {opacity: 1, transform: 'scale(1)', filter: 'blur(0px)'},
        {opacity: 0, transform: 'scale(.98)', filter: 'blur(3px)'}
      ], {duration: 170, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards'}));
      await waitFor(exitAnimations);
      if (token !== revision) return;

      const nextVisible = cards.filter(card => matches(card, selected));
      const oldHeight = grid ? grid.getBoundingClientRect().height : 0;
      commitSelection();
      const newHeight = grid ? grid.getBoundingClientRect().height : 0;
      release(exitAnimations);
      if (token !== revision) return;

      // Every card appears at its final grid position, including retained cards.
      const arrivals = nextVisible.map((card, index) => play(card, [
        {opacity: 0, transform: 'scale(.95)', filter: compactMotion ? 'blur(2px)' : 'blur(4px)'},
        {opacity: 1, transform: 'scale(1)', filter: 'blur(0px)'}
      ], {duration: compactMotion ? 380 : 440, delay: Math.min(index * 25, 50), easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'backwards'}));
      if (grid && Math.abs(oldHeight - newHeight) > 1) {
        // A temporary WAAPI height effect moves following content too.
        // alignContent prevents fixed-height grid rows from stretching.
        arrivals.push(play(grid, [
          {height: `${oldHeight}px`, overflow: 'clip', alignContent: 'start'},
          {height: `${newHeight}px`, overflow: 'clip', alignContent: 'start'}
        ], {duration: compactMotion ? 340 : 400, easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'backwards'}));
      }
      await waitFor(arrivals);
      if (token !== revision) return;
      release(arrivals);
      changing = false;
    }

    group.hidden = false;
    group.addEventListener('click', event => {
      const button = event.target.closest('button[data-filter]');
      if (!button || !group.contains(button) || !allowedFilters.includes(button.dataset.filter)) return;
      if (button.dataset.filter === selected) return;
      selected = button.dataset.filter;
      revision += 1;
      const token = revision;
      cancelRunning();
      detachCardReveals();
  
      updateControls();
      changing = true;
      transition(token).catch(() => {
        if (token === revision) finishLatest();
      });
    });
    return {finishLatest, isChanging: () => changing};
  }
  filterController = setupCatalogFilters();

  function startMotion() {
    if (motionPreference.matches) return;
    const easing = 'cubic-bezier(.22,1,.36,1)';
    if (!pageEntry) {
    animateOnce(document.querySelector('.hero-copy h1'), [
      {opacity: .2, transform: 'scale(.96)', filter: 'blur(3px)'},
      {opacity: 1, transform: 'scale(1)', filter: 'blur(0px)'}
    ], {duration: 900, delay: 0, easing, fill: 'backwards'});
    reveal(document.querySelector('.hero-copy > p'), 110, 20);
    reveal(document.querySelector('.hero-copy .button'), 180, 16);
    [
      {element: document.querySelector('.hero-main-photo'), duration: 850, delay: 80},
      {element: document.querySelector('.hero-detail-photo'), duration: 950, delay: 230}
    ].forEach(({element, duration, delay}) => {
      animateOnce(element, [
        {opacity: .2, transform: 'scale(.95)', filter: 'blur(4px)'},
        {opacity: 1, transform: 'scale(1)', filter: 'blur(0px)'}
      ], {duration, delay, easing, fill: 'backwards'});
    });
    reveal(document.querySelector('.photo-caption'), 180, 12);
    }
    if (typeof window.IntersectionObserver !== 'function') return;
    // Navigation and filter controls stay still while the product content animates.
    const selector = '.section-heading, .gift, .assortment-note, .about-section, .closing-inner, .catalog-item, .detail-back, #gift-page-title, .gift-detail, #gift-not-found';
    try {
      const firstObservation = new WeakSet();
      revealObserver = new IntersectionObserver(entries => {
        let order = 0;
        entries.forEach(entry => {
          const element = entry.target;
          if (!firstObservation.has(element)) {
            firstObservation.add(element);
            if (pageEntry && entry.isIntersecting) alreadyRevealed.add(element);
          }
          if (element.closest('[hidden]') || (filterController && filterController.isChanging())) return;
          if (!entry.isIntersecting) {
            // Rearm only after the complete block has left the viewport.
            activeAnimations.forEach(animation => {
              if (animation.effect && animation.effect.target === element) {
                animation.cancel();
                activeAnimations.delete(animation);
              }
            });
            const bounds = element.getBoundingClientRect();
            if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) alreadyRevealed.delete(element);
            return;
          }
          // Keep content opaque: resetting opacity after it was painted caused a flash.
          animateOnce(element, [
            {transform: 'scale(.96)', filter: 'blur(3px)'},
            {transform: 'scale(1)', filter: 'blur(0px)'}
          ], {duration: touchLayout() ? 600 : 720, delay: Math.min(order * 50, 100), easing, fill: 'backwards'});
          order += 1;
        });
      }, {threshold: 0, rootMargin: '0px'});
      document.querySelectorAll(selector).forEach(element => {
        revealObserver.observe(element);
      });
    } catch (_) {
      if (revealObserver) revealObserver.disconnect();
      revealObserver = null;
    }
  }

  function updateMotionPreference() {
    stopMotion();
    if (!motionPreference.matches) startMotion();
  }
  if (typeof motionPreference.addEventListener === 'function') {
    motionPreference.addEventListener('change', updateMotionPreference);
  } else if (typeof motionPreference.addListener === 'function') {
    motionPreference.addListener(updateMotionPreference);
  }

  window.addEventListener('pagehide', stopMotion);
  window.addEventListener('pageshow', event => {
    if (event.persisted && !motionPreference.matches && !revealObserver) startMotion();
  });
  startMotion();

  let navigationAnimation = null;
  let navigationCover = null;
  let navigating = false;
  if (pageEntry) {
    const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    Promise.race([fontsReady, new Promise(resolve => window.setTimeout(resolve, 1500))]).catch(() => {}).then(() => {
      window.requestAnimationFrame(() => document.documentElement.classList.add('page-ready'));
    });
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/(?:\/|\/(?:index|catalog|gift)\.html)$/.test(url.pathname)) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    if (motionPreference.matches || typeof document.body.animate !== 'function') return;
    event.preventDefault();
    if (navigating) return;
    navigating = true;
    const currentOpacity = document.documentElement.classList.contains('page-enter')
      ? window.getComputedStyle(document.documentElement, '::after').opacity : '0';
    navigationCover = document.createElement('div');
    navigationCover.className = 'page-cover';
    navigationCover.setAttribute('aria-hidden', 'true');
    document.body.append(navigationCover);
    document.documentElement.classList.remove('page-enter');
    const go = () => {
      try { sessionStorage.setItem('darite:page-entry', url.pathname + url.search); } catch (_) {}
      location.assign(url.href);
    };
    try {
      navigationAnimation = navigationCover.animate([{opacity: currentOpacity}, {opacity: 1}], {duration: 180, easing: 'ease-in', fill: 'forwards'});
      navigationAnimation.finished.then(go, () => { navigating = false; });
    } catch (_) { go(); }
  });
  window.addEventListener('pageshow', () => {
    if (navigationAnimation) navigationAnimation.cancel();
    if (navigationCover) navigationCover.remove();
    navigationCover = null;
    navigationAnimation = null;
    navigating = false;
  });

  const composition = document.querySelector('.hero-composition');
  if (composition) {
    document.addEventListener('visibilitychange', () => {
      composition.classList.toggle('is-page-hidden', document.hidden);
    });
    if (typeof window.IntersectionObserver === 'function') {
      const driftObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => composition.classList.toggle('is-offscreen', !entry.isIntersecting));
      });
      driftObserver.observe(composition);
    }
  }
})();
