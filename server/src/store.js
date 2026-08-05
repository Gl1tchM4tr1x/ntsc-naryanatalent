'use strict';

const fs = require('fs/promises');
const path = require('path');

// The captured portal-data.json seed was originally downloaded with formatting
// newlines inserted inside JSON string values, so plain JSON.parse fails on it.
// Stripping literal newlines is safe: JSON.stringify always escapes real
// embedded newlines as \n, never as literal control characters.
function parseJsonLoose(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return JSON.parse(raw.replace(/[\r\n]+/g, ' '));
  }
}

function createStore({ filePath, seedPath, defaultData = {} }) {
  let data = null;
  let writeChain = Promise.resolve();
  let onChange = null;

  // Called after every successful write so real-time subscribers (SSE
  // clients) can be notified with a fresh version counter.
  function setOnChange(fn) {
    onChange = typeof fn === 'function' ? fn : null;
  }

  async function init() {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      data = parseJsonLoose(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      if (seedPath) {
        let seedRaw;
        try {
          seedRaw = await fs.readFile(seedPath, 'utf8');
        } catch (seedErr) {
          throw new Error(
            `[store] seed file not found: ${seedPath}. ` +
            `The seed JSON (localhost8081/api/portal-data.json) must be shipped with the repo. ` +
            `Resolved path uses the project root (__dirname), not the current working directory. ` +
            `Cause: ${seedErr.message}`
          );
        }
        data = parseJsonLoose(seedRaw);
      } else {
        data = JSON.parse(JSON.stringify(defaultData));
      }
      await write(data);
    }
    return data;
  }

  function getData() {
    return data;
  }

  // Atomic write: write a temp file, then rename over the target. A read
  // during a write therefore never sees a half-written document.
  async function write(next) {
    const run = writeChain.then(async () => {
      const tmp = `${filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
      await fs.rename(tmp, filePath);
    });
    writeChain = run.catch(() => {});
    await run;
    data = next;
    if (onChange) onChange(next);
    return next;
  }

  // mutator(data) => next data. If the mutator returns the same reference
  // (no change), the store is left untouched.
  async function replace(mutator) {
    const next = mutator(data);
    if (next === data || next == null) return data;
    await write(next);
    return next;
  }

  return { init, getData, write, replace, setOnChange };
}

module.exports = { createStore, parseJsonLoose };
