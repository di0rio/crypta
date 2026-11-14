// Character customisation panel: rows of colour swatches plus two style toggles. Changes apply live.

export const PALETTE = {
  skin: ['#f3cfae', '#e3b38d', '#c98f62', '#9a6642', '#6e452c', '#f0d9c8'],
  hair: ['#2b1b15', '#5a3a22', '#b5793a', '#e0c27a', '#d9d9de', '#b23a2e', '#3a4a7a', '#6a3f8a'],
  tunic: ['#efe6cf', '#d9c9a8', '#bcd3d8', '#e8c7c0', '#4a4f5a', '#f5f0e6'],
  cape: ['#2c7479', '#3b5ba8', '#7a3d8f', '#a83b3b', '#c9772c', '#3f7d46', '#39404f', '#c4a43a'],
  trim: ['#f0d48a', '#ffffff', '#e85d4a', '#7fd6c9', '#2a2a33'],
  scarf: ['#d8392e', '#f0a23c', '#3f8fe0', '#58c08a', '#b05ad8', '#f3ead6', '#2a2a33']
};
const LABEL = { skin: 'pele', hair: 'cabelo', tunic: 'túnica', cape: 'capa', trim: 'barra', scarf: 'cachecol' };

export function randomLook() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)], L = {};
  Object.keys(PALETTE).forEach((k) => { L[k] = pick(PALETTE[k]); });
  L.tail = Math.random() < 0.6 ? 1 : 0; L.hat = Math.random() < 0.35 ? 1 : 0;
  return L;
}

export function createLookPanel(el, look, onChange, onClose) {
  el.innerHTML = '';
  const h = document.createElement('h2'); h.textContent = 'personagem'; el.appendChild(h);
  const rows = {};
  function refresh() {
    Object.keys(rows).forEach((k) => rows[k].forEach((b) => b.classList.toggle('sel', b.dataset.v === String(look[k]))));
  }
  Object.keys(PALETTE).forEach((key) => {
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('span'); lab.textContent = LABEL[key]; row.appendChild(lab);
    rows[key] = PALETTE[key].map((c) => {
      const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.dataset.v = c; b.setAttribute('aria-label', LABEL[key] + ' ' + c);
      b.addEventListener('click', () => { look[key] = c; refresh(); onChange(look); });
      row.appendChild(b); return b;
    });
    el.appendChild(row);
  });
  [['tail', 'rabo de cavalo'], ['hat', 'chapéu de palha']].forEach(([key, text]) => {
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('span'); lab.textContent = text; row.appendChild(lab);
    rows[key] = [['1', 'sim'], ['0', 'não']].map(([v, t]) => {
      const b = document.createElement('button'); b.className = 'tg'; b.textContent = t; b.dataset.v = v;
      b.addEventListener('click', () => { look[key] = +v; refresh(); onChange(look); });
      row.appendChild(b); return b;
    });
    el.appendChild(row);
  });
  const foot = document.createElement('div'); foot.className = 'row foot';
  const rnd = document.createElement('button'); rnd.className = 'tg'; rnd.textContent = 'aleatório';
  rnd.addEventListener('click', () => { Object.assign(look, randomLook()); refresh(); onChange(look); });
  const done = document.createElement('button'); done.className = 'tg strong'; done.textContent = 'pronto';
  done.addEventListener('click', onClose);
  foot.appendChild(rnd); foot.appendChild(done); el.appendChild(foot);
  refresh();
}
