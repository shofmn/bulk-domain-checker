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
const SUPPORTED_TLDS = new Set(['de', 'net', 'eu', 'com']);

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

  const tld = String(parsed.topLevelDomain ?? 'de').toLowerCase();
  if (!SUPPORTED_TLDS.has(tld)) {
    throw new Error(`topLevelDomain must be one of: ${Array.from(SUPPORTED_TLDS).join(', ')}`);
  }

  return {
    domainLength,
    prefix,
    suffix,
    intervalMs: interval,
    topLevelDomain: tld,
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

function whoisLookup(fqdn, provider) {
  return new Promise((resolve, reject) => {
    const proc = spawn('whois', ['-h', provider.host, fqdn]);
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

      const available = provider.isAvailable(stdout);
      resolve({ available, raw: stdout });
    });
  });
}

function getWhoisProvider(tld) {
  if (tld === 'de') {
    return {
      host: 'whois.denic.de',
      isAvailable: (output) => {
        const statusMatch = output.match(/Status:\s*(\w+)/i);
        return statusMatch ? statusMatch[1].toLowerCase() === 'free' : false;
      },
    };
  }

  if (tld === 'net' || tld === 'com') {
    return {
      host: 'whois.verisign-grs.com',
      isAvailable: (output) => /no match/i.test(output),
    };
  }

  if (tld === 'eu') {
    return {
      host: 'whois.eu',
      isAvailable: (output) => {
        const statusMatch = output.match(/Status:\s*(\w+)/i);
        return statusMatch ? statusMatch[1].toLowerCase() === 'available' : false;
      },
    };
  }

  throw new Error(`Unsupported TLD: ${tld}`);
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

  const { domainLength, prefix, suffix, intervalMs, topLevelDomain } = config;
  const generator = domainGenerator(domainLength, prefix, suffix);
  const availableDomains = [];
  let checked = 0;
  let taken = 0;
  const startTime = Date.now();
  const whoisProvider = getWhoisProvider(topLevelDomain);

  console.log(chalk.blue(`Checking ${domainLength}-character .${topLevelDomain} domains with prefix="${prefix}" and suffix="${suffix}"`));
  console.log(chalk.blue(`Delay between lookups: ${intervalMs}ms`));

  for (const domain of generator) {
    if (checked > 0) {
      await delay(intervalMs);
    }

    const fqdn = `${domain}.${topLevelDomain}`;
    let result;
    try {
      result = await whoisLookup(fqdn, whoisProvider);
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

  console.log('\n' + chalk.bold.yellow('Summary'));
  console.log(`${chalk.white('Checked:')} ${chalk.cyan(checked)}`);
  console.log(`${chalk.white('Taken:')} ${chalk.red(taken)}`);
  console.log(`${chalk.white('Available:')} ${chalk.green(availableCount)}`);
  const availableList = availableCount ? availableDomains.join(', ') : 'None';
  console.log(`${chalk.white('Available domains:')} ${availableCount ? chalk.green(availableList) : chalk.gray(availableList)}`);
  console.log(`${chalk.white('Runtime:')} ${chalk.magenta(formatDuration(durationMs))}`);
}

run().catch((err) => {
  console.error(chalk.red(`Unexpected error: ${err.message}`));
  process.exit(1);
});
