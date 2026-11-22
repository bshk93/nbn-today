'use strict';

// A fixed Chrome profile on disk, wiped before each launch.
//
// Left to itself, Puppeteer makes a new /tmp/puppeteer_dev_chrome_profile-*
// per launch and deletes it in browser.close(). A run killed by lowprio's
// memory cap or a timeout never gets there, and on the server /tmp is RAM:
// 93 of them once held 195 MB of it. One reused folder can't pile up, and
// clearing it at start keeps each run clean.

const fs = require('fs');
const os = require('os');
const path = require('path');

function freshProfileDir(name) {
  const dir = path.join(os.homedir(), '.cache', 'nbn-frontend', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { freshProfileDir };
