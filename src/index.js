import fs from 'fs';
import path from 'path';
import process from 'process';
import { spawn } from 'child_process';
import chalk from 'chalk';

const CONFIG_FILE = path.resolve(process.cwd(), 'config.json');
const MIN_LENGTH = 2;
const MAX_LENGTH = 63;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const DEFAULT_INTERVAL_MS = 500;

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Missing config.json. Copy config.example.json and adjust values.`);
  }

  const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`config.json contains invalid JSON: ${err.message}`);
  }

  const domainLength = Number(parsed.length);
  if (!Number.isInteger(domainLength) || domainLength < MIN_LENGTH || domainLength > MAX_LENGTH) {
    throw new Error(`"length" must be an integer between ${MIN_LENGTH} and ${MAX_LENGTH}.`);
  }

  const prefix = validateAffix(parsed.prefix ?? '', 'prefix');
  const suffix = validateAffix(parsed.suffix ?? '', 'suffix');

  if (prefix.length + suffix.length >= domainLength) {
    throw new Error('prefix + suffix length must be shorter than the domain length.');
  }

  const interval = parsed.intervalMs ?? DEFAULT_INTERVAL_MS;
  if (!Number.isFinite(interval) || interval < 0) {
    throw new Error('intervalMs must be a non-negative number of milliseconds when provided.');
  }

  return {
    domainLength,
    prefix,
    suffix,
    intervalMs: interval,
  };
}

function validateAffix(value, name) {
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string (letters a-z only).`);
  }

  if (!/^$|^[a-z]+$/.test(value)) {
    throw new Error(`${name} must only contain lowercase a-z characters.`);
  }

  return value;
}

function* domainGenerator(length, prefix, suffix) {
  const fillCount = length - prefix.length - suffix.length;

  if (fillCount === 0) {
    yield prefix + suffix;
    return;
  }

  function* build(current) {
    if (current.length === fillCount) {
      yield current;
      return;
    }

    for (const letter of ALPHABET) {
      yield* build(current + letter);
    }
  }

  for (const middle of build('')) {
    yield prefix + middle + suffix;
  }
}

function whoisLookup(domain) {
  return new Promise((resolve, reject) => {
    const proc = spawn('whois', ['-h', 'whois.denic.de', `${domain}.de`]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      if (code !== 0 && stderr) {
        return reject(new Error(stderr.trim()));
      }

      const statusMatch = stdout.match(/Status:\s*(\w+)/i);
      if (!statusMatch) {
        return resolve({ available: false, raw: stdout });
      }

      const available = statusMatch[1].toLowerCase() === 'free';
      resolve({ available, raw: stdout });
    });
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const formatDuration = (ms) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ];

  return `${parts[0]}h ${parts[1]}m ${parts[2]}s`;
};

async function run() {
  let config;
  try {
    config = readConfig();
  } catch (err) {
    console.error(chalk.red(`Configuration error: ${err.message}`));
    process.exit(1);
  }

  const { domainLength, prefix, suffix, intervalMs } = config;
  const generator = domainGenerator(domainLength, prefix, suffix);
  const availableDomains = [];
  let checked = 0;
  let taken = 0;
  const startTime = Date.now();

  console.log(chalk.blue(`Checking ${domainLength}-character .de domains with prefix="${prefix}" and suffix="${suffix}"`));
  console.log(chalk.blue(`Delay between lookups: ${intervalMs}ms`));

  for (const domain of generator) {
    if (checked > 0) {
      await delay(intervalMs);
    }

    const fqdn = `${domain}.de`;
    let result;
    try {
      result = await whoisLookup(domain);
    } catch (err) {
      console.error(chalk.red(`Error checking ${fqdn}: ${err.message}`));
      continue;
    }

    checked += 1;

    if (result.available) {
      availableDomains.push(fqdn);
      console.log(`${chalk.cyan(fqdn)} - ${chalk.green('AVAILABLE')}`);
    } else {
      taken += 1;
      console.log(`${chalk.cyan(fqdn)} - ${chalk.red('TAKEN')}`);
    }
  }

  const availableCount = availableDomains.length;
  const durationMs = Date.now() - startTime;

  console.log('\n' + chalk.bold('Summary'));
  console.log(`Checked: ${checked}`);
  console.log(`Taken: ${taken}`);
  console.log(`Available: ${availableCount}`);
  console.log(`Available domains: ${availableCount ? availableDomains.join(', ') : 'None'}`);
  console.log(`Runtime: ${formatDuration(durationMs)}`);
}

run().catch((err) => {
  console.error(chalk.red(`Unexpected error: ${err.message}`));
  process.exit(1);
});
