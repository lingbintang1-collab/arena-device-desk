import test from 'node:test';
import assert from 'node:assert/strict';
import { moderationQueue } from '../src/moderation.ts';

test('three reports queues an asset while two reports leaves it visible', () => {
  assert.deepEqual(moderationQueue([
    { assetId: 'cape-17', playerId: 'player-17', reports: 3 },
    { assetId: 'banner-8', playerId: 'player-8', reports: 2 }
  ]), [{ assetId: 'cape-17', playerId: 'player-17', reason: 'community_reports', state: 'pending' }]);
});
