# Flense

TypeScript/JavaScript client for the [Flense](https://flense.dev) document parsing API. Convert PDFs, images, and documents to markdown.

Flense is a paid document parsing service. [Get a free demo API key](https://flense.dev) to try it out.

```bash
npm install flense
```

## Quick Start

```typescript
import { Flense } from 'flense';

const flense = new Flense({ apiKey: 'flense_...' });

// Parse a PDF from URL
const result = await flense.parseUrl('https://example.com/doc.pdf').wait();
console.log(result.markdown);

// Parse a local file
import fs from 'fs';
const file = fs.readFileSync('document.pdf');
const result = await flense.parseFile(file, 'document.pdf').wait();
console.log(result.markdown);
```

## Parse Options

All features are OFF by default for fastest processing. Enable them as needed:

```typescript
const result = await flense
  .parseFile(file, 'document.pdf')
  .withOCR()       // Enable OCR for scanned documents
  .withTables()    // Enable table structure detection
  .withImages()    // Enable image extraction
  .withPageStreaming()  // Stream markdown per-page as each completes
  .wait();
```

| Method | Description |
|--------|-------------|
| `.withOCR(enabled?)` | Enable OCR for scanned/image-based PDFs |
| `.withTables(enabled?)` | Enable table structure detection |
| `.withImages(enabled?)` | Enable image extraction and upload |
| `.withPageStreaming(enabled?)` | Stream markdown per-page as each page completes |

## Real-time Progress

For large documents, subscribe to real-time updates:

```typescript
const job = flense.parseFile(file, 'document.pdf');

job.subscribe({
  onProgress: ({ progress, stage, currentPage, totalPages }) => {
    console.log(`${progress}% - ${stage}`);
  },
  onContent: ({ page, content }) => {
    console.log(`Page ${page} ready`);
  },
  onComplete: (status) => {
    console.log('Done!', status.output?.markdown);
  },
  onError: (error) => {
    console.error('Failed:', error.message);
  },
});
```

## React Hook

```tsx
import { useParseJob } from 'flense/react';

function DocumentParser() {
  const { parseFile, progress, content, isProcessing, isComplete } = useParseJob({
    apiKey: 'flense_...',
  });

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) parseFile(file);
        }}
      />
      {isProcessing && <p>Processing: {progress?.progress}%</p>}
      {isComplete && <pre>{content}</pre>}
    </div>
  );
}
```

## Environment Variable

Set `FLENSE_API_KEY` to avoid passing the key explicitly:

```bash
export FLENSE_API_KEY=flense_your_key_here
```

```typescript
const flense = new Flense(); // API key read from environment
```

## Supported Formats

| Format | Type |
|--------|------|
| PDF | Documents |
| DOCX | Word |
| PPTX | PowerPoint |
| XLS/XLSX | Excel |
| CSV | Spreadsheets |
| PNG, JPG, WEBP | Images |

## API Reference

See the full API documentation at [api.flense.dev/docs](https://api.flense.dev/docs)

## License

MIT
