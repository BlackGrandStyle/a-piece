/* ============================================================
   PLACEHOLDERS - повторяющиеся фразы сайта
   ============================================================ */

window.PLACEHOLDERS = {

  /* Логотип в шапке */
  brandHtml: 'black<span>grandstyle</span>',

  /* Текст аватара на главной */
  avatarText: 'bg',

  /* Подвал */
  footerCopy: '2026 # blackgrandstyle',

  /* Навигация: 8 пунктов */
  nav: {
    home: 'Главная',
    contacts: 'Контакты',
    library: 'Библиотека',
    hamster: 'Хомячок',
    games: 'Любимые игры',
    music: 'Любимая музыка',
    mods: 'Любимые моды Minecraft',
    stalker: 'Любимые моды S.T.A.L.K.E.R.'
  },

  /* Кнопки-ссылки в библиотеке */
  linkOpen: {
    steam: 'Открыть в Steam',
    spotify: 'Открыть на Spotify',
    curseforge: 'Открыть на CurseForge',
    appro: 'Открыть источник'
  }
};

/* ============================================================
   Применение плейсхолдеров к DOM
   ============================================================ */
(function initPlaceholders() {
  const P = window.PLACEHOLDERS;
  if (!P) return;

  function getValue(path) {
    const parts = String(path).split('.');
    let obj = P;
    for (let i = 0; i < parts.length; i++) {
      if (obj == null) return undefined;
      obj = obj[parts[i]];
    }
    return obj;
  }

  function apply(el) {
    const path = el.dataset.ph;
    if (!path) return;
    const val = getValue(path);
    if (val === undefined || val === null) return;
    const str = String(val);
    if (/<[a-z][\s\S]*>/i.test(str)) {
      el.innerHTML = str;
    } else {
      el.textContent = str;
    }
  }

  document.querySelectorAll('[data-ph]').forEach(apply);
})();