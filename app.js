// app.js
// Requires: pdf.js included in index.html
(function(){
  // Elements
  const classFilter = document.getElementById('classFilter');
  const chapterFilter = document.getElementById('chapterFilter');
  const tagFilter = document.getElementById('tagFilter');
  const searchBox = document.getElementById('searchBox');
  const resetBtn = document.getElementById('resetBtn');
  const grid = document.getElementById('grid');
  const noresult = document.getElementById('noresult');

  // pdf.js worker
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3/build/pdf.worker.min.js';

  let resources = [];
  const thumbCache = new Map(); // file -> url or dataURL
  const generating = new Map(); // file -> promise

  // helpers
  const unique = arr => [...new Set(arr || [])];
  const debounce = (fn, ms=220)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  // IntersectionObserver to lazy-generate thumbnails when card enters viewport
  const observer = new IntersectionObserver(entries=>{
    for(const ent of entries){
      if(ent.isIntersecting){
        const el = ent.target;
        observer.unobserve(el);
        const id = el.dataset.id;
        const res = resources.find(r=>r.id===id);
        if(res) ensureThumbnailForResource(res, el);
      }
    }
  }, { root: null, rootMargin: '400px', threshold: 0.08 });

  async function loadResources(){
    try{
      const r = await fetch('resources.json', {cache:'no-store'});
      if(!r.ok) throw new Error('resources.json not found');
      resources = await r.json();
      if(!Array.isArray(resources)) resources = [];

      // normalize
      resources.forEach(x=>{
        x._classNorm = (x.class||'').toString().trim().toLowerCase();
        x._chapterNorm = (x.chapter||'').toString().trim().toLowerCase();
        x._tagsNorm = (x.tags||[]).map(t=>t.toString().trim().toLowerCase());
        x._searchHay = ((x.title||'')+' '+(x.topic||'')+' '+(x.chapter||'')+' '+(x.tags||[]).join(' ')+' '+(x.file||'')).toLowerCase();
      });

      buildFilters();
      render();
    }catch(e){
      grid.innerHTML = `<div class="empty">Could not load resources.json: ${e.message}</div>`;
      console.error(e);
    }
  }

  // dynamic filters (same approach)
  function getFilteredResourcesForFilters(){
    const cls = (classFilter.value||'').toString().trim().toLowerCase();
    const chap = (chapterFilter.value||'').toString().trim().toLowerCase();
    return resources.filter(r=>{
      if(cls && (r._classNorm||'') !== cls) return false;
      if(chap && (r._chapterNorm||'') !== chap) return false;
      return true;
    });
  }

  function populateChapterOptions(){
    const cls = (classFilter.value||'').toString().trim().toLowerCase();
    const filtered = resources.filter(r => !cls || (r._classNorm === cls));
    const chapters = unique(filtered.map(r=>r.chapter||'Unknown')).sort((a,b)=>a.localeCompare(b));
    chapterFilter.innerHTML='';
    chapterFilter.appendChild(new Option('All Chapters',''));
    for(const ch of chapters) chapterFilter.appendChild(new Option(ch,ch));
  }

  function populateTagOptions(){
    const filtered = getFilteredResourcesForFilters();
    const tags = unique(filtered.flatMap(r=>r.tags||[])).sort((a,b)=>a.localeCompare(b));
    tagFilter.innerHTML=''; tagFilter.appendChild(new Option('All Concepts/Tags',''));
    for(const t of tags) tagFilter.appendChild(new Option(t,t));
  }

  function buildFilters(){
    const classes = unique(resources.map(r=>r.class||'Unclassed')).sort((a,b)=>a.localeCompare(b));
    classFilter.innerHTML=''; classFilter.appendChild(new Option('All Classes',''));
    for(const c of classes) classFilter.appendChild(new Option(c,c));
    populateChapterOptions(); populateTagOptions();
  }

  function render(){
    const classVal = (classFilter.value||'').toString().toLowerCase().trim();
    const chapVal = (chapterFilter.value||'').toString().toLowerCase().trim();
    const tagVal = (tagFilter.value||'').toString().toLowerCase().trim();
    const q = (searchBox.value||'').trim().toLowerCase();

    const filtered = resources.filter(r=>{
      if(classVal && (r._classNorm||'') !== classVal) return false;
      if(chapVal && (r._chapterNorm||'') !== chapVal) return false;
      if(tagVal && !(r._tagsNorm||[]).includes(tagVal)) return false;
      if(q && !(r._searchHay||'').includes(q)) return false;
      return true;
    });

    grid.innerHTML = '';
    if(filtered.length === 0){ noresult.style.display='block'; return; } else { noresult.style.display='none'; }

    const frag = document.createDocumentFragment();
    for(const r of filtered) frag.appendChild(buildCard(r));
    grid.appendChild(frag);

    // observe for thumbnails (lazy generation)
    grid.querySelectorAll('.card').forEach(card=>{
      observer.observe(card);
    });
  }

  // determine type label and class for badge
  function badgeForResource(res){
    const t = (res.type || '').toString().toLowerCase();
    if(t === 'pdf') return { cls:'pdf', label:'PDF', icon: pdfIcon() };
    if(t === 'image') return { cls:'image', label:'Image', icon: imageIcon() };
    if(t === 'url') return { cls:'url', label:'Link', icon: linkIcon() };
    // fallback: treat as file
    return { cls:'file', label:'File', icon: fileIcon() };
  }

  // small inline SVG icons (kept tiny)
  function pdfIcon(){ return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="18" height="22" x="3" y="1" rx="2" fill="#fff"/><path d="M7 8h10" stroke="#000" stroke-width="1.2" stroke-linecap="round"/></svg>`; }
  function imageIcon(){ return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="14" x="2" y="4" rx="1.5" fill="#fff"/><circle cx="8.5" cy="8.5" r="1.8" fill="#000"/></svg>`; }
  function linkIcon(){ return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 14a3.5 3.5 0 010-4.95l3-3a3.5 3.5 0 014.95 4.95l-1 1" stroke="#000" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 10a3.5 3.5 0 010 4.95l-3 3a3.5 3.5 0 01-4.95-4.95l1-1" stroke="#000" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
  function fileIcon(){ return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="20" x="4" y="2" rx="2" fill="#fff"/><path d="M8 8h8" stroke="#000" stroke-width="1.2" stroke-linecap="round"/></svg>`; }

  // build DOM card (with badge)
  function buildCard(r){
    const card = document.createElement('div'); card.className = 'card';
    card.dataset.id = r.id || '';
    card.dataset.file = r.file || '';

    // thumbnail area
    const tw = document.createElement('div'); tw.className = 'thumb-wrap';
    const img = document.createElement('img'); img.className = 'thumb'; img.alt = r.title || '';
    const pre = r.thumbnail || guessThumbPath(r.file);
    if(pre){
      img.src = pre;
    } else {
      img.src = placeholderSVG(320,180);
      const spinner = document.createElement('div'); spinner.className = 'thumb-spinner';
      const dot = document.createElement('div'); dot.className = 'spinner-dot'; spinner.appendChild(dot);
      tw.appendChild(spinner);
    }
    tw.appendChild(img);

    // badge
    const badgeInfo = badgeForResource(r);
    const badge = document.createElement('div'); badge.className = `file-badge ${badgeInfo.cls}`;
    badge.setAttribute('aria-hidden','true');
    // insert icon + label (use innerHTML just for SVG small trusted strings)
    badge.innerHTML = `${badgeInfo.icon}<span>${badgeInfo.label}</span>`;
    tw.appendChild(badge);

    card.appendChild(tw);

    // body
    const body = document.createElement('div'); body.className = 'card-body';
    const h = document.createElement('h3'); h.textContent = r.title || r.file || 'Untitled'; body.appendChild(h);
    const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = `Class: ${r.class||'-'} · Chapter: ${r.chapter||'-'}`; body.appendChild(meta);
    const topic = document.createElement('div'); topic.style.fontSize='13px'; topic.style.color='var(--muted)'; topic.textContent = r.topic||'—'; body.appendChild(topic);
    const tagsWrap = document.createElement('div'); tagsWrap.className='tags'; (r.tags||[]).forEach(tg=>{ const s=document.createElement('span'); s.className='tag'; s.textContent=tg; tagsWrap.appendChild(s); }); body.appendChild(tagsWrap);

    const actions = document.createElement('div'); actions.className='actions';
    if(r.type === 'url'){ const a=document.createElement('a'); a.className='action'; a.href=r.file; a.target='_blank'; a.rel='noopener'; a.textContent='Open Link'; actions.appendChild(a); }
    const pbtn = document.createElement('button'); pbtn.className='action'; pbtn.type='button'; pbtn.textContent='Preview'; pbtn.addEventListener('click', ()=>openPreviewByResource(r)); actions.appendChild(pbtn);
    const obtn = document.createElement('button'); obtn.className='action'; obtn.type='button'; obtn.textContent='Open file'; obtn.addEventListener('click', ()=>openResource(r.file)); actions.appendChild(obtn);

    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  function placeholderSVG(w=320,h=180){
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><rect width='100%' height='100%' fill='#071a2a'/><text x='50%' y='50%' fill='#7dd3fc' font-size='16' text-anchor='middle' dominant-baseline='middle'>No preview</text></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function guessThumbPath(file){
    if(!file) return null;
    try{
      const parts = file.split('/');
      const name = parts[parts.length-1];
      const base = name.replace(/\.[^/.]+$/,'');
      const guess = `resources/thumbs/${base}.png`;
      return guess;
    }catch(e){ return null; }
  }

  // ensureThumbnailForResource: prefer pre-generated, else generate (pdf only)
  async function ensureThumbnailForResource(res, cardEl){
    const img = cardEl.querySelector('.thumb');
    const spinner = cardEl.querySelector('.thumb-spinner');

    if(res.thumbnail){
      img.src = res.thumbnail;
      if(spinner) spinner.remove();
      return;
    }

    const guessed = guessThumbPath(res.file);
    if(guessed){
      try{
        const h = await fetch(guessed, { method:'HEAD' });
        if(h.ok){
          img.src = guessed;
          if(spinner) spinner.remove();
          return;
        }
      }catch(e){}
    }

    if(res.type === 'image'){
      img.src = res.file;
      if(spinner) spinner.remove();
      return;
    }

    if(res.type === 'pdf'){
      if(thumbCache.has(res.file)){
        img.src = thumbCache.get(res.file);
        if(spinner) spinner.remove();
        return;
      }
      if(generating.has(res.file)){
        try{ const url = await generating.get(res.file); if(url) img.src = url; }catch(e){}
        if(spinner) spinner.remove();
        return;
      }
      const p = (async ()=>{
        try{
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
          ctx.setTransform(ratio,0,0,ratio,0,0);
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL('image/png');
          thumbCache.set(res.file, dataUrl);
          return dataUrl;
        }catch(e){
          console.warn('Thumbnail generation failed', e);
          return null;
        }
      })();
      generating.set(res.file, p);
      const url = await p;
      generating.delete(res.file);
      if(url) img.src = url;
      if(spinner) spinner.remove();
      return;
    }

    if(spinner) spinner.remove();
  }

  // basic preview / open functions
  function openResource(url){
    if(!url) return;
    const w = window.open(url,'_blank');
    if(!w) alert('Browser blocked opening the file. Try right-click → Open in new tab.');
  }

  // simplified modal preview
  async function openPreviewByResource(res){
    if(res.type === 'image'){
      const modalEl = document.getElementById('modal');
      modalEl.innerHTML = '';
      modalEl.classList.add('active');
      modalEl.setAttribute('aria-hidden','false');
      const wrap = document.createElement('div'); wrap.className='viewer';
      const top = document.createElement('div'); top.className='top';
      const title = document.createElement('div'); title.id='vtitle'; title.textContent = res.title || '';
      const close = document.createElement('button'); close.textContent='Close'; close.addEventListener('click', ()=>{ modalEl.classList.remove('active'); modalEl.setAttribute('aria-hidden','true'); modalEl.innerHTML='';});
      top.appendChild(title); top.appendChild(close); wrap.appendChild(top);
      const body = document.createElement('div'); body.style.flex='1'; body.style.display='flex'; body.style.alignItems='center'; body.style.justifyContent='center';
      const img = document.createElement('img'); img.src = res.file; img.style.maxWidth='95%'; img.style.maxHeight='95%'; body.appendChild(img); wrap.appendChild(body);
      modalEl.appendChild(wrap);
      return;
    }
    if(res.type === 'pdf'){
      const modalEl = document.getElementById('modal');
      modalEl.innerHTML = '';
      modalEl.classList.add('active');
      modalEl.setAttribute('aria-hidden','false');
      const wrap = document.createElement('div'); wrap.className='viewer';
      const top = document.createElement('div'); top.className='top';
      const title = document.createElement('div'); title.id='vtitle'; title.textContent = res.title || '';
      const close = document.createElement('button'); close.textContent='Close'; close.addEventListener('click', ()=>{ modalEl.classList.remove('active'); modalEl.setAttribute('aria-hidden','true'); modalEl.innerHTML='';});
      top.appendChild(title); top.appendChild(close); wrap.appendChild(top);
      const body = document.createElement('div'); body.style.flex='1'; body.style.display='flex'; body.style.alignItems='center'; body.style.justifyContent='center';
      const canvas = document.createElement('canvas'); body.appendChild(canvas); wrap.appendChild(body);
      modalEl.appendChild(wrap);

      try{
        const pdfDoc = await pdfjsLib.getDocument(res.file).promise;
        const page = await pdfDoc.getPage(1);
        const scale = 1.25;
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';
        ctx.setTransform(ratio,0,0,ratio,0,0);
        await page.render({ canvasContext: ctx, viewport }).promise;
      }catch(err){
        console.error('Modal PDF render failed',err);
        window.open(res.file,'_blank');
      }
      return;
    }
    window.open(res.file,'_blank');
  }

  // wire events and init
  classFilter.addEventListener('change', ()=>{
    populateChapterOptions();
    chapterFilter.value='';
    populateTagOptions();
    tagFilter.value='';
    render();
  });
  chapterFilter.addEventListener('change', ()=>{ populateTagOptions(); tagFilter.value=''; render(); });
  tagFilter.addEventListener('change', render);
  searchBox.addEventListener('input', debounce(()=>render(), 220));
  resetBtn.addEventListener('click', ()=>{
    classFilter.value=''; chapterFilter.value=''; tagFilter.value=''; searchBox.value='';
    populateChapterOptions(); populateTagOptions(); render();
  });

  // start
  loadResources();
})();