// admin.js
(function () {
    // Config
    const API_LOGIN = '/api/login';
    const API_SETUP = '/api/setup-admin';
    const API_STATUS = '/api/admin-status';
    const API_UPLOAD = '/api/upload';
    const API_DELETE = '/api/delete';

    // State
    let authToken = sessionStorage.getItem('adminToken');
    let resources = [];
    const dropdownState = {
        class: { value: '', text: 'All Classes' },
        chapter: { value: '', text: 'All Chapters' }
    };

    // UI Elements - Auth
    const authModal = document.getElementById('authModal');
    const authForm = document.getElementById('authForm');
    const authTitle = document.getElementById('authTitle');
    const authEmail = document.getElementById('authEmail');
    const authPassword = document.getElementById('authPassword');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const authMessage = document.getElementById('authMessage');

    // UI Elements - Dashboard
    const grid = document.getElementById('grid');
    const searchBox = document.getElementById('searchBox');
    const uploadBtn = document.getElementById('uploadBtn');

    // Initialization
    async function init() {
        checkAuthStep();
    }

    // Check if we need to setup or login
    async function checkAuthStep() {
        try {
            const res = await fetch(API_STATUS);
            const status = await res.json();

            if (!status.setupComplete) {
                showSetupMode();
            } else if (!authToken) {
                showLoginMode();
            } else {
                // Logged in
                authModal.classList.remove('active');
                authModal.setAttribute('aria-hidden', 'true');
                loadResources();
            }
        } catch (e) {
            console.error('Failed to check status', e);
            authMessage.textContent = 'Failed to connect to server.';
        }
    }

    function showSetupMode() {
        authTitle.textContent = '⚙️ Admin Setup';
        authSubmitBtn.textContent = 'Create Admin Account';
        authModal.classList.add('active');
        authForm.onsubmit = handleSetup;
    }

    function showLoginMode() {
        authTitle.textContent = '🔒 Admin Login';
        authSubmitBtn.textContent = 'Login';
        authModal.classList.add('active');
        authForm.onsubmit = handleLogin;
    }

    async function handleSetup(e) {
        e.preventDefault();
        const email = authEmail.value;
        const password = authPassword.value;

        try {
            const res = await fetch(API_SETUP, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.success) {
                authMessage.innerHTML = '<span style="color:#10b981">Setup Complete! Please Login.</span>';
                setTimeout(() => showLoginMode(), 1500);
            } else {
                authMessage.innerHTML = `<span style="color:#ef4444">${data.message}</span>`;
            }
        } catch (err) {
            authMessage.textContent = err.message;
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const email = authEmail.value;
        const password = authPassword.value;

        try {
            const res = await fetch(API_LOGIN, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.success) {
                authToken = data.token;
                sessionStorage.setItem('adminToken', authToken);
                authModal.classList.remove('active');
                authMessage.textContent = '';
                loadResources();
            } else {
                authMessage.innerHTML = `<span style="color:#ef4444">${data.message}</span>`;
            }
        } catch (err) {
            authMessage.textContent = err.message;
        }
    }

    // --- Resource Loading (Simplified from app.js) ---
    async function loadResources() {
        try {
            const r = await fetch('resources.json', { cache: 'no-store' });
            resources = await r.json();
            render();
        } catch (e) {
            grid.textContent = "Error loading resources.";
        }
    }

    function render() {
        grid.innerHTML = '';
        const q = (searchBox.value || '').toLowerCase();

        // Sort logic
        const filtered = resources.filter(r =>
            (r.title + r.chapter).toLowerCase().includes(q)
        );

        filtered.forEach(r => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
        <div class="card-body">
          <h3>${r.title || r.file}</h3>
          <div class="meta">${r.class} · ${r.chapter}</div>
          <div class="actions">
             <a href="${r.file}" target="_blank" class="action">View</a>
             <button class="action action-delete" onclick="window.confirmDelete('${r.id}')">🗑️ Delete</button>
          </div>
        </div>
      `;
            grid.appendChild(card);
        });
    }

    searchBox.addEventListener('input', render);

    // --- Delete Logic ---
    window.confirmDelete = (id) => {
        const r = resources.find(x => x.id === id);
        if (!r) return;
        if (confirm(`Delete "${r.title}" permanently?`)) {
            doDelete(r);
        }
    };

    async function doDelete(r) {
        try {
            const res = await fetch(API_DELETE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ resourceId: r.id, file: r.file })
            });
            const data = await res.json();
            if (data.success) {
                loadResources(); // Reload
            } else {
                alert("Delete failed: " + data.message);
            }
        } catch (err) {
            alert("Delete error: " + err.message);
        }
    }

    // --- Upload Logic ---
    const uploadModal = document.getElementById('uploadModal');
    const uploadForm = document.getElementById('uploadForm');

    uploadBtn.onclick = () => {
        uploadModal.classList.add('active');
        uploadModal.setAttribute('aria-hidden', 'false');
    };

    document.getElementById('closeUploadBtn').onclick = closeUpload;
    document.getElementById('cancelUploadBtn').onclick = closeUpload;

    function closeUpload() {
        uploadModal.classList.remove('active');
        uploadModal.setAttribute('aria-hidden', 'true');
        uploadForm.reset();
        document.getElementById('uploadMessage').innerHTML = '';
    }

    // --- Chapter Population (Copied from app.js logic) ---
    const BOTANY_CHAPTERS = {
        "11": [
            "The Living World", "Biological Classification", "Plant Kingdom",
            "Morphology of Flowering Plants", "Anatomy of Flowering Plants",
            "Cell The unit of Life", "Cell Cycle and Cell Division",
            "Photosynthesis in Higher Plants", "Respiration in Plants",
            "Plant Growth and Development"
        ],
        "12": [
            "Sexual Reproduction in Flowering Plants", "Principle of Inheritance and Variation",
            "Molecular Basis of Inheritance", "Microbes in Human Welfare",
            "Organisms and Populations", "Ecosystem", "Biodiversity and Conservation"
        ]
    };

    const classSelect = document.getElementById('classSelect');
    const chapterInput = document.getElementById('chapterInput');

    classSelect.addEventListener('change', () => {
        const cls = classSelect.value;
        chapterInput.innerHTML = '<option value="">-- Select Chapter --</option>';
        if (cls && BOTANY_CHAPTERS[cls]) {
            BOTANY_CHAPTERS[cls].forEach(ch => {
                const opt = document.createElement('option');
                opt.value = ch; opt.textContent = ch;
                chapterInput.appendChild(opt);
            });
        }
    });

    uploadForm.onsubmit = async (e) => {
        e.preventDefault();

        // Quick validation
        const cls = classSelect.value;
        const chap = chapterInput.value;
        const files = document.getElementById('fileInput').files;

        if (!cls || !chap || files.length === 0) {
            alert("Please fill all fields"); return;
        }

        const fd = new FormData();
        fd.append('class', cls);
        fd.append('chapter', chap);
        // tags logic omitted for brevity in admin.js, can add if needed
        for (let f of files) fd.append('files', f);

        document.getElementById('uploadProgress').style.display = 'block';

        try {
            const res = await fetch(API_UPLOAD, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` },
                body: fd
            });
            const data = await res.json();
            document.getElementById('uploadProgress').style.display = 'none';

            if (data.success) {
                document.getElementById('uploadMessage').innerHTML = '<span style="color:#10b981">Success!</span>';
                setTimeout(() => {
                    closeUpload();
                    loadResources();
                }, 1000);
            } else {
                document.getElementById('uploadMessage').innerHTML = `<span style="color:#ef4444">${data.message}</span>`;
            }
        } catch (err) {
            document.getElementById('uploadMessage').textContent = err.message;
        }
    };

    init();
})();
