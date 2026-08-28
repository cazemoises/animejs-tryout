import { defineConfig } from 'vitest/config'

export default defineConfig({
  /**
   * Project Pages serve from a sub-path, so every emitted asset URL has to be
   * prefixed with it. Set unconditionally rather than only for `build`: the dev
   * server then runs at the same sub-path too, which costs nothing and keeps
   * dev and production from diverging on exactly the thing that only breaks in
   * production.
   *
   * Dev URL becomes http://localhost:5173/bobaiona/
   */
  base: '/bobaiona/',
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
