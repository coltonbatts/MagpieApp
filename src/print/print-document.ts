import { APP_NAME } from '@/lib/constants'

export type PrintPageSize = 'A4' | 'Letter'

interface PrintDocumentOptions {
  title: string
  svgMarkup: string
  pageSize: PrintPageSize
}

function pageSizeCssValue(pageSize: PrintPageSize): string {
  return pageSize === 'A4' ? 'A4 portrait' : 'Letter portrait'
}

export function generatePrintDocument(options: PrintDocumentOptions): string {
  const pageSizeCss = pageSizeCssValue(options.pageSize)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${options.title}</title>
    <style>
      @page {
        size: ${pageSizeCss};
        margin: 12mm;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #111;
        font-family: "Helvetica Neue", Arial, sans-serif;
      }

      .sheet {
        width: 100%;
        min-height: 100%;
      }

      .meta {
        margin-bottom: 8mm;
      }

      .meta h1 {
        margin: 0;
        font-size: 13pt;
        font-weight: 600;
      }

      .meta p {
        margin: 2mm 0 0;
        font-size: 9pt;
        color: #4b5563;
      }

      .pattern {
        border: 0.2mm solid #d1d5db;
        padding: 2mm;
      }

      .pattern svg {
        width: 100%;
        height: auto;
        display: block;
      }

      @media screen {
        body {
          padding: 18px;
          background: #f3f4f6;
        }

        .sheet {
          margin: 0 auto;
          max-width: 860px;
          padding: 20px;
          background: #fff;
          border: 1px solid #e5e7eb;
        }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <header class="meta">
        <h1>${options.title}</h1>
        <p>${APP_NAME} printable pattern</p>
      </header>
      <section class="pattern">
        ${options.svgMarkup}
      </section>
    </main>
  </body>
</html>`
}
