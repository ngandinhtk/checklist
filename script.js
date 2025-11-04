// Extracted script from index.html

// Tự động điền ngày hôm nay
document.getElementById('dateInput').valueAsDate = new Date();

// Cập nhật thống kê và lưu trạng thái (cùng metadata: ngày thứ, ghi chú, timestamp)
function showSavedBadge() {
    const b = document.getElementById('savedBadge');
    if (!b) return;
    b.style.opacity = '1';
    clearTimeout(b._hideTimeout);
    b._hideTimeout = setTimeout(() => { b.style.opacity = '0'; }, 1600);
}

function updateStats() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const total = checkboxes.length;
    let completed = 0;

    const state = {};
    checkboxes.forEach(cb => {
        state[cb.id] = cb.checked;
        if (cb.checked) completed++;
    });

    const percent = Math.round((completed / total) * 100);

    document.getElementById('completedToday').textContent = completed;
    document.getElementById('totalTasks').textContent = total;
    document.getElementById('percentComplete').textContent = percent + '%';

    // Lưu vào localStorage với metadata
    const dateKey = document.getElementById('dateInput').value;
    if (dateKey) {
        const dayNumber = document.getElementById('dayNumber').value || '';
        const notesEl = document.querySelector('.notes-section textarea');
        const notes = notesEl ? notesEl.value : '';

        const saveObj = {
            state: state,
            meta: {
                dayNumber: dayNumber,
                notes: notes,
                savedAt: (new Date()).toISOString()
            }
        };

        try {
            localStorage.setItem('checklist_' + dateKey, JSON.stringify(saveObj));
            showSavedBadge();
        } catch (e) {
            console.error('Lỗi lưu localStorage', e);
        }
    }
}

// tiny debounce helper
function debounce(fn, wait) {
    let t;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

// Khôi phục trạng thái khi load lại trang
window.addEventListener('load', function() {
    const dateKey = document.getElementById('dateInput').value;
    if (dateKey) {
        const raw = localStorage.getItem('checklist_' + dateKey);
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                const state = parsed && parsed.state ? parsed.state : parsed;
                Object.keys(state).forEach(id => {
                    const checkbox = document.getElementById(id);
                    if (checkbox) {
                        checkbox.checked = state[id];
                    }
                });
                // restore metadata if present
                if (parsed && parsed.meta) {
                    if (parsed.meta.dayNumber) document.getElementById('dayNumber').value = parsed.meta.dayNumber;
                    const notesEl = document.querySelector('.notes-section textarea');
                    if (notesEl && parsed.meta.notes) notesEl.value = parsed.meta.notes;
                }
                updateStats();
            } catch (e) {
                console.error('Lỗi parse saved state', e);
            }
        }
    }
    // attach auto-save for notes and dayNumber
    const notesEl = document.querySelector('.notes-section textarea');
    if (notesEl) notesEl.addEventListener('input', debounce(updateStats, 400));
    const dayNum = document.getElementById('dayNumber');
    if (dayNum) dayNum.addEventListener('change', updateStats);
});

// Cập nhật khi đổi ngày
document.getElementById('dateInput').addEventListener('change', function() {
    // Bỏ check tất cả
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    // clear notes/dayNumber UI before load
    const notesEl = document.querySelector('.notes-section textarea'); if (notesEl) notesEl.value = '';
    document.getElementById('dayNumber').value = '';
    updateStats();

    // Load lại trạng thái của ngày mới
    window.dispatchEvent(new Event('load'));
    // refresh history list
    showHistory('90');
});

// Hiệu ứng confetti khi hoàn thành 100%
function checkComplete() {
    const percent = parseInt(document.getElementById('percentComplete').textContent);
    if (percent === 100) {
        alert('🎉 CHÚC MỪNG! Bạn đã hoàn thành 100% checklist hôm nay! Bạn là chiến binh thật sự! 💪');
    }
}

// Gọi checkComplete mỗi lần update
const originalUpdate = updateStats;
updateStats = function() {
    originalUpdate();
    checkComplete();
};

// --- Lịch sử: scan localStorage, render và thao tác ---
function getAllChecklistKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('checklist_')) keys.push(k);
    }
    return keys;
}

function parseDateFromKey(key) {
    // key format: checklist_YYYY-MM-DD
    return key.replace('checklist_', '');
}

function getStatsFromState(state) {
    const ids = Object.keys(state);
    const total = ids.length;
    let completed = 0;
    ids.forEach(id => { if (state[id]) completed++; });
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
}

function daysBetween(dateA, dateB) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((dateB - dateA) / msPerDay);
}

function showHistory(mode = '90') {
    const listEl = document.getElementById('historyList');
    listEl.innerHTML = '';

    const keys = getAllChecklistKeys();
    const entries = keys.map(k => {
        const d = parseDateFromKey(k);
        const raw = localStorage.getItem(k);
        let parsed = {};
        try { parsed = JSON.parse(raw) || {}; } catch (e) { parsed = {}; }
        const state = parsed && parsed.state ? parsed.state : parsed;
        const stats = getStatsFromState(state);
        return { key: k, date: d, stats, meta: parsed && parsed.meta ? parsed.meta : null };
    });

    // sort desc
    entries.sort((a,b) => b.date.localeCompare(a.date));

    const today = new Date();
    const limitDays = 90;

    entries.forEach(entry => {
        const entryDate = new Date(entry.date + 'T00:00:00');
        const age = daysBetween(entryDate, today);
        if (mode === '90' && age > limitDays) return; // skip older than 90 when in 90 mode

        const item = document.createElement('div');
        item.className = 'history-item' + (age >= limitDays ? ' old-90' : '');

        const left = document.createElement('div');
        left.innerHTML = `<strong>${entry.date}</strong><div class="small-muted">${age} ngày trước</div>`;

        const right = document.createElement('div');
        right.innerHTML = `${entry.stats.completed}/${entry.stats.total} — ${entry.stats.percent}%`;

        item.appendChild(left);
        item.appendChild(right);

        // click to load that day's state into the UI
        item.style.cursor = 'pointer';
        item.title = 'Nhấp để xem và tải trạng thái vào giao diện';
        item.addEventListener('click', () => {
            const saved = localStorage.getItem(entry.key);
            if (!saved) return;
            let parsed = {};
            try { parsed = JSON.parse(saved); } catch (e) { parsed = {}; }
            const state = parsed && parsed.state ? parsed.state : parsed;
            // clear current
            document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            Object.keys(state).forEach(id => {
                const cb = document.getElementById(id);
                if (cb) cb.checked = state[id];
            });
            document.getElementById('dateInput').value = entry.date;
            // restore meta
            if (parsed && parsed.meta) {
                if (parsed.meta.dayNumber) document.getElementById('dayNumber').value = parsed.meta.dayNumber;
                const notesEl = document.querySelector('.notes-section textarea');
                if (notesEl && parsed.meta.notes) notesEl.value = parsed.meta.notes;
            }
            updateStats();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        listEl.appendChild(item);
    });

    if (entries.length === 0) {
        listEl.innerHTML = '<div class="small-muted">Chưa có dữ liệu lịch sử. Hãy hoàn thành checklist hôm nay để lưu lại.</div>';
    }
}

function exportHistory() {
    const keys = getAllChecklistKeys();
    const out = {};
    keys.forEach(k => { out[k.replace('checklist_', '')] = JSON.parse(localStorage.getItem(k)); });
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'checklist-history.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function clearHistoryConfirm() {
    if (!confirm('Bạn có chắc muốn xóa toàn bộ lịch sử checklist (dữ liệu localStorage)? Hành động này không thể hoàn tác.')) return;
    const keys = getAllChecklistKeys();
    keys.forEach(k => localStorage.removeItem(k));
    showHistory('all');
    alert('Đã xóa lịch sử.');
}

// show 90-day history on load
window.addEventListener('load', function() {
    showHistory('90');
});
