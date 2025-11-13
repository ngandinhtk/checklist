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

    const dateKey = document.getElementById('dateInput').value;
    if (dateKey) {
        // Tải dữ liệu hiện có trong ngày để kiểm tra cờ cảnh báo
        loadData(dateKey).then(oldData => {
            const alreadyShown = oldData && oldData.meta && oldData.meta.completionAlertShown;

            // Chỉ hiển thị cảnh báo nếu chúng ta vừa đạt 100% và nó chưa được hiển thị trước đó
            if (percent === 100 && !alreadyShown) {
                alert('🎉 CHÚC MỪNG! Bạn đã hoàn thành 100% checklist hôm nay! Bạn là chiến binh thật sự! 💪');
            }

            const dayNumber = document.getElementById('dayNumber').value || '';
            const notesEl = document.querySelector('.notes-section textarea');
            const notes = notesEl ? notesEl.value : '';

            // Giữ nguyên siêu dữ liệu hiện có
            const oldMeta = (oldData && oldData.meta) ? oldData.meta : {};

            const saveObj = {
                state: state,
                meta: {
                    ...oldMeta,
                    dayNumber: dayNumber,
                    notes: notes,
                    savedAt: (new Date()).toISOString(),
                    // Đặt cờ thành true nếu nó đã đúng hoặc nếu chúng ta đang ở mức 100%
                    completionAlertShown: alreadyShown || (percent === 100)
                }
            };

            saveData(dateKey, saveObj)
                .then(() => showSavedBadge())
                .catch(e => console.error('Lỗi lưu IndexedDB', e));
        }).catch(e => console.error('Lỗi tải dữ liệu trong updateStats', e));
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
    // Tự động xóa dữ liệu cũ hơn 14 ngày khi tải
    clearOldData(14).then(() => {
        console.log('Đã xóa dữ liệu cũ hơn 14 ngày.');
    }).catch(err => {
        console.error('Lỗi khi xóa dữ liệu cũ:', err);
    });

    const dateKey = document.getElementById('dateInput').value;
    if (dateKey) {
        loadData(dateKey).then(raw => {
            if (raw) {
                try {
                    const parsed = raw;
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
            } else {
                // Nếu không có dữ liệu cho ngày này, hãy đặt lại số liệu thống kê về 0.
                document.getElementById('completedToday').textContent = 0;
                document.getElementById('totalTasks').textContent = document.querySelectorAll('input[type="checkbox"]').length;
                document.getElementById('percentComplete').textContent = '0%';
            }
        });
    }
    // attach auto-save for notes and dayNumber
    const notesEl = document.querySelector('.notes-section textarea');
    if (notesEl) notesEl.addEventListener('input', debounce(updateStats, 400));
    const dayNum = document.getElementById('dayNumber');
    if (dayNum) dayNum.addEventListener('change', updateStats);
    loadReviews();
});

// Cập nhật khi đổi ngày
document.getElementById('dateInput').addEventListener('change', function() {
    // Bỏ check tất cả
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    // clear notes/dayNumber UI before load
    const notesEl = document.querySelector('.notes-section textarea'); if (notesEl) notesEl.value = '';
    document.getElementById('dayNumber').value = '';

    // Load lại trạng thái của ngày mới
    window.dispatchEvent(new Event('load'));
});

// Logic checkComplete hiện được tích hợp vào updateStats để ngăn chặn nhiều cảnh báo.

// --- Lịch sử: scan localStorage, render và thao tác ---
async function getAllChecklistKeys() {
    return await getAllKeys();
}

function parseDateFromKey(key) {
    // key format: checklist_YYYY-MM-DD
    return key.replace('checklist_', '');
}

function getStatsFromState(state, total) {
    const ids = Object.keys(state);
    let completed = 0;
    ids.forEach(id => { if (state[id]) completed++; });
    const percent = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
}

function daysBetween(dateA, dateB) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((dateB - dateA) / msPerDay);
}

async function showHistory(mode = '90') {
    const listEl = document.getElementById('historyList');
    listEl.innerHTML = '';

    const entries = await getAllData();

    // sort desc
    entries.sort((a,b) => b.date.localeCompare(a.date));

    const today = new Date();
    const limitDays = 90;
    const totalTasks = document.querySelectorAll('input[type="checkbox"]').length;

    entries.forEach(entry => {
        const entryDate = new Date(entry.date + 'T00:00:00');
        const age = daysBetween(entryDate, today);
        if (mode === '90' && age > limitDays) return; // skip older than 90 when in 90 mode

        const item = document.createElement('div');
        item.className = 'history-item' + (age >= limitDays ? ' old-90' : '');

        const left = document.createElement('div');
        left.innerHTML = `<strong>${entry.date}</strong><div class="small-muted">${age} ngày trước</div>`;

        const stats = getStatsFromState(entry.state, totalTasks);
        const right = document.createElement('div');
        right.innerHTML = `${stats.completed}/${stats.total} — ${stats.percent}%`;

        item.appendChild(left);
        item.appendChild(right);

        // click to load that day's state into the UI
        item.style.cursor = 'pointer';
        item.title = 'Nhấp để xem và tải trạng thái vào giao diện';
        item.addEventListener('click', () => {
            const state = entry.state;
            // clear current
            document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            Object.keys(state).forEach(id => {
                const cb = document.getElementById(id);
                if (cb) cb.checked = state[id];
            });
            document.getElementById('dateInput').value = entry.date;
            // restore meta
            if (entry.meta) {
                if (entry.meta.dayNumber) document.getElementById('dayNumber').value = entry.meta.dayNumber;
                const notesEl = document.querySelector('.notes-section textarea');
                if (notesEl && entry.meta.notes) notesEl.value = entry.meta.notes;
            }
            updateStats();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            openTab(null, 'checklistTab');
        });

        listEl.appendChild(item);
    });

    if (entries.length === 0) {
        listEl.innerHTML = '<div class="small-muted">Chưa có dữ liệu lịch sử. Hãy hoàn thành checklist hôm nay để lưu lại.</div>';
    }
}

async function exportHistory() {
    const allData = await getAllData();
    const out = {};
    allData.forEach(item => {
        out[item.date] = item;
    });
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
    if (!confirm('Bạn có chắc muốn xóa toàn bộ lịch sử checklist (dữ liệu IndexedDB)? Hành động này không thể hoàn tác.')) return;
    clearHistory().then(() => {
        showHistory('all');
        alert('Đã xóa lịch sử.');
    });
}

function openTab(evt, tabName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-link");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    if(evt) evt.currentTarget.className += " active";

    if(tabName === 'toolsTab'){
        showHistory('90');
    }
    if (tabName === 'reviewTab') {
        loadReviews();
    }
}

// --- Affirmations ---
const affirmations = [
    "Tôi chọn sự bình yên.",
    "Tiền bạc đến với tôi một cách dễ dàng và tự nhiên.",
    "Tôi xứng đáng với tất cả những điều tốt đẹp trong cuộc sống.",
    // "Hôm nay là một ngày tuyệt vời.",
    "Tôi mạnh mẽ hơn tôi nghĩ.",
    "Tôi thu hút cơ hội và thành công.",
    "Tôi biết ơn vì tất cả những gì tôi có.",
    "Tôi tin tưởng vào khả năng của bản thân.",
    "Mỗi ngày tôi đều học hỏi và phát triển.",
    "Tôi được yêu thương và ủng hộ.",
    "Tôi tạo ra thực tại yêu thương và hạnh phúc cho mình.",
    "Tôi tha thứ cho bản thân và những người khác.",
    "Tôi kỷ luật mỗi ngày.",
    "Hãy dành cho bản thân sự tôn trọng và hoà nhã.",
    "Tôi kiểm soát được cảm xúc của mình.",
    "Tôi thu hút những người tích cực và truyền cảm hứng.",
    "Tôi tập trung vào mục tiêu",
    "Tôi là một thỏi nam châm hút tiền.",
    "Sự giàu có đang chảy vào cuộc sống của tôi.",
    "Tôi can đảm đối mặt với mọi thử thách.",
    "Tôi luôn giữ thái độ tích cực.",
    "Tôi tự hào về con người tôi đang trở thành.",
    "Tôi buông bỏ những năng lượng cũ không phải của tôi.",
    "Vũ trụ luôn ủng hộ tôi."
];

const affirmationText = document.getElementById('affirmationText');
const newAffirmationBtn = document.getElementById('newAffirmationBtn');

function showNewAffirmation() {
    const randomIndex = Math.floor(Math.random() * affirmations.length);
    affirmationText.textContent = affirmations[randomIndex];
}

// Show a new affirmation on page load
window.addEventListener('load', showNewAffirmation);

// Show a new affirmation when the button is clicked
if (newAffirmationBtn) {
    newAffirmationBtn.addEventListener('click', showNewAffirmation);
}

// --- Review Section ---

async function loadReviews() {
    const reviewList = document.getElementById('reviewList');
    reviewList.innerHTML = '';
    const reviews = await getAllReviews();

    if (reviews.length === 0) {
        reviewList.innerHTML = '<div class="small-muted">Chưa có review nào.</div>';
        return;
    }

    // Sort reviews by date, newest first
    reviews.sort((a, b) => new Date(b.date) - new Date(a.date));

    reviews.forEach(review => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const content = document.createElement('div');
        content.className = 'review-content';

        const text = document.createElement('p');
        text.textContent = review.text;

        const date = document.createElement('div');
        date.className = 'small-muted';
        date.textContent = new Date(review.date).toLocaleString();

        content.appendChild(text);
        content.appendChild(date);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-review-btn';
        deleteBtn.textContent = 'Xóa';
        deleteBtn.onclick = () => handleDeleteReview(review.id);

        item.appendChild(content);
        item.appendChild(deleteBtn);
        reviewList.appendChild(item);
    });
}

async function handleDeleteReview(reviewId) {
    if (confirm('Bạn có chắc muốn xóa review này?')) {
        await deleteReview(reviewId);
        await loadReviews();
    }
}

document.getElementById('addReviewBtn').addEventListener('click', async () => {
    const reviewInput = document.getElementById('reviewInput');
    const reviewText = reviewInput.value.trim();
    if (reviewText) {
        const reviewDate = new Date().toISOString();
        await addReview(reviewText, reviewDate);
        reviewInput.value = '';
        await loadReviews();
    }
});