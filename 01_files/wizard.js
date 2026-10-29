const form = document.getElementById('kycForm');
const hasMandataire = document.getElementById('hasMandataire');
const statusMsg = document.getElementById('statusMsg');
const submitBtn = document.getElementById('submitBtn');
const navList = document.getElementById('wizardList');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const stepMsg = document.getElementById('stepMsg');

const MANDATAIRE_STEPS = [5, 6, 7, 8];
const LANG_KEY = 'kyc_lang';
let current = 1;

const AR_LETTERS = '\\u0600-\\u06FF\\u200c\\u200d';
const isAr = () => currentLang() === 'ar';

function setLang(lang) {
  window.__KYC_LANG__ = lang === 'ar' ? 'ar' : 'fr';
  try { localStorage.setItem(LANG_KEY, window.__KYC_LANG__); } catch (err) { }
  applyLang();
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function currentBureauText() {
  const etabSelect = form.querySelector('[name="t_etablissement"]');
  return etabSelect && etabSelect.value ? etabSelect.value : 'XX';
}

function renderGenerateNote() {
  const note = document.querySelector('.generate-note');
  if (note) note.innerHTML = t('label.generateNote', { bureau: escapeHtml(currentBureauText()) });
}

function renderDocs() {
  const box = document.getElementById('docsContent');
  if (box) box.innerHTML = t('docs.content');
}

function applyLang() {
  const lang = currentLang();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = t('page.title');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle;
    if (key) el.title = t(key);
  });

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    const on = btn.dataset.lang === lang;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });

  populateNationalites();
  populateWilayas();
  renderGenerateNote();
  renderDocs();
  renderRecap();

  const panel = getPanel(current);
  if (panel) panel.querySelectorAll('input, select').forEach((i) => validateSingleInput(i));
  if (stepMsg) { stepMsg.textContent = ''; stepMsg.className = ''; }
  if (statusMsg) { statusMsg.textContent = ''; statusMsg.className = ''; }
}

document.querySelectorAll('.lang-btn').forEach((btn) => {
  btn.addEventListener('click', () => setLang(btn.dataset.lang));
});

const maxStep = () => (hasMandataire.checked ? 10 : 6);
const recapStep = () => maxStep() - 1;
const getPanel = (step) => document.querySelector(`.wizard-step-panel[data-step="${step}"]`);

function wireConditional(prefix) {
  const usaRadios = form.querySelectorAll(`input[name="${prefix}_residentUSA"]`);
  const fiscalRow = document.getElementById(`${prefix}_fiscalFormRow`);
  usaRadios.forEach((r) =>
    r.addEventListener('change', () => {
      fiscalRow.style.display = form.querySelector(`input[name="${prefix}_residentUSA"]:checked`).value === 'oui' ? 'flex' : 'none';
    })
  );

  const ppeRadios = form.querySelectorAll(`input[name="${prefix}_ppe"]`);
  const ppeRow = document.getElementById(`${prefix}_raisonPPERow`);
  ppeRadios.forEach((r) =>
    r.addEventListener('change', () => {
      ppeRow.style.display = form.querySelector(`input[name="${prefix}_ppe"]:checked`).value === 'oui' ? 'block' : 'none';
    })
  );
}
wireConditional('t');
wireConditional('m');

const PRECISER_STRIP_RE = /[^A-Za-z0-9À-ÖØ-öø-ÿ\s'’.,()]/g;
function precisierStripRe() {
  return isAr() ? new RegExp(`[^${AR_LETTERS}0-9\\s'’.,()]`, 'gu') : PRECISER_STRIP_RE;
}
function sanitizeFreeTextInput(input) {
  input.addEventListener('input', () => {
    const cleaned = input.value.replace(precisierStripRe(), '').replace(/\s+/g, ' ');
    if (cleaned !== input.value) input.value = cleaned;
  });
}
document.querySelectorAll('input[name$="_raisonPPE"]').forEach(sanitizeFreeTextInput);

const AMOUNT_STRIP_RE = /[^0-9.]/g;
function sanitizeAmountInput(input) {
  input.addEventListener('input', () => {
    const cleaned = input.value.replace(AMOUNT_STRIP_RE, '');
    if (cleaned !== input.value) input.value = cleaned;
  });
}
document.querySelectorAll('input[name$="_revenuAutrePreciser"]').forEach(sanitizeAmountInput);

const CP_EXACT_RE = /^\d{5}$/;
const NAME_LET_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s'’.-]*$/;
const ADDR_MIN_LENGTH = 5;
const ADDR_MAX_LENGTH = 60;

const LETTER_STRIP_RE = /[^A-Za-zÀ-ÖØ-öø-ÿ\s'’.-]/g;
const CP_STRIP_RE = /[^0-9]/g;

function letterStripRe() {
  return isAr() ? new RegExp(`[^${AR_LETTERS}0-9\\s'’.-]`, 'gu') : LETTER_STRIP_RE;
}
function nameLetRe() {
  return isAr() ? new RegExp(`^[${AR_LETTERS}][${AR_LETTERS}0-9\\s'’.-]*$`) : NAME_LET_RE;
}

const LETTER_ONLY_NAMES = new Set([
  't_nom', 't_prenom', 't_nomPrenom', 't_nomPrenomMere', 't_prenomPere', 't_paysNaissance',
  'm_nomPrenomTitulaire', 'm_nomPrenomMandataire', 'm_nomPrenomMere', 'm_prenomPere', 'm_paysNaissance',
]);

const ADDRESS_NAMES = new Set(['t_adresse', 'm_adresseResidence']);

const CP_NAMES = new Set([
  't_codePostalWilaya', 't_codePostalEtablissement',
  'm_codePostalWilaya', 'm_codePostalEtablissement',
]);

function fieldRoot(input) {
  return input.closest('.field') || input.closest('.checkbox-grid') || null;
}

function markField(input, ok, allowEmpty) {
  const root = fieldRoot(input);
  if (!root) return;
  root.classList.remove('is-valid', 'is-invalid');
  if (ok && input.value.trim() !== '') root.classList.add('is-valid');
  else if (!allowEmpty && !ok) root.classList.add('is-invalid');
}

function validateSingleInput(input) {
  const name = input.name;
  if (CP_NAMES.has(name)) {
    markField(input, CP_EXACT_RE.test(input.value), true);
  } else if (LETTER_ONLY_NAMES.has(name)) {
    if (input.value.trim() !== '') markField(input, nameLetRe().test(input.value), true);
    else markField(input, false, true);
  } else if (ADDRESS_NAMES.has(name)) {
    const ok = input.value.trim().length >= ADDR_MIN_LENGTH && input.value.trim().length <= ADDR_MAX_LENGTH && textRe().test(input.value);
    markField(input, ok, true);
  } else {
    markField(input, true, true);
  }
}

function wireRealTimeValidation() {
  document.querySelectorAll('input[type="text"], input[type="email"]').forEach((input) => {
    const name = input.name;
    const isCp = CP_NAMES.has(name);
    const isLetter = LETTER_ONLY_NAMES.has(name);
    if (!isCp && !isLetter && !ADDRESS_NAMES.has(name)) return;

    input.addEventListener('input', () => {
      if (isCp) {
        const cleaned = input.value.replace(CP_STRIP_RE, '').slice(0, 5);
        if (cleaned !== input.value) input.value = cleaned;
      } else if (isLetter) {
        const cleaned = input.value.replace(letterStripRe(), '').replace(/\s+/g, ' ');
        if (cleaned !== input.value) input.value = cleaned;
      }
      validateSingleInput(input);
    });

    input.addEventListener('blur', () => validateSingleInput(input));
  });

  CP_NAMES.forEach((name) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (el) el.addEventListener('input', () => validateSingleInput(el));
  });
}

wireRealTimeValidation();

const NATIONALITES = [
  'Algérienne', 'Marocaine', 'Tunisienne', 'Libyenne', 'Mauritanienne',
  'Malienne', 'Nigérienne', 'Sénégalaise', 'Française', 'Espagnole',
  'Italienne', 'Belge', 'Allemande', 'Britannique', 'Canadienne',
  'Américaine', 'Égyptienne', 'Syrienne', 'Libanaise', 'Turque',
  'Chinoise', 'Malaisienne', 'Autre',
];
function populateNationalites() {
  document.querySelectorAll('select[name$="_nationalite"]').forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = '';
    NATIONALITES.forEach((n) => {
      const opt = document.createElement('option');
      const display = t('nat.' + n);
      opt.value = display;
      opt.textContent = display;
      sel.appendChild(opt);
    });
    if (current && Array.from(sel.options).some((o) => o.value === current)) sel.value = current;
    else sel.value = t('nat.Algérienne');
  });
}
populateNationalites();

hasMandataire.addEventListener('change', () => {
  document.querySelectorAll('[data-mandataire]').forEach((el) => {
    el.hidden = !hasMandataire.checked;
  });
  if (current > maxStep()) current = maxStep();
  render();
});

function render() {
  const max = maxStep();
  document.querySelectorAll('.wizard-step-panel').forEach((p) => {
    const isGen = p.dataset.generate === 'true';
    const isRecap = p.dataset.recap === 'true';
    p.classList.toggle('active', isGen ? current === max : (isRecap ? current === max - 1 : +p.dataset.step === current));
  });
  navList.querySelectorAll('li').forEach((li) => {
    const isGen = li.dataset.generate === 'true';
    const isRecap = li.dataset.recap === 'true';
    if (isGen) {
      li.classList.toggle('active', current === max);
      li.classList.toggle('done', current > max);
      li.classList.toggle('visited', current >= max);
      li.classList.toggle('locked', current < max);
    } else if (isRecap) {
      li.classList.toggle('active', current === max - 1);
      li.classList.toggle('done', current > max - 1);
      li.classList.toggle('visited', current >= max - 1);
      li.classList.toggle('locked', current < max - 1);
    } else {
      const s = +li.dataset.step;
      li.classList.toggle('active', s === current);
      li.classList.toggle('done', s < current);
      li.classList.toggle('visited', s <= current);
      li.classList.toggle('locked', s > current);
    }
  });
  prevBtn.disabled = current === 1;
  nextBtn.style.display = current < max ? '' : 'none';
  stepMsg.textContent = '';
  stepMsg.className = '';
  scrollActiveStepIntoView();
  if (current === max - 1) renderRecap();
  if (current === max) ensureTurnstile();
}

function scrollActiveStepIntoView() {
  if (!window.matchMedia('(max-width: 900px)').matches) return;
  const active = navList.querySelector('li.active');
  if (!active) return;
  const c = navList.getBoundingClientRect();
  const a = active.getBoundingClientRect();
  if (a.left < c.left || a.right > c.right) {
    navList.scrollBy({ left: a.left - c.left - (c.width - a.width) / 2, behavior: 'smooth' });
  }
}

let turnstileToken = '';
let turnstileRendered = false;

function renderTurnstile() {
  const widget = document.getElementById('turnstileWidget');
  if (!widget || turnstileRendered || !window.turnstile) return;
  const sitekey = widget.dataset.sitekey;
  if (!sitekey) return;
  window.turnstile.render(widget, {
    sitekey,
    callback: (token) => { turnstileToken = token; },
    'error-callback': () => { turnstileToken = ''; },
    'expired-callback': () => { turnstileToken = ''; },
  });
  turnstileRendered = true;
}

window.onTurnstileApiLoad = () => {
  if (current === maxStep()) renderTurnstile();
};

function ensureTurnstile() {
  if (!window.turnstile) return;
  renderTurnstile();
}

function resetTurnstile() {
  const widget = document.getElementById('turnstileWidget');
  if (window.turnstile && widget && turnstileRendered) {
    try { window.turnstile.reset(widget); } catch (err) { }
  }
  turnstileToken = '';
}

prevBtn.addEventListener('click', () => {
  if (current > 1) {
    current--;
    render();
    getPanel(current).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

navList.addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  if (li.dataset.recap) {
    if (current >= recapStep()) {
      current = recapStep();
      render();
    }
    return;
  }
  const s = +li.dataset.step;
  if (s <= current && s !== current) {
    current = s;
    render();
  }
});

function stepFilled(panel) {
  let filled = 0;
  panel.querySelectorAll('input, select').forEach((i) => {
    if ((i.type === 'radio' || i.type === 'checkbox') && i.checked) filled++;
    else if (i.tagName === 'SELECT') { if (i.value !== '') filled++; }
    else if (i.value && i.value.trim() !== '') filled++;
  });
  return filled;
}

const prefixFor = (step) => (step >= 5 ? 'm' : 't');
const val = (prefix, name) => {
  const el = form.querySelector(`[name="${prefix}_${name}"]`);
  return el ? el.value.trim() : '';
};
const checkedVal = (prefix, name) => {
  const el = form.querySelector(`input[name="${prefix}_${name}"]:checked`);
  return el ? el.value : '';
};
const EMAIL_RE = /^(?![.])[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9-]+(?:\.[A-Z0-9-]{2,})+$/i;
const NIN_RE = /^\d{18}$/;
const PHONE_RE = /^[0-9 +().-]{6,20}$/;
const TEXT_RE = /^[A-Za-z0-9À-ÖØ-öø-ÿ\s'’.,\-/()°]+$/;
const PRECISER_RE = /^[A-Za-z0-9À-ÖØ-öø-ÿ\s'’.,()]+$/;
const NAT_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s'’.,-]*$/;
const AMOUNT_RE = /^[0-9][0-9.]*$/;

function textRe() {
  return isAr() ? new RegExp(`^[${AR_LETTERS}0-9\\s'’.,\\-/()°]+$`) : TEXT_RE;
}
function precisierRe() {
  return isAr() ? new RegExp(`^[${AR_LETTERS}0-9\\s'’.,()]+$`) : PRECISER_RE;
}
function natRe() {
  return isAr() ? new RegExp(`^[${AR_LETTERS}][${AR_LETTERS}0-9\\s'’.,-]*$`) : NAT_RE;
}
function wilayaEtabRe() {
  return new RegExp(`^[A-Za-z0-9À-ÖØ-öø-ÿ${AR_LETTERS}\\s'’.,\\-/()°]+$`);
}

const FIELD_LABEL_KEYS = {
  nom: 'label.nom',
  prenom: 'label.prenom',
  nomPrenom: 'label.nomPrenom',
  nomPrenomMandataire: 'label.nomPrenomMandataire',
  nomPrenomTitulaire: 'label.nomPrenomTitulaire',
  nomPrenomMere: 'label.nomPrenomMere',
  prenomPere: 'label.prenomPere',
  paysNaissance: 'label.paysNaissance',
  adresse: 'label.adresse',
  adresseResidence: 'label.adresseResidence',
  nin: 'label.nin',
  objetOuverture: 'label.objetOuverture',
  origineFonds: 'label.origineFonds',
  dateSignature: 'label.dateSignature',
  situationPro: 'label.situationPro',
  natureActivite: 'label.natureActivite',
  secteurActivite: 'label.secteurActivite',
  profession: 'label.profession',
  nationalite: 'label.nationalite',
  autresNationalites: 'label.autresNationalites',
  raisonPPE: 'label.raisonPPE',
  wilaya: 'label.wilaya',
  etablissement: 'label.etablissement',
};

function fieldLabel(name) {
  const key = FIELD_LABEL_KEYS[name];
  return key ? t(key) : name;
}

function validateIdentite(prefix) {
  for (const name of ['nom', 'prenom', 'nomPrenom', 'nomPrenomMandataire', 'nomPrenomTitulaire', 'nomPrenomMere', 'prenomPere', 'paysNaissance', 'profession']) {
    const v = val(prefix, name);
    if (v && !nameLetRe().test(v)) return t('validation.invalidChars', { name: fieldLabel(name) });
  }

  const nat = val(prefix, 'autresNationalites');
  if (nat && !natRe().test(nat)) return t('validation.invalidChars', { name: fieldLabel('autresNationalites') });

  for (const name of ['adresse', 'adresseResidence']) {
    const v = val(prefix, name);
    if (v && !textRe().test(v)) return t('validation.invalidChars', { name: fieldLabel(name) });
    if (v && v.length > ADDR_MAX_LENGTH) return t('validation.addrMax', { name: fieldLabel(name) });
  }

  for (const name of ['wilaya', 'etablissement']) {
    const v = val(prefix, name);
    if (v && !wilayaEtabRe().test(v)) return t('validation.invalidChars', { name: fieldLabel(name) });
  }

  for (const name of ['raisonPPE']) {
    const v = val(prefix, name);
    if (v && !precisierRe().test(v)) return t('validation.invalidChars', { name: fieldLabel(name) });
  }

  const amount = val(prefix, 'revenuAutrePreciser');
  if (amount && !AMOUNT_RE.test(amount)) {
    return t('validation.invalidAmount');
  }

  const email = val(prefix, 'email');
  if (email && !EMAIL_RE.test(email)) return t('validation.invalidEmail');

  const nin = val(prefix, 'nin');
  if (nin && !NIN_RE.test(nin)) return t('validation.invalidNin');

  const telephone = val(prefix, 'telephone');
  if (telephone && !PHONE_RE.test(telephone)) {
    return t('validation.invalidPhone');
  }

  const portable = val(prefix, 'portable');
  if (portable) {
    if (!PHONE_RE.test(portable)) {
      return t('validation.invalidPortable');
    }
    const digits = portable.replace(/\D/g, '');
    if (digits.length !== 10 || !/^0[567]/.test(digits)) {
      return t('validation.invalidPortableDigits');
    }
  }

  const pays = val(prefix, 'paysNaissance');
  if (pays && !nameLetRe().test(pays)) return t('validation.invalidPays');

  const dob = val(prefix, 'dateNaissance');
  if (dob) {
    const d = new Date(dob);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(d.getTime())) {
      return t('validation.invalidDob');
    }
    if (d.getFullYear() < 1900) return t('validation.invalidDobYear');
    if (d > new Date()) return t('validation.dobFuture');
  }

  for (const name of ['codePostalEtablissement', 'codePostalWilaya']) {
    const v = val(prefix, name);
    if (v && !/^\d{5}$/.test(v)) return t('validation.invalidCp');
  }
  return '';
}

function validateStep(step) {
  if (step === recapStep()) return '';
  const prefix = prefixFor(step);
  if (prefix === 't') {
    if (!val('t', 'nom')) return t('validation.requiredField', { name: fieldLabel('nom') });
    if (!val('t', 'prenom')) return t('validation.requiredField', { name: fieldLabel('prenom') });
  } else {
    const nameEl = form.querySelector('[name="m_nomPrenomMandataire"]');
    if (nameEl && !nameEl.value.trim()) return t('validation.requiredNameMandataire');
  }

  if (step === 1 || step === 5) {
    if (step === 5) {
      if (!val(prefix, 'nomPrenomMandataire')) return t('validation.requiredNameMandataire');
      if (!val(prefix, 'nomPrenomTitulaire')) return t('validation.requiredNomPrenomTitulaire');
    }
    if (step === 1) {
      const etab = form.querySelector('[name="t_etablissement"]');
      if (etab && !etab.value) {
        return t('validation.requiredEtablissement');
      }
    }
    const addrName = step === 1 ? 'adresse' : 'adresseResidence';
    const addr = val(prefix, addrName);
    if (!addr) return t('validation.requiredAdresse');
    if (addr.length < ADDR_MIN_LENGTH) return t('validation.requiredAdresseMin');
    if (addr.length > ADDR_MAX_LENGTH) return t('validation.addrMax', { name: fieldLabel(addrName) });
    if (!textRe().test(addr)) return t('validation.invalidChars', { name: fieldLabel(addrName) });

    const nin = val(prefix, 'nin');
    if (!nin) return t('validation.requiredNin');
    if (!NIN_RE.test(nin)) return t('validation.invalidNin');

    if (!val(prefix, 'nationalite')) {
      return t('validation.requiredNationalite');
    }

    for (const name of ['nomPrenomMere', 'prenomPere', 'paysNaissance']) {
      if (!val(prefix, name)) {
        return t('validation.requiredField', { name: fieldLabel(name) });
      }
    }

    const err = validateIdentite(prefix);
    if (err) return err;
  }

  if (step === 2 || step === 6) {
    if (checkedVal(prefix, 'residentUSA') === 'oui' && !val(prefix, 'formulaireFiscal')) {
      return t('validation.requiredFiscalForm');
    }
    if (checkedVal(prefix, 'ppe') === 'oui' && !val(prefix, 'raisonPPE')) {
      return t('validation.requiredRaisonPPE');
    }
  }

  if (step === 3 || step === 7) {
    const prof = val(prefix, 'profession');
    if (prof && !nameLetRe().test(prof)) return t('validation.invalidChars', { name: fieldLabel('profession') });
    if (step === 7) {
      for (const name of ['situationPro', 'natureActivite', 'secteurActivite']) {
        if (!checkedVal('m', name)) {
          return t('validation.requiredSelect', { name: fieldLabel(name) });
        }
      }
    }
  }

  if (step === 4 || step === 8) {
    if (step === 4) {
      const revenu = checkedVal('t', 'revenuMensuel');
      const revenuAutre = val('t', 'revenuAutrePreciser');
      if (!revenu && !revenuAutre) {
        return t('validation.requiredRevenu');
      }
      for (const name of ['objetOuverture', 'origineFonds']) {
        if (!checkedVal('t', name)) {
          return t('validation.requiredSelect', { name: fieldLabel(name) });
        }
      }
    }
    if (step === 8) {
      const revenu = checkedVal('m', 'revenuMensuel');
      const revenuAutre = val('m', 'revenuAutrePreciser');
      if (!revenu && !revenuAutre) {
        return t('validation.requiredRevenu');
      }
    }
    const sig = val(prefix, 'dateSignature');
    if (!sig) return t('validation.requiredSignature');
    if (sig > today()) return t('validation.signatureFuture');
    if (sig < today()) return t('validation.signaturePast');
  }

  if (!stepFilled(getPanel(step))) {
    return t('validation.fillAtLeastOne');
  }
  return '';
}

nextBtn.addEventListener('click', () => {
  const err = validateStep(current);
  if (err) {
    stepMsg.textContent = err;
    stepMsg.className = 'error';
    return;
  }
  if (current < maxStep()) {
    current++;
    render();
    getPanel(current).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

const today = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

let BUREAUX = null;

function updateConsentBureau() {
  renderGenerateNote();
}

function loadBureaux() {
  // The post-office dataset is bundled in data/bureaux.js so the page also
  // works from file:// inside Electron, without any HTTP request.
  BUREAUX = (window.KYC_BUREAUX && typeof window.KYC_BUREAUX === 'object')
    ? window.KYC_BUREAUX
    : null;
  populateWilayas();
  if (current === recapStep()) renderRecap();
}

function populateWilayas() {
  if (!BUREAUX) return;
  const entries = Object.entries(BUREAUX).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  form.querySelectorAll('select[name$="_wilaya"]').forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = '<option value="">' + t('sel.wilaya') + '</option>';
    entries.forEach(([code, data]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${code} - ${data.wilaya}`;
      sel.appendChild(opt);
    });
    if (current && BUREAUX[current]) sel.value = current;
  });
}

function wireWilaya(prefix) {
  const wilayaSelect = form.querySelector(`[name="${prefix}_wilaya"]`);
  const etabSelect = form.querySelector(`[name="${prefix}_etablissement"]`);
  const codePostalWilayaInput = form.querySelector(`[name="${prefix}_codePostalWilaya"]`);
  const codePostalEtablissementInput = form.querySelector(`[name="${prefix}_codePostalEtablissement"]`);
  if (!wilayaSelect || !etabSelect) return;

  const updateCodePostalEtablissement = () => {
    const data = BUREAUX && BUREAUX[wilayaSelect.value];
    const bureau = data && data.bureaux.find((b) => b.nom === etabSelect.value);
    codePostalEtablissementInput.value = bureau ? (bureau.code_postal || '') : '';
    validateSingleInput(codePostalEtablissementInput);
  };

  const populateBureaux = (code) => {
    etabSelect.innerHTML = '<option value="">' + t('sel.bureau') + '</option>';
    const data = BUREAUX && BUREAUX[code];
    if (!data) return;
    data.bureaux.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.nom;
      opt.textContent = b.nom;
      etabSelect.appendChild(opt);
    });
    codePostalWilayaInput.value = code + '000';
    validateSingleInput(codePostalWilayaInput);
    if (prefix === 't') updateConsentBureau();
    updateCodePostalEtablissement();
  };

  wilayaSelect.addEventListener('change', () => {
    populateBureaux(wilayaSelect.value);
  });

  etabSelect.addEventListener('change', () => {
    if (prefix === 't') updateConsentBureau();
    updateCodePostalEtablissement();
  });
}

wireWilaya('t');
wireWilaya('m');

updateConsentBureau();
loadBureaux();

document.querySelectorAll('input[name$="_dateSignature"]').forEach((el) => {
  el.min = today();
});

function formatDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

const VALUE_LABELS = { w8: 'label.w8', w9: 'label.w9', ouverture: 'label.ouverture', mandataire: 'label.mandataire', oui: 'label.oui', non: 'label.non' };
const VALUE_OPT_KEYS = {
  reception_salaire: 'opt.receptionSalaire',
  reception_bourse: 'opt.receptionBourse',
  services_monetique: 'opt.servicesMonetique',
  paiement_facture: 'opt.paiementFacture',
  paiement_cheque: 'opt.paiementCheque',
  reception_pension: 'opt.receptionPension',
  sans_emploi: 'opt.sansEmploi',
  profession_liberale: 'opt.professionLiberale',
  auto_entrepreneur: 'opt.autoEntrepreneur',
  entreprise_publique: 'opt.entreprisePublique',
  entreprise_privee: 'opt.entreprisePrivee',
  personne_physique: 'opt.personnePhysique',
  organisation_non_lucratif: 'opt.organisationNonLucratif',
  transports_logistique: 'opt.transports',
  banque_assurance: 'opt.banque',
  agriculture_peche: 'opt.agriculture',
  construction_immobilier: 'opt.construction',
  commerce_distribution: 'opt.commerce',
  energie_eau: 'opt.energie',
  hebergement_hotellerie: 'opt.hebergement',
  information_communication: 'opt.information',
  benefices_activite: 'opt.beneficesActivite',
  pension_bourse: 'opt.pensionBourse',
  revenu_locatifs: 'opt.revenuLocatifs',
  aide_sociale: 'opt.aideSociale',
};
const VALUE_OPT_CAMEL = /_([a-z])/g;

function valueLabel(v) {
  if (!v) return '';
  if (VALUE_LABELS[v]) return t(VALUE_LABELS[v]);
  let k = VALUE_OPT_KEYS[v] || ('opt.' + v);
  let l = t(k);
  if (l === k) {
    k = 'opt.' + v.replace(VALUE_OPT_CAMEL, (m, c) => c.toUpperCase());
    l = t(k);
  }
  return l === k ? v : l;
}

function wilayaName(code) {
  const data = BUREAUX && BUREAUX[code];
  return data && data.wilaya ? data.wilaya : (code || '');
}

function recapRows(prefix) {
  const rows = [];
  const push = (labelKey, getter) => {
    const v = getter();
    if (v === '' || v == null) return;
    rows.push([t(labelKey), String(v)]);
  };
  if (prefix === 't') {
    push('label.wilaya', () => wilayaName(val('t', 'wilaya')));
    push('label.etablissement', () => val('t', 'etablissement'));
    push('label.codePostalWilaya', () => val('t', 'codePostalWilaya'));
    push('label.codePostalEtablissement', () => val('t', 'codePostalEtablissement'));
    push('label.nom', () => val('t', 'nom'));
    push('label.prenom', () => val('t', 'prenom'));
    push('label.dateNaissance', () => formatDate(val('t', 'dateNaissance')));
    push('label.paysNaissance', () => val('t', 'paysNaissance'));
    push('label.nationalite', () => val('t', 'nationalite'));
    push('label.autresNationalites', () => val('t', 'autresNationalites'));
    push('label.nin', () => val('t', 'nin'));
    push('label.nomPrenomMere', () => val('t', 'nomPrenomMere'));
    push('label.prenomPere', () => val('t', 'prenomPere'));
    push('label.adresse', () => val('t', 'adresse'));
    push('label.telephone', () => val('t', 'telephone'));
    push('label.portable', () => val('t', 'portable'));
    push('label.email', () => val('t', 'email'));
    push('label.residentUSA', () => valueLabel(checkedVal('t', 'residentUSA')));
    push('label.formulaireFiscal', () => valueLabel(checkedVal('t', 'formulaireFiscal')));
    push('label.ppe', () => valueLabel(checkedVal('t', 'ppe')));
    push('label.raisonPPE', () => val('t', 'raisonPPE'));
    push('label.profession', () => val('t', 'profession'));
    push('label.situationPro', () => valueLabel(checkedVal('t', 'situationPro')));
    push('label.natureActivite', () => valueLabel(checkedVal('t', 'natureActivite')));
    push('label.secteurActivite', () => valueLabel(checkedVal('t', 'secteurActivite')));
    push('label.revenusMensuels', () => valueLabel(checkedVal('t', 'revenuMensuel')));
    push('label.revenuAutre', () => val('t', 'revenuAutrePreciser'));
    push('label.objetOuverture', () => valueLabel(checkedVal('t', 'objetOuverture')));
    push('label.origineFonds', () => valueLabel(checkedVal('t', 'origineFonds')));
    push('label.dateSignature', () => formatDate(val('t', 'dateSignature')));
  } else {
    push('label.wilaya', () => wilayaName(val('m', 'wilaya')));
    push('label.etablissement', () => val('m', 'etablissement'));
    push('label.codePostalWilaya', () => val('m', 'codePostalWilaya'));
    push('label.codePostalEtablissement', () => val('m', 'codePostalEtablissement'));
    push('label.nomPrenomTitulaire', () => val('m', 'nomPrenomTitulaire'));
    push('label.nomPrenomMandataire', () => val('m', 'nomPrenomMandataire'));
    push('label.dateNaissance', () => formatDate(val('m', 'dateNaissance')));
    push('label.paysNaissance', () => val('m', 'paysNaissance'));
    push('label.nin', () => val('m', 'nin'));
    push('label.adresseResidence', () => val('m', 'adresseResidence'));
    push('label.nomPrenomMere', () => val('m', 'nomPrenomMere'));
    push('label.prenomPere', () => val('m', 'prenomPere'));
    push('label.nationalite', () => val('m', 'nationalite'));
    push('label.autresNationalites', () => val('m', 'autresNationalites'));
    push('label.telephone', () => val('m', 'telephone'));
    push('label.portable', () => val('m', 'portable'));
    push('label.email', () => val('m', 'email'));
    push('label.residentUSA', () => valueLabel(checkedVal('m', 'residentUSA')));
    push('label.formulaireFiscal', () => valueLabel(checkedVal('m', 'formulaireFiscal')));
    push('label.ppe', () => valueLabel(checkedVal('m', 'ppe')));
    push('label.raisonPPE', () => val('m', 'raisonPPE'));
    push('label.profession', () => val('m', 'profession'));
    push('label.situationPro', () => valueLabel(checkedVal('m', 'situationPro')));
    push('label.natureActivite', () => valueLabel(checkedVal('m', 'natureActivite')));
    push('label.secteurActivite', () => valueLabel(checkedVal('m', 'secteurActivite')));
    push('label.revenusMensuels', () => valueLabel(checkedVal('m', 'revenuMensuel')));
    push('label.revenuAutre', () => val('m', 'revenuAutrePreciser'));
    push('label.dateSignature', () => formatDate(val('m', 'dateSignature')));
  }
  return rows;
}

function renderRecap() {
  const box = document.getElementById('recapContent');
  if (!box) return;
  const sections = [{ title: t('recap.titulaire'), rows: recapRows('t') }];
  if (hasMandataire.checked) sections.push({ title: t('recap.mandataire'), rows: recapRows('m') });
  const html = sections.map((s) => {
    const items = s.rows.map(([label, value]) =>
      `<div class="recap-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    ).join('');
    if (!items) return '';
    return `<section class="recap-section"><h3 class="recap-title">${escapeHtml(s.title)}</h3><dl class="recap-list">${items}</dl></section>`;
  }).join('');
  box.innerHTML = html || `<p class="recap-empty">${escapeHtml(t('recap.empty'))}</p>`;
}

function collect(prefix) {
  const data = {};
  form.querySelectorAll(`input[name^="${prefix}_"], select[name^="${prefix}_"]`).forEach((input) => {
    if (input.name === 'hasMandataire') return;
    const key = input.name.slice(prefix.length + 1);
    if (input.type === 'text' || input.type === 'email') {
      if (input.value.trim() !== '') data[key] = input.value.trim();
    } else if (input.type === 'date') {
      if (input.value) data[key] = formatDate(input.value);
    } else if (input.tagName === 'SELECT') {
      if (input.value !== '') data[key] = input.value;
    }
  });
  form.querySelectorAll(`input[type="radio"][name^="${prefix}_"]`).forEach((input) => {
    if (input.checked) {
      const key = input.name.slice(prefix.length + 1);
      data[key] = input.value;
    }
  });
  const groups = {};
  form.querySelectorAll(`input[type="checkbox"][name^="${prefix}_"]`).forEach((input) => {
    if (input.name === 'hasMandataire') return;
    if (input.checked) {
      const key = input.name.slice(prefix.length + 1);
      groups[key] = groups[key] || [];
      groups[key].push(input.value);
    }
  });
  Object.assign(data, groups);
  if (prefix === 't') {
    // Page 1 prints both parts on one line; pages 3/4 use them apart.
    // Arabic names read given-name first, Latin names family-name first.
    const arabic = /[\u0600-\u06ff]/.test((data.nom || '') + (data.prenom || ''));
    const full = (arabic ? [data.prenom, data.nom] : [data.nom, data.prenom])
      .filter(Boolean).join(' ');
    if (full) data.nomPrenom = full;
  }
  return data;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusMsg.textContent = '';
  statusMsg.className = '';



  if (!turnstileToken) {
    statusMsg.textContent = t('captcha.required');
    statusMsg.className = 'error';
    return;
  }

  const titulaire = collect('t');
  if (!titulaire.nomPrenom) {
    statusMsg.textContent = t('required.nomPrenom');
    statusMsg.className = 'error';
    return;
  }

  for (let s = 1; s < maxStep(); s++) {
    const pnl = getPanel(s);
    if (pnl && pnl.hidden) continue;
    const err = validateStep(s);
    if (err) {
      statusMsg.textContent = err;
      statusMsg.className = 'error';
      current = s;
      render();
      getPanel(s).scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
  }

  const consentBureauEtab = form.querySelector('[name="t_etablissement"]');
  const payload = {
    lang: currentLang(),
    titulaire,
    captcha: { token: turnstileToken },
    consent: {
      ok: true,
      bureau: consentBureauEtab && consentBureauEtab.value ? consentBureauEtab.value : '',
    },
  };
  if (hasMandataire.checked) {
    payload.mandataire = collect('m');
  }

  submitBtn.disabled = true;
  statusMsg.textContent = t('submit.progress');
  statusMsg.className = '';

  try {
    // Let the browser paint the progress message before the (synchronous)
    // PDF work starts.
    await new Promise((resolve) => setTimeout(resolve, 30));

    if (!window.KYC_PDF || typeof window.KYC_PDF.build !== 'function') {
      throw new Error(t('pdf.error'));
    }

    const blob = await window.KYC_PDF.build(payload, BUREAUX);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = (titulaire.nomPrenom || 'client').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60);
    a.download = `KYC_${baseName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    statusMsg.textContent = t('submit.success');
    statusMsg.className = 'success';
  } catch (err) {
    const detail = (err && err.message) ? err.message : t('pdf.error');
    statusMsg.textContent = `${t('submit.errorPrefix')} : ${detail}`;
    statusMsg.className = 'error';
  } finally {
    submitBtn.disabled = false;
    resetTurnstile();
  }
});

(function initLang() {
  let saved = 'fr';
  try { saved = localStorage.getItem(LANG_KEY) || 'fr'; } catch (err) { }
  window.__KYC_LANG__ = saved === 'ar' ? 'ar' : 'fr';
})();

render();
applyLang();
