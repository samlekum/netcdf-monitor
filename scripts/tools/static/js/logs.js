const POLL_INTERVAL_MS = 4000;

const state = {
  entries: [],
  knownPids: [],
  activePid: 'all',
  activeLevel: 'all',
  autoscroll: true,
  renderedCount: 0,
  renderedRaws: [],
  renderedFilterKey: null,
};

const el = {
  pidFilters: document.getElementById('pid-filters'),
  levelTabs: document.querySelectorAll('.level-tab'),
  autoscrollToggle: document.getElementById('autoscroll-toggle'),
  terminalBody: document.getElementById('terminal-body'),
  terminalLines: document.getElementById('terminal-lines'),
  terminalEmpty: document.getElementById('terminal-empty'),
  terminalTitle: document.getElementById('terminal-title'),
  terminalCount: document.getElementById('terminal-count'),
  jumpLatest: document.getElementById('jump-latest'),
  liveDot: document.getElementById('live-dot'),
  liveText: document.getElementById('live-text'),
};

function isNearBottom() {
  const { scrollTop, scrollHeight, clientHeight } = el.terminalBody;
  return scrollHeight - (scrollTop + clientHeight) < 40;
}

function scrollToBottom() {
  el.terminalBody.scrollTop = el.terminalBody.scrollHeight;
}

// Dipakai buat "bungkam" sesaat listener scroll di bawah, pas KITA yang
// gerakin scrollbar secara programatik (scrollToBottom / jump button),
// biar gak disalahartikan sebagai user manual scroll ke atas.
let suppressScrollCheck = false;

el.terminalBody.addEventListener('scroll', () => {
  if (suppressScrollCheck) return;
  if (!state.autoscroll) return;
  if (!isNearBottom()) {
    state.autoscroll = false;
    el.autoscrollToggle.classList.remove('active');
  }
});

function programmaticScrollToBottom() {
  suppressScrollCheck = true;
  scrollToBottom();
  // Lepas suppress-nya di frame berikutnya, setelah event scroll (yang
  // dipicu assignment di atas) selesai diproses browser.
  requestAnimationFrame(() => { suppressScrollCheck = false; });
}

el.autoscrollToggle.addEventListener('click', () => {
  state.autoscroll = !state.autoscroll;
  el.autoscrollToggle.classList.toggle('active', state.autoscroll);
  if (state.autoscroll) {
    programmaticScrollToBottom();
    el.jumpLatest.hidden = true;
  }
});

el.jumpLatest.addEventListener('click', () => {
  state.autoscroll = true;
  el.autoscrollToggle.classList.add('active');
  programmaticScrollToBottom();
  el.jumpLatest.hidden = true;
});

function setActivePid(pid) {
  state.activePid = pid;
  el.pidFilters.querySelectorAll('.pid-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.pid === pid);
  });
  renderLines();
}

function setActiveLevel(level) {
  state.activeLevel = level;
  el.levelTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.level === level);
  });
  renderLines();
}

el.levelTabs.forEach(tab => {
  tab.addEventListener('click', () => setActiveLevel(tab.dataset.level));
});

function rebuildPidChips(pids) {
  const changed = pids.join(',') !== state.knownPids.join(',');
  if (!changed) return;
  state.knownPids = pids;

  // Kalau proses yang lagi dipilih sudah gak aktif lagi, balik ke "Semua".
  if (state.activePid !== 'all' && !pids.includes(state.activePid)) {
    state.activePid = 'all';
  }

  el.pidFilters.innerHTML = '';
  const allChip = document.createElement('button');
  allChip.className = 'pid-chip' + (state.activePid === 'all' ? ' active' : '');
  allChip.dataset.pid = 'all';
  allChip.textContent = pids.length > 1 ? `Semua proses (${pids.length})` : 'Semua proses';
  allChip.addEventListener('click', () => setActivePid('all'));
  el.pidFilters.appendChild(allChip);

  pids.forEach(pid => {
    const chip = document.createElement('button');
    chip.className = 'pid-chip' + (state.activePid === pid ? ' active' : '');
    chip.dataset.pid = pid;
    chip.innerHTML = `<span class="pid-dot"></span> PID ${pid}`;
    chip.addEventListener('click', () => setActivePid(pid));
    el.pidFilters.appendChild(chip);
  });
}

function formatLineTime(ts) {
  if (!ts) return '';
  // "2026-07-27 14:32:10,123" -> tampilin jam:menit:detik aja, cukup buat konteks
  const match = ts.match(/(\d{2}:\d{2}:\d{2})/);
  return match ? match[1] : ts;
}

function createLineElement(entry) {
  const line = document.createElement('div');
  line.className = 'log-line is-new';
  line.dataset.level = entry.level;
  line.innerHTML = `
    <span class="log-ts">${formatLineTime(entry.ts)}</span>
    ${entry.pid ? `<span class="log-pid">PID ${entry.pid}</span>` : ''}
    <span class="log-msg"></span>
  `;
  // textContent (not innerHTML) for the message so log content can never
  // be interpreted as markup.
  line.querySelector('.log-msg').textContent = entry.message;
  return line;
}

function currentFilterKey() {
  return `${state.activePid}::${state.activeLevel}`;
}

function renderLines() {
  const filtered = state.entries.filter(e => {
    const pidMatch = state.activePid === 'all' || e.pid === state.activePid;
    const levelMatch = state.activeLevel === 'all' || e.level === state.activeLevel;
    return pidMatch && levelMatch;
  });

  el.terminalEmpty.style.display = state.entries.length === 0 ? 'flex' : 'none';

  const filterKey = currentFilterKey();
  const filterChanged = filterKey !== state.renderedFilterKey;

  // Cari overlap dengan apa yang sudah nampil di DOM: kalau baris
  // terakhir yang sudah dirender masih ada di posisi yang sama pada
  // array baru, tinggal APPEND baris-baris setelahnya -- DOM lama sama
  // sekali gak disentuh, jadi scrollTop gak pernah ke-reset paksa.
  //
  // Full rebuild cuma dipakai kalau filter baru diganti, atau window log
  // dari backend sudah geser sejauh baris terakhir kita gak ketemu lagi
  // (kasus jarang -- fallback aman).
  let appendFrom = -1;
  if (!filterChanged && state.renderedRaws.length > 0) {
    const lastRenderedRaw = state.renderedRaws[state.renderedRaws.length - 1];
    const idx = filtered.findIndex(e => e.raw === lastRenderedRaw);
    if (idx !== -1) appendFrom = idx + 1;
  }

  const wasNearBottom = isNearBottom();

  if (filterChanged || appendFrom === -1) {
    // Full rebuild: filter ganti, atau gak nemu titik overlap.
    el.terminalLines.innerHTML = '';
    filtered.forEach(entry => el.terminalLines.appendChild(createLineElement(entry)));
  } else if (appendFrom < filtered.length) {
    // Append-only: baris lama di DOM tetap utuh.
    filtered.slice(appendFrom).forEach(entry => {
      el.terminalLines.appendChild(createLineElement(entry));
    });
  }

  state.renderedRaws = filtered.map(e => e.raw);
  state.renderedFilterKey = filterKey;

  el.terminalCount.textContent = `${filtered.length} baris`;
  el.terminalTitle.textContent = state.activePid === 'all'
    ? 'download_activity.log (semua proses)'
    : `download_activity_${state.activePid}.log`;

  const hasNewContent = filtered.length > state.renderedCount;
  if (state.autoscroll && wasNearBottom) {
    programmaticScrollToBottom();
    el.jumpLatest.hidden = true;
  } else if (!state.autoscroll && hasNewContent) {
    el.jumpLatest.hidden = false;
  }

  state.renderedCount = filtered.length;
}

function setLiveStatus(secondsSinceUpdate, activePidCount) {
  if (activePidCount === 0) {
    el.liveDot.classList.remove('active');
    el.liveText.textContent = 'Tidak ada proses aktif';
    return;
  }

  el.liveDot.classList.add('active');
  const label = activePidCount === 1 ? '1 proses aktif' : `${activePidCount} proses aktif`;
  if (secondsSinceUpdate == null) {
    el.liveText.textContent = label;
  } else {
    el.liveText.textContent = `${label} · ${Math.round(secondsSinceUpdate)}s lalu`;
  }
}

async function pollLog() {
  try {
    const res = await fetch('/api/log');
    if (!res.ok) throw new Error('Bad response');
    const data = await res.json();

    state.entries = data.entries;

    rebuildPidChips(data.active_pids || []);
    renderLines();
    setLiveStatus(data.seconds_since_update, (data.active_pids || []).length);
  } catch (err) {
    console.error('Gagal ambil log:', err);
    el.liveDot.classList.remove('active');
    el.liveText.textContent = 'Gagal terhubung ke server';
  }
}

pollLog();
setInterval(pollLog, POLL_INTERVAL_MS);