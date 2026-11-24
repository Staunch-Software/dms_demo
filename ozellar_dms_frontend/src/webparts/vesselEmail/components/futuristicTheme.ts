// Maritime futuristic skin — DESIGN ONLY.
// The CSS itself now lives in ./styles/index.global.scss and is bundled with the web part; this
// module keeps the font stack / motion constants and loads the web font. Layered on top of AppLayout.tsx's
// injectFullScreenStyles(). It only re-maps CSS custom properties and adds
// presentation rules (glass, radii, fonts, background, motion). No handler,
// state, API call, permission or DOM order is touched.
//
// Settings → Color Management keeps working: every --clay-* value that
// applyColorTheme() writes (bg / text / accent / hover and their derived
// surfaces, gradients, glow) is deliberately NOT overridden here.

import './styles/index.global.scss.css';

const FONT_ID = 'vessel-dms-futuristic-fonts';

export const vdmsFont = {
  display: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  ui: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

export const vdmsMotion = {
  spring: 'cubic-bezier(.2,.9,.25,1.15)',
  glide: 'cubic-bezier(.2,.8,.2,1)',
};

export function injectFuturisticTheme(): void {
  if (typeof document === 'undefined') return;

  if (!document.getElementById(FONT_ID)) {
    const link = document.createElement('link');
    link.id = FONT_ID;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(link);
  }

}
