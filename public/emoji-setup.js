// Emoji picker for composer using Emoji Button (CDN). No framework; safe to load after DOM.
(function () {
  try {
    // 1) Inject lightweight styles for the small emoji button
    var style = document.createElement('style');
    style.textContent = [
      '.icon-btn{width:32px;min-width:32px;height:30px;padding:0;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:#fff;color:#000;border:1px solid rgba(0,0,0,0.08);font-size:18px;line-height:1;}',
      '.icon-btn:hover{opacity:1;}',
      '.icon-btn:active{transform:none;opacity:0.85;}',
      '.theme-dark .icon-btn{background:#2c2c2e;color:#fff;border-color:rgba(255,255,255,0.12);}'
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
      var s = document.createElement('script');
      // Use UMD build to avoid "Unexpected token export" in non-module script context
      s.src = 'https://cdn.jsdelivr.net/npm/@joeattardi/emoji-button@4/dist/index.umd.min.js';
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(window.EmojiButton); };
      s.onerror = function () { reject(new Error('failed to load emoji-button')); };
      document.head.appendChild(s);
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

  loadEmojiLib().then(bindPicker).catch(function () {
    // Ignore load failure: chat still works without the picker.
  });
})();
