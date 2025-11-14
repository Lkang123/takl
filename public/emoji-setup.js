// Emoji picker for composer using Emoji Button (CDN). No framework; safe to load after DOM.
(function () {
  try {
    // 1) Inject lightweight styles for the small emoji button
    var style = document.createElement('style');
    style.textContent = [
      '.icon-btn{width:32px;min-width:32px;height:30px;padding:0;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:#fff;color:#000;border:1px solid rgba(0,0,0,0.08);font-size:18px;line-height:1;}',
      '.icon-btn:hover{opacity:1;}',
      '.icon-btn:active{transform:none;opacity:0.85;}',
      '.theme-dark .icon-btn{background:#2c2c2e;color:#fff;border-color:rgba(255,255,255,0.12);}',
      /* Fallback emoji panel */
      '.emoji-panel{position:fixed;z-index:10000;background:#fff;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);padding:8px;display:none;max-width:300px;max-height:240px;overflow:auto;}',
      '.emoji-grid{display:grid;grid-template-columns:repeat(8, 1fr);gap:6px;}',
      '.emoji-item{width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:6px;font-size:20px;}',
      '.emoji-item:hover{background:#f2f2f7;}',
      '.theme-dark .emoji-panel{background:#2c2c2e;}',
      '.theme-dark .emoji-item:hover{background:#3a3a3c;}'
    ].join('');
    document.head && document.head.appendChild(style);
  } catch (_) {}

  // 2) Find composer elements
  var form = document.getElementById('form');
  var input = document.getElementById('input');
  if (!form || !input) return;

  // 3) Create emoji button and insert before input
  var emojiBtn = document.createElement('button');
  emojiBtn.type = 'button';
  emojiBtn.id = 'emojiBtn';
  emojiBtn.className = 'icon-btn';
  emojiBtn.setAttribute('aria-label', '表情');
  emojiBtn.textContent = '🙂';
  try {
    form.insertBefore(emojiBtn, input);
  } catch (_) {
    form.insertBefore(emojiBtn, form.firstChild);
  }

  // 4) Load Emoji Button library and wire up the picker
  function loadEmojiLib() {
    return new Promise(function (resolve, reject) {
      if (window.EmojiButton) return resolve(window.EmojiButton);
      // 1) Try local classic script (UMD/global)
      var local = document.createElement('script');
      local.src = '/vendor/emoji-button/index.js';
      local.async = true;
      local.onload = function(){ if (window.EmojiButton) resolve(window.EmojiButton); else tryCdnClassic(); };
      local.onerror = function(){ tryCdnClassic(); };
      document.head.appendChild(local);
      function tryCdnClassic(){
        if (window.EmojiButton) return resolve(window.EmojiButton);
        var cdn = document.createElement('script');
        cdn.src = 'https://unpkg.com/@joeattardi/emoji-button@4/dist/index.js';
        cdn.async = true;
        cdn.onload = function(){ if (window.EmojiButton) resolve(window.EmojiButton); else tryModuleShim(); };
        cdn.onerror = function(){ tryModuleShim(); };
        document.head.appendChild(cdn);
      }
      function tryModuleShim(){
        if (window.EmojiButton) return resolve(window.EmojiButton);
        // 3) ESM module shim as last resort
        var mod = document.createElement('script');
        mod.type = 'module';
        mod.textContent = "import EmojiButton from '/vendor/emoji-button/index.js'; window.EmojiButton = EmojiButton;";
        mod.onload = function(){ if (window.EmojiButton) resolve(window.EmojiButton); else reject(new Error('emoji-button not available')); };
        mod.onerror = function(){ reject(new Error('emoji-button module failed')); };
        document.head.appendChild(mod);
      }
    });
  }

  function insertAtCaret(el, text) {
    try {
      var start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
      var end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
      var before = el.value.slice(0, start);
      var after = el.value.slice(end);
      el.value = before + text + after;
      var pos = start + text.length;
      if (el.setSelectionRange) el.setSelectionRange(pos, pos);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (_) {
      el.value += text;
    }
  }

  function bindPicker(EmojiButton) {
    if (!EmojiButton) return;
    var picker = new EmojiButton({ zIndex: 10000, autoHide: true, showPreview: false });

    function openPicker() {
      try { input.focus({ preventScroll: true }); } catch (_) {}
      picker.togglePicker(emojiBtn);
    }

    // Keep focus so the keyboard doesn't hide on mobile
    emojiBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
      try { input.focus({ preventScroll: true }); } catch (_) {}
    }, { passive: false });
    emojiBtn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      openPicker();
    }, { passive: false });
    emojiBtn.addEventListener('click', function (e) {
      e.preventDefault();
      openPicker();
    });

    picker.on('emoji', function (selection) {
      var ch = (selection && (selection.emoji || selection.unicode)) || selection || '';
      if (ch) insertAtCaret(input, ch);
      try { input.focus({ preventScroll: true }); } catch (_) {}
    });
  }

  // Fallback simple panel
  function setupFallbackPalette(btn, targetInput) {
    var panel = document.createElement('div');
    panel.className = 'emoji-panel';
    var grid = document.createElement('div'); grid.className = 'emoji-grid'; panel.appendChild(grid);
    var emojis = ('😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😍 😘 😜 🤪 🤩 😎 🤔 🙄 😏 😢 😭 😡 👍 👎 👏 🙌 🙏 ✌️ 🤝 🎉 🔥 ✨ 🌟 💯 ❤️ 🧡 💛 💚 💙 💜 🤍 🤎 🖤').split(/\s+/);
    emojis.forEach(function(e){
      if (!e) return;
      var item = document.createElement('div');
      item.className = 'emoji-item';
      item.textContent = e;
      item.addEventListener('click', function(){
        // insert and close
        try {
          var start = typeof targetInput.selectionStart === 'number' ? targetInput.selectionStart : targetInput.value.length;
          var end = typeof targetInput.selectionEnd === 'number' ? targetInput.selectionEnd : targetInput.value.length;
          var before = targetInput.value.slice(0, start);
          var after = targetInput.value.slice(end);
          targetInput.value = before + e + after;
          var pos = start + e.length;
          targetInput.setSelectionRange && targetInput.setSelectionRange(pos, pos);
          targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (_) {
          targetInput.value += e;
        }
        hide();
        try { targetInput.focus({ preventScroll: true }); } catch (_) {}
      });
      grid.appendChild(item);
    });
    document.body.appendChild(panel);

    function show(anchor) {
      panel.style.display = 'block';
      var rect = anchor.getBoundingClientRect();
      var top = rect.top - panel.offsetHeight - 8;
      if (top < 8) top = rect.bottom + 8;
      var left = rect.left;
      if (left + panel.offsetWidth > window.innerWidth - 8) {
        left = window.innerWidth - panel.offsetWidth - 8;
      }
      if (left < 8) left = 8;
      panel.style.top = top + 'px';
      panel.style.left = left + 'px';
    }
    function hide(){ panel.style.display = 'none'; }

    // wire events
    btn.addEventListener('mousedown', function(e){ e.preventDefault(); try { targetInput.focus({ preventScroll: true }); } catch (_) {} }, { passive:false });
    btn.addEventListener('click', function(e){ e.preventDefault(); if (panel.style.display === 'block') hide(); else show(btn); });
    document.addEventListener('click', function(e){
      if (panel.style.display !== 'block') return;
      if (panel.contains(e.target) || e.target === btn) return;
      hide();
    }, true);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, { passive: true });
  }

  // Try to load library; if failed, enable fallback panel
  loadEmojiLib().then(bindPicker).catch(function () {
    try { setupFallbackPalette(emojiBtn, input); } catch(_) {}
  });
})();
