/* Стартовые данные таблицы лидеров.
   Используются ОДИН РАЗ — при первом заходе, если в localStorage ещё ничего нет.
   Дальше все записи хранятся в localStorage браузера. */
window.DINO_SEED_LEADERBOARD = [
  { nick: 'ДинозаврБосс',        score: 2450, difficulty: 'hard',   date: 1700000000000 },
  { nick: 'БыстрыйЁжик',         score: 1890, difficulty: 'medium', date: 1700000001000 },
  { nick: 'КосмическийПельмень', score: 1520, difficulty: 'hard',   date: 1700000002000 },
  { nick: 'ТихийХакер',          score: 1180, difficulty: 'medium', date: 1700000003000 },
  { nick: 'МудрыйКактус',        score:  870, difficulty: 'easy',   date: 1700000004000 }
];