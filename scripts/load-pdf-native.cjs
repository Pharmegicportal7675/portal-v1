'use strict';

/**
 * Pure CommonJS bridge for loading puppeteer-core / chromium-min.
 * Next.js ESM server bundles cannot call require()/createRequire reliably on Hostinger.
 * This file is always executed as native Node CJS (via Module.createRequire or the PDF worker).
 */

const path = require('path');
const Module = require('module');

function loadPackage(root, packageName) {
  const createRequire = Module.createRequire;
  if (typeof createRequire !== 'function') {
    throw new Error('module.createRequire is not available');
  }

  const req = createRequire(path.join(root, 'package.json'));
  const abs = path.join(root, 'node_modules', packageName);

  try {
    return req(packageName);
  } catch (namedError) {
    try {
      return req(abs);
    } catch {
      throw namedError;
    }
  }
}

function unwrapDefault(mod) {
  if (mod && typeof mod === 'object' && mod.default && typeof mod.default === 'object') {
    return mod.default;
  }
  return mod;
}

function loadPuppeteerCore(root) {
  const mod = unwrapDefault(loadPackage(root, 'puppeteer-core'));
  if (!mod || typeof mod.launch !== 'function') {
    throw new Error('puppeteer-core loaded but launch() is missing');
  }
  return mod;
}

function loadChromiumMin(root) {
  return unwrapDefault(loadPackage(root, '@sparticuz/chromium-min'));
}

module.exports = {
  loadPuppeteerCore,
  loadChromiumMin,
};
