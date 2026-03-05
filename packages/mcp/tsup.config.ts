import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  banner: {
    // Shebang for CLI + createRequire shim so bundled CJS deps can require() Node builtins
    js: `#!/usr/bin/env node\nimport{createRequire}from'module';const require=createRequire(import.meta.url);`,
  },
  // Bundle @trenchtools/core into the output so we only publish one package
  noExternal: ['@trenchtools/core'],
});
