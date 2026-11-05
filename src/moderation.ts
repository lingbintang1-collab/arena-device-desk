export type PlayerAsset = { assetId: string; playerId: string; reports: number };

export function moderationQueue(assets: PlayerAsset[]) {
  return assets.filter(asset => asset.reports >= 3).map(asset => ({
    assetId: asset.assetId,
    playerId: asset.playerId,
    reason: 'community_reports' as const,
    state: 'pending' as const
  }));
}
