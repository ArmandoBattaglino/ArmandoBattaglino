// Wraps the SVG content in a desaturating <filter> so the rendered output is pure B&W.
// Usage: node scripts/grayscale-svg.js <file.svg>

const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node grayscale-svg.js <file.svg>');
  process.exit(1);
}

let svg = fs.readFileSync(file, 'utf8');

const filterDef =
  '<filter id="bw" color-interpolation-filters="sRGB">' +
    '<feColorMatrix type="saturate" values="0"/>' +
    '<feComponentTransfer><feFuncR type="linear" slope="1.05"/><feFuncG type="linear" slope="1.05"/><feFuncB type="linear" slope="1.05"/></feComponentTransfer>' +
  '</filter>';

// Inject filter into existing <defs>, or create one right after <svg ...>
if (/<defs[^>]*>/.test(svg)) {
  svg = svg.replace(/<defs([^>]*)>/, `<defs$1>${filterDef}`);
} else {
  svg = svg.replace(/<svg([^>]*)>/, `<svg$1><defs>${filterDef}</defs>`);
}

// Wrap everything after </defs> in a desaturated group
svg = svg.replace(/<\/defs>/, `</defs><g filter="url(#bw)">`);
svg = svg.replace(/<\/svg>\s*$/, `</g></svg>`);

fs.writeFileSync(file, svg);
console.log('Desaturated', file);
