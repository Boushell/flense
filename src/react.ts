"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Flense,
  type FlenseConfig,
  type JobStatus,
  type ProgressUpdate,
  type ContentChunk,
  type JobState,
  type ParseJob,
  type ParseOptions,
} from "./index";

export type { JobStatus, ProgressUpdate, ContentChunk, JobState, ParseOptions };

export interface UseFlenseOptions extends FlenseConfig {}

export interface UseParseJobOptions {
  onProgress?: (progress: ProgressUpdate) => void;
  onContent?: (content: ContentChunk) => void;
  onComplete?: (status: JobStatus) => void;
  onFailed?: (status: JobStatus) => void;
  onError?: (error: Error) => void;
}

export interface UseParseJobReturn {
  /** Current job status */
  status: JobStatus | null;
  /** Whether the job is currently processing */
  isProcessing: boolean;
  /** Whether the job has completed (success or failure) */
  isComplete: boolean;
  /** Latest progress update */
  progress: ProgressUpdate | null;
  /** Accumulated content chunks */
  contentChunks: ContentChunk[];
  /** Full content (joined from chunks or final output) */
  content: string | null;
  /** Error if job failed */
  error: Error | null;
  /** Parse a file with optional configuration */
  parseFile: (file: File, options?: ParseOptions) => void;
  /** Parse a URL with optional configuration */
  parseUrl: (url: string, options?: ParseOptions) => void;
  /** Reset state for a new job */
  reset: () => void;
}

/**
 * Create a Flense client instance.
 */
export function useFlense(options: UseFlenseOptions = {}): Flense | null {
  const [client, setClient] = useState<Flense | null>(null);

  useEffect(() => {
    try {
      const flense = new Flense(options);
      setClient(flense);
    } catch {
      // API key not available yet
      setClient(null);
    }
  }, [options.apiKey, options.baseUrl]);

  return client;
}

/**
 * Hook for parsing documents with real-time progress updates.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { parseFile, progress, content, isProcessing, isComplete } = useParseJob({
 *     apiKey: 'flense_...',
 *     onProgress: (p) => console.log(`${p.progress}%`),
 *   });
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={(e) => {
 *         const file = e.target.files?.[0];
 *         if (file) parseFile(file);
 *       }} />
 *       {isProcessing && <p>Processing: {progress?.progress}%</p>}
 *       {isComplete && <pre>{content}</pre>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useParseJob(
  config: UseFlenseOptions & UseParseJobOptions = {}
): UseParseJobReturn {
  const { onProgress, onContent, onComplete, onFailed, onError, ...flenseConfig } = config;

  const [status, setStatus] = useState<JobStatus | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [contentChunks, setContentChunks] = useState<ContentChunk[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const clientRef = useRef<Flense | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const callbacksRef = useRef({ onProgress, onContent, onComplete, onFailed, onError });

  // Update callbacks ref
  callbacksRef.current = { onProgress, onContent, onComplete, onFailed, onError };

  // Create client lazily
  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new Flense(flenseConfig);
    }
    return clientRef.current;
  }, [flenseConfig.apiKey, flenseConfig.baseUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  const reset = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    setStatus(null);
    setProgress(null);
    setContentChunks([]);
    setError(null);
  }, []);

  const subscribeToJob = useCallback(
    (job: ParseJob) => {
      // Reset state for new job
      setStatus(null);
      setProgress(null);
      setContentChunks([]);
      setError(null);

      // Cancel any existing subscription
      unsubscribeRef.current?.();

      unsubscribeRef.current = job.subscribe({
        onStatus: (s) => {
          setStatus(s);
        },
        onProgress: (p) => {
          setProgress(p);
          callbacksRef.current.onProgress?.(p);
        },
        onContent: (c) => {
          setContentChunks((prev) => [...prev, c]);
          callbacksRef.current.onContent?.(c);
        },
        onComplete: (s) => {
          setStatus(s);
          callbacksRef.current.onComplete?.(s);
        },
        onFailed: (s) => {
          setStatus(s);
          setError(new Error(s.error || "Job failed"));
          callbacksRef.current.onFailed?.(s);
        },
        onError: (e) => {
          setError(e);
          callbacksRef.current.onError?.(e);
        },
      });
    },
    []
  );

  const parseFile = useCallback(
    (file: File, options?: ParseOptions) => {
      try {
        const client = getClient();
        let job = client.parseFile(file, file.name);
        // Apply options using fluent API
        if (options?.ocr !== undefined) job = job.withOCR(options.ocr);
        if (options?.tables !== undefined) job = job.withTables(options.tables);
        if (options?.images !== undefined) job = job.withImages(options.images);
        if (options?.pageStreaming !== undefined) job = job.withPageStreaming(options.pageStreaming);
        if (options?.caching === false) job = job.disableCaching();
        subscribeToJob(job);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        callbacksRef.current.onError?.(err);
      }
    },
    [getClient, subscribeToJob]
  );

  const parseUrl = useCallback(
    (url: string, options?: ParseOptions) => {
      try {
        const client = getClient();
        let job = client.parseUrl(url);
        // Apply options using fluent API
        if (options?.ocr !== undefined) job = job.withOCR(options.ocr);
        if (options?.tables !== undefined) job = job.withTables(options.tables);
        if (options?.images !== undefined) job = job.withImages(options.images);
        if (options?.pageStreaming !== undefined) job = job.withPageStreaming(options.pageStreaming);
        if (options?.caching === false) job = job.disableCaching();
        subscribeToJob(job);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        callbacksRef.current.onError?.(err);
      }
    },
    [getClient, subscribeToJob]
  );

  const isProcessing = useMemo(
    () => status !== null && !["completed", "failed", "cancelled"].includes(status.state),
    [status]
  );

  const isComplete = useMemo(
    () => status?.state === "completed" || status?.state === "failed" || status?.state === "cancelled",
    [status]
  );

  const content = useMemo(() => {
    // Prefer final output content
    if (status?.output?.content) return status.output.content;
    if (status?.output?.markdown) return status.output.markdown;
    // Fall back to accumulated chunks
    if (contentChunks.length > 0) {
      return contentChunks
        .sort((a, b) => a.page - b.page)
        .map((c) => c.content)
        .join("\n\n");
    }
    return null;
  }, [status, contentChunks]);

  return {
    status,
    isProcessing,
    isComplete,
    progress,
    contentChunks,
    content,
    error,
    parseFile,
    parseUrl,
    reset,
  };
}
