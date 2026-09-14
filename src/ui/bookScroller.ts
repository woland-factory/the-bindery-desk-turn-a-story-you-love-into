// Pure windowing math for the virtualized viewport. Every spread row shares a
// single stride (scaled page height plus row gap), so a row's top is a simple
// multiple of the stride. Given the scroll position and viewport height, this
// returns the visible spread range (plus overscan) and the pad/spacer sizes.
// The window size depends only on the viewport, never on the total spread
// count, so scroll work stays O(visible spreads).

export interface SpreadWindow {
  /** First mounted spread index (inclusive). */
  firstSpread: number;
  /** Last mounted spread index (inclusive); -1 when there is nothing to show. */
  lastSpread: number;
  /** Top pad that offsets the mounted spreads to their real position. */
  topPadPx: number;
  /** Full scrollable height (the spacer). */
  totalPx: number;
}

export function windowSpreads(
  spreadCount: number,
  spreadStridePx: number,
  scrollTop: number,
  viewportPx: number,
  overscan: number,
): SpreadWindow {
  if (spreadCount <= 0) {
    return { firstSpread: 0, lastSpread: -1, topPadPx: 0, totalPx: 0 };
  }
  const stride = Math.max(1, spreadStridePx);
  const totalPx = spreadCount * stride;
  const top = Math.max(0, scrollTop);

  const firstVisible = Math.floor(top / stride);
  const lastVisible = Math.floor((top + Math.max(0, viewportPx)) / stride);

  const firstSpread = Math.max(0, firstVisible - overscan);
  const lastSpread = Math.min(spreadCount - 1, lastVisible + overscan);

  return { firstSpread, lastSpread, topPadPx: firstSpread * stride, totalPx };
}
