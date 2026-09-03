const fs = require('fs-extra');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'sudo.json');
fs.ensureFileSync(file);

function load() {
  try {
    const data = fs.readJsonSync(file);
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}

function normalize(number) {
  return String(number || '').replace(/[^0-9]/g, '');
}

function save(list) {
  fs.writeJsonSync(file, [...new Set(list.map(normalize).filter(Boolean))], { spaces: 2 });
}

function has(number) {
  return load().includes(normalize(number));
}

function add(number) {
  const n = normalize(number);
  if (!n) return false;
  const list = load();
  if (list.includes(n)) return false;
  list.push(n); save(list); return true;
}

function remove(number) {
  const n = normalize(number);
  const list = load();
  const next = list.filter(x => x !== n);
  if (next.length === list.length) return false;
  save(next); return true;
}

module.exports = { normalize, has, add, remove, list: load };
