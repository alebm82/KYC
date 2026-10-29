/*
 * Client-side port of app/pdfgen.py.
 *
 * The official four-page Algérie Poste form is shipped inside data/template.js
 * as base64.  Values entered in the wizard are drawn directly on top of the
 * template with pdf-lib, using the same navy colour and coordinates as the
 * Python/ReportLab exporter.  The one-page Arabic CH6 withdrawal-authorisation
 * form (data/ch6.js) is appended as page 5 and filled from the same payload.
 *
 * Latin values use the standard Helvetica font.  Arabic values are reshaped
 * into presentation forms and reordered for right-to-left reading, then drawn
 * with the bundled Amiri font.  Font shaping is deliberately disabled for that
 * font because the text is already shaped: otherwise fontkit would apply GSUB
 * a second time and break the joining.
 *
 * Everything runs in the browser (or in Electron).  No data leaves the
 * machine.
 */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* Constants                                                              */
  /* ---------------------------------------------------------------------- */

  var NAVY = { r: 0.05, g: 0.05, b: 0.45 };

  // Arabic wording added to the two parent lines of the Arabic request page.
  // The strings are stored in visual order, already shaped for a Unicode font,
  // because the labels are fixed and must render identically on every export.
  // Logical text: "اسم الاب" and "لقب واسم الام".
  var ARABIC_FATHER = '\ufe8f\ufefb\ufe8d \ufee2\ufeb3\ufe8d';
  var ARABIC_MOTHER = '\ufee1\ufefb\ufe8d \ufee2\ufeb3\ufe8d\ufeed \ufe90\ufed8\ufedf';
  var ARABIC_LABEL_SIZE = 12;

  // Anchor points taken from the two arrows on the supplied page-3 crop.  The
  // text grows in the direction the arrow points: left for the father line and
  // right for the mother line.
  var P3_ARABIC_LABELS = {
    pere: [747.3, 251.9, 'right'],
    mere: [525.4, 234.9, 'left']
  };

  // Arabic letters, supplements and presentation forms.  Used to decide whether
  // a value must keep its original case and be drawn with an Arabic font.
  var ARABIC_RE = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;
  var ARABIC_DIGIT_RE = /[\u0660-\u0669\u06f0-\u06f9]/g;
  var BIDI_MARKS_RE = /[\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069]/g;
  var DIGIT_MAP = (function () {
    var map = {};
    var i;
    for (i = 0; i < 10; i += 1) map[String.fromCharCode(0x0660 + i)] = String(i);
    for (i = 0; i < 10; i += 1) map[String.fromCharCode(0x06f0 + i)] = String(i);
    return map;
  })();

  // Characters outside this set cannot be encoded by the standard WinAnsi
  // Helvetica font.  Python's pdfgen replaces them with "?"; do the same so a
  // stray symbol never blocks the export.
  var CP1252_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

  var P1_W = 595.28;
  var P1_H = 841.89;
  var P3_W = 850.39;
  var P3_H = 595.28;

  // Page 5: one-page Arabic "CH6" withdrawal-authorisation form
  // (assets/CH6.pdf, A4 landscape).  Each field is [rightEdge, lineBottom,
  // maxWidth]; values are right-aligned on the dotted leader.
  var CH6_H = 595.28;
  var CH6_BASELINE = 2.6;
  var CH6_SIZE = 11;
  var CH6_FIELDS = {
    name: [683.63, 162.18, 243.00],
    address: [776.99, 199.98, 336.00],
    bureau: [533.27, 217.74, 93.00],
    person1: [800.03, 292.38, 162.00],
    person2: [800.03, 325.14, 162.00],
    person3: [609.95, 292.38, 168.00],
    person4: [609.95, 311.34, 168.00],
    place: [703.99, 383.63, 100.05],
    date: [580.01, 383.63, 145.14]
  };

  /* ---------------------------------------------------------------------- */
  /* Coordinates of the original four-page export                           */
  /* ---------------------------------------------------------------------- */

  var P1_TEXT = {
    etablissement: [190.0, 688.10],
    nom: [110.0, 635.89],
    date_naissance: [118.0, 619.69],
    pays_naissance: [403.0, 619.69],
    nationalite: [82.0, 605.99],
    autres_nationalites: [117.0, 593.35],
    mere: [154.0, 561.99],
    pere: [106.0, 545.49],
    adresse: [69.0, 529.99],
    wilaya: [62.0, 516.39],
    code_postal: [347.0, 516.39],
    telephone: [106.0, 498.49],
    portable: [270.0, 498.49],
    email: [422.0, 498.49],
    raison_ppe: [156.2, 427.22],
    profession: [90.0, 409.09],
    date_signature: [53.0, 103.39]
  };

  var P1_CP_X = 96.648;
  var P1_CP_Y = 674.39;
  var P1_CP_STEP = 14.30;
  var P1_NIN_X = 208.648;
  var P1_NIN_Y = 578.89;
  var P1_NIN_STEP = 14.30;

  var P1_CHECK = {
    ouverture: [27.19, 734.08],
    mise_a_jour: [27.19, 721.78],
    usa_oui: [205.74, 475.04],
    usa_non: [253.39, 475.98],
    w8: [187.74, 462.04],
    w9: [275.74, 462.04],
    ppe_oui: [289.74, 441.79],
    ppe_non: [338.39, 441.78],
    salarie: [28.35, 381.37],
    retraite_situation: [103.55, 381.37],
    etudiant: [170.09, 381.37],
    sans_emploi: [228.80, 381.37],
    profession_liberale: [302.48, 381.37],
    gerant: [402.45, 381.37],
    auto_entrepreneur_situation: [459.61, 381.37],
    ministere: [27.90, 358.54],
    entreprise_publique: [154.45, 358.21],
    entreprise_privee: [230.06, 358.21],
    personne_physique: [305.65, 358.21],
    organisation_non_lucratif: [379.09, 358.21],
    autre_nature: [478.01, 358.21],
    administration: [26.04, 330.57],
    banque_assurance: [26.04, 321.57],
    commerce_distribution: [26.04, 312.57],
    industrie: [191.04, 330.57],
    agriculture_peche: [191.04, 321.57],
    energie_eau: [191.04, 312.57],
    transports_logistique: [307.04, 330.57],
    construction_immobilier: [307.04, 321.57],
    hebergement_hotellerie: [307.04, 312.57],
    information_communication: [454.16, 318.59],
    services: [454.16, 310.54],
    r0_20: [26.90, 287.83],
    r20_40: [141.20, 287.83],
    r40_80: [261.45, 288.21],
    plus_300: [381.45, 289.21],
    r80_120: [26.89, 274.18],
    r120_200: [141.20, 274.21],
    r200_300: [261.45, 274.21],
    reception_salaire: [26.79, 242.28],
    services_monetique: [168.48, 243.28],
    paiement_cheque: [349.16, 243.73],
    auto_entrepreneur_objet: [466.84, 242.73],
    reception_bourse: [26.80, 229.90],
    paiement_facture: [168.48, 230.73],
    reception_pension: [349.58, 230.72],
    autre_objet: [467.84, 229.91],
    salaire: [27.64, 198.88],
    benefices_activite: [92.22, 198.90],
    pension_bourse: [175.23, 198.90],
    retraite_origine: [249.21, 198.90],
    revenu_locatifs: [316.72, 198.90],
    dividendes: [382.37, 198.90],
    aide_sociale: [461.17, 198.90]
  };

  var P3_TEXT = {
    nom: [468.0, 337.48],
    prenom: [470.0, 320.48],
    date_naissance: [513.0, 286.48],
    lieu_naissance: [500.0, 269.48],
    pere: [483.0, 251.78],
    mere: [458.0, 234.88],
    nationalite: [479.0, 218.48],
    adresse: [495.0, 201.48],
    telephone: [488.0, 133.48],
    portable: [602.0, 133.48],
    email: [726.0, 133.48],
    intitule_nom: [478.0, 80.48],
    intitule_prenom: [660.0, 80.48],
    intitule_adresse: [478.0, 62.48]
  };

  var P3_NIN_X = 564.848;
  var P3_NIN_Y = 355.78;
  var P3_NIN_STEP = 10.70;
  var P3_CP_X = 761.588;
  var P3_CP_Y = 44.48;
  var P3_CP_STEP = 14.18;

  var P4_TEXT = {
    profession: [84.0, 536.28],
    date_signature: [303.0, 103.48]
  };

  var P2_TEXT = {
    etablissement: [190.0, 688.10],
    nom_titulaire: [285.0, 631.26],
    nom_mandataire: [285.0, 613.17],
    date_naissance: [118.0, 598.09],
    pays_naissance: [403.0, 598.09],
    adresse: [170.0, 567.91],
    telephone: [106.0, 552.47],
    portable: [270.0, 552.47],
    email: [422.0, 552.47],
    pere: [110.0, 537.74],
    mere: [158.0, 522.65],
    nationalite: [85.0, 507.56],
    autres_nationalites: [122.0, 492.48],
    raison_ppe: [347.0, 398.53],
    profession: [90.0, 374.12],
    date_signature: [52.0, 102.35]
  };

  var P2_CP_X = 96.648;
  var P2_CP_Y = 674.39;
  var P2_CP_STEP = 14.30;
  var P2_NIN_X = 228.65;
  var P2_NIN_Y = 581.38;
  var P2_NIN_STEP = 14.252;

  var P2_CHECK = {
    ouverture: [26.88, 733.80],
    mise_a_jour: [26.88, 721.80],
    mandataire: [518.61, 733.80],
    signataire: [518.61, 721.80],
    usa_oui: [205.74, 458.04],
    usa_non: [253.39, 459.04],
    w8: [187.74, 445.10],
    w9: [275.74, 445.10],
    ppe_oui: [284.74, 415.92],
    ppe_non: [333.42, 415.92],
    salarie: [28.35, 343.37],
    retraite_situation: [103.55, 343.37],
    etudiant: [170.75, 343.37],
    sans_emploi: [229.95, 343.37],
    profession_liberale: [304.15, 343.37],
    gerant: [401.35, 343.37],
    auto_entrepreneur_situation: [458.91, 343.37],
    ministere: [25.90, 311.29],
    entreprise_publique: [154.45, 310.96],
    entreprise_privee: [230.06, 310.96],
    personne_physique: [305.65, 310.96],
    organisation_non_lucratif: [379.09, 310.96],
    autre_nature: [478.01, 310.96],
    administration: [28.04, 275.89],
    banque_assurance: [28.04, 263.29],
    commerce_distribution: [28.04, 250.61],
    industrie: [193.04, 276.42],
    agriculture_peche: [193.04, 264.59],
    energie_eau: [193.04, 253.61],
    transports_logistique: [309.04, 275.89],
    construction_immobilier: [309.04, 263.58],
    hebergement_hotellerie: [309.04, 251.61],
    information_communication: [456.16, 267.59],
    services: [456.16, 257.54],
    r0_20: [26.90, 223.83],
    r20_40: [141.20, 223.83],
    r40_80: [261.45, 224.21],
    plus_300: [381.45, 225.21],
    r80_120: [26.90, 210.21],
    r120_200: [141.20, 210.21],
    r200_300: [261.45, 210.21]
  };

  /* ---------------------------------------------------------------------- */
  /* Build state (reset for every document)                                 */
  /* ---------------------------------------------------------------------- */

  var state = {
    lib: null,
    helvetica: null,
    arabicFont: null,
    bidi: null,
    navy: null,
    white: null,
    black: null
  };

  /* ---------------------------------------------------------------------- */
  /* Text helpers                                                           */
  /* ---------------------------------------------------------------------- */

  function hasArabic(value) {
    return ARABIC_RE.test(String(value == null ? '' : value));
  }

  function translateDigits(text) {
    return String(text == null ? '' : text).replace(ARABIC_DIGIT_RE, function (ch) {
      return DIGIT_MAP[ch];
    });
  }

  function stripBidiMarks(text) {
    return String(text == null ? '' : text).replace(BIDI_MARKS_RE, '');
  }

  function isWinAnsiChar(ch) {
    var code = ch.codePointAt(0);
    return (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      CP1252_EXTRA.indexOf(ch) !== -1
    );
  }

  function winAnsiSafe(text) {
    var out = '';
    var chars = Array.from(String(text == null ? '' : text));
    for (var i = 0; i < chars.length; i += 1) {
      out += isWinAnsiChar(chars[i]) ? chars[i] : '?';
    }
    return out;
  }

  // Return the uppercase text used by the official document.
  function clean(value) {
    if (value == null) return '';
    var text = translateDigits(String(value).trim()).toUpperCase();
    return winAnsiSafe(text);
  }

  // Keep Arabic values intact, uppercase and transliterate the rest.
  function normalise(value) {
    if (value == null) return '';
    var raw = stripBidiMarks(translateDigits(String(value).trim()));
    if (!hasArabic(raw)) return clean(raw);
    return raw.split(/\s+/).filter(Boolean).join(' ');
  }

  // Arabic is shaped into presentation forms and reordered for right-to-left
  // reading, then drawn left-to-right by the PDF viewer.
  function shapeArabic(text) {
    if (!global.ArabicShaper || typeof global.ArabicShaper.convertArabic !== 'function') {
      return text;
    }
    var shaped = global.ArabicShaper.convertArabic(text);
    if (!state.bidi) return shaped;
    var levels = state.bidi.getEmbeddingLevels(shaped);
    return state.bidi.getReorderedString(shaped, levels);
  }

  // Return ``{ text, arabic }``.
  function renderText(value) {
    var text = normalise(value);
    if (!text) return { text: '', arabic: false };
    if (hasArabic(text)) return { text: shapeArabic(text), arabic: true };
    return { text: text, arabic: false };
  }

  function textWidth(value, size) {
    var rendered = renderText(value);
    if (!rendered.text) return 0;
    var font = rendered.arabic ? state.arabicFont : state.helvetica;
    if (!font) return 0;
    return font.widthOfTextAtSize(rendered.text, size);
  }

  function dateValue(value) {
    var text = clean(value);
    if (text.length === 10 && text.charAt(4) === '-' && text.charAt(7) === '-') {
      return text.slice(8, 10) + '/' + text.slice(5, 7) + '/' + text.slice(0, 4);
    }
    return text;
  }

  // Date of birth with a space between every character, as requested.
  function dateNaissance(value) {
    var text = dateValue(value);
    return text ? text.split('').join(' ') : '';
  }

  function choice(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  /* ---------------------------------------------------------------------- */
  /* Drawing helpers                                                        */
  /* ---------------------------------------------------------------------- */

  function draw(page, x, y, value, size) {
    var rendered = renderText(value);
    if (!rendered.text) return;
    page.drawText(rendered.text, {
      x: x,
      y: y,
      size: size == null ? 9 : size,
      font: rendered.arabic ? state.arabicFont : state.helvetica,
      color: state.navy
    });
  }

  // Draw text that is already shaped and in visual order (fixed labels).
  function drawRaw(page, x, y, text, size) {
    if (!text) return;
    page.drawText(text, {
      x: x,
      y: y,
      size: size == null ? 9 : size,
      font: state.arabicFont,
      color: state.navy
    });
  }

  function drawDigits(page, value, x, y, step, count, size) {
    var digits = translateDigits(value).replace(/[^0-9]/g, '');
    var fontSize = size == null ? 9 : size;
    var limit = Math.min(digits.length, count);
    for (var i = 0; i < limit; i += 1) {
      page.drawText(digits.charAt(i), {
        x: x + step * i,
        y: y,
        size: fontSize,
        font: state.helvetica,
        color: state.navy
      });
    }
  }

  function check(page, x, y) {
    draw(page, x, y, 'X', 8);
  }

  function paintHeaderChoice(page, value, mapping, positions) {
    var key = mapping[choice(value)];
    if (key && positions[key]) check(page, positions[key][0], positions[key][1]);
  }

  function bureauLookup(bureaux, wilaya, establishment) {
    var code = '';
    var name = '';
    var entry = bureaux ? bureaux[String(wilaya == null ? '' : wilaya)] : null;
    if (entry && typeof entry === 'object') {
      name = String(entry.wilaya || '');
      var list = entry.bureaux || [];
      for (var i = 0; i < list.length; i += 1) {
        if (list[i] && list[i].nom === establishment) {
          code = String(list[i].code_postal || '');
          break;
        }
      }
    }
    return { code: code, name: name };
  }

  function wilayaName(bureaux, wilaya) {
    var entry = bureaux ? bureaux[String(wilaya == null ? '' : wilaya)] : null;
    if (entry && typeof entry === 'object' && entry.wilaya) return String(entry.wilaya);
    return String(wilaya == null ? '' : wilaya);
  }

  // Split a legacy single name field.  Latin names are stored family-name
  // first ("ALEB MOHAMMED AYOUB"); Arabic input is normally first-name first.
  function splitName(fullName) {
    var text = normalise(fullName);
    var parts = text.split(/\s+/).filter(Boolean);
    if (!parts.length) return ['', ''];
    if (parts.length === 1) return [parts[0], ''];
    if (hasArabic(text)) return [parts[parts.length - 1], parts.slice(0, -1).join(' ')];
    return [parts[0], parts.slice(1).join(' ')];
  }

  // Return [nom, prenom] from the two fields or a legacy payload.
  function identityNames(person) {
    person = person || {};
    var nom = String(person.nom || '').trim();
    var prenom = String(person.prenom || '').trim();
    if (nom || prenom) return [nom, prenom];
    return splitName(person.nomPrenom);
  }

  // Merge surname and given names for the single-line fields.  Arabic is
  // written given-name first, Latin family-name first.
  function fullName(person) {
    var names = identityNames(person);
    var nom = names[0];
    var prenom = names[1];
    if (nom || prenom) {
      var parts = (hasArabic(nom) || hasArabic(prenom)) ? [prenom, nom] : [nom, prenom];
      return parts.filter(Boolean).join(' ');
    }
    return (person || {}).nomPrenom;
  }

  /* ---------------------------------------------------------------------- */
  /* Page painters                                                          */
  /* ---------------------------------------------------------------------- */

  function paintArabicLabels(page, titulaire) {
    var t = titulaire || {};

    // Keep the mother label after the printed name instead of letting a long
    // name run through it.  The red arrow remains the minimum position.
    var motherWidth = textWidth(t.nomPrenomMere, 9);
    var motherX = Math.max(P3_ARABIC_LABELS.mere[0], P3_TEXT.mere[0] + motherWidth + 8.0);

    var labels = [
      ['pere', ARABIC_FATHER],
      ['mere', ARABIC_MOTHER]
    ];
    for (var i = 0; i < labels.length; i += 1) {
      var key = labels[i][0];
      var text = labels[i][1];
      var anchorX = P3_ARABIC_LABELS[key][0];
      var baselineY = P3_ARABIC_LABELS[key][1];
      var align = P3_ARABIC_LABELS[key][2];
      if (key === 'mere') anchorX = motherX;

      var width = state.arabicFont.widthOfTextAtSize(text, ARABIC_LABEL_SIZE);
      var x = align === 'right' ? anchorX - width : anchorX;

      // Clear the dotted leader behind the label so the Arabic text stays
      // readable; the template's line is restored outside this small box.
      page.drawRectangle({
        x: x - 4.0,
        y: baselineY - 3.0,
        width: width + 8.0,
        height: 15.0,
        color: state.white
      });

      page.drawText(text, {
        x: x,
        y: baselineY,
        size: ARABIC_LABEL_SIZE,
        font: state.arabicFont,
        color: state.black
      });
    }
  }

  function paintTitulaire(page, titulaire, bureaux) {
    var t = titulaire || {};

    var establishment = clean(t.etablissement);
    var postalCode = clean(t.codePostalEtablissement);
    var wilayaCode = String(t.wilaya == null ? '' : t.wilaya);
    var computed = bureauLookup(bureaux, wilayaCode, t.etablissement);
    if (!postalCode) postalCode = computed.code;
    var wilaya = computed.name || wilayaName(bureaux, wilayaCode);

    draw(page, P1_TEXT.etablissement[0], P1_TEXT.etablissement[1], establishment);
    drawDigits(page, postalCode, P1_CP_X, P1_CP_Y, P1_CP_STEP, 5);

    draw(page, P1_TEXT.nom[0], P1_TEXT.nom[1], fullName(t));
    draw(page, P1_TEXT.date_naissance[0], P1_TEXT.date_naissance[1], dateNaissance(t.dateNaissance));
    draw(page, P1_TEXT.pays_naissance[0], P1_TEXT.pays_naissance[1], t.paysNaissance);
    draw(page, P1_TEXT.nationalite[0], P1_TEXT.nationalite[1], t.nationalite);
    draw(page, P1_TEXT.autres_nationalites[0], P1_TEXT.autres_nationalites[1], t.autresNationalites);
    drawDigits(page, t.nin, P1_NIN_X, P1_NIN_Y, P1_NIN_STEP, 18);
    draw(page, P1_TEXT.mere[0], P1_TEXT.mere[1], t.nomPrenomMere);
    draw(page, P1_TEXT.pere[0], P1_TEXT.pere[1], t.prenomPere);
    draw(page, P1_TEXT.adresse[0], P1_TEXT.adresse[1], t.adresse);
    draw(page, P1_TEXT.wilaya[0], P1_TEXT.wilaya[1], wilaya);
    draw(page, P1_TEXT.code_postal[0], P1_TEXT.code_postal[1], t.codePostalWilaya);
    draw(page, P1_TEXT.telephone[0], P1_TEXT.telephone[1], t.telephone);
    draw(page, P1_TEXT.portable[0], P1_TEXT.portable[1], t.portable);
    draw(page, P1_TEXT.email[0], P1_TEXT.email[1], t.email, 8);
    draw(page, P1_TEXT.raison_ppe[0], P1_TEXT.raison_ppe[1], t.raisonPPE);
    draw(page, P1_TEXT.profession[0], P1_TEXT.profession[1], t.profession);
    draw(page, P1_TEXT.date_signature[0], P1_TEXT.date_signature[1], dateValue(t.dateSignature));

    check(page, P1_CHECK.ouverture[0], P1_CHECK.ouverture[1]);

    paintHeaderChoice(page, t.residentUSA, { oui: 'usa_oui', non: 'usa_non' }, P1_CHECK);
    paintHeaderChoice(page, t.formulaireFiscal, { w8: 'w8', w9: 'w9' }, P1_CHECK);
    paintHeaderChoice(page, t.ppe, { oui: 'ppe_oui', non: 'ppe_non' }, P1_CHECK);

    paintHeaderChoice(page, t.situationPro, {
      salarie: 'salarie',
      retraite: 'retraite_situation',
      etudiant: 'etudiant',
      sans_emploi: 'sans_emploi',
      profession_liberale: 'profession_liberale',
      gerant: 'gerant',
      auto_entrepreneur: 'auto_entrepreneur_situation'
    }, P1_CHECK);

    paintHeaderChoice(page, t.natureActivite, {
      ministere: 'ministere',
      entreprise_publique: 'entreprise_publique',
      entreprise_privee: 'entreprise_privee',
      personne_physique: 'personne_physique',
      organisation_non_lucratif: 'organisation_non_lucratif',
      autre: 'autre_nature'
    }, P1_CHECK);

    paintHeaderChoice(page, t.secteurActivite, {
      administration: 'administration',
      industrie: 'industrie',
      transports_logistique: 'transports_logistique',
      banque_assurance: 'banque_assurance',
      agriculture_peche: 'agriculture_peche',
      construction_immobilier: 'construction_immobilier',
      commerce_distribution: 'commerce_distribution',
      energie_eau: 'energie_eau',
      hebergement_hotellerie: 'hebergement_hotellerie',
      information_communication: 'information_communication',
      services: 'services'
    }, P1_CHECK);

    paintHeaderChoice(page, t.revenuMensuel, {
      r0_20: 'r0_20',
      r20_40: 'r20_40',
      r40_80: 'r40_80',
      r80_120: 'r80_120',
      r120_200: 'r120_200',
      r200_300: 'r200_300',
      plus_300: 'plus_300'
    }, P1_CHECK);

    paintHeaderChoice(page, t.objetOuverture, {
      reception_salaire: 'reception_salaire',
      reception_bourse: 'reception_bourse',
      services_monetique: 'services_monetique',
      paiement_facture: 'paiement_facture',
      paiement_cheque: 'paiement_cheque',
      reception_pension: 'reception_pension',
      auto_entrepreneur: 'auto_entrepreneur_objet',
      autre: 'autre_objet'
    }, P1_CHECK);

    paintHeaderChoice(page, t.origineFonds, {
      salaire: 'salaire',
      benefices_activite: 'benefices_activite',
      pension_bourse: 'pension_bourse',
      retraite: 'retraite_origine',
      revenu_locatifs: 'revenu_locatifs',
      dividendes: 'dividendes',
      aide_sociale: 'aide_sociale'
    }, P1_CHECK);
  }

  function paintArabicPage(page, titulaire) {
    var t = titulaire || {};
    paintArabicLabels(page, t);
    var names = identityNames(t);
    var nom = names[0];
    var prenom = names[1];

    drawDigits(page, t.nin, P3_NIN_X, P3_NIN_Y, P3_NIN_STEP, 18);
    draw(page, P3_TEXT.nom[0], P3_TEXT.nom[1], nom);
    draw(page, P3_TEXT.prenom[0], P3_TEXT.prenom[1], prenom);
    draw(page, P3_TEXT.date_naissance[0], P3_TEXT.date_naissance[1], dateNaissance(t.dateNaissance));
    draw(page, P3_TEXT.lieu_naissance[0], P3_TEXT.lieu_naissance[1], t.paysNaissance);
    draw(page, P3_TEXT.pere[0], P3_TEXT.pere[1], t.prenomPere);
    draw(page, P3_TEXT.mere[0], P3_TEXT.mere[1], t.nomPrenomMere);
    draw(page, P3_TEXT.nationalite[0], P3_TEXT.nationalite[1], t.nationalite);

    var fullAddress = normalise(t.adresse);
    var postalCode = clean(t.codePostalWilaya);
    var arabicAddress = postalCode ? fullAddress + ', ' + postalCode : fullAddress;
    draw(page, P3_TEXT.adresse[0], P3_TEXT.adresse[1], arabicAddress.slice(0, 30));

    draw(page, P3_TEXT.telephone[0], P3_TEXT.telephone[1], t.telephone);
    draw(page, P3_TEXT.portable[0], P3_TEXT.portable[1], t.portable);
    draw(page, P3_TEXT.email[0], P3_TEXT.email[1], t.email, 8);

    draw(page, P3_TEXT.intitule_nom[0], P3_TEXT.intitule_nom[1], nom);
    draw(page, P3_TEXT.intitule_prenom[0], P3_TEXT.intitule_prenom[1], prenom);
    draw(page, P3_TEXT.intitule_adresse[0], P3_TEXT.intitule_adresse[1], fullAddress);
    drawDigits(page, postalCode, P3_CP_X, P3_CP_Y, P3_CP_STEP, 5);
  }

  function paintPage4(page, titulaire) {
    var t = titulaire || {};
    draw(page, P4_TEXT.profession[0], P4_TEXT.profession[1], t.profession);
    draw(page, P4_TEXT.date_signature[0], P4_TEXT.date_signature[1], dateValue(t.dateSignature));

    var objet = choice(t.objetOuverture);
    // The official export marks both "Domiciliation de salaire" and "Bourse"
    // for a salary-receipt request; this reproduces its observed behaviour.
    if (objet === 'reception_salaire') {
      check(page, 218.71, 452.11);
      check(page, 218.71, 436.65);
    } else if (objet === 'reception_bourse') {
      check(page, 218.71, 436.65);
    } else if (objet === 'reception_pension') {
      check(page, 218.71, 424.00);
    }
  }

  // Right-align a value on a CH6 dotted leader, shrinking it to fit the run.
  function drawCh6Field(page, field, value) {
    var rendered = renderText(value);
    if (!rendered.text) return;
    var font = rendered.arabic ? state.arabicFont : state.helvetica;
    var size = CH6_SIZE;
    while (size > 6.5 && font.widthOfTextAtSize(rendered.text, size) > field[2] - 2) {
      size -= 0.5;
    }
    var width = font.widthOfTextAtSize(rendered.text, size);
    var baseline = CH6_H - field[1] + CH6_BASELINE;
    var right = field[0] - 3;

    // Erase the dotted leader under the value so the template dots do not
    // show through the letters.
    page.drawRectangle({
      x: field[0] - field[2],
      y: baseline - 2.5,
      width: field[2],
      height: size + 4.5,
      color: state.white
    });

    page.drawText(rendered.text, {
      x: right - width,
      y: baseline,
      size: size,
      font: font,
      color: state.navy
    });
  }

  // CH6 prints "اللقب و الإسم" (surname first), unlike the page-1 line.
  function ch6Name(person) {
    person = person || {};
    var nom = String(person.nom || '').trim();
    var prenom = String(person.prenom || '').trim();
    if (nom || prenom) return [nom, prenom].filter(Boolean).join(' ');
    return String(person.nomPrenomMandataire || person.nomPrenom || '').trim();
  }

  function paintCh6(page, titulaire, mandataire, bureaux) {
    var t = titulaire || {};
    var m = mandataire && typeof mandataire === 'object' ? mandataire : null;
    var bureau = clean(t.etablissement);
    var place = wilayaName(bureaux, t.wilaya) || bureau;
    var address = t.adresse || t.adresseResidence || place;

    drawCh6Field(page, CH6_FIELDS.name, ch6Name(t));
    drawCh6Field(page, CH6_FIELDS.address, address);
    drawCh6Field(page, CH6_FIELDS.bureau, bureau);
    drawCh6Field(page, CH6_FIELDS.place, place);
    drawCh6Field(page, CH6_FIELDS.date, dateValue(t.dateSignature));
    if (m) drawCh6Field(page, CH6_FIELDS.person1, ch6Name(m));
  }

  function paintMandataire(page, mandataire, titulaire, bureaux) {
    var m = mandataire || {};
    var t = titulaire || {};

    var establishment = clean(m.etablissement);
    var postalCode = clean(m.codePostalEtablissement);
    var wilayaCode = String(m.wilaya == null ? '' : m.wilaya);
    var computed = bureauLookup(bureaux, wilayaCode, m.etablissement);
    if (!postalCode) postalCode = computed.code;

    draw(page, P2_TEXT.etablissement[0], P2_TEXT.etablissement[1], establishment);
    drawDigits(page, postalCode, P2_CP_X, P2_CP_Y, P2_CP_STEP, 5);

    draw(page, P2_TEXT.nom_titulaire[0], P2_TEXT.nom_titulaire[1], m.nomPrenomTitulaire || fullName(t));
    draw(page, P2_TEXT.nom_mandataire[0], P2_TEXT.nom_mandataire[1], m.nomPrenomMandataire);
    draw(page, P2_TEXT.date_naissance[0], P2_TEXT.date_naissance[1], dateNaissance(m.dateNaissance));
    draw(page, P2_TEXT.pays_naissance[0], P2_TEXT.pays_naissance[1], m.paysNaissance);
    drawDigits(page, m.nin, P2_NIN_X, P2_NIN_Y, P2_NIN_STEP, 18);
    draw(page, P2_TEXT.adresse[0], P2_TEXT.adresse[1], m.adresseResidence);
    draw(page, P2_TEXT.telephone[0], P2_TEXT.telephone[1], m.telephone);
    draw(page, P2_TEXT.portable[0], P2_TEXT.portable[1], m.portable);
    draw(page, P2_TEXT.email[0], P2_TEXT.email[1], m.email, 8);
    draw(page, P2_TEXT.pere[0], P2_TEXT.pere[1], m.prenomPere);
    draw(page, P2_TEXT.mere[0], P2_TEXT.mere[1], m.nomPrenomMere);
    draw(page, P2_TEXT.nationalite[0], P2_TEXT.nationalite[1], m.nationalite);
    draw(page, P2_TEXT.autres_nationalites[0], P2_TEXT.autres_nationalites[1], m.autresNationalites);
    draw(page, P2_TEXT.raison_ppe[0], P2_TEXT.raison_ppe[1], m.raisonPPE);
    draw(page, P2_TEXT.profession[0], P2_TEXT.profession[1], m.profession);
    draw(page, P2_TEXT.date_signature[0], P2_TEXT.date_signature[1], dateValue(m.dateSignature));

    check(page, P2_CHECK.ouverture[0], P2_CHECK.ouverture[1]);
    if (choice(m.mandataireType) === 'signataire') {
      check(page, P2_CHECK.signataire[0], P2_CHECK.signataire[1]);
    } else {
      check(page, P2_CHECK.mandataire[0], P2_CHECK.mandataire[1]);
    }

    paintHeaderChoice(page, m.residentUSA, { oui: 'usa_oui', non: 'usa_non' }, P2_CHECK);
    paintHeaderChoice(page, m.formulaireFiscal, { w8: 'w8', w9: 'w9' }, P2_CHECK);
    paintHeaderChoice(page, m.ppe, { oui: 'ppe_oui', non: 'ppe_non' }, P2_CHECK);

    paintHeaderChoice(page, m.situationPro, {
      salarie: 'salarie',
      retraite: 'retraite_situation',
      etudiant: 'etudiant',
      sans_emploi: 'sans_emploi',
      profession_liberale: 'profession_liberale',
      gerant: 'gerant',
      auto_entrepreneur: 'auto_entrepreneur_situation'
    }, P2_CHECK);

    paintHeaderChoice(page, m.natureActivite, {
      ministere: 'ministere',
      entreprise_publique: 'entreprise_publique',
      entreprise_privee: 'entreprise_privee',
      personne_physique: 'personne_physique',
      organisation_non_lucratif: 'organisation_non_lucratif',
      autre: 'autre_nature'
    }, P2_CHECK);

    paintHeaderChoice(page, m.secteurActivite, {
      administration: 'administration',
      industrie: 'industrie',
      transports_logistique: 'transports_logistique',
      banque_assurance: 'banque_assurance',
      agriculture_peche: 'agriculture_peche',
      construction_immobilier: 'construction_immobilier',
      commerce_distribution: 'commerce_distribution',
      energie_eau: 'energie_eau',
      hebergement_hotellerie: 'hebergement_hotellerie',
      information_communication: 'information_communication',
      services: 'services'
    }, P2_CHECK);

    paintHeaderChoice(page, m.revenuMensuel, {
      r0_20: 'r0_20',
      r20_40: 'r20_40',
      r40_80: 'r40_80',
      r80_120: 'r80_120',
      r120_200: 'r120_200',
      r200_300: 'r200_300',
      plus_300: 'plus_300'
    }, P2_CHECK);
  }

  /* ---------------------------------------------------------------------- */
  /* Entry point                                                            */
  /* ---------------------------------------------------------------------- */

  function base64ToBytes(base64) {
    var binary = global.atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // The Arabic text is already reshaped.  pdf-lib/fontkit would otherwise run
  // GSUB again (and reorder/join the presentation forms incorrectly), so make
  // the font map code points straight to glyphs.
  function disableShaping(fontkitFont) {
    fontkitFont.layout = function layout(text) {
      var glyphs = this.glyphsForString(String(text));
      var advanceWidth = 0;
      for (var i = 0; i < glyphs.length; i += 1) advanceWidth += glyphs[i].advanceWidth;
      return { glyphs: glyphs, advanceWidth: advanceWidth, positions: [], features: [] };
    };
  }

  async function build(payload, bureaux) {
    payload = payload || {};
    var titulaire = payload.titulaire || {};
    var mandataire = payload.mandataire;

    if (!global.PDFLib) throw new Error('pdf-lib is not loaded.');
    if (!global.fontkit) throw new Error('fontkit is not loaded.');
    if (!global.bidi_js) throw new Error('bidi-js is not loaded.');
    if (!global.ArabicShaper) throw new Error('the Arabic reshaper is not loaded.');
    if (!global.KYC_TEMPLATE_PDF_BASE64) throw new Error('the PDF template is not loaded.');
    if (!global.KYC_ARABIC_FONT_BASE64) throw new Error('the Arabic font is not loaded.');

    var lib = global.PDFLib;
    state.lib = lib;
    state.navy = lib.rgb(NAVY.r, NAVY.g, NAVY.b);
    state.white = lib.rgb(1, 1, 1);
    state.black = lib.rgb(0, 0, 0);
    state.bidi = global.bidi_js();

    var pdf = await lib.PDFDocument.load(base64ToBytes(global.KYC_TEMPLATE_PDF_BASE64), {
      updateMetadata: false
    });
    pdf.registerFontkit(global.fontkit);

    state.helvetica = await pdf.embedFont(lib.StandardFonts.Helvetica);
    state.arabicFont = await pdf.embedFont(base64ToBytes(global.KYC_ARABIC_FONT_BASE64), {
      subset: false
    });
    disableShaping(state.arabicFont.embedder.font);

    var pages = pdf.getPages();
    if (pages.length < 4) throw new Error('The PDF template is incomplete (4 pages expected).');

    paintTitulaire(pages[0], titulaire, bureaux);
    if (mandataire && typeof mandataire === 'object' && Object.keys(mandataire).length) {
      paintMandataire(pages[1], mandataire, titulaire, bureaux);
    }
    paintArabicPage(pages[2], titulaire);
    paintPage4(pages[3], titulaire);

    // Append the one-page Arabic withdrawal-authorisation form (CH6).
    if (global.KYC_CH6_PDF_BASE64) {
      var ch6Doc = await lib.PDFDocument.load(base64ToBytes(global.KYC_CH6_PDF_BASE64), {
        updateMetadata: false
      });
      var ch6Pages = await pdf.copyPages(ch6Doc, [0]);
      pdf.addPage(ch6Pages[0]);
      paintCh6(ch6Pages[0], titulaire, mandataire, bureaux);
    }

    pdf.setTitle('');
    pdf.setAuthor('');
    pdf.setSubject('');
    pdf.setKeywords([]);
    pdf.setCreator('KYC local clone');
    pdf.setProducer('KYC local clone');

    var bytes = await pdf.save();
    return new Blob([bytes], { type: 'application/pdf' });
  }

  global.KYC_PDF = {
    build: build,
    // Exposed for tests and for the asset generator.
    _internals: {
      clean: clean,
      normalise: normalise,
      renderText: renderText,
      dateValue: dateValue,
      dateNaissance: dateNaissance,
      fullName: fullName,
      splitName: splitName
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
