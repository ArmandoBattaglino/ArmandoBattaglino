// Wraps the SVG content in a CRT-phosphor-green filter.
// Extracts luminance from each pixel and outputs it as pure green,
// giving the rendered SVG that old-monitor terminal look.
// Usage: node scripts/grayscale-svg.js <file.svg>

const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node grayscale-svg.js <file.svg>');
  process.exit(1);
}

let svg = fs.readFileSync(file, 'utf8');

// Matrix:
//   R_out = 0
//   G_out = 0.32*R + 0.65*G + 0.13*B + 0.04  (luminance, slightly boosted)
//   B_out = 0
//   A_out = A
const filterDef =
  '<filter id="phosphor" color-interpolation-filters="sRGB">' +
    '<feColorMatrix type="matrix" values="' +
      '0    0    0    0 0  ' +
      '0.32 0.65 0.13 0 0.04  ' +
      '0    0    0    0 0  ' +
      '0    0    0    1 0' +
    '"/>' +
  '</filter>';

// Inject filter into existing <defs>, or create one right after <svg ...>
if (/<defs[^>]*>/.test(svg)) {
  svg = svg.replace(/<defs([^>]*)>/, `<defs$1>${filterDef}`);
} else {
  svg = svg.replace(/<svg([^>]*)>/, `<svg$1><defs>${filterDef}</defs>`);
}

// Wrap everything after </defs> in a phosphor-tinted group
svg = svg.replace(/<\/defs>/, `</defs><g filter="url(#phosphor)">`);
svg = svg.replace(/<\/svg>\s*$/, `</g></svg>`);

fs.writeFileSync(file, svg);
console.log('Phosphor-tinted', file);
