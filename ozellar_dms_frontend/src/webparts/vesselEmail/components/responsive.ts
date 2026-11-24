export const MOBILE_MAX = 767;
// Tablet is 768–1023. A 1024px-wide window (common laptop / split-screen / landscape-tablet
// width) is treated as a desktop so the sidebar stays open. Keep the `max-width: 1023px`
// media queries in futuristicTheme.ts in step with this value.
export const TABLET_MAX = 1023;

export function isMobileWidth(width: number): boolean {
  return width <= MOBILE_MAX;
}

export function isTabletWidth(width: number): boolean {
  return width > MOBILE_MAX && width <= TABLET_MAX;
}

export function isTabletOrBelow(width: number): boolean {
  return width <= TABLET_MAX;
}
