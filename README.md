# AI Agent CLI Tool - Website Cloner

A conversational CLI agent built with Node.js and Google Gemini that scrapes any website URL and generates a single-file HTML clone (Header, Hero, Footer) which auto-opens in your browser.

## How it works

The agent runs a strict reasoning loop:

```
START -> THINK -> TOOL -> OBSERVE -> THINK -> TOOL -> OBSERVE -> ... -> OUTPUT
```

At each step, Gemini returns a JSON object:

```json
{
  "step": "THINK | TOOL | OBSERVE | OUTPUT",
  "content": "Agent's reasoning or message",
  "tool_name": "scrapeWebsite",
  "tool_args": { "url": "https://www.scaler.com/" }
}
```

## Project structure

```
AI-Agent-CLI-Tool/
  index.js         CLI interface + agent loop
  tools.js         Tool implementations (scrape, write, read, open)
  prompt.js        System prompt
  package.json     Dependencies
  .env             Your Gemini API key (not committed)
  .gitignore
  README.md
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in this folder with your Gemini API key:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

Get a free key at https://aistudio.google.com/app/apikey

## Run

```bash
node index.js
```

You'll see:

```
Website Cloner Agent
Type a URL or instruction to begin. Examples:
  https://www.scaler.com/
  clone https://www.stripe.com/
  exit  (to quit)

You >
```

### Example

```
You >  https://www.scaler.com/
```

The agent will:
1. THINK - plan the scraping strategy
2. TOOL - scrapeWebsite("https://www.scaler.com/")
3. OBSERVE - analyze nav, hero text, colors, footer
4. THINK - design the HTML structure
5. TOOL - writeFile("scaler_clone.html", "<html>...")
6. TOOL - readFile to verify
7. TOOL - openInBrowser to launch the result
8. OUTPUT - summary

## Tools

| Tool | Description |
|------|-------------|
| `scrapeWebsite(url)` | Fetches the page and returns a structured summary |
| `writeFile(filename, content)` | Saves the generated HTML clone to disk |
| `readFile(filename)` | Reads back the file to verify completeness |
| `openInBrowser(filename)` | Opens the HTML file in the default browser |

## Dependencies

| Package | Purpose |
|---------|---------|
| `@google/generative-ai` | Gemini SDK |
| `axios` | HTTP client for scraping |
| `cheerio` | Server-side HTML parsing |
| `dotenv` | Loads `.env` into `process.env` |
# gen-AI-ASSIGNMENT
