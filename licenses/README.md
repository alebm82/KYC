# Third-party licenses

This application bundles the following open-source components. Their full
licence texts are in this `licenses/` directory.

| Component | Version | Licence | Used for |
| --- | --- | --- | --- |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 | MIT | Reading the official template and drawing the PDF overlay |
| [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) | 1.1.1 | MIT | Embedding the Arabic TrueType font |
| [bidi-js](https://github.com/lojjic/bidi-js) | 1.1.0 | MIT | Unicode bidirectional reordering |
| [arabic-persian-reshaper](https://github.com/alex-clay/arabic-persian-reshaper) | 1.0.1 | MIT | Arabic letter shaping / presentation forms |
| [Amiri](https://github.com/aliftype/amiri) | Regular | SIL OFL 1.1 | Arabic glyphs in the generated PDF |

## Notes

- `licenses/pdf-lib-LICENSE.md` — pdf-lib MIT licence.
- `licenses/fontkit-LICENSE.txt` — fontkit MIT licence.
- `licenses/bidi-js-LICENSE.txt` — bidi-js MIT licence.
- `licenses/arabic-persian-reshaper-LICENSE.txt` — reshaper MIT licence.
- `licenses/Amiri-OFL.txt` — SIL Open Font License for the Amiri font.

The Amiri font is embedded unmodified in `assets/Amiri-Regular.ttf` and in
`data/arabic-font.js` (base64). The font is distributed under the SIL Open Font
License, which permits embedding and redistribution.
