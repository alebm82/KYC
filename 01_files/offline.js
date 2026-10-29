/*
 * Local offline layer for the CCPNet KYC wizard.
 *
 *  - Replaces the Cloudflare Turnstile captcha with a local stub.
 *  - Auto-saves the form in localStorage and restores it on reload.
 *  - Adds small Export / Import / Reset buttons.
 *
 * Nothing is ever sent to the Internet and no request is made to a server:
 * the PDF is built in this page with pdf-lib.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ccpnet_kyc_state_v1';

  /* ------------------------------------------------------------------ */
  /* 1. Turnstile stub                                                    */
  /* ------------------------------------------------------------------ */

  var notify = function () {};

  window.turnstile = {
    render: function (el, opts) {
      if (el) {
        el.innerHTML =
          '<div class="local-captcha">' +
          '<strong>Mode local.</strong> Aucune vérification anti-robot n\'est nécessaire.<br>' +
          'Le PDF est généré sur cet ordinateur, sans envoi de vos données sur Internet.' +
          '</div>';
      }
      notify = (opts && typeof opts.callback === 'function') ? opts.callback : function () {};
      notify('local-offline');
    },
    reset: function () {
      // Keep a token available so the form can be generated more than once.
      notify('local-offline');
    },
    remove: function () {},
    getResponse: function () {
      return 'local-offline';
    }
  };

  /* ------------------------------------------------------------------ */
  /* 2. Form state save / restore                                         */
  /* ------------------------------------------------------------------ */

  function getForm() {
    return document.getElementById('kycForm');
  }

  function collectState() {
    var form = getForm();
    var data = {};
    if (!form) return data;

    form.querySelectorAll('input, select').forEach(function (el) {
      var name = el.name;
      if (!name) return;

      if (el.type === 'radio') {
        if (el.checked) data[name] = el.value;
      } else if (el.type === 'checkbox') {
        if (name === 'hasMandataire') {
          data[name] = el.checked;
        } else if (el.checked) {
          if (!Array.isArray(data[name])) data[name] = [];
          data[name].push(el.value);
        }
      } else {
        data[name] = el.value;
      }
    });

    return data;
  }

  function splitLegacyName(value) {
    var parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return ['', ''];
    if (parts.length === 1) return [parts[0], ''];
    // Older exports stored one "Nom et Prénom" value.  Arabic names are
    // usually written first-name first, Latin ones family-name first.
    if (/[\u0600-\u06ff]/.test(parts.join(' '))) {
      return [parts[parts.length - 1], parts.slice(0, -1).join(' ')];
    }
    return [parts[0], parts.slice(1).join(' ')];
  }

  function migrateState(data) {
    if (!data) return data;
    if (!('t_nom' in data) && !('t_prenom' in data) && data.t_nomPrenom) {
      var split = splitLegacyName(data.t_nomPrenom);
      data.t_nom = split[0];
      data.t_prenom = split[1];
    }
    return data;
  }

  function applyState(data) {
    var form = getForm();
    if (!form || !data) return;
    data = migrateState(data);

    form.querySelectorAll('input, select').forEach(function (el) {
      var name = el.name;
      if (!name || !(name in data)) return;
      var value = data[name];

      if (el.type === 'radio') {
        el.checked = String(value) === String(el.value);
      } else if (el.type === 'checkbox') {
        if (name === 'hasMandataire') {
          el.checked = !!value;
        } else {
          el.checked = Array.isArray(value) && value.indexOf(el.value) !== -1;
        }
      } else {
        el.value = value == null ? '' : value;
      }
    });

    // Let the wizard reveal the mandataire steps.
    var has = form.querySelector('#hasMandataire');
    if (has) has.dispatchEvent(new Event('change', { bubbles: true }));

    // Re-run the page's own sanitising / validation handlers.
    form.querySelectorAll('input[type="text"], input[type="email"]').forEach(function (el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    restoreBureaux(data, 0);
  }

  // The post-office list arrives asynchronously, so retry until the
  // establishment <select> has been populated, then replay the saved choice.
  var restoring = false;

  function restoreBureaux(data, tries) {
    var form = getForm();
    if (!form) return;

    var pending = false;

    ['t', 'm'].forEach(function (prefix) {
      var wilaya = form.querySelector('[name="' + prefix + '_wilaya"]');
      var etab = form.querySelector('[name="' + prefix + '_etablissement"]');
      if (!wilaya || !etab || !wilaya.value) return;

      // Ask the page to (re)fill the establishment list. The bundled
      // bureaux.js data is normally ready already, but keep the retry below
      // for slow file:// loads.
      wilaya.dispatchEvent(new Event('change', { bubbles: true }));

      if (etab.options.length <= 1) {
        pending = true;
        return;
      }

      var wanted = data[prefix + '_etablissement'];
      if (wanted) {
        etab.value = wanted;
        if (etab.value !== wanted) etab.value = '';
      }
      etab.dispatchEvent(new Event('change', { bubbles: true }));
    });

    if (pending && tries < 40) {
      setTimeout(function () { restoreBureaux(data, tries + 1); }, 200);
      return;
    }

    // Restoration is over: let autosave resume and store the settled state.
    restoring = false;
    saveNow();
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.data ? parsed.data : null;
    } catch (err) {
      return null;
    }
  }

  var saveTimer = null;
  var clearing = false;

  function saveNow() {
    if (restoring || clearing) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data: collectState() })
      );
      flashSaved();
    } catch (err) {
      /* storage full or blocked: keep working */
    }
  }

  function scheduleSave() {
    if (clearing) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }

  /* ------------------------------------------------------------------ */
  /* 3. Small local toolbar                                               */
  /* ------------------------------------------------------------------ */

  var L10N = {
    fr: {
      title: 'Mes données',
      export: 'Exporter',
      import: 'Importer',
      clear: 'Effacer',
      note: 'Sauvegarde automatique sur cet ordinateur. Aucune donnée n\'est envoyée sur Internet.',
      saved: 'enregistré'
    },
    ar: {
      title: 'بياناتي',
      export: 'تصدير',
      import: 'استيراد',
      clear: 'مسح',
      note: 'حفظ تلقائي على هذا الحاسوب. لا تُرسل أي بيانات إلى الإنترنت.',
      saved: 'تم الحفظ'
    }
  };

  function labels() {
    return L10N[window.__KYC_LANG__] || L10N.fr;
  }

  var savedLabel = null;
  var savedTimer = null;
  var toolbarEls = null;

  function applyLabels() {
    var l = labels();
    if (toolbarEls) {
      toolbarEls.title.textContent = l.title;
      toolbarEls.exportBtn.textContent = l.export;
      toolbarEls.importBtn.textContent = l.import;
      toolbarEls.clearBtn.textContent = l.clear;
      toolbarEls.note.textContent = l.note;
    }
  }

  function flashSaved() {
    if (!savedLabel) return;
    savedLabel.textContent = labels().saved;
    if (savedTimer) clearTimeout(savedTimer);
    savedTimer = setTimeout(function () {
      if (savedLabel) savedLabel.textContent = '';
    }, 1600);
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function buildToolbar() {
    var tools = document.createElement('div');
    tools.className = 'local-tools';

    var title = document.createElement('div');
    title.className = 'local-tools-title';

    var row = document.createElement('div');
    row.className = 'local-tools-row';

    var exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.title = 'Enregistrer les données saisies dans un fichier JSON';
    exportBtn.addEventListener('click', function () {
      var state = collectState();
      var arabic = /[\u0600-\u06ff]/.test((state.t_nom || '') + (state.t_prenom || ''));
      var name = (arabic ? [state.t_prenom, state.t_nom] : [state.t_nom, state.t_prenom])
        .filter(Boolean).join(' ') || state.t_nomPrenom || 'client';
      var safe = String(name).replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40);
      download('CCP_KYC_' + (safe || 'client') + '.json',
        JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data: state }, null, 2));
    });

    var importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.title = 'Recharger un fichier JSON exporté précédemment';

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.hidden = true;
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result));
          var data = parsed && parsed.data ? parsed.data : parsed;
          if (!data || typeof data !== 'object') throw new Error('format');
          applyState(data);
          saveNow();
        } catch (err) {
          alert('Fichier illisible : ce n\'est pas un export de ce formulaire.');
        }
        fileInput.value = '';
      };
      reader.readAsText(file, 'utf-8');
    });

    importBtn.addEventListener('click', function () { fileInput.click(); });

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'danger';
    clearBtn.title = 'Vider le formulaire et les données enregistrées';
    clearBtn.addEventListener('click', function () {
      if (!confirm('Effacer toutes les données saisies et enregistrées sur cet ordinateur ?')) return;
      clearing = true;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }

      var form = getForm();
      if (form) {
        form.reset();
        form.querySelectorAll('.is-valid, .is-invalid').forEach(function (el) {
          el.classList.remove('is-valid', 'is-invalid');
        });
      }

      // Wipe every local key (saved form state, etc.), but keep the
      // interface language so the user does not land back in French.
      var lang = null;
      try { lang = localStorage.getItem('kyc_lang'); } catch (err) {}
      try {
        localStorage.clear();
        if (lang) localStorage.setItem('kyc_lang', lang);
      } catch (err) {}
      try { sessionStorage.clear(); } catch (err) {}

      location.reload();
    });

    savedLabel = document.createElement('span');
    savedLabel.className = 'saved';

    var note = document.createElement('p');
    note.className = 'local-tools-note';

    row.appendChild(exportBtn);
    row.appendChild(importBtn);
    row.appendChild(clearBtn);
    tools.appendChild(title);
    tools.appendChild(row);
    tools.appendChild(note);
    tools.appendChild(savedLabel);
    tools.appendChild(fileInput);

    // Dock the tools under the wizard steps, otherwise fall back to the footer.
    var nav = document.querySelector('.wizard-nav');
    if (nav) {
      nav.appendChild(tools);
    } else {
      tools.classList.add('local-tools-floating');
      document.body.appendChild(tools);
    }

    toolbarEls = {
      title: title,
      note: note,
      exportBtn: exportBtn,
      importBtn: importBtn,
      clearBtn: clearBtn
    };

    applyLabels();

    // The page's own language switch does not know about this toolbar.
    if (typeof window.setLang === 'function' && !window.setLang.__localWrapped) {
      var originalSetLang = window.setLang;
      var wrapped = function (lang) {
        originalSetLang(lang);
        applyLabels();
      };
      wrapped.__localWrapped = true;
      window.setLang = wrapped;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 4. Wire everything after the wizard has initialised                  */
  /* ------------------------------------------------------------------ */

  function boot() {
    buildToolbar();

    // Restore after wizard.js has run (it is loaded just before this timeout).
    var state = loadState();
    if (state) {
      restoring = true;
      applyState(state);
    }

    var form = getForm();
    if (form) {
      form.addEventListener('input', scheduleSave, true);
      form.addEventListener('change', scheduleSave, true);
    }
    window.addEventListener('beforeunload', saveNow);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 0);
  }
})();
