const fs = require('fs');
const matter = require('gray-matter');
const path = require('path');

const blogPath = '/Users/reuben/Desktop/minestarters/code/snx-prototype/content/blog/look-through-rwa-lending.md';
const svgPath = '/Users/reuben/Desktop/minestarters/code/snx-prototype/apps/web/public/blog/look-through-rwa-lending.svg';

const raw = fs.readFileSync(blogPath, 'utf8');
const { data, content } = matter(raw);

console.log('=== Frontmatter ===');
console.log(JSON.stringify(data, null, 2));

console.log('\n=== Required fields check ===');
const required = ['title', 'description', 'date', 'author', 'tags', 'published', 'image'];
required.forEach((f) => {
  const present = data[f] !== undefined && data[f] !== null && data[f] !== '';
  console.log(`  ${present ? 'OK ' : 'MISSING'} ${f}: ${JSON.stringify(data[f])}`);
});

console.log('\n=== Content stats ===');
const words = content.trim().split(/\s+/).length;
console.log(`  body words: ${words}`);

const lines = content.split('\n');
const headings = lines.filter((l) => /^#{1,6}\s/.test(l));
console.log('  headings:');
headings.forEach((h) => console.log(`    ${h}`));

console.log('\n=== Concession + crypto-native sentinel checks ===');
const sentinels = [
  { label: 'perp pool concession', re: /perp pool/i },
  { label: 'tbill / treasury sleeve concession', re: /TBill cash sleeve|tokenized treasury wrapper/i },
  { label: 'smart-contract risk named', re: /smart-?contract risk/i },
  { label: 'oracle risk named', re: /oracle risk|oracle integrity/i },
  { label: 'OracleAdapter cited', re: /OracleAdapter/ },
  { label: 'PriceSync cited', re: /PriceSync/ },
];
sentinels.forEach((s) => {
  console.log(`  ${s.re.test(content) ? 'OK ' : 'MISSING'} ${s.label}`);
});

console.log('\n=== SVG check ===');
const svg = fs.readFileSync(svgPath, 'utf8');
console.log(`  bytes: ${svg.length}`);
console.log(`  starts: ${svg.slice(0, 60)}`);
console.log(`  has #080c14: ${svg.includes('#080c14')}`);
console.log(`  has #2dd4bf: ${svg.includes('#2dd4bf')}`);
console.log(`  has #38bdf8: ${svg.includes('#38bdf8')}`);
console.log(`  has system-ui font: ${svg.includes('system-ui')}`);
console.log(`  has feGaussianBlur glow: ${svg.includes('feGaussianBlur')}`);
console.log(`  has IndexFlow basket: ${svg.includes('IndexFlow basket')}`);
console.log(`  has all 4 row labels:`);
['Obligor', 'Failure mode', 'Recovery', 'Time-to-cash'].forEach((r) => {
  console.log(`    ${svg.includes(`>${r}<`) ? 'OK ' : 'MISSING'} ${r}`);
});

console.log('\n=== Hero image path matches frontmatter ===');
const expected = data.image;
const expectedFsPath = path.resolve(
  '/Users/reuben/Desktop/minestarters/code/snx-prototype/apps/web/public',
  expected.replace(/^\//, ''),
);
console.log(`  frontmatter image: ${expected}`);
console.log(`  expected fs path:  ${expectedFsPath}`);
console.log(`  matches SVG path:  ${expectedFsPath === svgPath ? 'OK' : 'MISMATCH'}`);
console.log(`  file exists:       ${fs.existsSync(expectedFsPath) ? 'OK' : 'MISSING'}`);
