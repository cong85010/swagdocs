# SwagDocs - OpenAPI to Markdown Converter

A Chrome extension that converts Swagger/OpenAPI endpoints into high-quality Markdown documentation with TypeScript interfaces and Axios snippets.

## Features

- 🔍 **Automatic Detection**: Detects OpenAPI/Swagger JSON URLs on the current page
- 📝 **Endpoint Selection**: Interactive UI to select specific endpoints
- 🔎 **Search & Filter**: Search endpoints by path, method, or summary
- 📋 **Markdown Generation**: Converts OpenAPI specs to structured Markdown
- 💻 **TypeScript Support**: Generates TypeScript interfaces for responses
- 🚀 **Axios Snippets**: Ready-to-use Axios function calls
- 🎨 **Dark Mode**: Neon-noir styling optimized for dark mode

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder from this project

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build in watch mode:
   ```bash
   npm run dev
   ```

3. Load the extension from the `dist` folder

## Usage

1. Navigate to a page with Swagger/OpenAPI documentation
2. Click the extension icon
3. Select the endpoints you want to document
4. Switch to the "Preview" tab to see the generated Markdown
5. Click "Copy" to copy the Markdown to your clipboard

## Project Structure

```
swagdocs/
├── manifest.json          # Chrome extension manifest (V3)
├── popup.html            # Extension popup HTML
├── src/
│   ├── content/          # Content scripts
│   │   └── content.js    # Detects OpenAPI URLs
│   ├── background/       # Background scripts
│   │   └── background.js # Handles messages and storage
│   ├── popup/            # React popup application
│   │   ├── App.tsx       # Main popup component
│   │   ├── main.tsx      # React entry point
│   │   └── index.css     # Styles
│   └── utils/
│       └── markdownGenerator.ts  # Markdown generation logic
└── dist/                 # Build output (generated)
```

## Technologies

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Lucide React (icons)
- Chrome Extension Manifest V3
