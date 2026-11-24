// Lets TypeScript accept side-effect imports of compiled stylesheets, e.g.
//   import './styles/index.global.scss.css';
// The CSS itself is produced by the Sass build step and bundled by webpack; nothing is exported.
declare module '*.css';
