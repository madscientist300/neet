// app.js
// Requires: pdf.js included in index.html
(function () {
  // Elements - Custom Dropdowns
  const classFilterWrapper = document.getElementById('classFilterWrapper');
  const chapterFilterWrapper = document.getElementById('chapterFilterWrapper');
  const tagFilterWrapper = document.getElementById('tagFilterWrapper');
  const searchBox = document.getElementById('searchBox');
  const resetBtn = document.getElementById('resetBtn');
  const grid = document.getElementById('grid');
  const noresult = document.getElementById('noresult');

  // Custom Dropdown State
  const dropdownState = {
    class: { value: '', text: 'All Classes' },
    chapter: { value: '', text: 'All Chapters' },
    tag: { value: '', text: 'All Concepts/Tags' }
  };

  // Initialize Custom Dropdowns
  function initCustomDropdowns() {
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.custom-select')) {
        closeAllDropdowns();
      }
    });

    // Setup each dropdown
    setupDropdown(classFilterWrapper, 'class', (value, text) => {
      dropdownState.class = { value, text };
      populateChapterOptions();
      dropdownState.chapter = { value: '', text: 'All Chapters' };
      updateDropdownDisplay(chapterFilterWrapper, dropdownState.chapter.text);
      populateTagOptions();
      dropdownState.tag = { value: '', text: 'All Concepts/Tags' };
      updateDropdownDisplay(tagFilterWrapper, dropdownState.tag.text);
      render();
    });

    setupDropdown(chapterFilterWrapper, 'chapter', (value, text) => {
      dropdownState.chapter = { value, text };
      populateTagOptions();
      dropdownState.tag = { value: '', text: 'All Concepts/Tags' };
      updateDropdownDisplay(tagFilterWrapper, dropdownState.tag.text);
      render();
    });

    setupDropdown(tagFilterWrapper, 'tag', (value, text) => {
      dropdownState.tag = { value, text };
      render();
    });
  }

  function setupDropdown(wrapper, filterType, onChange) {
    const trigger = wrapper.querySelector('.select-trigger');
    const options = wrapper.querySelector('.select-options');

    // Toggle dropdown on trigger click
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = wrapper.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) {
        wrapper.classList.add('open');
      }
    });

    options.addEventListener('click', (e) => {
      const option = e.target.closest('.select-option');
      if (option) {
        const value = option.dataset.value;
        const text = option.textContent;

        // Update selected state
        options.querySelectorAll('.select-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        // Update trigger text
        updateDropdownDisplay(wrapper, text);

        // Close dropdown
        wrapper.classList.remove('open');

        // Trigger change callback
        if (onChange) onChange(value, text);
      }
    });
  }

  function updateDropdownDisplay(wrapper, text) {
    const textEl = wrapper.querySelector('.select-text');
    textEl.textContent = text;
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.custom-select').forEach(dropdown => {
      dropdown.classList.remove('open');
    });
  }

  function populateDropdownOptions(wrapper, options, selectedValue = '') {
    const optionsContainer = wrapper.querySelector('.select-options');
    optionsContainer.innerHTML = '';

    options.forEach(({ value, text }) => {
      const option = document.createElement('div');
      option.className = 'select-option';
      option.dataset.value = value;
      option.textContent = text;
      if (value === selectedValue) {
        option.classList.add('selected');
      }
      optionsContainer.appendChild(option);
    });
  }

  // pdf.js worker
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3/build/pdf.worker.min.js';

  let resources = [];
  const thumbCache = new Map(); // file -> url or dataURL
  const generating = new Map(); // file -> promise

  // helpers
  const unique = arr => [...new Set(arr || [])];
  const debounce = (fn, ms = 220) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // IntersectionObserver to lazy-generate thumbnails when card enters viewport
  const observer = new IntersectionObserver(entries => {
    for (const ent of entries) {
      if (ent.isIntersecting) {
        const el = ent.target;
        observer.unobserve(el);
        const id = el.dataset.id;
        const res = resources.find(r => r.id === id);
        if (res) ensureThumbnailForResource(res, el);
      }
    }
  }, { root: null, rootMargin: '400px', threshold: 0.08 });

  async function loadResources() {
    try {
      const r = await fetch('resources.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('resources.json not found');
      resources = await r.json();
      if (!Array.isArray(resources)) resources = [];

      // normalize
      resources.forEach(x => {
        x._classNorm = (x.class || '').toString().trim().toLowerCase();
        x._chapterNorm = (x.chapter || '').toString().trim().toLowerCase();
        x._tagsNorm = (x.tags || []).map(t => t.toString().trim().toLowerCase());
        x._searchHay = ((x.title || '') + ' ' + (x.topic || '') + ' ' + (x.chapter || '') + ' ' + (x.tags || []).join(' ') + ' ' + (x.file || '')).toLowerCase();
      });

      buildFilters();
      render();
    } catch (e) {
      grid.innerHTML = `<div class="empty">Could not load resources.json: ${e.message}</div>`;
      console.error(e);
    }
  }

  // dynamic filters (same approach)
  function getFilteredResourcesForFilters() {
    const cls = dropdownState.class.value.toString().trim().toLowerCase();
    const chap = dropdownState.chapter.value.toString().trim().toLowerCase();
    return resources.filter(r => {
      if (cls && (r._classNorm || '') !== cls) return false;
      if (chap && (r._chapterNorm || '') !== chap) return false;
      return true;
    });
  }

  function populateChapterOptions() {
    const cls = dropdownState.class.value.toString().trim().toLowerCase();
    const filtered = resources.filter(r => !cls || (r._classNorm === cls));
    const chapters = unique(filtered.map(r => r.chapter || 'Unknown')).sort((a, b) => a.localeCompare(b));

    const options = [{ value: '', text: 'All Chapters' }];
    chapters.forEach(ch => options.push({ value: ch, text: ch }));

    populateDropdownOptions(chapterFilterWrapper, options, dropdownState.chapter.value);
  }

  function populateTagOptions() {
    const filtered = getFilteredResourcesForFilters();
    const tags = unique(filtered.flatMap(r => r.tags || [])).sort((a, b) => a.localeCompare(b));

    const options = [{ value: '', text: 'All Concepts/Tags' }];
    tags.forEach(t => options.push({ value: t, text: t }));

    populateDropdownOptions(tagFilterWrapper, options, dropdownState.tag.value);
  }

  function buildFilters() {
    const classes = unique(resources.map(r => r.class || 'Unclassed')).sort((a, b) => a.localeCompare(b));

    const classOptions = [{ value: '', text: 'All Classes' }];
    classes.forEach(c => classOptions.push({ value: c, text: c }));

    populateDropdownOptions(classFilterWrapper, classOptions, '');
    populateChapterOptions();
    populateTagOptions();
  }

  function render() {
    const classVal = dropdownState.class.value.toString().toLowerCase().trim();
    const chapVal = dropdownState.chapter.value.toString().toLowerCase().trim();
    const tagVal = dropdownState.tag.value.toString().toLowerCase().trim();
    const q = (searchBox.value || '').trim().toLowerCase();

    const filtered = resources.filter(r => {
      if (classVal && (r._classNorm || '') !== classVal) return false;
      if (chapVal && (r._chapterNorm || '') !== chapVal) return false;
      if (tagVal && !(r._tagsNorm || []).includes(tagVal)) return false;
      if (q && !(r._searchHay || '').includes(q)) return false;
      return true;
    });

    grid.innerHTML = '';
    if (filtered.length === 0) { noresult.style.display = 'block'; return; } else { noresult.style.display = 'none'; }

    const frag = document.createDocumentFragment();
    for (const r of filtered) frag.appendChild(buildCard(r));
    grid.appendChild(frag);

    // observe for thumbnails (lazy generation)
    grid.querySelectorAll('.card').forEach(card => {
      observer.observe(card);
    });
  }



  // determine type label and class for badge
  function badgeForResource(res) {
    const t = (res.type || '').toString().toLowerCase();
    if (t === 'pdf') return { cls: 'pdf', label: 'PDF', icon: pdfIcon() };
    if (t === 'image') return { cls: 'image', label: 'Image', icon: imageIcon() };
    if (t === 'url') return { cls: 'url', label: 'Link', icon: linkIcon() };
    // fallback: treat as file
    return { cls: 'file', label: 'File', icon: fileIcon() };
  }

  // small inline SVG icons (kept tiny)
  function pdfIcon() { return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="18" height="22" x="3" y="1" rx="2" fill="#fff"/><path d="M7 8h10" stroke="#000" stroke-width="1.2" stroke-linecap="round"/></svg>`; }
  function imageIcon() { return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="14" x="2" y="4" rx="1.5" fill="#fff"/><circle cx="8.5" cy="8.5" r="1.8" fill="#000"/></svg>`; }
  function linkIcon() { return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 14a3.5 3.5 0 010-4.95l3-3a3.5 3.5 0 014.95 4.95l-1 1" stroke="#000" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 10a3.5 3.5 0 010 4.95l-3 3a3.5 3.5 0 01-4.95-4.95l1-1" stroke="#000" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
  function fileIcon() { return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="20" x="4" y="2" rx="2" fill="#fff"/><path d="M8 8h8" stroke="#000" stroke-width="1.2" stroke-linecap="round"/></svg>`; }

  // build DOM card (with badge)
  function buildCard(r) {
    const card = document.createElement('div'); card.className = 'card';
    card.dataset.id = r.id || '';
    card.dataset.file = r.file || '';

    // thumbnail area
    const tw = document.createElement('div'); tw.className = 'thumb-wrap';
    const img = document.createElement('img'); img.className = 'thumb'; img.alt = r.title || '';
    const pre = r.thumbnail || guessThumbPath(r.file);
    if (pre) {
      img.src = pre;
    } else {
      img.src = placeholderSVG(320, 180);
      const spinner = document.createElement('div'); spinner.className = 'thumb-spinner';
      const dot = document.createElement('div'); dot.className = 'spinner-dot'; spinner.appendChild(dot);
      tw.appendChild(spinner);
    }
    tw.appendChild(img);

    // badge
    const badgeInfo = badgeForResource(r);
    const badge = document.createElement('div'); badge.className = `file-badge ${badgeInfo.cls}`;
    badge.setAttribute('aria-hidden', 'true');
    // insert icon + label (use innerHTML just for SVG small trusted strings)
    badge.innerHTML = `${badgeInfo.icon}<span>${badgeInfo.label}</span>`;
    tw.appendChild(badge);

    card.appendChild(tw);

    // body
    const body = document.createElement('div'); body.className = 'card-body';
    const h = document.createElement('h3'); h.textContent = r.title || r.file || 'Untitled'; body.appendChild(h);
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `Class: ${r.class || '-'} · Chapter: ${r.chapter || '-'}`; body.appendChild(meta);
    const topic = document.createElement('div'); topic.style.fontSize = '13px'; topic.style.color = 'var(--muted)'; topic.textContent = r.topic || '—'; body.appendChild(topic);
    const tagsWrap = document.createElement('div'); tagsWrap.className = 'tags'; (r.tags || []).forEach(tg => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = tg; tagsWrap.appendChild(s); }); body.appendChild(tagsWrap);

    const actions = document.createElement('div'); actions.className = 'actions';
    if (r.type === 'url') { const a = document.createElement('a'); a.className = 'action'; a.href = r.file; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open Link'; actions.appendChild(a); }
    const pbtn = document.createElement('button'); pbtn.className = 'action'; pbtn.type = 'button'; pbtn.textContent = 'Preview'; pbtn.addEventListener('click', () => openPreviewByResource(r)); actions.appendChild(pbtn);
    const obtn = document.createElement('button'); obtn.className = 'action'; obtn.type = 'button'; obtn.textContent = 'Open file'; obtn.addEventListener('click', () => openResource(r.file)); actions.appendChild(obtn);

    if (backendAvailable) {
      const dbtn = document.createElement('button'); dbtn.className = 'action action-delete'; dbtn.type = 'button'; dbtn.textContent = '♻️'; dbtn.setAttribute('aria-label', 'Delete'); dbtn.addEventListener('click', () => openDeleteModal(r)); actions.appendChild(dbtn);
    }

    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  function placeholderSVG(w = 320, h = 180) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><rect width='100%' height='100%' fill='#071a2a'/><text x='50%' y='50%' fill='#7dd3fc' font-size='16' text-anchor='middle' dominant-baseline='middle'>No preview</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function guessThumbPath(file) {
    if (!file) return null;
    try {
      const parts = file.split('/');
      const name = parts[parts.length - 1];
      const base = name.replace(/\.[^/.]+$/, '');
      const guess = `resources/thumbs/${base}.png`;
      return guess;
    } catch (e) { return null; }
  }

  // ensureThumbnailForResource: prefer pre-generated, else generate (pdf only)
  async function ensureThumbnailForResource(res, cardEl) {
    const img = cardEl.querySelector('.thumb');
    const spinner = cardEl.querySelector('.thumb-spinner');

    if (res.thumbnail) {
      img.src = res.thumbnail;
      if (spinner) spinner.remove();
      return;
    }

    const guessed = guessThumbPath(res.file);
    if (guessed) {
      try {
        const h = await fetch(guessed, { method: 'HEAD' });
        if (h.ok) {
          img.src = guessed;
          if (spinner) spinner.remove();
          return;
        }
      } catch (e) { }
    }

    if (res.type === 'image') {
      img.src = res.file;
      if (spinner) spinner.remove();
      return;
    }

    if (res.type === 'pdf') {
      if (thumbCache.has(res.file)) {
        img.src = thumbCache.get(res.file);
        if (spinner) spinner.remove();
        return;
      }
      if (generating.has(res.file)) {
        try { const url = await generating.get(res.file); if (url) img.src = url; } catch (e) { }
        if (spinner) spinner.remove();
        return;
      }
      const p = (async () => {
        try {
          const pdfDoc = await pdfjsLib.getDocument(res.file).promise;
          const page = await pdfDoc.getPage(1);
          const scale = 0.28;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          const ratio = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = Math.floor(viewport.width) + 'px';
          canvas.style.height = Math.floor(viewport.height) + 'px';
          const ctx = canvas.getContext('2d');
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL('image/png');
          thumbCache.set(res.file, dataUrl);
          return dataUrl;
        } catch (e) {
          console.warn('Thumbnail generation failed', e);
          return null;
        }
      })();
      generating.set(res.file, p);
      const url = await p;
      generating.delete(res.file);
      if (url) img.src = url;
      if (spinner) spinner.remove();
      return;
    }

    if (spinner) spinner.remove();
  }

  // basic preview / open functions
  function openResource(url) {
    if (!url) return;
    const w = window.open(url, '_blank');
    if (!w) alert('Browser blocked opening the file. Try right-click → Open in new tab.');
  }

  // simplified modal preview
  async function openPreviewByResource(res) {
    if (res.type === 'image') {
      const modalEl = document.getElementById('modal');
      modalEl.innerHTML = '';
      modalEl.classList.add('active');
      modalEl.setAttribute('aria-hidden', 'false');
      const wrap = document.createElement('div'); wrap.className = 'viewer';
      const top = document.createElement('div'); top.className = 'top';
      const title = document.createElement('div'); title.id = 'vtitle'; title.textContent = res.title || '';
      const close = document.createElement('button'); close.textContent = 'Close'; close.addEventListener('click', () => { modalEl.classList.remove('active'); modalEl.setAttribute('aria-hidden', 'true'); modalEl.innerHTML = ''; });
      top.appendChild(title); top.appendChild(close); wrap.appendChild(top);
      const body = document.createElement('div'); body.style.flex = '1'; body.style.display = 'flex'; body.style.alignItems = 'center'; body.style.justifyContent = 'center';
      const img = document.createElement('img'); img.src = res.file; img.style.maxWidth = '95%'; img.style.maxHeight = '95%'; body.appendChild(img); wrap.appendChild(body);
      modalEl.appendChild(wrap);
      return;
    }
    if (res.type === 'pdf') {
      const modalEl = document.getElementById('modal');
      modalEl.innerHTML = '';
      modalEl.classList.add('active');
      modalEl.setAttribute('aria-hidden', 'false');

      // build viewer wrapper
      const wrap = document.createElement('div'); wrap.className = 'viewer';
      const top = document.createElement('div'); top.className = 'top';
      const title = document.createElement('div'); title.id = 'vtitle'; title.textContent = res.title || '';
      const close = document.createElement('button'); close.textContent = 'Close';
      close.addEventListener('click', () => { modalEl.classList.remove('active'); modalEl.setAttribute('aria-hidden', 'true'); modalEl.innerHTML = ''; });
      top.appendChild(title); top.appendChild(close); wrap.appendChild(top);

      // create iframe to load PDF.js viewer (remote)
      const body = document.createElement('div');
      body.style.flex = '1';
      body.style.display = 'flex';
      body.style.flexDirection = 'column';
      body.style.overflow = 'hidden';

      const iframe = document.createElement('iframe');
      // Use Mozilla's hosted PDF.js viewer; encode the file URL properly
      // build a raw.githubusercontent.com URL for the PDF (public repo, branch main)
      const rawBase = 'https://raw.githubusercontent.com/madscientist300/neet/main/';
      const rawUrl = rawBase + (res.file || '').replace(/^\/+/, '');
      iframe.src = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(rawUrl)}`;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = '0';
      iframe.setAttribute('loading', 'lazy');

      // in some environments iframe embedding may be blocked; provide fallback link above iframe
      const fallback = document.createElement('div');
      fallback.style.padding = '10px';
      fallback.style.fontSize = '14px';
      fallback.style.color = 'var(--muted)';
      fallback.innerHTML = `If the preview does not load you can <a href="${res.file}" target="_blank" rel="noopener">open the PDF in a new tab</a>.`;

      body.appendChild(fallback);
      body.appendChild(iframe);
      wrap.appendChild(body);
      modalEl.appendChild(wrap);

      // prevent body scroll while modal open
      document.body.style.overflow = 'hidden';

      return;
    }
    window.open(res.file, '_blank');
  }

  // Event Listeners - Debounced search for better performance (300ms delay)
  const debouncedSearch = debounce(() => render(), 300);
  searchBox.addEventListener('input', debouncedSearch);

  // Assuming loadMoreBtn exists and its functionality is desired
  // If not, this block should be removed or adapted.
  // loadMoreBtn.addEventListener('click', () => {
  //   currentPage++;
  //   renderPDFs(true);
  // });

  // The original resetBtn logic is more complex than just calling resetFilters.
  // I will integrate the new debounced search and keep the original reset logic.
  // If a 'resetFilters' function is intended to encapsulate the reset logic,
  // that function should be defined elsewhere.
  resetBtn.addEventListener('click', () => {
    dropdownState.class = { value: '', text: 'All Classes' };
    dropdownState.chapter = { value: '', text: 'All Chapters' };
    dropdownState.tag = { value: '', text: 'All Concepts/Tags' };
    searchBox.value = '';

    updateDropdownDisplay(classFilterWrapper, 'All Classes');
    updateDropdownDisplay(chapterFilterWrapper, 'All Chapters');
    updateDropdownDisplay(tagFilterWrapper, 'All Concepts/Tags');

    populateChapterOptions();
    populateTagOptions();
    render();
  });

  // ========== PIN SETUP FUNCTIONALITY ==========
  const pinSetupModal = document.getElementById('pinSetupModal');
  const pinSetupForm = document.getElementById('pinSetupForm');
  const newPinInput = document.getElementById('newPinInput');
  const confirmPinInput = document.getElementById('confirmPinInput');
  const pinSetupMessage = document.getElementById('pinSetupMessage');

  // Check PIN status on load
  // Check PIN status on load
  // Backend Status Flag
  let backendAvailable = false;

  // Check PIN status on load
  async function checkPINStatus() {
    try {
      const response = await fetch('/api/pin-status');

      // Check if response is valid JSON (backend is running)
      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType || !contentType.includes('application/json')) {
        throw new Error('Backend not available');
      }

      const data = await response.json();

      // Backend is available!
      backendAvailable = true;
      if (uploadBtn) uploadBtn.style.display = 'inline-block';
      // Re-render to show delete buttons
      render();

      if (!data.setupComplete) {
        // Show PIN setup modal
        pinSetupModal.classList.add('active');
        pinSetupModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }
    } catch (error) {
      console.log('Running in static mode (Backend not available). Upload/Delete features disabled.');
      // Ensure hidden
      if (uploadBtn) uploadBtn.style.display = 'none';

      // Hide delete buttons dynamically
      const style = document.createElement('style');
      style.textContent = '.action-delete { display: none !important; }';
      document.head.appendChild(style);
    }
  }

  // Handle PIN setup form
  pinSetupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pin = newPinInput.value.trim();
    const confirmPin = confirmPinInput.value.trim();

    if (pin !== confirmPin) {
      pinSetupMessage.innerHTML = '<span style="color:#ef4444">❌ PINs do not match. Please try again.</span>';
      return;
    }

    if (pin.length < 4) {
      pinSetupMessage.innerHTML = '<span style="color:#ef4444">❌ PIN must be at least 4 characters.</span>';
      return;
    }

    try {
      const response = await fetch('/api/setup-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      const result = await response.json();

      if (result.success) {
        pinSetupMessage.innerHTML = `<span style="color:#10b981">✅ ${result.message}</span>`;

        // Close modal after 1.5 seconds
        setTimeout(() => {
          pinSetupModal.classList.remove('active');
          pinSetupModal.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
          pinSetupForm.reset();
          pinSetupMessage.innerHTML = '';
        }, 1500);
      } else {
        pinSetupMessage.innerHTML = `<span style="color:#ef4444">❌ ${result.message}</span>`;
      }
    } catch (error) {
      pinSetupMessage.innerHTML = `<span style="color:#ef4444">❌ Failed to set PIN: ${error.message}</span>`;
    }
  });

  // ========== UPLOAD FUNCTIONALITY ==========
  const uploadBtn = document.getElementById('uploadBtn');
  const uploadModal = document.getElementById('uploadModal');
  const uploadForm = document.getElementById('uploadForm');
  const closeUploadBtn = document.getElementById('closeUploadBtn');
  const cancelUploadBtn = document.getElementById('cancelUploadBtn');
  const classSelect = document.getElementById('classSelect');
  const chapterInput = document.getElementById('chapterInput');
  const tagsInput = document.getElementById('tagsInput');
  const pinInput = document.getElementById('pinInput');
  const fileInput = document.getElementById('fileInput');
  const fileCount = document.getElementById('fileCount');
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadMessage = document.getElementById('uploadMessage');

  // Master list of chapters
  const BOTANY_CHAPTERS = {
    "11": [
      "The Living World",
      "Biological Classification",
      "Plant Kingdom",
      "Morphology of Flowering Plants",
      "Anatomy of Flowering Plants",
      "Cell The unit of Life",
      "Cell Cycle and Cell Division",
      "Photosynthesis in Higher Plants",
      "Respiration in Plants",
      "Plant Growth and Development"
    ],
    "12": [
      "Sexual Reproduction in Flowering Plants",
      "Principle of Inheritance and Variation",
      "Molecular Basis of Inheritance",
      "Microbes in Human Welfare",
      "Organisms and Populations",
      "Ecosystem",
      "Biodiversity and Conservation"
    ]
  };

  // Populate chapters when class changes
  classSelect.addEventListener('change', () => {
    const cls = classSelect.value;
    chapterInput.innerHTML = '<option value="">-- Select Chapter --</option>';

    if (cls && BOTANY_CHAPTERS[cls]) {
      BOTANY_CHAPTERS[cls].forEach(ch => {
        const opt = document.createElement('option');
        opt.value = ch;
        opt.textContent = ch;
        chapterInput.appendChild(opt);
      });
    } else {
      chapterInput.innerHTML = '<option value="">-- Select Class First --</option>';
    }
  });

  // Show upload modal
  uploadBtn.addEventListener('click', () => {
    uploadModal.classList.add('active');
    uploadModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  });

  // Close modal handlers
  function closeUploadModal() {
    uploadModal.classList.remove('active');
    uploadModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    uploadForm.reset();
    fileCount.textContent = 'No files selected';
    uploadMessage.innerHTML = '';
    uploadProgress.style.display = 'none';
  }

  closeUploadBtn.addEventListener('click', closeUploadModal);
  cancelUploadBtn.addEventListener('click', closeUploadModal);

  // Click outside modal to close
  uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) closeUploadModal();
  });

  // File input change handler
  fileInput.addEventListener('change', () => {
    const count = fileInput.files.length;
    if (count === 0) {
      fileCount.textContent = 'No files selected';
    } else if (count === 1) {
      fileCount.textContent = `1 file selected: ${fileInput.files[0].name}`;
    } else {
      fileCount.textContent = `${count} files selected`;
    }
  });

  // Form submission
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const classVal = classSelect.value;
    const chapter = chapterInput.value.trim();
    const tags = tagsInput.value.trim();
    const pin = pinInput.value.trim();
    const files = fileInput.files;

    // Validation
    if (!classVal) {
      uploadMessage.innerHTML = '<span style="color:#ef4444">❌ Please select a class</span>';
      return;
    }
    if (!chapter) {
      uploadMessage.innerHTML = '<span style="color:#ef4444">❌ Please enter a chapter name</span>';
      return;
    }
    if (!pin) {
      uploadMessage.innerHTML = '<span style="color:#ef4444">❌ Please enter your PIN</span>';
      return;
    }
    if (files.length === 0) {
      uploadMessage.innerHTML = '<span style="color:#ef4444">❌ Please select at least one file</span>';
      return;
    }

    // Prepare form data
    const formData = new FormData();
    formData.append('class', classVal);
    formData.append('chapter', chapter);
    formData.append('tags', tags);
    formData.append('pin', pin);

    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    // Show progress
    uploadProgress.style.display = 'block';
    uploadMessage.innerHTML = '';

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      uploadProgress.style.display = 'none';

      if (result.success) {
        uploadMessage.innerHTML = `<span style="color:#10b981">✅ ${result.message}</span>`;

        // Reload resources after 1 second
        setTimeout(async () => {
          await loadResources();
          closeUploadModal();
        }, 1500);
      } else {
        uploadMessage.innerHTML = `<span style="color:#ef4444">${result.message}</span>`;
      }

    } catch (error) {
      uploadProgress.style.display = 'none';
      uploadMessage.innerHTML = `<span style="color:#ef4444">❌ Upload failed: ${error.message}</span>`;
      console.error('Upload error:', error);
    }
  });

  // ========== DELETE FUNCTIONALITY ==========
  const deleteModal = document.getElementById('deleteModal');
  const deleteForm = document.getElementById('deleteForm');
  const closeDeleteBtn = document.getElementById('closeDeleteBtn');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const deletePinInput = document.getElementById('deletePinInput');
  const deleteMessage = document.getElementById('deleteMessage');
  const deleteResourceInfo = document.getElementById('deleteResourceInfo');
  let currentResourceToDelete = null;

  // Open delete modal with resource info
  function openDeleteModal(resource) {
    currentResourceToDelete = resource;
    deleteResourceInfo.innerHTML = `
      <strong>${resource.title || resource.file || 'Untitled'}</strong>
      <div style="margin-top: 4px;">Class: ${resource.class || '-'} · Chapter: ${resource.chapter || '-'}</div>
    `;
    deleteModal.classList.add('active');
    deleteModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  // Close delete modal
  function closeDeleteModal() {
    deleteModal.classList.remove('active');
    deleteModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    deleteForm.reset();
    deleteMessage.innerHTML = '';
    currentResourceToDelete = null;
  }

  closeDeleteBtn.addEventListener('click', closeDeleteModal);
  cancelDeleteBtn.addEventListener('click', closeDeleteModal);

  // Click outside modal to close
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });

  // Handle delete form submission
  deleteForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentResourceToDelete) {
      deleteMessage.innerHTML = '<span style="color:#ef4444">❌ No resource selected</span>';
      return;
    }

    const pin = deletePinInput.value.trim();

    if (!pin) {
      deleteMessage.innerHTML = '<span style="color:#ef4444">❌ Please enter your PIN</span>';
      return;
    }

    deleteMessage.innerHTML = '<span style="color:#7dd3fc">⏳ Deleting...</span>';

    try {
      const response = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: pin,
          resourceId: currentResourceToDelete.id,
          file: currentResourceToDelete.file
        })
      });

      const result = await response.json();

      if (result.success) {
        deleteMessage.innerHTML = '<span style="color:#10b981">✅ Resource deleted successfully</span>';

        // Reload resources after 1 second
        setTimeout(async () => {
          await loadResources();
          closeDeleteModal();
        }, 1000);
      } else {
        deleteMessage.innerHTML = `<span style="color:#ef4444">${result.message}</span>`;
      }
    } catch (error) {
      deleteMessage.innerHTML = `<span style="color:#ef4444">❌ Delete failed: ${error.message}</span>`;
      console.error('Delete error:', error);
    }
  });

  // start
  initCustomDropdowns();
  loadResources();
  checkPINStatus(); // Check if PIN needs to be set up
})();