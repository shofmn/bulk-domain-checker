# de-domain-checker

Simple Node.js terminal app to bulk-check .de domain availability by querying `whois.denic.de`.

## Prerequisites

- Node.js 18+ (tested with v24.x)
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
| `length` | integer (2-63) | Total length of the domain label (without `.de`). |
| `prefix` | string | Lowercase letters that must appear at the start. |
| `suffix` | string | Lowercase letters that must appear at the end. |
| `intervalMs` | integer (optional) | Delay between lookups in ms. Defaults to 500. |

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
  "intervalMs": 500
}
```

## Running the checker

```bash
npm start
```

For each generated domain the app prints either `AVAILABLE` (green) or `TAKEN` (red) and, once the list is exhausted, a summary:

```
Summary
Checked: 468
Taken: 467
Available: 1
Available domains: glhf.de
```
