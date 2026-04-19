'use strict';

// ===== STATE =====
var APP = {
  view: 'home',
  pendingRock: null,
  pendingPhoto: null,
  collFilter: 'all',
  collRarity: 'all',
  collSearch: '',
  wishFilter: 'all',
};

// ===== STORAGE =====
function getCollection()    { return JSON.parse(localStorage.getItem('rock_collection') || '[]'); }
function saveCollection(a)  { localStorage.setItem('rock_collection', JSON.stringify(a)); }
function getApiKey()        { return localStorage.getItem('rock_api_key') || ''; }
function saveApiKey(k)      { localStorage.setItem('rock_api_key', k); }
function isSetupDone()      { return localStorage.getItem('rock_setup_done') === 'true'; }
function markSetupDone()    { localStorage.setItem('rock_setup_done', 'true'); }
function getWishFound()     { return JSON.parse(localStorage.getItem('rock_wish_found') || '{}'); }
function saveWishFound(o)   { localStorage.setItem('rock_wish_found', JSON.stringify(o)); }

// ===== UTILS =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function norm(s) {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}
function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function typeEmoji(t) {
  return { igneous:'🔥', sedimentary:'🏖️', metamorphic:'💫', gemstone:'💎', mineral:'✨', unknown:'🪨' }[t] || '🪨';
}
function rarityEmoji(r) {
  var clean = (r||'common').replace('-',' ');
  return { common:'⚪', uncommon:'🟢', rare:'🔵', 'very rare':'🟣' }[clean] || '⚪';
}
function rarityClass(r) {
  return (r||'common').replace(' ','-');
}

// ===== IMAGE RESIZE =====
function resizeImage(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onerror = reject;
    reader.onload = function(e) {
      var img = new Image();
      img.onerror = reject;
      img.onload = function() {
        var MAX = 900, w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), mediaType: 'image/jpeg' });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ===== CLAUDE API =====
async function identifyRock(dataUrl, mediaType, knownName) {
  var key = getApiKey();
  if (!key) { navigate('setup'); throw new Error('No API key set.'); }

  var base64 = dataUrl.split(',')[1];
  var nameHint = knownName ? ' This rock is called "' + knownName + '".' : '';
  var prompt = 'You are a friendly geologist helping a child identify rocks.' + nameHint + ' Analyze this photo and respond ONLY with valid JSON in this exact format (no extra text):\n{"name":"Rock Name","type":"igneous","rarity":"common","composition":"Simple plain-language description of minerals","funFact":"One amazing kid-friendly sentence","confidence":"high","hardness":7,"lustre":"glassy","streak":"white","cleavage":"poor","transparency":"opaque"}\n\nRules:\n- type: igneous, sedimentary, metamorphic, gemstone, mineral, or unknown\n- rarity: common, uncommon, rare, or very rare\n- confidence: high, medium, or low\n- hardness: Mohs hardness as a number 1-10 (use decimals like 6.5 if between values)\n- lustre: metallic, glassy, waxy, pearly, silky, resinous, dull, or adamantine\n- streak: the color left when scratched on a surface (e.g. white, black, red-brown, yellow)\n- cleavage: perfect, good, poor, none, or conchoidal\n- transparency: opaque, translucent, or transparent\n- Keep composition and funFact short and easy for a child to understand\n- Respond with ONLY the JSON object, nothing else';

  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 }},
          { type: 'text',  text: prompt }
        ]
      }]
    })
  });

  var data = await res.json();
  if (!res.ok) throw new Error(data.error && data.error.message ? data.error.message : 'API error ' + res.status);

  var text = (data.content[0].text || '').trim();
  var m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Could not read the response. Please try again.');
  return JSON.parse(m[0]);
}

// ===== SET PROGRESS =====
function getFoundNames() {
  return new Set(getCollection().map(function(r) { return norm(r.name); }));
}
function isRockFound(set, rock) {
  var key = set.id + ':' + rock.id;
  return getFoundNames().has(norm(rock.name)) || !!getWishFound()[key];
}
function setProgress(set) {
  var found = set.rocks.filter(function(r) { return isRockFound(set, r); }).length;
  return { found: found, total: set.rocks.length, pct: Math.round(found / set.rocks.length * 100) };
}

// ===== ROUTING =====
function navigate(view) {
  APP.view = view;
  document.querySelectorAll('.view').forEach(function(el) {
    el.classList.remove('active');
    el.style.display = ''; // clear any inline style set by renderSetup
  });
  var el = document.getElementById('view-' + view);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }

  var nav = document.getElementById('bottom-nav');
  if (nav) nav.classList.toggle('hidden', view === 'setup');

  document.querySelectorAll('.nav-btn[data-view]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  var renders = {
    setup: renderSetup,
    home: renderHome,
    add: renderAdd,
    collection: renderCollection,
    sets: renderSets,
    wishlist: renderWishlist,
  };
  if (renders[view]) renders[view]();
}

// ===== CELEBRATION =====
function celebrate(title, subtitle, emoji) {
  var overlay = document.getElementById('celebration');
  overlay.innerHTML = '';
  overlay.classList.remove('hidden');

  var confettiEmojis = ['🎉','⭐','🌟','✨','🎊','💥','🪄','🏆','🎈','💫'];
  for (var i = 0; i < 22; i++) {
    var c = document.createElement('div');
    c.className = 'confetti-piece';
    c.textContent = confettiEmojis[Math.floor(Math.random() * confettiEmojis.length)];
    c.style.left = (Math.random() * 100) + 'vw';
    c.style.setProperty('--dur', (0.9 + Math.random() * 1.4) + 's');
    c.style.setProperty('--r', (Math.random() > 0.5 ? '' : '-') + (360 + Math.floor(Math.random() * 360)) + 'deg');
    c.style.animationDelay = (Math.random() * 0.4) + 's';
    overlay.appendChild(c);
  }

  var card = document.createElement('div');
  card.className = 'celeb-card';
  card.innerHTML =
    '<span class="celeb-emoji">' + emoji + '</span>' +
    '<div class="celeb-title">' + esc(title) + '</div>' +
    '<div class="celeb-subtitle">' + esc(subtitle) + '</div>' +
    '<button class="btn btn-primary" id="celeb-ok">Awesome! 🤩</button>';
  overlay.appendChild(card);

  // Dimmed background
  overlay.style.background = 'rgba(0,0,0,0.5)';
  overlay.style.pointerEvents = 'all';

  function dismiss() {
    overlay.classList.add('hidden');
    overlay.style.pointerEvents = 'none';
  }
  document.getElementById('celeb-ok').addEventListener('click', dismiss);
  setTimeout(dismiss, 6000);
}

// ===== RENDER: SETUP =====
function renderSetup() {
  var el = document.getElementById('view-setup');
  el.style.display = 'flex';
  el.innerHTML =
    '<span class="setup-rock">🪨</span>' +
    '<div class="setup-title">Rock Collection!</div>' +
    '<div class="setup-desc">Take photos of rocks and find out what they are! Build your collection and complete fun rock sets. 🌟</div>' +
    '<div class="setup-form">' +
      '<div class="field">' +
        '<label>Anthropic API Key</label>' +
        '<input type="password" id="api-key-input" placeholder="sk-ant-..." autocomplete="off" value="' + esc(getApiKey()) + '">' +
      '</div>' +
      '<p class="setup-hint">Get a free key at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a></p>' +
      '<div class="mt-16"></div>' +
      '<button class="btn btn-primary" id="setup-go">Let\'s Go! 🚀</button>' +
      (isSetupDone() ? '<button class="btn btn-ghost mt-16" id="setup-back">← Back</button>' : '') +
    '</div>';

  document.getElementById('setup-go').addEventListener('click', function() {
    var k = document.getElementById('api-key-input').value.trim();
    if (!k.startsWith('sk-ant-')) {
      alert('Please enter a valid Anthropic API key — it starts with "sk-ant-"');
      return;
    }
    saveApiKey(k);
    markSetupDone();
    celebrate('You\'re all set!', 'Let\'s find some rocks! 🪨', '🎉');
    setTimeout(function() { navigate('home'); }, 500);
  });

  var backBtn = document.getElementById('setup-back');
  if (backBtn) backBtn.addEventListener('click', function() { navigate('home'); });
}

// ===== RENDER: HOME =====
function renderHome() {
  var el = document.getElementById('view-home');
  var coll = getCollection();
  var total = coll.length;
  var latest = coll[0] || null;
  var setsStarted = ROCK_SETS.filter(function(s) { return setProgress(s).found > 0; }).length;
  var recent = coll.slice(0, 3);

  // Hero: full-bleed latest rock photo with stats overlaid
  var heroHtml;
  if (total === 0) {
    heroHtml =
      '<div class="hero-empty">' +
        '<span class="hero-empty-icon">🪨</span>' +
        '<div class="hero-empty-title">Start your collection!</div>' +
        '<p class="hero-empty-sub">Tap the + button to photograph your first rock</p>' +
      '</div>';
  } else {
    heroHtml =
      '<div class="hero-section">' +
        (latest && latest.photoDataUrl
          ? '<img class="hero-photo" src="' + latest.photoDataUrl + '" alt="' + esc(latest.name) + '">'
          : '<div class="hero-photo-placeholder">🪨</div>') +
        '<div class="hero-overlay">' +
          '<div class="hero-latest-label">Latest Find</div>' +
          '<div class="hero-latest-name">' + esc(latest ? latest.name : '') + '</div>' +
          '<div class="hero-stats-row">' +
            '<div class="hero-stat"><span class="hero-stat-num">' + total + '</span><span class="hero-stat-lbl">Rocks 🪨</span></div>' +
            '<div class="hero-stat-sep"></div>' +
            '<div class="hero-stat"><span class="hero-stat-num">' + setsStarted + '</span><span class="hero-stat-lbl">Sets ⭐</span></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // Recent finds row
  var recentHtml = '';
  if (recent.length > 0) {
    recentHtml =
      '<div class="home-section">' +
        '<div class="section-title">Recent Finds 🆕</div>' +
        '<div class="recent-grid">' +
          recent.map(function(r) {
            return '<div class="recent-card">' +
              (r.photoDataUrl
                ? '<img src="' + r.photoDataUrl + '" alt="' + esc(r.name) + '" loading="lazy">'
                : '<div class="recent-card-placeholder">🪨</div>') +
              '<div class="recent-card-name">' + esc(r.name) + '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  // Set progress cards
  var setsHtml = ROCK_SETS.slice(0, 3).map(function(s) {
    var p = setProgress(s);
    return '<div class="set-mini-card">' +
      '<div class="set-mini-header">' +
        '<span class="set-mini-icon">' + s.icon + '</span>' +
        '<span class="set-mini-name">' + esc(s.name) + '</span>' +
        '<span class="set-mini-count">' + p.found + '/' + p.total + '</span>' +
      '</div>' +
      '<div class="progress-wrap"><div class="progress-fill" style="width:' + p.pct + '%"></div></div>' +
    '</div>';
  }).join('');

  el.innerHTML =
    heroHtml +
    recentHtml +
    '<div class="home-section">' +
      '<div class="section-title">Set Progress ⭐</div>' +
      setsHtml +
    '</div>' +
    '<div class="home-section">' +
      '<button class="btn btn-ghost" id="import-btn" style="font-size:14px;min-height:44px">📥 Import starter-collection.json</button>' +
      '<button class="btn btn-ghost mt-8" id="settings-home-btn" style="font-size:14px;min-height:44px">⚙️ Change API Key</button>' +
    '</div>';

  document.getElementById('import-btn').addEventListener('click', importCollection);
  document.getElementById('settings-home-btn').addEventListener('click', function() { navigate('setup'); });
}

// ===== IMPORT COLLECTION =====
async function importCollection() {
  var btn = document.getElementById('import-btn');
  if (btn) { btn.textContent = '⏳ Loading...'; btn.disabled = true; }

  try {
    var resp = await fetch('starter-collection.json?v=' + Date.now());
    if (!resp.ok) throw new Error('starter-collection.json not found. Run seed-collection.py first.');
    var rocks = await resp.json();
    if (!Array.isArray(rocks) || rocks.length === 0) throw new Error('File is empty or invalid.');

    var existing = getCollection();
    var existingNames = new Set(existing.map(function(r) { return norm(r.name); }));

    var added = 0;
    rocks.forEach(function(r) {
      if (!existingNames.has(norm(r.name))) {
        existing.push(r);
        added++;
      }
    });
    saveCollection(existing);

    celebrate(
      added + ' rocks imported! 🪨',
      rocks.length - added > 0 ? (rocks.length - added) + ' duplicates skipped.' : 'Your collection is ready!',
      '🎉'
    );
    setTimeout(function() { navigate('collection'); }, 400);
  } catch (err) {
    alert('Import failed: ' + err.message);
    if (btn) { btn.textContent = '📥 Import starter-collection.json'; btn.disabled = false; }
  }
}

// ===== RENDER: ADD =====
function renderAdd() {
  var el = document.getElementById('view-add');
  APP.pendingRock = null;
  APP.pendingPhoto = null;

  el.innerHTML =
    '<div class="page-header">' +
      '<div class="page-title">Add a Rock 📸</div>' +
      '<div class="page-subtitle">Take a photo and we\'ll identify it!</div>' +
    '</div>' +
    '<div id="add-body">' +
      '<div class="upload-zone" id="upload-zone">' +
        '<span class="upload-icon">📸</span>' +
        '<h3>Tap to take a photo!</h3>' +
        '<p>Or choose a photo from your library</p>' +
      '</div>' +
      '<input type="file" id="file-input" accept="image/*" capture="environment">' +
    '</div>';

  document.getElementById('upload-zone').addEventListener('click', function() {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', function(e) {
    var f = e.target.files && e.target.files[0];
    if (f) handlePhoto(f);
  });
}

async function handlePhoto(file) {
  var body = document.getElementById('add-body');
  if (!body) return;

  body.innerHTML = '<div class="loading-state"><span class="spin-emoji">🔍</span><p>Identifying your rock...</p></div>';

  try {
    var resized = await resizeImage(file);
    APP.pendingPhoto = resized;
    var rock = await identifyRock(resized.dataUrl, resized.mediaType);
    APP.pendingRock = rock;
    showResult(resized.dataUrl, rock);
  } catch (err) {
    body.innerHTML =
      '<div class="error-banner">❌ ' + esc(err.message || 'Something went wrong. Please try again.') + '</div>' +
      '<div class="upload-zone" id="upload-zone2"><span class="upload-icon">📸</span><h3>Try again</h3><p>Tap to take another photo</p></div>' +
      '<input type="file" id="file-input2" accept="image/*" capture="environment">';
    var uz = document.getElementById('upload-zone2');
    var fi = document.getElementById('file-input2');
    if (uz && fi) {
      uz.addEventListener('click', function() { fi.click(); });
      fi.addEventListener('change', function(e) {
        var f = e.target.files && e.target.files[0];
        if (f) handlePhoto(f);
      });
    }
  }
}

function showResult(photoDataUrl, rock) {
  var body = document.getElementById('add-body');
  if (!body) return;

  var isLow = rock.confidence === 'low';
  var rc = rarityClass(rock.rarity);

  var html = '';
  if (isLow) {
    html += '<div class="low-conf-banner">🤔 We think this is <strong>' + esc(rock.name) + '</strong> — does that look right? You can change the name below.</div>';
  }
  html +=
    '<div class="result-card">' +
      '<img class="result-photo" src="' + photoDataUrl + '" alt="Your rock">' +
      '<div class="result-body">' +
        '<div class="result-name">' + esc(rock.name) + '</div>' +
        '<div class="result-badges">' +
          '<span class="badge badge-' + (rock.type||'unknown') + '">' + typeEmoji(rock.type) + ' ' + esc(rock.type||'unknown') + '</span>' +
          '<span class="badge badge-' + rc + '">' + rarityEmoji(rock.rarity) + ' ' + esc((rock.rarity||'common').replace('-',' ')) + '</span>' +
        '</div>' +
        '<div class="result-composition">' + esc(rock.composition) + '</div>' +
        '<div class="result-fact">' + esc(rock.funFact) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="add-form">' +
      '<div class="field"><label>Rock Name</label><input type="text" id="rock-name" value="' + esc(rock.name) + '" placeholder="Rock name"></div>' +
      '<div class="field"><label>Where did you find it? (optional)</label><input type="text" id="rock-location" placeholder="e.g. Backyard, beach, park..."></div>' +
      '<button class="btn btn-primary" id="confirm-btn">Add to My Collection! 🎉</button>' +
      '<button class="btn btn-ghost mt-16" id="retake-btn">📸 Take Another Photo</button>' +
    '</div>';

  body.innerHTML = html;

  document.getElementById('confirm-btn').addEventListener('click', confirmAdd);
  document.getElementById('retake-btn').addEventListener('click', function() { renderAdd(); });
}

function confirmAdd() {
  var nameEl = document.getElementById('rock-name');
  var locEl  = document.getElementById('rock-location');
  var name = nameEl ? nameEl.value.trim() : '';
  if (!name) { alert('Please enter a name for your rock!'); return; }

  var rock = APP.pendingRock || {};
  var entry = {
    id:           uid(),
    name:         name,
    type:         rock.type         || 'unknown',
    rarity:       rock.rarity       || 'common',
    composition:  rock.composition  || '',
    funFact:      rock.funFact      || '',
    hardness:     rock.hardness     || null,
    lustre:       rock.lustre       || '',
    streak:       rock.streak       || '',
    cleavage:     rock.cleavage     || '',
    transparency: rock.transparency || '',
    photoDataUrl: APP.pendingPhoto ? APP.pendingPhoto.dataUrl : '',
    location:     locEl ? locEl.value.trim() : '',
    dateAdded:    new Date().toISOString().slice(0, 10),
  };

  var coll = getCollection();
  coll.unshift(entry);
  saveCollection(coll);

  APP.pendingRock = null;
  APP.pendingPhoto = null;

  var celebEmoji = rock.rarity === 'very rare' ? '💎' : rock.rarity === 'rare' ? '🔵' : '🎉';
  celebrate('Rock found! 🪨', name + ' added to your collection!', celebEmoji);

  checkSetCompletions();
  setTimeout(function() { navigate('collection'); }, 300);
}

function checkSetCompletions() {
  for (var i = 0; i < ROCK_SETS.length; i++) {
    var p = setProgress(ROCK_SETS[i]);
    if (p.pct === 100 && p.total > 0) {
      var setName = ROCK_SETS[i].name;
      setTimeout(function(n) {
        return function() { celebrate(n + ' Complete! 🏆', 'You found all the rocks in this set!', '🏆'); };
      }(setName), 2200);
      break;
    }
  }
}

// ===== RENDER: COLLECTION =====
function renderCollection() {
  var el = document.getElementById('view-collection');

  el.innerHTML =
    '<div class="page-header"><div class="page-title">My Rocks 🪨</div></div>' +
    '<div class="coll-filters">' +
      '<div class="search-wrap"><input type="search" id="coll-search" placeholder="Search rocks..." value="' + esc(APP.collSearch) + '"></div>' +
      '<div class="filter-row" id="type-row">' +
        ['all','igneous','sedimentary','metamorphic','gemstone','mineral'].map(function(f) {
          return '<button class="pill' + (APP.collFilter === f ? ' active' : '') + '" data-type="' + f + '">' +
            (f === 'all' ? '🪨 All' : typeEmoji(f) + ' ' + f.charAt(0).toUpperCase() + f.slice(1)) +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="filter-row" id="rarity-row">' +
        ['all','common','uncommon','rare','very-rare'].map(function(f) {
          return '<button class="pill' + (APP.collRarity === f ? ' active' : '') + '" data-rarity="' + f + '">' +
            (f === 'all' ? 'All Rarity' : rarityEmoji(f.replace('-',' ')) + ' ' + f.replace('-',' ').charAt(0).toUpperCase() + f.replace('-',' ').slice(1)) +
          '</button>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<div id="rocks-grid"></div>';

  document.getElementById('coll-search').addEventListener('input', function(e) {
    APP.collSearch = e.target.value;
    refreshGrid();
  });
  document.getElementById('type-row').addEventListener('click', function(e) {
    var p = e.target.closest('.pill');
    if (!p) return;
    APP.collFilter = p.dataset.type;
    document.querySelectorAll('#type-row .pill').forEach(function(x) { x.classList.toggle('active', x.dataset.type === APP.collFilter); });
    refreshGrid();
  });
  document.getElementById('rarity-row').addEventListener('click', function(e) {
    var p = e.target.closest('.pill');
    if (!p) return;
    APP.collRarity = p.dataset.rarity;
    document.querySelectorAll('#rarity-row .pill').forEach(function(x) { x.classList.toggle('active', x.dataset.rarity === APP.collRarity); });
    refreshGrid();
  });

  refreshGrid();
}

function refreshGrid() {
  var grid = document.getElementById('rocks-grid');
  if (!grid) return;

  var rocks = getCollection();
  if (APP.collFilter !== 'all') rocks = rocks.filter(function(r) { return r.type === APP.collFilter; });
  if (APP.collRarity !== 'all') {
    var rq = APP.collRarity.replace('-', ' ');
    rocks = rocks.filter(function(r) { return (r.rarity||'common').replace('-',' ') === rq; });
  }
  if (APP.collSearch) {
    var q = APP.collSearch.toLowerCase();
    rocks = rocks.filter(function(r) { return r.name.toLowerCase().includes(q); });
  }

  if (rocks.length === 0) {
    grid.innerHTML = '<div class="empty-state"><span class="es-icon">' + (getCollection().length === 0 ? '📸' : '🔍') + '</span><h3>' + (getCollection().length === 0 ? 'No rocks yet!' : 'No matches') + '</h3><p>' + (getCollection().length === 0 ? 'Tap the + button to add your first rock!' : 'Try a different filter or search term.') + '</p></div>';
    return;
  }

  grid.innerHTML = '<div class="rocks-grid">' +
    rocks.map(function(r) {
      var rc = rarityClass(r.rarity);
      return '<div class="rock-card" data-id="' + r.id + '">' +
        (r.photoDataUrl
          ? '<img class="rock-card-photo" src="' + r.photoDataUrl + '" alt="' + esc(r.name) + '" loading="lazy">'
          : '<div class="rock-card-placeholder">🪨</div>') +
        '<div class="rock-card-body">' +
          '<div class="rock-card-name">' + esc(r.name) + '</div>' +
          '<div class="rock-card-badges">' +
            '<span class="badge badge-' + (r.type||'unknown') + '">' + typeEmoji(r.type) + '</span>' +
            '<span class="badge badge-' + rc + '">' + rarityEmoji(r.rarity) + ' ' + esc((r.rarity||'common').replace('-',' ')) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';

  grid.querySelectorAll('.rock-card').forEach(function(card) {
    card.addEventListener('click', function() { showRockDetail(card.dataset.id); });
  });
}

// ===== REPORT CARD =====
var RARITY_THEMES = {
  'common':    { color: '#7F8C8D', grad: 'linear-gradient(135deg,#95A5A6,#7F8C8D)', stars: '⭐',         label: 'Common'    },
  'uncommon':  { color: '#219A52', grad: 'linear-gradient(135deg,#2ECC71,#219A52)', stars: '⭐⭐',       label: 'Uncommon'  },
  'rare':      { color: '#2471A3', grad: 'linear-gradient(135deg,#3498DB,#2471A3)', stars: '⭐⭐⭐',     label: 'Rare!'     },
  'very rare': { color: '#D4AC0D', grad: 'linear-gradient(135deg,#F4D03F,#D4AC0D)', stars: '⭐⭐⭐⭐',   label: 'VERY RARE!'},
};

function showRockDetail(rockId) {
  var rock = getCollection().find(function(r) { return r.id === rockId; });
  if (!rock) return;

  var rarity = (rock.rarity || 'common').replace('-', ' ');
  var theme  = RARITY_THEMES[rarity] || RARITY_THEMES['common'];
  var hasDetailedStats = rock.hardness || rock.lustre || rock.streak;

  // Hardness pips
  var hardnessHtml = '';
  if (rock.hardness) {
    var pips = '';
    for (var i = 1; i <= 10; i++) {
      pips += '<div class="rc-pip' + (i <= Math.round(rock.hardness) ? ' filled' : '') + '"></div>';
    }
    hardnessHtml =
      '<div class="rc-stat-row">' +
        '<span class="rc-stat-icon">💪</span>' +
        '<span class="rc-stat-label">Hardness</span>' +
        '<div class="rc-stat-right">' +
          '<div class="rc-pips">' + pips + '</div>' +
          '<span class="rc-pip-num">' + rock.hardness + '/10</span>' +
        '</div>' +
      '</div>';
  }

  // Simple stat row helper
  function statRow(icon, label, value) {
    if (!value) return '';
    return '<div class="rc-stat-row">' +
      '<span class="rc-stat-icon">' + icon + '</span>' +
      '<span class="rc-stat-label">' + label + '</span>' +
      '<span class="rc-stat-val">' + esc(value) + '</span>' +
    '</div>';
  }

  var overlay = document.createElement('div');
  overlay.className = 'rc-overlay';
  overlay.innerHTML =
    '<div class="rc-card" id="rc-card">' +

      // Photo
      '<div class="rc-photo-wrap">' +
        (rock.photoDataUrl
          ? '<img class="rc-photo" src="' + rock.photoDataUrl + '" alt="' + esc(rock.name) + '">'
          : '<div class="rc-photo-placeholder">🪨</div>') +
        '<div class="rc-ribbon" style="background:' + theme.color + '">' + theme.label + '</div>' +
      '</div>' +

      // Name banner
      '<div class="rc-banner" style="background:' + theme.grad + '">' +
        '<div class="rc-name">' + esc(rock.name) + '</div>' +
        '<div class="rc-type-row">' +
          '<span class="rc-type-badge">' + typeEmoji(rock.type) + ' ' + esc(rock.type || 'unknown') + '</span>' +
          '<span class="rc-stars">' + theme.stars + '</span>' +
        '</div>' +
      '</div>' +

      // Stats
      '<div class="rc-body">' +

        // Detailed stats or re-analyze prompt
        (hasDetailedStats
          ? '<div class="rc-section">' +
              hardnessHtml +
              statRow('✨', 'Lustre',       rock.lustre) +
              statRow('🎨', 'Streak',       rock.streak) +
              statRow('💔', 'Cleavage',     rock.cleavage) +
              statRow('👁', 'Transparency', rock.transparency) +
            '</div>'
          : '<div class="rc-reanalyze-wrap">' +
              '<button class="rc-reanalyze-btn" id="reanalyze-btn">🔬 Get Full Stats</button>' +
              '<p class="rc-reanalyze-hint">Tap to analyze this rock\'s detailed properties</p>' +
            '</div>'
        ) +

        // Composition
        (rock.composition
          ? '<div class="rc-section"><div class="rc-composition"><span class="rc-comp-label">🧪 Made of</span> ' + esc(rock.composition) + '</div></div>'
          : '') +

        // Fun fact
        (rock.funFact
          ? '<div class="rc-section"><div class="rc-fact"><span class="rc-fact-label">💡 Fun Fact</span>' + esc(rock.funFact) + '</div></div>'
          : '') +

        // Meta
        '<div class="rc-meta">' +
          (rock.location  ? '<span>📍 ' + esc(rock.location)   + '</span>' : '') +
          (rock.dateAdded ? '<span>📅 ' + fmtDate(rock.dateAdded) + '</span>' : '') +
        '</div>' +

        // Action buttons
        '<div class="rc-actions">' +
          '<button class="rc-btn-share" id="rc-share">📤 Share</button>' +
          '<button class="rc-btn-close" id="rc-close">✕ Close</button>' +
        '</div>' +
        '<button class="rc-btn-delete" id="rc-delete">🗑 Remove from Collection</button>' +

      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  // Close
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.getElementById('rc-close').addEventListener('click', function() { overlay.remove(); });

  // Share
  document.getElementById('rc-share').addEventListener('click', function() { shareCard(rock); });

  // Delete
  document.getElementById('rc-delete').addEventListener('click', function() {
    if (!confirm('Remove "' + rock.name + '" from your collection?')) return;
    saveCollection(getCollection().filter(function(r) { return r.id !== rockId; }));
    overlay.remove();
    refreshGrid();
  });

  // Re-analyze for detailed stats
  var reBtn = document.getElementById('reanalyze-btn');
  if (reBtn) {
    reBtn.addEventListener('click', function() { refreshRockStats(rockId, overlay); });
  }
}

async function refreshRockStats(rockId, overlay) {
  var rock = getCollection().find(function(r) { return r.id === rockId; });
  if (!rock || !rock.photoDataUrl) { alert('No photo available to re-analyze.'); return; }

  var btn = document.getElementById('reanalyze-btn');
  if (btn) { btn.textContent = '🔬 Analyzing...'; btn.disabled = true; }

  try {
    var result = await identifyRock(rock.photoDataUrl, 'image/jpeg', rock.name);
    var coll = getCollection();
    var idx  = coll.findIndex(function(r) { return r.id === rockId; });
    if (idx >= 0) {
      coll[idx].hardness     = result.hardness     || coll[idx].hardness;
      coll[idx].lustre       = result.lustre        || coll[idx].lustre;
      coll[idx].streak       = result.streak        || coll[idx].streak;
      coll[idx].cleavage     = result.cleavage      || coll[idx].cleavage;
      coll[idx].transparency = result.transparency  || coll[idx].transparency;
      coll[idx].composition  = result.composition   || coll[idx].composition;
      coll[idx].funFact      = result.funFact       || coll[idx].funFact;
      saveCollection(coll);
    }
    if (overlay) overlay.remove();
    showRockDetail(rockId);
  } catch (err) {
    if (btn) { btn.textContent = '🔬 Get Full Stats'; btn.disabled = false; }
    alert('Could not get stats: ' + err.message);
  }
}

function shareCard(rock) {
  var text = '🪨 ' + rock.name + '\n' +
    typeEmoji(rock.type) + ' ' + (rock.type || '') + '  ' +
    rarityEmoji(rock.rarity) + ' ' + (rock.rarity || '') + '\n' +
    (rock.funFact ? '\n💡 ' + rock.funFact : '') +
    '\n\n— Rock Collection App';

  if (navigator.share) {
    navigator.share({ title: rock.name, text: text }).catch(function() {});
  } else {
    var msg = document.createElement('div');
    msg.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#2C3E50;color:white;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;z-index:9999;text-align:center;';
    msg.textContent = '📸 Take a screenshot to share this card!';
    document.body.appendChild(msg);
    setTimeout(function() { msg.remove(); }, 3000);
  }
}

// ===== RENDER: SETS =====
function renderSets() {
  var el = document.getElementById('view-sets');

  var html =
    '<div class="page-header">' +
      '<div class="page-title">Rock Sets ⭐</div>' +
      '<div class="page-subtitle">Complete sets to become a Rock Master!</div>' +
    '</div>' +
    '<div class="sets-list">' +
    ROCK_SETS.map(function(s) {
      var p = setProgress(s);
      return '<div class="set-card" data-set="' + s.id + '">' +
        '<div class="set-card-header">' +
          '<span class="set-icon">' + s.icon + '</span>' +
          '<div class="set-info">' +
            '<div class="set-name">' + esc(s.name) + '</div>' +
            '<div class="set-desc">' + esc(s.description) + '</div>' +
          '</div>' +
          (p.pct === 100 ? '<span class="set-done-tag">✅ Done!</span>' : '') +
        '</div>' +
        '<div class="set-foot">' +
          '<span class="set-foot-text">' + p.found + ' of ' + p.total + ' found</span>' +
          '<span class="set-foot-pct">' + p.pct + '%</span>' +
        '</div>' +
        '<div class="progress-wrap"><div class="progress-fill" style="width:' + p.pct + '%"></div></div>' +
      '</div>';
    }).join('') +
    '</div>';

  el.innerHTML = html;

  el.querySelectorAll('.set-card').forEach(function(card) {
    card.addEventListener('click', function() { showSetDetail(card.dataset.set); });
  });
}

function showSetDetail(setId) {
  var set = ROCK_SETS.find(function(s) { return s.id === setId; });
  if (!set) return;
  var p = setProgress(set);

  var detail = document.createElement('div');
  detail.className = 'set-detail';
  detail.innerHTML =
    '<div class="set-detail-header">' +
      '<button class="back-btn" id="set-back">←</button>' +
      '<span class="set-detail-icon">' + set.icon + '</span>' +
      '<div>' +
        '<div class="set-detail-title">' + esc(set.name) + '</div>' +
        '<div class="set-detail-sub">' + p.found + ' of ' + p.total + ' found</div>' +
      '</div>' +
    '</div>' +
    '<div class="set-detail-body">' +
      '<div class="set-detail-prog">' +
        '<div class="set-detail-prog-row">' +
          '<span style="font-size:14px;color:var(--color-text-muted)">' + p.pct + '% complete</span>' +
          (p.pct === 100 ? '<span style="color:#1A7A4A;font-weight:800">✅ Complete!</span>' : '') +
        '</div>' +
        '<div class="progress-wrap"><div class="progress-fill" style="width:' + p.pct + '%"></div></div>' +
      '</div>' +
      '<div class="set-rocks-grid">' +
      set.rocks.map(function(rock) {
        var found = isRockFound(set, rock);
        return '<div class="set-rock-tile ' + (found ? 'found' : 'missing') + '">' +
          '<div class="tile-icon">' + (found ? '✅' : typeEmoji(rock.type)) + '</div>' +
          '<div class="tile-name">' + esc(rock.name) + '</div>' +
        '</div>';
      }).join('') +
      '</div>' +
    '</div>';

  document.body.appendChild(detail);
  document.getElementById('set-back').addEventListener('click', function() { detail.remove(); });
}

// ===== RENDER: WISHLIST =====
function renderWishlist() {
  var el = document.getElementById('view-wishlist');

  var unfound = [];
  ROCK_SETS.forEach(function(set) {
    set.rocks.forEach(function(rock) {
      if (!isRockFound(set, rock)) unfound.push({ set: set, rock: rock });
    });
  });

  var filtered = APP.wishFilter === 'all' ? unfound : unfound.filter(function(x) { return x.set.id === APP.wishFilter; });

  el.innerHTML =
    '<div class="page-header">' +
      '<div class="page-title">Still Looking 🔍</div>' +
      '<div class="page-subtitle">' + unfound.length + ' rock' + (unfound.length !== 1 ? 's' : '') + ' left to find</div>' +
    '</div>' +
    '<div class="wishlist-filters">' +
      '<div class="filter-row">' +
        '<button class="pill' + (APP.wishFilter === 'all' ? ' active' : '') + '" data-wf="all">🔍 All</button>' +
        ROCK_SETS.map(function(s) {
          return '<button class="pill' + (APP.wishFilter === s.id ? ' active' : '') + '" data-wf="' + s.id + '">' + s.icon + ' ' + esc(s.name) + '</button>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<div class="wishlist-list">' +
      (filtered.length === 0
        ? '<div class="empty-state"><span class="es-icon">🏆</span><h3>Set complete!</h3><p>You\'ve found all rocks in this set. Amazing work!</p></div>'
        : filtered.slice(0, 60).map(function(x) {
            return '<div class="wish-item">' +
              '<div class="wish-icon">' + typeEmoji(x.rock.type) + '</div>' +
              '<div class="wish-info">' +
                '<div class="wish-name">' + esc(x.rock.name) + '</div>' +
                '<div class="wish-set">' + x.set.icon + ' ' + esc(x.set.name) + '</div>' +
                (x.rock.description ? '<div class="wish-desc">' + esc(x.rock.description) + '</div>' : '') +
              '</div>' +
              '<button class="btn-found" data-sid="' + x.set.id + '" data-rid="' + x.rock.id + '" data-rname="' + esc(x.rock.name) + '">✓ Found!</button>' +
            '</div>';
          }).join('')
      ) +
    '</div>';

  el.querySelectorAll('.filter-row .pill').forEach(function(p) {
    p.addEventListener('click', function() {
      APP.wishFilter = p.dataset.wf;
      renderWishlist();
    });
  });

  el.querySelectorAll('.btn-found').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var key = btn.dataset.sid + ':' + btn.dataset.rid;
      var wf = getWishFound();
      wf[key] = true;
      saveWishFound(wf);
      celebrate(esc(btn.dataset.rname) + ' found! ✅', 'Marked as found in your wishlist!', '🎉');
      renderWishlist();
    });
  });
}

// ===== SETTINGS (gear icon) =====
function openSettings() {
  navigate('setup');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  // Nav
  document.querySelectorAll('.nav-btn[data-view]').forEach(function(btn) {
    btn.addEventListener('click', function() { navigate(btn.dataset.view); });
  });

  // Settings button
  var gear = document.getElementById('settings-btn');
  if (gear) gear.addEventListener('click', openSettings);

  // Route
  if (!isSetupDone() || !getApiKey()) {
    navigate('setup');
  } else {
    navigate('home');
  }
});
