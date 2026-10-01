/**
 * Prisma's generated client bundles dotenv "~" expansion via os.homedir().
 * Next's file tracer turns that into a glob of the whole Windows user profile,
 * which crashes on protected junctions such as "Application Data" and "Cookies".
 * Loaded with `node -r` before `next build` so the tracer never starts that scan.
 */
const Module = require('module');
const os = require('os');

if (process.platform === 'win32') {
  const originalLoad = Module._load;
  const homePrefix = `${os.homedir().replace(/\//g, '\\').toLowerCase()}\\**`;

  function isWholeProfileGlob(pattern) {
    const text = String(pattern).replace(/\//g, '\\').toLowerCase();
    return text.startsWith(homePrefix);
  }

  function guard(original) {
    if (typeof original !== 'function' || original.__skipUserProfileGlob) return original;

    const wrapped = function guardedGlob(pattern, options, callback) {
      if (isWholeProfileGlob(pattern)) {
        const done = typeof options === 'function' ? options : callback;
        if (typeof done === 'function') done(null, []);
        return [];
      }
      return original.apply(this, arguments);
    };

    Object.assign(wrapped, original);
    wrapped.__skipUserProfileGlob = true;
    if (typeof original.sync === 'function') {
      wrapped.sync = function guardedSync(pattern, options) {
        if (isWholeProfileGlob(pattern)) return [];
        return original.sync(pattern, options);
      };
    }
    return wrapped;
  }

  Module._load = function (request, parent, isMain) {
    const exported = originalLoad.apply(this, arguments);
    const id = String(request).replace(/\\/g, '/');
    if (!id.includes('next/dist/compiled/glob') && !id.endsWith('/compiled/glob/glob.js')) {
      return exported;
    }
    if (typeof exported === 'function') return guard(exported);
    if (exported && typeof exported.default === 'function') {
      exported.default = guard(exported.default);
    }
    return exported;
  };
}
