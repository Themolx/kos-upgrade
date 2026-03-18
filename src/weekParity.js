/**
 * KOS Upgrade – Sudý/Lichý týden badge v hlavičce
 */

const WeekParity = {
  init() {
    const isOdd = KOS.isOddWeek();
    const weekNum = KOS.getISOWeek(new Date());
    const label = isOdd ? 'Lichý' : 'Sudý';

    const badge = KOS.el('div', { className: `kos-week-badge kos-week-badge--${isOdd ? 'odd' : 'even'}` },
      KOS.el('span', { className: 'kos-week-badge__label' }, `${label} týden`),
      KOS.el('span', { className: 'kos-week-badge__number' }, `(${weekNum})`)
    );

    const headers = document.querySelectorAll('#hlavicka.row');
    const header = headers.length > 1 ? headers[1] : headers[0];
    if (header) {
      header.style.position = 'relative';
      header.appendChild(badge);
    } else {
      document.body.appendChild(badge);
    }
  }
};
