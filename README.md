# bulk-domain-checker

Simple Node.js terminal app to bulk-check `.de`, `.net`, `.eu`, and `.com` domain availability via WHOIS.

## Prerequisites

- Node.js 24+
- `whois` binary available in your shell (macOS and most Linux distros include it)

## Setup

```bash
npm install
```

Copy the sample configuration and adjust the values before running the checker:

```bash
cp config.example.json config.json
# edit config.json to fit your search
```

## Configuration (`config.json`)

| Field | Type | Description |
| --- | --- | --- |
| `length` | integer (2-63) | Total length of the domain label (without the TLD). |
| `prefix` | string | Lowercase letters that must appear at the start. |
| `suffix` | string | Lowercase letters that must appear at the end. |
| `intervalMs` | integer (optional) | Delay between lookups in ms. Defaults to 500. |
| `topLevelDomain` | `"de"`, `"net"`, `"eu"`, or `"com"` | Which TLD to test. Defaults to `"de"`. |

Constraints:
- Only lowercase `a-z` characters are allowed for prefix/suffix.
- `prefix.length + suffix.length` must be strictly less than `length`.
- Remaining characters are brute-forced with every `a-z` combination.

Example:

```json
{
  "length": 4,
  "prefix": "gl",
  "suffix": "",
  "intervalMs": 500,
  "topLevelDomain": "de"
}
```

## Running the checker

```bash
npm start
```

`whois.denic.de` is used for `.de` domains (a domain is free when the response contains `Status: free`). For `.net` and `.com`, the checker queries `whois.verisign-grs.com` and treats any response containing `No match` as available. For `.eu`, the checker uses `whois.eu` and considers domains with `Status: AVAILABLE` to be free.

For each generated domain the app prints either `AVAILABLE` (green) or `TAKEN` (red) and, once the list is exhausted, a summary:

```
Summary
Checked: 468
Taken: 467
Available: 1
Available domains: glhf.de
Runtime: 00h 15m 34s
```
