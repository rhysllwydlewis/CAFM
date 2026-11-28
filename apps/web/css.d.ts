// Plain stylesheet imports for their side effect, such as `import '@fmstead/ui/styles.css'`. TypeScript 6 checks
// that these resolve, and Next.js only types CSS modules, so the plain ones are declared here.
declare module '*.css';
