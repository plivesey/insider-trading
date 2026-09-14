// Generates card_list.csv — every card in the game (stocks, actions, insider
// tips, goals, loans, Hot Tips) plus the code-dealt starter Market Order.
// Colors are shown with the industry labels printed on the cards.
const fs = require('node:fs');
const path = require('node:path');

const HERE = __dirname;
const load = f => {
  const d = JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8'));
  return Array.isArray(d) ? d : d.cards ?? Object.values(d).find(Array.isArray);
};

const IND = { Blue: 'Steel', Orange: 'Oil', Yellow: 'Rail', Purple: 'Bank', Wild: 'Wild' };
const relabel = s =>
  String(s ?? '')
    .replace(/\bBlue\b/g, 'Steel')
    .replace(/\bOrange\b/g, 'Oil')
    .replace(/\bYellow\b/g, 'Rail')
    .replace(/\bPurple\b/g, 'Bank');

const rows = [];
const add = r =>
  rows.push({
    Category: '',
    Name: '',
    Count: '',
    Color: '',
    Subtype: '',
    Deck: '',
    Requirement: '',
    Text: '',
    ...r
  });

// ---- Stocks (group identical color+type) ----
const stocks = load('stock_cards.json');
const stockGroups = new Map();
for (const c of stocks) {
  const key = `${c.color}|${c.type}`;
  if (!stockGroups.has(key)) stockGroups.set(key, { card: c, count: 0 });
  stockGroups.get(key).count++;
}
for (const { card, count } of stockGroups.values()) {
  add({
    Category: 'Stock',
    Name: card.name ?? 'Common Share',
    Count: count,
    Color: IND[card.color],
    Subtype: card.type,
    Deck: 'Main deck (auctioned)',
    Text: relabel(card.ability ?? '')
  });
}

// ---- Action cards (group by name) ----
const actions = load('action_cards.json');
const actionGroups = new Map();
for (const c of actions) {
  if (!actionGroups.has(c.name)) actionGroups.set(c.name, { card: c, count: 0 });
  actionGroups.get(c.name).count++;
}
for (const { card, count } of actionGroups.values()) {
  add({
    Category: 'Action',
    Name: card.name,
    Count: count,
    Subtype: card.persistent ? 'persistent' : 'single-use',
    Deck: 'Main deck (auctioned)',
    Text: relabel(card.description)
  });
}

// ---- Insider tips (group by text) ----
const tips = load('insider_tip_cards.json');
const tipGroups = new Map();
for (const c of tips) {
  if (!tipGroups.has(c.text)) tipGroups.set(c.text, { card: c, count: 0 });
  tipGroups.get(c.text).count++;
}
for (const { card, count } of tipGroups.values()) {
  add({
    Category: 'Insider Tip',
    Name: 'Insider Tip',
    Count: count,
    Subtype: card.type,
    Deck: 'Insider Tip deck',
    Text: relabel(card.text)
  });
}

// ---- Goals ----
const goals = load('goal_cards.json');
for (const g of goals) {
  add({
    Category: 'Goal',
    Name: relabel(g.goal.text),
    Count: 1,
    Subtype: g.goal.parsed.type,
    Deck: 'Goals (public)',
    Requirement: relabel(g.goal.text),
    Text: relabel(g.reward.text)
  });
}

// ---- Loans (identical) ----
const loans = load('loan_cards.json');
add({
  Category: 'Loan',
  Name: 'Bank Loan',
  Count: loans.length,
  Deck: 'Bank (auto-issued)',
  Text: 'Take $10 now. End-game penalty escalates per player: 1st −$12, 2nd −$13, 3rd −$14 (max 3 loans/player).'
});

// ---- Hot Tips (identical starter) ----
const peeks = load('peek_cards.json');
add({
  Category: 'Hot Tip',
  Name: 'Hot Tip',
  Count: `${peeks.length} (1 per player)`,
  Deck: 'Starter (each player)',
  Text: relabel(peeks[0].description)
});

// ---- Market Order (code-dealt starter, not in any JSON) ----
add({
  Category: 'Starter',
  Name: 'Market Order',
  Count: '1 per player',
  Subtype: 'single-use',
  Deck: 'Starter (each player)',
  Text: 'Buy one stock from the market at its current price (that color rises +1). Only colored stocks; not the card being auctioned.'
});

// ---- Emit CSV ----
const cols = ['Category', 'Name', 'Count', 'Color', 'Subtype', 'Deck', 'Requirement', 'Text'];
const esc = v => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const lines = [cols.join(',')];
for (const r of rows) lines.push(cols.map(c => esc(r[c])).join(','));
const out = path.join(HERE, 'card_list.csv');
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`Wrote ${out} — ${rows.length} rows.`);
