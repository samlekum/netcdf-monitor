const POLL_INTERVAL_MS = 5000;
let lastKnownFile = null;
let firstCheck = true;

function showToast(message) {
  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');
  toast.className = 'toast';

  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" type="button" aria-label="Close notification">
      &times;
    </button>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  const closeBtn = toast.querySelector('.toast-close');

  let timer;
  let remaining = 6000;
  let startTime;
  let isDragging = false;
  let startX = 0;
  let currentX = 0;

  function startTimer() {
    startTime = Date.now();

    timer = setTimeout(() => {
      dismissToast();
    }, remaining);
  }

  function pauseTimer() {
    clearTimeout(timer);
    remaining -= Date.now() - startTime;
  }

  function dismissToast() {
    clearTimeout(timer);

    toast.classList.remove('show');
    toast.classList.add('dismiss');

    setTimeout(() => {
      toast.remove();
    }, 300);
  }

  // Close button
  closeBtn.addEventListener('click', () => {
    dismissToast();
  });

  // Pause timer ketika mouse masuk
  toast.addEventListener('mouseenter', () => {
    pauseTimer();
  });

  // Lanjutkan timer ketika mouse keluar
  toast.addEventListener('mouseleave', () => {
    if (!isDragging && remaining > 0) {
      startTimer();
    }
  });

  // Touch / drag start
  toast.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.toast-close')) return;

    isDragging = true;
    startX = e.clientX;
    currentX = 0;

    pauseTimer();

    toast.classList.add('dragging');
    toast.setPointerCapture(e.pointerId);
  });

  // Drag
  toast.addEventListener('pointermove', (e) => {
    if (!isDragging) return;

    currentX = e.clientX - startX;

    toast.style.transform = `translateX(${currentX}px)`;
    toast.style.opacity = Math.max(
      0.2,
      1 - Math.abs(currentX) / 250
    );
  });

  // Drag end
  toast.addEventListener('pointerup', () => {
    if (!isDragging) return;

    isDragging = false;
    toast.classList.remove('dragging');

    const threshold = 100;

    if (Math.abs(currentX) >= threshold) {
      dismissToast();
      return;
    }

    // Balik ke posisi awal
    toast.style.transform = '';
    toast.style.opacity = '';

    startTimer();
  });

  startTimer();
}

async function checkForNewFile() {
  try {
    const res = await fetch('/api/statistics');
    if (!res.ok) return;
    const data = await res.json();
    if (firstCheck) {
      lastKnownFile = data.latest_file;
      firstCheck = false;
      return;
    }
    if (data.latest_file && data.latest_file !== lastKnownFile) {
      lastKnownFile = data.latest_file;
      showToast('File baru terdownload:<span class="file">' + data.latest_file + '</span>');
    }
  } catch (err) {
    console.error('Gagal cek statistik:', err);
  }
}
checkForNewFile();
setInterval(checkForNewFile, POLL_INTERVAL_MS);

function updateHeights() {
  document.querySelectorAll('.day-header.open').forEach(h => {
    const c = h.nextElementSibling;
    c.style.maxHeight = c.scrollHeight + 'px';
  });
  document.querySelectorAll('.accordion-header.open').forEach(h => {
    const c = h.parentElement.querySelector('.accordion-content');
    c.style.maxHeight = c.scrollHeight + 'px';
  });
}

function closeDay(header) {
  header.classList.remove('open');
  header.nextElementSibling.style.maxHeight = '0px';
}

function toggleMonth(header) {
  const item = header.parentElement;
  const content = item.querySelector('.accordion-content');
  const isOpen = header.classList.contains('open');

  document.querySelectorAll('.accordion-header').forEach(h => {
    h.classList.remove('open');
    const c = h.parentElement.querySelector('.accordion-content');
    c.style.maxHeight = '0px';
    c.querySelectorAll('.day-header.open').forEach(closeDay);
  });

  if (!isOpen) {
    header.classList.add('open');
    content.style.maxHeight = content.scrollHeight + 'px';
  }
}

async function toggleDay(header, month, day) {
  const content = header.nextElementSibling;
  const isOpen = header.classList.contains('open');

  document.querySelectorAll('.day-header.open').forEach(h => {
    if (h !== header) closeDay(h);
  });

  if (isOpen) {
    closeDay(header);
    updateHeights();
    return;
  }

  header.classList.add('open');
  const fileList = content.querySelector('.file-list');
  const summary = content.querySelector('.slot-summary');

  if (fileList.dataset.loaded !== 'true') {
    fileList.innerHTML = '<div class="file-loading">Memuat jadwal slot...</div>';
    updateHeights();
    try {
      const res = await fetch(
        '/api/files?month=' +
        encodeURIComponent(month) +
        '&day=' +
        encodeURIComponent(day)
      );

      let data;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server error (${res.status}): respons bukan JSON. ${text.slice(0, 100)}`);
      }

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      renderFileList(fileList, data.schedule);

      summary.style.display = 'flex';
      summary.innerHTML =
        '<span class="dot-ok">' +
        data.existing_count +
        '</span> dari ' +
        data.total_slots +
        ' slot sudah terunduh &middot; <span class="dot-missing">' +
        (data.total_slots - data.existing_count) +
        '</span> belum ada';

      fileList.dataset.loaded = 'true';

    } catch (err) {
      console.error('Gagal memuat jadwal slot:', err);

      fileList.innerHTML =
        '<div class="file-loading">' +
        'Gagal memuat jadwal slot: ' +
        err.message +
        '</div>';
    }
  }

  updateHeights();
}

function renderFileList(container, schedule) {
  container.innerHTML = '';
  if (!schedule || schedule.length === 0) {
    container.innerHTML = '<div class="file-loading">Tidak ada jadwal slot untuk hari ini.</div>';
    return;
  }
  for (const slot of schedule) {
    const row = document.createElement('div');
    row.className = 'file-row ' + (slot.exists ? 'exists' : 'missing');

    const time = document.createElement('span');
    time.className = 'file-time';
    time.textContent = slot.time.slice(0, 2) + ':' + slot.time.slice(2);

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = slot.filename;

    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = slot.exists ? slot.size : '\u2014';

    row.appendChild(time);
    row.appendChild(name);
    row.appendChild(size);
    container.appendChild(row);
  }
}

window.addEventListener('resize', updateHeights);

// Desktop/tablet file explorer for Monthly breakdown.
// Mobile keeps the accordion.
(function () {
  const dataEl = document.getElementById('explorer-data');
  const body = document.getElementById('explorer-body');
  if (!dataEl || !body) return;

  let BREAKDOWN;
  try {
    BREAKDOWN = JSON.parse(dataEl.textContent);
  } catch (err) {
    console.error('Gagal parse data explorer:', err);
    return;
  }

  const toolbar = document.querySelector('.explorer-toolbar');
  const backBtn = document.getElementById('explorer-back');
  const fwdBtn = document.getElementById('explorer-forward');
  const breadcrumbEl = document.getElementById('explorer-breadcrumb');
  const countEl = document.getElementById('explorer-count');
  const viewBtns = document.querySelectorAll('.view-btn');
  const refreshBtn = document.getElementById('refresh-btn');

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (refreshBtn.classList.contains('loading')) return;

      refreshBtn.classList.add('loading');

      setTimeout(() => {
        window.location.reload();
      }, 400);
    });
  }

  let viewMode = 'grid';
  let history = [{ level: 'root' }];
  let historyIndex = 0;
  let requestToken = 0; // guards against out-of-order async file fetches

  function humanSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes || 0;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return n.toFixed(1) + ' ' + units[i];
  }

  function monthSummary(month) {
    const days = BREAKDOWN[month] || {};
    const dayNames = Object.keys(days);
    let files = 0, size = 0;
    dayNames.forEach((d) => {
      files += days[d][0];
      size += days[d][1];
    });
    return { dayCount: dayNames.length, files, size, locked: dayNames.length < 10 };
  }

  function currentState() {
    return history[historyIndex];
  }

  function navigateTo(state) {
    history = history.slice(0, historyIndex + 1);
    history.push(state);
    historyIndex = history.length - 1;
    render();
  }

  function goBack() {
    if (historyIndex > 0) {
      historyIndex--;
      render();
    }
  }

  function goForward() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      render();
    }
  }

  backBtn.addEventListener('click', goBack);
  fwdBtn.addEventListener('click', goForward);

  viewBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      viewMode = btn.dataset.view;
      viewBtns.forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', String(isActive));
      });
      render();
    });
  });

  function updateNavButtons() {
    backBtn.disabled = historyIndex === 0;
    fwdBtn.disabled = historyIndex === history.length - 1;
  }

  function makeSeparator() {
    const span = document.createElement('span');
    span.className = 'crumb-sep';
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    return span;
  }

  function makeCrumb(label, state, isActive) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'crumb' + (isActive ? ' active' : '');
    btn.textContent = label;
    if (isActive) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', () => navigateTo(state));
    }
    return btn;
  }

  function renderBreadcrumb(state) {
    breadcrumbEl.innerHTML = '';
    breadcrumbEl.appendChild(makeCrumb('Monthly breakdown', { level: 'root' }, state.level === 'root'));
    if (state.level === 'month' || state.level === 'day') {
      breadcrumbEl.appendChild(makeSeparator());
      breadcrumbEl.appendChild(
        makeCrumb(state.month, { level: 'month', month: state.month }, state.level === 'month')
      );
    }
    if (state.level === 'day') {
      breadcrumbEl.appendChild(makeSeparator());
      breadcrumbEl.appendChild(
        makeCrumb(state.day, { level: 'day', month: state.month, day: state.day }, true)
      );
    }
  }

  function folderIconSVG() {
    return '<svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>';
  }

  function lockIconSVG() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="10" x="4" y="11" rx="2"></rect><path d="M7 11V8a5 5 0 0 1 10 0v3"></path></svg>';
  }

  function alertIconSVG() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  }

  // Renders a level whose items behave like folders (root: months, month: days)
  function renderFolderLevel(items) {
    body.classList.remove('explorer-file-view');
    body.innerHTML = '';

    if (items.length === 0) {
      body.innerHTML = '<div class="explorer-empty">Tidak ada data untuk ditampilkan.</div>';
      return;
    }

    if (viewMode === 'grid') {
      const grid = document.createElement('div');
      grid.className = 'explorer-grid';
      items.forEach((item) => grid.appendChild(folderCard(item)));
      body.appendChild(grid);
    } else {
      const table = document.createElement('div');
      table.className = 'explorer-table';

      const thead = document.createElement('div');
      thead.className = 'explorer-thead';
      thead.innerHTML =
        '<span class="col-name">Name</span><span>Days</span><span>Files</span><span>Size</span><span>Status</span>';
      table.appendChild(thead);

      items.forEach((item) => table.appendChild(folderRow(item)));
      body.appendChild(table);
    }
  }

  function folderRow(item) {
    const row = document.createElement('div');
    row.className = 'explorer-row' + (item.locked ? ' locked' : '');

    const name = document.createElement('div');
    name.className = 'row-name';
    name.innerHTML = folderIconSVG() + '<span>' + item.label + '</span>';

    const daysCell = document.createElement('span');
    daysCell.className = 'row-cell';
    daysCell.textContent = item.daysLabel != null ? item.daysLabel : '\u2014';

    const filesCell = document.createElement('span');
    filesCell.className = 'row-cell';
    filesCell.textContent = item.files + '';

    const sizeCell = document.createElement('span');
    sizeCell.className = 'row-cell';
    sizeCell.textContent = humanSize(item.size);

    const statusCell = document.createElement('span');
    const tag = document.createElement('span');
    tag.className = 'status-tag ' + (item.locked ? 'pending' : 'ok');
    tag.innerHTML = '<span class="dot"></span>' + (item.locked ? 'Collecting' : 'Available');
    statusCell.appendChild(tag);
    statusCell.style.justifySelf = 'end';

    row.appendChild(name);
    row.appendChild(daysCell);
    row.appendChild(filesCell);
    row.appendChild(sizeCell);
    row.appendChild(statusCell);

    if (!item.locked) row.addEventListener('click', item.onOpen);
    return row;
  }

  function folderCard(item) {
    const card = document.createElement('div');
    card.className = 'folder-card' + (item.locked ? ' locked' : '');

    const iconWrap = document.createElement('div');
    iconWrap.className = 'folder-icon-wrap';
    iconWrap.innerHTML = folderIconSVG();
    if (item.locked) {
      const badge = document.createElement('span');
      badge.className = 'lock-badge';
      badge.innerHTML = lockIconSVG();
      iconWrap.appendChild(badge);
    }

    const name = document.createElement('div');
    name.className = 'folder-card-name';
    name.textContent = item.label;

    const meta = document.createElement('div');
    meta.className = 'folder-card-meta';
    meta.textContent = item.metaLabel;

    card.appendChild(iconWrap);
    card.appendChild(name);
    card.appendChild(meta);

    if (!item.locked) card.addEventListener('click', item.onOpen);
    return card;
  }

  function renderRoot() {
    toolbar.classList.remove('is-leaf');
    const months = Object.keys(BREAKDOWN);
    countEl.textContent = months.length + ' month' + (months.length !== 1 ? 's' : '');

    const items = months.map((month) => {
      const s = monthSummary(month);
      return {
        label: month,
        daysLabel: s.dayCount,
        files: s.files,
        size: s.size,
        locked: s.locked,
        metaLabel: s.dayCount + ' day' + (s.dayCount !== 1 ? 's' : ''),
        onOpen: () => navigateTo({ level: 'month', month }),
      };
    });

    renderFolderLevel(items);
  }

  function renderMonth(month) {
    toolbar.classList.remove('is-leaf');
    const days = BREAKDOWN[month] || {};
    const dayNames = Object.keys(days).sort((a, b) => Number(a) - Number(b));
    const locked = dayNames.length < 10;

    countEl.textContent = dayNames.length + ' day' + (dayNames.length !== 1 ? 's' : '');

    body.classList.remove('explorer-file-view');
    body.innerHTML = '';

    if (locked) {
      const notice = document.createElement('div');
      notice.className = 'explorer-notice';
      notice.innerHTML =
        alertIconSVG() +
        '<span>Baru ' +
        dayNames.length +
        ' hari data untuk bulan ini &mdash; detail file per hari baru bisa dibuka setelah data bulan ini genap 10 hari.</span>';
      body.appendChild(notice);
    }

    const items = dayNames.map((day) => {
      const data = days[day];
      return {
        label: day,
        daysLabel: null,
        files: data[0],
        size: data[1],
        locked: locked,
        metaLabel: data[0] + ' file' + (data[0] !== 1 ? 's' : ''),
        onOpen: () => navigateTo({ level: 'day', month, day }),
      };
    });

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'explorer-empty';
      empty.textContent = 'Tidak ada data untuk ditampilkan.';
      body.appendChild(empty);
      return;
    }

    if (viewMode === 'grid') {
      const grid = document.createElement('div');
      grid.className = 'explorer-grid';
      items.forEach((item) => grid.appendChild(folderCard(item)));
      body.appendChild(grid);
    } else {
      const table = document.createElement('div');
      table.className = 'explorer-table';
      const thead = document.createElement('div');
      thead.className = 'explorer-thead';
      thead.innerHTML =
        '<span class="col-name">Name</span><span>Days</span><span>Files</span><span>Size</span><span>Status</span>';
      table.appendChild(thead);
      items.forEach((item) => table.appendChild(folderRow(item)));
      body.appendChild(table);
    }
  }

  function renderFileSlots(month, day) {
    toolbar.classList.add('is-leaf');
    countEl.textContent = '';
    body.classList.add('explorer-file-view');
    body.innerHTML =
      '<div class="slot-summary" style="display:none;"></div>' +
      '<div class="file-list" data-loaded="false"><div class="explorer-loading">Memuat jadwal slot...</div></div>';

    const summary = body.querySelector('.slot-summary');
    const fileList = body.querySelector('.file-list');
    const myToken = ++requestToken;

  fetch('/api/files?month=' + encodeURIComponent(month) + '&day=' + encodeURIComponent(day))
    .then(async (res) => {
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Server error (${res.status}): respons bukan JSON. ${text.slice(0, 100)}`);
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      return data;
    })
    .then((data) => {
      if (myToken !== requestToken) return;

      renderFileList(fileList, data.schedule);

      summary.style.display = 'flex';
      summary.innerHTML =
        '<span class="dot-ok">' +
        data.existing_count +
        '</span> dari ' +
        data.total_slots +
        ' slot sudah terunduh &middot; <span class="dot-missing">' +
        (data.total_slots - data.existing_count) +
        '</span> belum ada';

      countEl.textContent =
        data.existing_count + ' / ' + data.total_slots + ' slots';
    })
    .catch((err) => {
      if (myToken !== requestToken) return;

      console.error('Gagal memuat file:', err);

      fileList.innerHTML =
        '<div class="explorer-loading">' +
        'Gagal memuat jadwal slot: ' +
        err.message +
        '</div>';
    });
  }

  function render() {
    const state = currentState();
    renderBreadcrumb(state);
    updateNavButtons();

    if (state.level === 'root') {
      renderRoot();
    } else if (state.level === 'month') {
      renderMonth(state.month);
    } else if (state.level === 'day') {
      renderFileSlots(state.month, state.day);
    }
  }

  render();
})();