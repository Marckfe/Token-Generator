const fetch = require('node-fetch');
async function test() {
  const identifiers = [{name: "Archmage's Charm"}, {name: "Brainstorm"}, {name: "Sink into Stupor"}];
  const res = await fetch('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiers })
  });
  const data = await res.json();
  console.log(data);
}
test();
