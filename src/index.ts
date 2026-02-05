/**
 * Flense SDK
 *
 * Official TypeScript/JavaScript client library for the Flense document parsing API.
 *
 * @packageDocumentation
 * @module flense
 *
 * @example Basic usage
 * ```typescript
 * import { Flense } from 'flense';
 *
 * const flense = new Flense({ apiKey: 'flense_...' });
 *
 * // Parse a URL
 * const result = await flense.parseUrl('https://example.com/doc.pdf').wait();
 * console.log(result.markdown);
 *
 * // Parse a file
 * const file = fs.readFileSync('document.pdf');
 * const result = await flense.parseFile(file, 'document.pdf').wait();
 * ```
 *
 * @example With real-time progress updates
 * ```typescript
 * const job = flense.parseFile(file, 'document.pdf');
 * job.subscribe({
 *   onProgress: (p) => console.log(`${p.progress}% - ${p.stage}`),
 *   onContent: (c) => console.log(`Page ${c.page} ready`),
 *   onComplete: (s) => console.log('Done!', s.output?.markdown),
 * });
 * ```
 */

/**
 * Configuration options for the Flense client.
 */
export interface FlenseConfig {
  /**
   * Your Flense API key.
   * Get one at https://flense.dev or by calling POST /v1/auth/api-key
   */
  apiKey?: string;

  /**
   * Base URL for the Flense API.
   * @default "https://api.flense.dev"
   */
  baseUrl?: string;
}

/**
 * Result of creating a parse job.
 */
export interface ParseResult {
  /** The unique job ID for tracking this parse operation */
  jobId: string;
}

/**
 * Result of a synchronous parse operation.
 */
export interface ParseFileResult {
  /** Whether the parse was successful */
  success: boolean;
  /** The parsed markdown content */
  markdown: string;
}

/**
 * Result of a completed parse job.
 */
export interface JobResult {
  /** Whether the job completed successfully */
  success: boolean;
  /** The parsed markdown content */
  markdown: string;
  /** The final job state */
  state: string;
}

/**
 * Possible states for a parse job.
 */
export type JobState =
  | "created"
  | "active"
  | "completed"
  | "failed"
  | "cancelled"
  | "archived";

/**
 * Full status of a parse job.
 */
export interface JobStatus {
  /** Unique job identifier */
  id: string;
  /** Current job state */
  state: JobState;
  /** Job input data */
  data?: Record<string, unknown>;
  /** Job output when completed */
  output?: {
    /** Document ID */
    documentId?: string;
    /** Parsed content */
    content?: string;
    /** Parsed markdown */
    markdown?: string;
    /** Processing time in milliseconds */
    processingTime?: number;
  };
  /** When the job was created */
  createdOn?: string;
  /** When processing started */
  startedOn?: string;
  /** When processing completed */
  completedOn?: string;
  /** Number of retry attempts */
  retryCount?: number;
  /** Maximum retry attempts allowed */
  retryLimit?: number;
  /** Error message if job failed */
  error?: string;
}

/**
 * Progress update during document parsing.
 */
export interface ProgressUpdate {
  /** Overall progress percentage (0-100) */
  progress: number;
  /** Current processing stage description */
  stage: string;
  /** Current page being processed */
  currentPage?: number;
  /** Total number of pages in the document */
  totalPages?: number;
  /** Average time per page in seconds */
  avgPageTime?: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;
}

/**
 * A chunk of parsed content from a specific page.
 */
export interface ContentChunk {
  /** Page number (1-indexed) */
  page: number;
  /** Parsed content for this page */
  content: string;
}

/**
 * Options for configuring document parsing behavior.
 * All features are OFF by default for fastest processing.
 * Use the fluent API (.withOCR(), .withTables(), .withImages()) to enable features.
 */
export interface ParseOptions {
  /**
   * Enable OCR (Optical Character Recognition) for scanned documents.
   * Only needed for scanned/image-based PDFs.
   * @default false
   */
  ocr?: boolean;

  /**
   * Enable table structure detection and parsing.
   * Enable if you need structured table data in markdown.
   * @default false
   */
  tables?: boolean;

  /**
   * Enable image extraction and upload.
   * Enable if you need images embedded in the output.
   * @default false
   */
  images?: boolean;
}

/**
 * Callbacks for subscribing to job updates.
 */
export interface JobSubscriptionCallbacks {
  /** Called on any status change */
  onStatus?: (status: JobStatus) => void;
  /** Called when progress updates are received */
  onProgress?: (progress: ProgressUpdate) => void;
  /** Called when a page's content is ready */
  onContent?: (content: ContentChunk) => void;
  /** Called when the job completes successfully */
  onComplete?: (status: JobStatus) => void;
  /** Called when the job fails */
  onFailed?: (status: JobStatus) => void;
  /** Called on any error (connection, parsing, etc.) */
  onError?: (error: Error) => void;
}

interface QueueJobCreateResponse {
  success: boolean;
  jobId: string;
  documentId?: string;
  remaining?: number;
  unlimited?: boolean;
  message?: string;
}

interface QueueJobStatusResponse {
  id: string;
  state: string;
  output?: {
    content?: string;
    markdown?: string;
  };
  error?: string;
}

interface FlenseResponse {
  success: boolean;
  markdown: string;
  content?: string;
}

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  xml: "application/xml",
  json: "application/json",
};

function getFilenameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      if (lastSegment && lastSegment.includes(".")) {
        return lastSegment;
      }
    }
  } catch {
    // Invalid URL, return default
  }
  return "document";
}

function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext && MIME_TYPES[ext]) {
    return MIME_TYPES[ext];
  }
  return "application/octet-stream";
}

function generateDocumentId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Represents a parse job that can be subscribed to for real-time updates.
 *
 * ParseJob implements PromiseLike, so you can await it directly to get the job ID,
 * or call `.wait()` to wait for the full result, or `.subscribe()` for real-time updates.
 *
 * Use the fluent API to configure parsing options:
 *
 * @example Await for job ID only
 * ```typescript
 * const { jobId } = await flense.parseFile(file, 'doc.pdf');
 * ```
 *
 * @example Wait for complete result
 * ```typescript
 * const result = await flense.parseFile(file, 'doc.pdf').wait();
 * console.log(result.markdown);
 * ```
 *
 * @example Subscribe to real-time updates
 * ```typescript
 * const job = flense.parseFile(file, 'doc.pdf');
 * job.subscribe({
 *   onProgress: (p) => console.log(`${p.progress}%`),
 *   onComplete: (s) => console.log('Done!'),
 * });
 * ```
 *
 * @example Optimize for speed (text-based PDF)
 * ```typescript
 * const result = await flense.parseFile(file, 'doc.pdf')
 *   .withOCR(false)      // Skip OCR - much faster for text PDFs
 *   .withTables(false)   // Skip table detection
 *   .wait();
 * ```
 */
export class ParseJob implements PromiseLike<ParseResult> {
  private jobIdPromise: Promise<string> | null = null;
  private _jobId: string | null = null;
  // Default: all features OFF for fastest processing
  private _options: ParseOptions = {
    ocr: false,
    tables: false,
    images: false,
  };

  constructor(
    private createJob: (options: ParseOptions) => Promise<string>,
    private client: Flense
  ) {}

  /**
   * Enable OCR (Optical Character Recognition).
   *
   * OCR is OFF by default. Enable for scanned/image-based PDFs
   * where text is not directly extractable. Adds ~5-8s per page.
   *
   * @param enabled - Whether to enable OCR (default: true when called)
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * // Enable OCR for scanned documents
   * flense.parseFile(file, 'scanned.pdf').withOCR().wait();
   * ```
   */
  withOCR(enabled: boolean = true): this {
    this._options.ocr = enabled;
    return this;
  }

  /**
   * Enable table structure detection.
   *
   * Table detection is OFF by default. Enable if you need
   * structured table data in your markdown output. Adds ~2-3s per page.
   *
   * @param enabled - Whether to enable table detection (default: true when called)
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * // Enable table parsing
   * flense.parseFile(file, 'report.pdf').withTables().wait();
   * ```
   */
  withTables(enabled: boolean = true): this {
    this._options.tables = enabled;
    return this;
  }

  /**
   * Enable image extraction and upload.
   *
   * Image extraction is OFF by default. When enabled, images are
   * extracted and uploaded to cloud storage with URLs in markdown.
   *
   * @param enabled - Whether to enable image extraction (default: true when called)
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * // Enable image extraction
   * flense.parseFile(file, 'doc.pdf').withImages().wait();
   * ```
   */
  withImages(enabled: boolean = true): this {
    this._options.images = enabled;
    return this;
  }

  /**
   * Get the current parse options.
   */
  get options(): ParseOptions {
    return { ...this._options };
  }

  private getJobId(): Promise<string> {
    if (!this.jobIdPromise) {
      this.jobIdPromise = this.createJob(this._options).then((id) => {
        this._jobId = id;
        return id;
      });
    }
    return this.jobIdPromise;
  }

  /**
   * Get the job ID (available after job is created).
   * Returns null until the job creation request completes.
   */
  get jobId(): string | null {
    return this._jobId;
  }

  then<TResult1 = ParseResult, TResult2 = never>(
    onFulfilled?:
      | ((value: ParseResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.getJobId()
      .then((jobId) => ({ jobId }))
      .then(onFulfilled, onRejected);
  }

  /**
   * Wait for the job to complete and return the result.
   *
   * Uses polling to check job status. For real-time updates with progress
   * information, use {@link subscribe} instead.
   *
   * @returns Promise that resolves with the job result when complete
   * @throws Error if the job fails
   *
   * @example
   * ```typescript
   * const result = await flense.parseFile(file, 'doc.pdf').wait();
   * console.log(result.markdown);
   * ```
   */
  wait(): Promise<JobResult> {
    return this.getJobId().then((jobId) => this.client.waitForJob(jobId));
  }

  /**
   * Subscribe to real-time job updates via Server-Sent Events.
   *
   * This provides the best user experience for large documents, as you receive
   * progress updates and page content as they become available.
   *
   * @param callbacks - Callback functions for different event types
   * @returns Unsubscribe function to close the connection
   *
   * @example
   * ```typescript
   * const job = flense.parseFile(file, 'document.pdf');
   *
   * const unsubscribe = job.subscribe({
   *   onProgress: ({ progress, stage, currentPage, totalPages }) => {
   *     console.log(`${progress}% - ${stage}`);
   *     if (currentPage && totalPages) {
   *       console.log(`Page ${currentPage}/${totalPages}`);
   *     }
   *   },
   *   onContent: ({ page, content }) => {
   *     console.log(`Page ${page} ready: ${content.length} chars`);
   *   },
   *   onComplete: (status) => {
   *     console.log('Done!', status.output?.markdown);
   *   },
   *   onError: (error) => {
   *     console.error('Failed:', error.message);
   *   },
   * });
   *
   * // Later, to stop receiving updates:
   * unsubscribe();
   * ```
   */
  subscribe(callbacks: JobSubscriptionCallbacks): () => void {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    this.getJobId().then((jobId) => {
      if (cancelled) return;
      unsubscribe = this.client.subscribeToJob(jobId, callbacks);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }
}

/**
 * Flense API client for parsing documents into markdown.
 *
 * @example Basic usage
 * ```typescript
 * import { Flense } from 'flense';
 *
 * const flense = new Flense({ apiKey: 'flense_...' });
 *
 * // Parse a URL
 * const result = await flense.parseUrl('https://example.com/doc.pdf').wait();
 * console.log(result.markdown);
 * ```
 *
 * @example Using environment variable
 * ```typescript
 * // Set FLENSE_API_KEY environment variable
 * const flense = new Flense();
 * ```
 */
export class Flense {
  private apiKey: string;
  private baseUrl: string;

  /**
   * Create a new Flense client.
   *
   * @param config - Configuration options
   * @throws Error if no API key is provided or found in environment
   *
   * @example With explicit API key
   * ```typescript
   * const flense = new Flense({ apiKey: 'flense_abc123...' });
   * ```
   *
   * @example With environment variable
   * ```typescript
   * // Set FLENSE_API_KEY=flense_abc123...
   * const flense = new Flense();
   * ```
   *
   * @example With custom base URL
   * ```typescript
   * const flense = new Flense({
   *   apiKey: 'flense_abc123...',
   *   baseUrl: 'https://api.staging.flense.dev',
   * });
   * ```
   */
  constructor(config?: FlenseConfig) {
    const apiKey = config?.apiKey ?? process.env.FLENSE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing API key. Provide it via config.apiKey or set FLENSE_API_KEY environment variable."
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = config?.baseUrl ?? "https://api.flense.dev";
  }

  /**
   * Get the base URL for this client.
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get the API key for this client.
   */
  getApiKey(): string {
    return this.apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      Authorization: `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Flense API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Parse a document from a public URL.
   *
   * Returns a ParseJob that can be:
   * - Awaited for the job ID only
   * - Called with `.wait()` to wait for the complete result
   * - Called with `.subscribe()` for real-time progress updates
   *
   * @param url - Public URL of the document to parse
   * @returns A ParseJob for tracking the parse operation
   *
   * @example Get job ID only
   * ```typescript
   * const { jobId } = await flense.parseUrl('https://example.com/doc.pdf');
   * console.log('Job started:', jobId);
   * ```
   *
   * @example Wait for complete result
   * ```typescript
   * const result = await flense.parseUrl('https://example.com/doc.pdf').wait();
   * console.log(result.markdown);
   * ```
   *
   * @example With progress updates
   * ```typescript
   * const job = flense.parseUrl('https://example.com/doc.pdf');
   * job.subscribe({
   *   onProgress: (p) => console.log(`${p.progress}%`),
   *   onComplete: (s) => console.log(s.output?.markdown),
   * });
   * ```
   */
  parseUrl(url: string): ParseJob {
    const createJob = async (options: ParseOptions): Promise<string> => {
      const filename = getFilenameFromUrl(url);
      const mimeType = getMimeTypeFromFilename(filename);
      const documentId = generateDocumentId();

      const response = await this.request<QueueJobCreateResponse>(
        "/v1/queue/jobs",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            documentUrl: url,
            filename,
            mimeType,
            documentId,
            options: {
              ocr: options.ocr,
              tables: options.tables,
              images: options.images,
            },
          }),
        }
      );

      return response.jobId;
    };

    return new ParseJob(createJob, this);
  }

  /**
   * Parse a document from a file.
   *
   * Returns a ParseJob for tracking progress and getting results.
   * For large files, use `.subscribe()` to get real-time progress updates
   * and page-by-page content as it's processed.
   *
   * @param file - The file to parse (Buffer, File, or Blob)
   * @param filename - Name of the file (used for MIME type detection)
   * @returns A ParseJob for tracking the parse operation
   *
   * @example Simple usage - wait for complete result
   * ```typescript
   * const file = fs.readFileSync('document.pdf');
   * const result = await flense.parseFile(file, 'document.pdf').wait();
   * console.log(result.markdown);
   * ```
   *
   * @example Browser file input
   * ```typescript
   * const input = document.querySelector('input[type="file"]');
   * const file = input.files[0];
   * const result = await flense.parseFile(file, file.name).wait();
   * ```
   *
   * @example With progress updates
   * ```typescript
   * const job = flense.parseFile(file, 'document.pdf');
   * job.subscribe({
   *   onProgress: ({ progress, stage, currentPage, totalPages }) => {
   *     console.log(`${progress}% - ${stage}`);
   *     if (currentPage && totalPages) {
   *       console.log(`Processing page ${currentPage}/${totalPages}`);
   *     }
   *   },
   *   onContent: ({ page, content }) => {
   *     console.log(`Page ${page} complete: ${content.length} characters`);
   *   },
   *   onComplete: (status) => {
   *     console.log('All done!', status.output?.markdown);
   *   },
   * });
   * ```
   */
  parseFile(file: Buffer | File | Blob, filename: string): ParseJob {
    const createJob = async (options: ParseOptions): Promise<string> => {
      const formData = new FormData();

      if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
        const uint8Array = new Uint8Array(file);
        const blob = new Blob([uint8Array], {
          type: getMimeTypeFromFilename(filename),
        });
        formData.append("file", blob, filename);
      } else {
        formData.append("file", file as Blob, filename);
      }

      // Add parse options as JSON
      if (options.ocr !== undefined || options.tables !== undefined || options.images !== undefined) {
        formData.append("options", JSON.stringify({
          ocr: options.ocr,
          tables: options.tables,
          images: options.images,
        }));
      }

      const response = await this.request<QueueJobCreateResponse>(
        "/v1/queue/parse",
        {
          method: "POST",
          body: formData,
        }
      );

      return response.jobId;
    };

    return new ParseJob(createJob, this);
  }

  /**
   * Parse a file synchronously (no streaming).
   *
   * This method waits for the entire document to be parsed before returning.
   * For large files, prefer {@link parseFile} with `.subscribe()` for better UX.
   *
   * @param file - The file to parse
   * @param filename - Name of the file
   * @returns Promise resolving to the parsed result
   *
   * @example
   * ```typescript
   * const result = await flense.parseFileSync(file, 'document.pdf');
   * console.log(result.markdown);
   * ```
   */
  async parseFileSync(
    file: Buffer | File | Blob,
    filename: string
  ): Promise<ParseFileResult> {
    const formData = new FormData();

    if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
      const uint8Array = new Uint8Array(file);
      const blob = new Blob([uint8Array], {
        type: getMimeTypeFromFilename(filename),
      });
      formData.append("file", blob, filename);
    } else {
      formData.append("file", file as Blob, filename);
    }

    const response = await this.request<FlenseResponse>("/v1/flense/", {
      method: "POST",
      body: formData,
    });

    return {
      success: response.success,
      markdown: response.markdown || response.content || "",
    };
  }

  /**
   * Get the current status of a job.
   *
   * @param jobId - The job ID to check
   * @returns Promise resolving to the job status
   *
   * @example
   * ```typescript
   * const status = await flense.getJobStatus('job_abc123');
   * console.log(status.state); // 'active', 'completed', 'failed', etc.
   * ```
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    return this.request<JobStatus>(`/v1/queue/jobs/${jobId}`);
  }

  /**
   * Subscribe to real-time job updates via Server-Sent Events.
   *
   * This is the low-level subscription method. For most use cases,
   * prefer using `parseFile().subscribe()` or `parseUrl().subscribe()`.
   *
   * @param jobId - The job ID to subscribe to
   * @param callbacks - Callback functions for different event types
   * @returns Unsubscribe function to close the connection
   *
   * @remarks
   * Requires EventSource support (browsers, or polyfill in Node.js).
   * The connection will automatically close when the job completes,
   * fails, is cancelled, or times out (5 minutes max).
   *
   * @example
   * ```typescript
   * const unsubscribe = flense.subscribeToJob('job_abc123', {
   *   onStatus: (s) => console.log('Status:', s.state),
   *   onProgress: (p) => console.log('Progress:', p.progress),
   *   onComplete: (s) => console.log('Done:', s.output?.markdown),
   * });
   *
   * // Later, to stop receiving updates:
   * unsubscribe();
   * ```
   */
  subscribeToJob(
    jobId: string,
    callbacks: JobSubscriptionCallbacks
  ): () => void {
    const sseUrl = `${this.baseUrl}/v1/queue/jobs/${jobId}/subscribe`;

    // Check for EventSource support
    if (typeof EventSource === "undefined") {
      callbacks.onError?.(
        new Error(
          "EventSource not supported. Use waitForJob() for polling, or add an EventSource polyfill."
        )
      );
      return () => {};
    }

    const eventSource = new EventSource(sseUrl);

    const handleStatus = (data: JobStatus) => {
      callbacks.onStatus?.(data);
      if (data.state === "completed") {
        callbacks.onComplete?.(data);
      } else if (data.state === "failed") {
        callbacks.onFailed?.(data);
      }
    };

    eventSource.addEventListener("status", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as JobStatus;
        handleStatus(data);
      } catch (e) {
        callbacks.onError?.(new Error(`Failed to parse status event: ${e}`));
      }
    });

    eventSource.addEventListener("progress", (event) => {
      try {
        const data = JSON.parse(
          (event as MessageEvent).data
        ) as ProgressUpdate;
        callbacks.onProgress?.(data);
      } catch (e) {
        callbacks.onError?.(new Error(`Failed to parse progress event: ${e}`));
      }
    });

    eventSource.addEventListener("content", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as ContentChunk;
        callbacks.onContent?.(data);
      } catch (e) {
        callbacks.onError?.(new Error(`Failed to parse content event: ${e}`));
      }
    });

    eventSource.addEventListener("complete", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as JobStatus;
        handleStatus(data);
        eventSource.close();
      } catch (e) {
        callbacks.onError?.(new Error(`Failed to parse complete event: ${e}`));
      }
    });

    eventSource.addEventListener("failed", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as JobStatus;
        handleStatus(data);
        eventSource.close();
      } catch (e) {
        callbacks.onError?.(new Error(`Failed to parse failed event: ${e}`));
      }
    });

    eventSource.addEventListener("cancelled", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as JobStatus;
        handleStatus(data);
        eventSource.close();
      } catch (e) {
        callbacks.onError?.(
          new Error(`Failed to parse cancelled event: ${e}`)
        );
      }
    });

    eventSource.addEventListener("timeout", () => {
      eventSource.close();
    });

    eventSource.onerror = () => {
      callbacks.onError?.(new Error("SSE connection error"));
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }

  /**
   * Wait for a job to complete and return the result.
   *
   * Uses polling to check job status periodically.
   * For real-time updates, use {@link subscribeToJob} instead.
   *
   * @param jobId - The job ID to wait for
   * @returns Promise resolving to the job result
   * @throws Error if the job fails
   *
   * @example
   * ```typescript
   * const result = await flense.waitForJob('job_abc123');
   * console.log(result.markdown);
   * ```
   */
  async waitForJob(jobId: string): Promise<JobResult> {
    const pollInterval = 1000;

    while (true) {
      const response = await this.request<QueueJobStatusResponse>(
        `/v1/queue/jobs/${jobId}`
      );

      if (response.state === "completed") {
        return {
          success: true,
          markdown: response.output?.markdown || response.output?.content || "",
          state: response.state,
        };
      }

      if (response.state === "failed") {
        throw new Error(
          `Job ${jobId} failed: ${response.error ?? "Unknown error"}`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }
}

export default Flense;
