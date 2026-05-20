// Wraps the SVG content in a desaturating filter so the rendered output is
// pure grayscale — quieter than the previous phosphor-green look, lets the
// header and SVG cards carry the color accents instead.
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

if (/<defs[^>]*>/.test(svg)) {
  svg = svg.replace(/<defs([^>]*)>/, `<defs$1>${filterDef}`);
} else {
  svg = svg.replace(/<svg([^>]*)>/, `<svg$1><defs>${filterDef}</defs>`);
}

svg = svg.replace(/<\/defs>/, `</defs><g filter="url(#bw)">`);
svg = svg.replace(/<\/svg>\s*$/, `</g></svg>`);

fs.writeFileSync(file, svg);
console.log('Desaturated', file);
