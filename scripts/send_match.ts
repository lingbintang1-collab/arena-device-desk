export {};

const response = await fetch('http://127.0.0.1:3000/match-update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    updateId: 'e9d41aa4-02c4-4f4e-94e9-d9ba015a2301',
    deviceId: 'arena-eu-7', status: 'degraded',
    assets: [
      { assetId: 'cape-17', playerId: 'player-17', reports: 3 },
      { assetId: 'banner-8', playerId: 'player-8', reports: 2 }
    ],
    liveEvent: { name: 'midnight-cup', players: 24 }
  })
});
const result = await response.json();
if (!response.ok) throw new Error(JSON.stringify(result));
console.log(JSON.stringify(result, null, 2));
