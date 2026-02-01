/**
 * Flense API Client
 * Official client library for the Flense document parsing service.
 */

export interface FlenseConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface ParseResult {
  jobId: string;
}

export interface ParseFileResult {
  success: boolean;
  markdown: string;
}

export interface JobResult {
  success: boolean;
  markdown: string;
  state: string;
}

export type JobState =
  | "created"
  | "active"
  | "completed"
  | "failed"
  | "cancelled"
  | "archived";

export interface JobStatus {
  id: string;
  state: JobState;
  data?: Record<string, unknown>;
  output?: {
    documentId?: string;
    content?: string;
    markdown?: string;
    processingTime?: number;
  };
  createdOn?: string;
  startedOn?: string;
  completedOn?: string;
  retryCount?: number;
  retryLimit?: number;
  error?: string;
}

export interface ProgressUpdate {
  progress: number;
  stage: string;
  currentPage?: number;
  totalPages?: number;
  avgPageTime?: number;
  estimatedTimeRemaining?: number;
}

export interface ContentChunk {
  page: number;
  content: string;
}

export interface JobSubscriptionCallbacks {
  onStatus?: (status: JobStatus) => void;
  onProgress?: (progress: ProgressUpdate) => void;
  onContent?: (content: ContentChunk) => void;
  onComplete?: (status: JobStatus) => void;
  onFailed?: (status: JobStatus) => void;
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
 */
export class ParseJob implements PromiseLike<ParseResult> {
  private jobIdPromise: Promise<string> | null = null;
  private _jobId: string | null = null;

  constructor(
    private createJob: () => Promise<string>,
    private client: Flense
  ) {}

  private getJobId(): Promise<string> {
    if (!this.jobIdPromise) {
      this.jobIdPromise = this.createJob().then((id) => {
        this._jobId = id;
        return id;
      });
    }
    return this.jobIdPromise;
  }

  /**
   * Get the job ID (available after job is created).
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
   * Uses polling - for real-time updates use subscribe() instead.
   */
  wait(): Promise<JobResult> {
    return this.getJobId().then((jobId) => this.client.waitForJob(jobId));
  }

  /**
   * Subscribe to real-time job updates via SSE.
   * Returns an unsubscribe function.
   *
   * @example
   * const job = flense.parseFile(file, filename);
   * const unsubscribe = job.subscribe({
   *   onProgress: (p) => console.log(`${p.progress}% - ${p.stage}`),
   *   onContent: (c) => console.log(`Page ${c.page}: ${c.content.slice(0, 50)}...`),
   *   onComplete: (status) => console.log('Done!', status.output?.content),
   * });
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

export class Flense {
  private apiKey: string;
  private baseUrl: string;

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
   * Returns a ParseJob that can be awaited for the jobId,
   * or call .wait() to wait for the result, or .subscribe() for real-time updates.
   *
   * @example
   * // Get job ID only
   * const { jobId } = await flense.parseUrl('https://example.com/doc.pdf');
   *
   * // Wait for result (polling)
   * const result = await flense.parseUrl('https://example.com/doc.pdf').wait();
   *
   * // Subscribe to real-time updates
   * const job = flense.parseUrl('https://example.com/doc.pdf');
   * job.subscribe({
   *   onProgress: (p) => console.log(p.progress),
   *   onComplete: (s) => console.log(s.output?.content),
   * });
   */
  parseUrl(url: string): ParseJob {
    const createJob = async (): Promise<string> => {
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
          }),
        }
      );

      return response.jobId;
    };

    return new ParseJob(createJob, this);
  }

  /**
   * Parse a document from a file.
   * Returns a ParseJob for tracking progress and getting results.
   *
   * For large files, use .subscribe() to get real-time progress and
   * page-by-page content as it's processed.
   *
   * @example
   * // Simple usage - wait for complete result
   * const result = await flense.parseFile(file, 'document.pdf').wait();
   *
   * // With progress updates
   * const job = flense.parseFile(file, 'document.pdf');
   * job.subscribe({
   *   onProgress: ({ progress, stage, currentPage, totalPages }) => {
   *     console.log(`${progress}% - ${stage} (page ${currentPage}/${totalPages})`);
   *   },
   *   onContent: ({ page, content }) => {
   *     console.log(`Page ${page} complete`);
   *   },
   *   onComplete: (status) => {
   *     console.log('All done!', status.output?.content);
   *   },
   * });
   */
  parseFile(file: Buffer | File | Blob, filename: string): ParseJob {
    const createJob = async (): Promise<string> => {
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
   * For large files, prefer parseFile() with subscribe() for better UX.
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
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    return this.request<JobStatus>(`/v1/queue/jobs/${jobId}`);
  }

  /**
   * Subscribe to real-time job updates via Server-Sent Events.
   * Returns an unsubscribe function to close the connection.
   *
   * Note: This requires EventSource support (browsers, or polyfill in Node.js).
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
   * Uses polling - for real-time updates use subscribeToJob() instead.
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
