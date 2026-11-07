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
  const zoomTimers = new Map();
  let revealObserver = null;
  let filterController = null;

  function stopZoom() {
    zoomTimers.forEach((timer, viewport) => {
      window.clearTimeout(timer);
      viewport.classList.remove('is-zoomed');
      viewport.classList.remove('is-active-block');
    });
    zoomTimers.clear();
  }

  function stopMotion() {
    if (filterController) filterController.finishLatest();
    if (revealObserver) revealObserver.disconnect();
    revealObserver = null;
    activeAnimations.forEach(animation => {
      try { animation.finish(); } catch (_) { /* Base content remains visible. */ }
      animation.cancel();
    });
    activeAnimations.clear();
    stopZoom();
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

  function reveal(element, delay = 0, distance = 20) {
    animateOnce(element, [
      {opacity: .2, transform: `translateY(${Math.min(distance, 22)}px)`},
      {opacity: 1, transform: 'translateY(0)'}
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
        if (revealObserver) revealObserver.unobserve(card);
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
      const outgoing = currentlyVisible.filter(card => !matches(card, selected));
      const exitAnimations = outgoing.map(card => play(card, [
        {opacity: 1, transform: 'translateY(0) scale(1)'},
        {opacity: 0, transform: 'translateY(-10px) scale(.97)'}
      ], {duration: compactMotion ? 110 : 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards'}));
      await waitFor(exitAnimations);
      if (token !== revision) return;

      const nextVisible = cards.filter(card => matches(card, selected));
      const survivors = nextVisible.filter(card => !card.hidden);
      const entering = nextVisible.filter(card => card.hidden);
      const oldPositions = new Map(survivors.map(card => [card, card.getBoundingClientRect()]));
      const oldHeight = grid ? grid.getBoundingClientRect().height : 0;
      commitSelection();
      const newPositions = new Map(survivors.map(card => [card, card.getBoundingClientRect()]));
      const newHeight = grid ? grid.getBoundingClientRect().height : 0;
      release(exitAnimations);
      if (token !== revision) return;

      const arrivals = [];
      survivors.forEach(card => {
        const before = oldPositions.get(card);
        const after = newPositions.get(card);
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < .5 && Math.abs(dy) < .5) return;
        arrivals.push(play(card, [
          {transform: `translate(${dx}px, ${dy}px)`},
          {transform: 'translate(0, 0)'}
        ], {duration: compactMotion ? 260 : 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards'}));
      });
      entering.forEach((card, index) => {
        arrivals.push(play(card, [
          {opacity: .2, transform: 'translateY(14px) scale(.97)'},
          {opacity: 1, transform: 'translateY(0) scale(1)'}
        ], {duration: compactMotion ? 260 : 360, delay: Math.min(index * (compactMotion ? 25 : 40), compactMotion ? 50 : 120), easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards'}));
      });
      if (grid && Math.abs(oldHeight - newHeight) > 1) {
        // A temporary WAAPI height effect moves following content too.
        // alignContent prevents fixed-height grid rows from stretching.
        arrivals.push(play(grid, [
          {height: `${oldHeight}px`, overflow: 'clip', alignContent: 'start'},
          {height: `${newHeight}px`, overflow: 'clip', alignContent: 'start'}
        ], {duration: compactMotion ? 260 : 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards'}));
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
      stopZoom();
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
    animateOnce(document.querySelector('.hero-copy h1'), [
      {opacity: .2, transform: 'translateY(26px)', clipPath: 'inset(0 0 10% 0)'},
      {opacity: 1, transform: 'translateY(0)', clipPath: 'inset(0 0 0 0)'}
    ], {duration: 900, delay: 0, easing, fill: 'backwards'});
    reveal(document.querySelector('.hero-copy > p'), 110, 20);
    reveal(document.querySelector('.hero-copy .button'), 180, 16);
    [
      {element: document.querySelector('.hero-main-photo'), duration: 850, delay: 80},
      {element: document.querySelector('.hero-detail-photo'), duration: 950, delay: 230}
    ].forEach(({element, duration, delay}) => {
      animateOnce(element, [
        {opacity: .2, transform: 'translateY(32px) rotate(-2deg) scale(.96)'},
        {opacity: 1, transform: 'translateY(0) rotate(0deg) scale(1)'}
      ], {duration, delay, easing, fill: 'backwards'});
    });
    reveal(document.querySelector('.photo-caption'), 180, 12);
    if (typeof window.IntersectionObserver !== 'function') return;
    const selector = '.section-heading, .gift, .assortment-note, .about-section, .closing-inner, .catalog-heading, .catalog-toolbar, .catalog-item, .detail-back, #gift-page-title, .gift-detail, #gift-not-found, .site-footer';
    try {
      revealObserver = new IntersectionObserver(entries => {
        let order = 0;
        entries.forEach(entry => {
          if (!entry.isIntersecting || entry.target.closest('[hidden]')) return;
          reveal(entry.target, Math.min(order * 65, 180));
          order += 1;
          if (revealObserver) revealObserver.unobserve(entry.target);
        });
      }, {threshold: .08, rootMargin: '0px 0px -30px 0px'});
      document.querySelectorAll(selector).forEach(element => {
        if (!alreadyRevealed.has(element)) revealObserver.observe(element);
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

  document.addEventListener('pointerdown', event => {
    if (motionPreference.matches || !['touch', 'pen'].includes(event.pointerType)) return;
    const viewport = event.target.closest('.hero-main-photo, .hero-detail-photo, .gift-card, .gift, .about-section, .hero-composition, .gift-detail') || event.target.closest('.image-viewport');
    if (!viewport) return;
    stopZoom();
    viewport.classList.add('is-zoomed');
    viewport.classList.add('is-active-block');
    const timer = window.setTimeout(() => {
      viewport.classList.remove('is-zoomed');
      viewport.classList.remove('is-active-block');
      zoomTimers.delete(viewport);
    }, 450);
    zoomTimers.set(viewport, timer);
  }, {passive: true});
  // Let a quick tap remain perceptible; scrolling and cancellation still reset immediately.
  document.addEventListener('pointerup', () => {
    zoomTimers.forEach((timer, viewport) => {
      window.clearTimeout(timer);
      zoomTimers.set(viewport, window.setTimeout(stopZoom, 220));
    });
  }, {passive: true});
  document.addEventListener('pointercancel', stopZoom, {passive: true});
  window.addEventListener('scroll', stopZoom, {passive: true});
  window.addEventListener('blur', stopZoom);
  window.addEventListener('pagehide', stopMotion);
  window.addEventListener('pageshow', event => {
    if (event.persisted && !motionPreference.matches && !revealObserver) startMotion();
  });
  startMotion();
})();
