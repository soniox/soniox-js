import type { HttpClient } from "../http/client.js";
import { isSonioxHttpError } from "../http/errors.js";
import type {
    CreateTranscriptionOptions,
    ListTranscriptionsOptions,
    ListTranscriptionsResponse,
    SegmentGroupKey,
    SegmentTranscriptOptions,
    SonioxTranscriptionData,
    TranscribeFromFileIdOptions,
    TranscribeFromFileOptions,
    TranscribeFromUrlOptions,
    TranscribeOptions,
    TranscriptionIdentifier,
    TranscriptionStatus,
    TranscriptResponse,
    TranscriptSegment,
    TranscriptToken,
    UploadFileInput,
    WaitOptions,
} from "../types/public/index.js";

import type { SonioxFilesAPI } from "./files.js";

/**
 * Checks if an error is a 404 Not Found error
 */
function isNotFoundError(error: unknown): boolean {
    return isSonioxHttpError(error) && error.status === 404;
}

/**
 * Minimum polling interval in ms
 */
const MIN_POLL_INTERVAL_MS = 1000;

/**
 * Default polling interval in ms
 */
const DEFAULT_POLL_INTERVAL_MS = 1000;

/**
 * Default timeout for waiting in ms (5 minutes)
 */
const DEFAULT_TIMEOUT_MS = 300000;

/**
 * Helper to sleep for a given number of ms, interruptible by abort signal
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Transcription wait aborted'));
            return;
        }

        const timeoutId = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);

        function onAbort() {
            clearTimeout(timeoutId);
            reject(new Error('Transcription wait aborted'));
        }

        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

/**
 * Helper to extract transcription ID from a TranscriptionIdentifier
 */
function getTranscriptionId(transcription: TranscriptionIdentifier): string {
    return typeof transcription === 'string' ? transcription : transcription.id;
}

/**
 * Creates an AbortSignal that fires when either the timeout expires or the provided signal aborts
 * Returns the signal and a cleanup function to clear the timeout
 */
function createTimeoutSignal(
    timeout_ms: number | undefined,
    signal: AbortSignal | undefined
): { signal: AbortSignal | undefined; cleanup: () => void } {
    // No timeout and no signal - return undefined
    if (timeout_ms === undefined && signal === undefined) {
        return { signal: undefined, cleanup: () => {} };
    }

    // Only user signal, no timeout
    if (timeout_ms === undefined) {
        return { signal, cleanup: () => {} };
    }

    if (!Number.isFinite(timeout_ms) || timeout_ms <= 0) {
        throw new Error('timeout_ms must be a finite positive number');
    }

    // Create timeout-based abort controller
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
        timeoutController.abort(new Error(`Operation timed out after ${timeout_ms}ms`));
    }, timeout_ms);

    const cleanup = () => clearTimeout(timeoutId);

    // Only timeout, no user signal
    if (signal === undefined) {
        return { signal: timeoutController.signal, cleanup };
    }

    // Both timeout and user signal - combine them
    const combinedController = new AbortController();

    const onAbort = () => {
        cleanup();
        timeoutController.signal.removeEventListener('abort', onTimeout);
        combinedController.abort(signal.reason ?? new Error('Operation aborted'));
    };

    const onTimeout = () => {
        signal.removeEventListener('abort', onAbort);
        combinedController.abort(timeoutController.signal.reason);
    };

    if (signal.aborted) {
        cleanup();
        combinedController.abort(signal.reason ?? new Error('Operation aborted'));
    } else {
        signal.addEventListener('abort', onAbort, { once: true });
        timeoutController.signal.addEventListener('abort', onTimeout, { once: true });
    }

    return {
        signal: combinedController.signal,
        cleanup: () => {
            cleanup();
            signal.removeEventListener('abort', onAbort);
            timeoutController.signal.removeEventListener('abort', onTimeout);
        }
    };
}

/**
 * Default grouping keys for segmentation
 */
const DEFAULT_GROUP_BY: SegmentGroupKey[] = ['speaker', 'language'];

/**
 * Groups contiguous tokens into segments based on specified grouping keys.
 *
 * A new segment starts when any of the `groupBy` fields changes.
 * Tokens are concatenated with a single space between them.
 *
 * @param tokens - Array of transcript tokens to segment
 * @param options - Segmentation options
 * @param options.groupBy - Fields to group by (default: ['speaker', 'language'])
 * @returns Array of segments with combined text and timing
 *
 * @example
 * ```typescript
 * const transcript = await transcription.getTranscript();
 *
 * // Group by both speaker and language (default)
 * const segments = segmentTranscript(transcript.tokens);
 *
 * // Group by speaker only
 * const bySpeaker = segmentTranscript(transcript.tokens, { groupBy: ['speaker'] });
 *
 * // Group by language only
 * const byLanguage = segmentTranscript(transcript.tokens, { groupBy: ['language'] });
 *
 * for (const seg of segments) {
 *     console.log(`[Speaker ${seg.speaker}] ${seg.text}`);
 * }
 * ```
 */
export function segmentTranscript(
    tokens: TranscriptToken[],
    options: SegmentTranscriptOptions = {}
): TranscriptSegment[] {
    if (tokens.length === 0) {
        return [];
    }

    const groupBy = options.groupBy ?? DEFAULT_GROUP_BY;
    const groupBySpeaker = groupBy.includes('speaker');
    const groupByLanguage = groupBy.includes('language');

    const segments: TranscriptSegment[] = [];
    let currentTokens: TranscriptToken[] = [];
    let currentSpeaker: string | undefined;
    let currentLanguage: string | undefined;

    for (const token of tokens) {
        const speakerChanged = groupBySpeaker && token.speaker !== currentSpeaker;
        const languageChanged = groupByLanguage && token.language !== currentLanguage;

        if (currentTokens.length > 0 && (speakerChanged || languageChanged)) {
            segments.push(buildSegment(currentTokens, currentSpeaker, currentLanguage));
            currentTokens = [];
        }

        currentTokens.push(token);
        currentSpeaker = token.speaker;
        currentLanguage = token.language;
    }

    if (currentTokens.length > 0) {
        segments.push(buildSegment(currentTokens, currentSpeaker, currentLanguage));
    }

    return segments;
}

/**
 * Helper to build a segment from a list of tokens
 */
function buildSegment(
    tokens: TranscriptToken[],
    speaker: string | undefined,
    language: string | undefined
): TranscriptSegment {
    const firstToken = tokens[0];
    const lastToken = tokens[tokens.length - 1];

    if (!firstToken || !lastToken) {
        throw new Error('Cannot build segment from an empty token array');
    }

    const text = tokens.map(t => t.text).join('');

    return {
        text,
        start_ms: firstToken.start_ms,
        end_ms: lastToken.end_ms,
        ...(speaker !== undefined && { speaker }),
        ...(language !== undefined && { language }),
        tokens,
    };
}

/**
 * A Transcript result containing the transcribed text and tokens.
 */
export class SonioxTranscript {
    /**
     * Unique identifier of the transcription this transcript belongs to.
     */
    readonly id: string;

    /**
     * Complete transcribed text content.
     */
    readonly text: string;

    /**
     * List of detailed token information with timestamps and metadata.
     */
    readonly tokens: TranscriptToken[];

    constructor(data: TranscriptResponse) {
        this.id = data.id;
        this.text = data.text;
        this.tokens = data.tokens;
    }

    /**
     * Groups tokens into segments based on specified grouping keys.
     *
     * A new segment starts when any of the `groupBy` fields changes.
     *
     * @param options - Segmentation options
     * @param options.groupBy - Fields to group by (default: ['speaker', 'language'])
     * @returns Array of segments with combined text and timing
     *
     * @example
     * ```typescript
     * const transcript = await transcription.getTranscript();
     *
     * // Group by both speaker and language (default)
     * const segments = transcript.segments();
     *
     * // Group by speaker only
     * const bySpeaker = transcript.segments({ groupBy: ['speaker'] });
     *
     * for (const s of segments) {
     *     console.log(`[Speaker ${s.speaker}] ${s.text}`);
     * }
     * ```
     */
    segments(options?: SegmentTranscriptOptions): TranscriptSegment[] {
        return segmentTranscript(this.tokens, options);
    }
}

/**
 * A Transcription instance
 */
export class SonioxTranscription {
    /**
     * Unique identifier of the transcription.
     */
    readonly id: string;

    /**
     * Current status of the transcription.
     */
    readonly status: TranscriptionStatus;

    /**
     * UTC timestamp when the transcription was created.
     */
    readonly created_at: string;

    /**
     * Speech-to-text model used.
     */
    readonly model: string;

    /**
     * URL of the audio file being transcribed.
     */
    readonly audio_url: string | null | undefined;

    /**
     * ID of the uploaded file being transcribed.
     */
    readonly file_id: string | null | undefined;

    /**
     * Name of the file being transcribed.
     */
    readonly filename: string;

    /**
     * Expected languages in the audio.
     */
    readonly language_hints: string[] | undefined;

    /**
     * When true, speakers are identified and separated in the transcription output.
     */
    readonly enable_speaker_diarization: boolean;

    /**
     * When true, language is detected for each part of the transcription.
     */
    readonly enable_language_identification: boolean;

    /**
     * Duration of the audio in milliseconds. Only available after processing begins.
     */
    readonly audio_duration_ms: number | null | undefined;

    /**
     * Error type if transcription failed.
     */
    readonly error_type: string | null | undefined;

    /**
     * Error message if transcription failed.
     */
    readonly error_message: string | null | undefined;

    /**
     * URL to receive webhook notifications.
     */
    readonly webhook_url: string | null | undefined;

    /**
     * Name of the authentication header sent with webhook notifications.
     */
    readonly webhook_auth_header_name: string | null | undefined;

    /**
     * Authentication header value (masked).
     */
    readonly webhook_auth_header_value: string | null | undefined;

    /**
     * HTTP status code received when webhook was delivered.
     */
    readonly webhook_status_code: number | null | undefined;

    /**
     * Optional tracking identifier.
     */
    readonly client_reference_id: string | null | undefined;

    /**
     * Additional context provided for the transcription.
     */
    readonly context: string | null | undefined;

    constructor(
        data: SonioxTranscriptionData,
        private readonly _http: HttpClient,
    ) {
        this.id = data.id;
        this.status = data.status;
        this.created_at = data.created_at;
        this.model = data.model;
        this.audio_url = data.audio_url;
        this.file_id = data.file_id;
        this.filename = data.filename;
        this.language_hints = data.language_hints;
        this.enable_speaker_diarization = data.enable_speaker_diarization;
        this.enable_language_identification = data.enable_language_identification;
        this.audio_duration_ms = data.audio_duration_ms;
        this.error_type = data.error_type;
        this.error_message = data.error_message;
        this.webhook_url = data.webhook_url;
        this.webhook_auth_header_name = data.webhook_auth_header_name;
        this.webhook_auth_header_value = data.webhook_auth_header_value;
        this.webhook_status_code = data.webhook_status_code;
        this.client_reference_id = data.client_reference_id;
        this.context = data.context;
    }

    /**
     * Returns the raw data for this transcription.
     */
    toJSON(): SonioxTranscriptionData {
        return {
            id: this.id,
            status: this.status,
            created_at: this.created_at,
            model: this.model,
            audio_url: this.audio_url,
            file_id: this.file_id,
            filename: this.filename,
            language_hints: this.language_hints,
            enable_speaker_diarization: this.enable_speaker_diarization,
            enable_language_identification: this.enable_language_identification,
            audio_duration_ms: this.audio_duration_ms,
            error_type: this.error_type,
            error_message: this.error_message,
            webhook_url: this.webhook_url,
            webhook_auth_header_name: this.webhook_auth_header_name,
            webhook_auth_header_value: this.webhook_auth_header_value,
            webhook_status_code: this.webhook_status_code,
            client_reference_id: this.client_reference_id,
            context: this.context,
        };
    }

    /**
     * Permanently deletes this transcription.
     * This operation is idempotent - succeeds even if the transcription doesn't exist.
     *
     * @throws {SonioxHttpError} On API errors (except 404)
     *
     * @example
     * ```typescript
     * const transcription = await client.transcriptions.get('550e8400-e29b-41d4-a716-446655440000');
     * await transcription.delete();
     * ```
     */
    async delete(): Promise<void> {
        try {
            await this._http.request<null>({
                method: 'DELETE',
                path: `/v1/transcriptions/${this.id}`,
            });
        } catch (error) {
            if (!isNotFoundError(error)) {
                throw error;
            }
        }
    }

    /**
     * Permanently deletes this transcription and its associated file (if any).
     * This operation is idempotent - succeeds even if resources don't exist.
     *
     * @throws {SonioxHttpError} On API errors (except 404)
     *
     * @example
     * ```typescript
     * // Clean up both transcription and uploaded file
     * const transcription = await client.transcriptions.transcribe({
     *     model: 'stt-async-v3',
     *     file: buffer,
     *     wait: true,
     * });
     * // ... use transcription ...
     * await transcription.destroy(); // Deletes both transcription and file
     * ```
     */
    async destroy(): Promise<void> {
        // Delete the transcription first
        await this.delete();

        // Delete the associated file if present
        if (this.file_id) {
            try {
                await this._http.request<null>({
                    method: 'DELETE',
                    path: `/v1/files/${this.file_id}`,
                });
            } catch (error) {
                if (!isNotFoundError(error)) {
                    throw error;
                }
            }
        }
    }

    /**
     * Retrieves the full transcript text and tokens for this transcription.
     * Only available for successfully completed transcriptions.
     *
     * @returns The transcript with text and detailed tokens, or null if not found.
     * @throws {SonioxHttpError} On API errors (except 404).
     *
     * @example
     * ```typescript
     * const transcription = await client.transcriptions.get('550e8400-e29b-41d4-a716-446655440000');
     * if (transcription) {
     *     const transcript = await transcription.getTranscript();
     *     if (transcript) {
     *         console.log(transcript.text);
     *     }
     * }
     * ```
     */
    async getTranscript(): Promise<SonioxTranscript | null> {
        try {
            const response = await this._http.request<TranscriptResponse>({
                method: 'GET',
                path: `/v1/transcriptions/${this.id}/transcript`,
            });
            return new SonioxTranscript(response.data);
        } catch (error) {
            if (isNotFoundError(error)) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Re-fetches this transcription to get the latest status.
     * @param signal - Optional AbortSignal for request cancellation.
     * @returns A new SonioxTranscription instance with updated data.
     * @throws {SonioxHttpError}
     *
     * @example
     * ```typescript
     * let transcription = await client.transcriptions.get('550e8400-e29b-41d4-a716-446655440000');
     * transcription = await transcription.refresh();
     * console.log(transcription.status);
     * ```
     */
    async refresh(signal?: AbortSignal): Promise<SonioxTranscription> {
        const response = await this._http.request<SonioxTranscriptionData>({
            method: 'GET',
            path: `/v1/transcriptions/${this.id}`,
            ...(signal && { signal }),
        });
        return new SonioxTranscription(response.data, this._http);
    }

    /**
     * Waits for the transcription to complete or fail.
     * Polls the API at the specified interval until the status is 'completed' or 'error'.
     *
     * @param options - Wait options including polling interval, timeout, and callbacks.
     * @returns The completed or errored transcription.
     * @throws {Error} If the wait times out or is aborted.
     * @throws {SonioxHttpError} On API errors.
     *
     * @example
     * ```typescript
     * const transcription = await client.transcriptions.create({
     *     model: 'stt-async-v3',
     *     audio_url: 'https://example.com/audio.mp3',
     * });
     *
     * // Simple wait
     * const completed = await transcription.wait();
     *
     * // Wait with progress callback
     * const completed = await transcription.wait({
     *     interval_ms: 2000,
     *     on_status_change: (status) => console.log(`Status: ${status}`),
     * });
     * ```
     */
    async wait(options: WaitOptions = {}): Promise<SonioxTranscription> {
        const {
            interval_ms: requestedInterval = DEFAULT_POLL_INTERVAL_MS,
            timeout_ms = DEFAULT_TIMEOUT_MS,
            on_status_change,
            signal,
        } = options;

        // Enforce minimum polling interval
        const interval_ms = Math.max(requestedInterval, MIN_POLL_INTERVAL_MS);

        // If already completed or errored, return immediately
        if (this.status !== 'queued' && this.status !== 'processing') {
            return this;
        }

        // Check abort signal before any network calls
        if (signal?.aborted) {
            throw new Error('Transcription wait aborted');
        }

        const startTime = Date.now();

        // Helper to check timeout
        const checkTimeout = () => {
            if (Date.now() - startTime > timeout_ms) {
                throw new Error(`Transcription wait timed out after ${timeout_ms}ms`);
            }
        };

        // Check timeout before initial refresh
        checkTimeout();

        let lastStatus = this.status as TranscriptionStatus;
        let current = await this.refresh(signal);

        while (current.status === 'queued' || current.status === 'processing') {
            // Notify on status change
            if (current.status !== lastStatus) {
                on_status_change?.(current.status, current.toJSON());
                lastStatus = current.status;
            }

            // Check timeout before sleeping
            checkTimeout();

            // Wait for interval (interruptible by abort signal)
            await sleep(interval_ms, signal);

            // Check timeout after sleep, before making network call
            checkTimeout();

            // Refresh status (passes signal to HTTP request)
            current = await current.refresh(signal);
        }

        // Notify on final status change
        if (current.status !== lastStatus) {
            on_status_change?.(current.status, current.toJSON());
        }

        return current;
    }
}

/**
 * Result set for transcription listing.
 */
export class TranscriptionListResult implements AsyncIterable<SonioxTranscription> {
    /**
     * Transcriptions from the first page of results.
     */
    readonly transcriptions: SonioxTranscription[];

    /**
     * Pagination cursor for the next page. Null if no more pages.
     */
    readonly next_page_cursor: string | null;

    constructor(
        initialResponse: ListTranscriptionsResponse<SonioxTranscriptionData>,
        private readonly _http: HttpClient,
        private readonly _options: ListTranscriptionsOptions,
    ) {
        this.transcriptions = initialResponse.transcriptions.map(
            data => new SonioxTranscription(data, _http)
        );
        this.next_page_cursor = initialResponse.next_page_cursor;
    }

    /**
     * Returns the raw data for this list result
     */
    toJSON(): ListTranscriptionsResponse<SonioxTranscriptionData> {
        return {
            transcriptions: this.transcriptions.map(t => t.toJSON()),
            next_page_cursor: this.next_page_cursor,
        };
    }

    /**
     * Returns true if there are more pages of results beyond the first page.
     */
    isPaged(): boolean {
        return this.next_page_cursor !== null;
    }

    /**
     * Async iterator that automatically fetches all pages.
     * Use with `for await...of` to iterate through all transcriptions.
     */
    async *[Symbol.asyncIterator](): AsyncIterator<SonioxTranscription> {
        // Yield transcriptions from the first page
        for (const transcription of this.transcriptions) {
            yield transcription;
        }

        // Fetch and yield subsequent pages
        let cursor = this.next_page_cursor;
        while (cursor !== null) {
            const response = await this._http.request<ListTranscriptionsResponse<SonioxTranscriptionData>>({
                method: 'GET',
                path: '/v1/transcriptions',
                query: {
                    limit: this._options.limit,
                    cursor,
                },
            });

            for (const data of response.data.transcriptions) {
                yield new SonioxTranscription(data, this._http);
            }

            cursor = response.data.next_page_cursor;
        }
    }
}

export class SonioxTranscriptionsAPI {
    constructor(
        private http: HttpClient,
        private filesApi: SonioxFilesAPI,
    ) {}

    /**
     * Creates a new transcription from audio_url or file_id
     *
     * @param options - Transcription options including model and audio source.
     * @returns The created transcription.
     * @throws {SonioxHttpError} On API errors.
     *
     * @example
     * ```typescript
     * // Transcribe from URL
     * const transcription = await client.transcriptions.create({
     *     model: 'stt-async-v3',
     *     audio_url: 'https://example.com/audio.mp3',
     * });
     *
     * // Transcribe from uploaded file
     * const file = await client.files.upload(buffer);
     * const transcription = await client.transcriptions.create({
     *     model: 'stt-async-v3',
     *     file_id: file.id,
     * });
     *
     * // With speaker diarization
     * const transcription = await client.transcriptions.create({
     *     model: 'stt-async-v3',
     *     audio_url: 'https://example.com/audio.mp3',
     *     enable_speaker_diarization: true,
     * });
     * ```
     */
    async create(options: CreateTranscriptionOptions, signal?: AbortSignal): Promise<SonioxTranscription> {
        const response = await this.http.request<SonioxTranscriptionData>({
            method: 'POST',
            path: '/v1/transcriptions',
            body: options,
            ...(signal && { signal }),
        });

        return new SonioxTranscription(response.data, this.http);
    }

    /**
     * Retrieves list of transcriptions
     *
     * The returned result is async iterable - use `for await...of` to iterate through all pages
     *
     * @param options - Optional pagination and filter parameters.
     * @returns TranscriptionListResult with async iteration support.
     * @throws {SonioxHttpError} On API errors.
     *
     * @example
     * ```typescript
     * const result = await client.transcriptions.list();
     *
     * // Automatic paging - iterates through ALL transcriptions across all pages
     * for await (const transcription of result) {
     *     console.log(transcription.id, transcription.status);
     * }
     *
     * // Or access just the first page
     * for (const transcription of result.transcriptions) {
     *     console.log(transcription.id);
     * }
     *
     * // Check if there are more pages
     * if (result.isPaged()) {
     *     console.log('More pages available');
     * }
     * ```
     */
    async list(options: ListTranscriptionsOptions = {}): Promise<TranscriptionListResult> {
        const response = await this.http.request<ListTranscriptionsResponse<SonioxTranscriptionData>>({
            method: 'GET',
            path: '/v1/transcriptions',
            query: {
                limit: options.limit,
                cursor: options.cursor,
            },
        });

        return new TranscriptionListResult(response.data, this.http, options);
    }

    /**
     * Retrieves a transcription by ID
     *
     * @param id - The UUID of the transcription or a SonioxTranscription instance.
     * @returns The transcription, or null if not found.
     * @throws {SonioxHttpError} On API errors (except 404).
     *
     * @example
     * ```typescript
     * const transcription = await client.transcriptions.get('550e8400-e29b-41d4-a716-446655440000');
     * if (transcription) {
     *     console.log(transcription.status, transcription.model);
     * }
     * ```
     */
    async get(id: TranscriptionIdentifier): Promise<SonioxTranscription | null> {
        const transcription_id = getTranscriptionId(id);
        try {
            const response = await this.http.request<SonioxTranscriptionData>({
                method: 'GET',
                path: `/v1/transcriptions/${transcription_id}`,
            });
            return new SonioxTranscription(response.data, this.http);
        } catch (error) {
            if (isNotFoundError(error)) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Permanently deletes a transcription.
     * This operation is idempotent - succeeds even if the transcription doesn't exist.
     *
     * @param id - The UUID of the transcription or a SonioxTranscription instance
     * @throws {SonioxHttpError} On API errors (except 404)
     *
     * @example
     * ```typescript
     * // Delete by ID
     * await client.transcriptions.delete('550e8400-e29b-41d4-a716-446655440000');
     *
     * // Or delete a transcription instance
     * const transcription = await client.transcriptions.get('550e8400-e29b-41d4-a716-446655440000');
     * if (transcription) {
     *     await client.transcriptions.delete(transcription);
     * }
     * ```
     */
    async delete(id: TranscriptionIdentifier): Promise<void> {
        const transcription_id = getTranscriptionId(id);
        try {
            await this.http.request<null>({
                method: 'DELETE',
                path: `/v1/transcriptions/${transcription_id}`,
            });
        } catch (error) {
            if (!isNotFoundError(error)) {
                throw error;
            }
        }
    }

    /**
     * Permanently deletes a transcription and its associated file (if any).
     * This operation is idempotent - succeeds even if resources don't exist.
     *
     * @param id - The UUID of the transcription or a SonioxTranscription instance
     * @throws {SonioxHttpError} On API errors (except 404)
     *
     * @example
     * ```typescript
     * // Clean up both transcription and uploaded file
     * const transcription = await client.transcriptions.transcribe({
     *     model: 'stt-async-v3',
     *     file: buffer,
     *     wait: true,
     * });
     * // ... use transcription ...
     * await client.transcriptions.destroy(transcription); // Deletes both
     *
     * // Or by ID
     * await client.transcriptions.destroy('550e8400-e29b-41d4-a716-446655440000');
     * ```
     */
    async destroy(id: TranscriptionIdentifier): Promise<void> {
        // Get the full transcription to access file_id
        const transcription = await this.get(id);

        // If transcription doesn't exist, nothing to do
        if (!transcription) {
            return;
        }

        // Delete transcription first
        await this.delete(transcription);

        // Delete the associated file if present (ignore 404)
        if (transcription.file_id) {
            try {
                await this.filesApi.delete(transcription.file_id);
            } catch (error) {
                if (!isNotFoundError(error)) {
                    throw error;
                }
            }
        }
    }

    /**
     * Retrieves the full transcript text and tokens for a completed transcription.
     * Only available for successfully completed transcriptions.
     *
     * @param id - The UUID of the transcription or a SonioxTranscription instance
     * @returns The transcript with text and detailed tokens, or null if not found
     * @throws {SonioxHttpError} On API errors (except 404)
     *
     * @example
     * ```typescript
     * const transcript = await client.transcriptions.getTranscript('550e8400-e29b-41d4-a716-446655440000');
     * if (transcript) {
     *     console.log(transcript.text);
     *     for (const token of transcript.tokens) {
     *         console.log(token.text, token.start_ms, token.end_ms, token.confidence);
     *     }
     * }
     * ```
     */
    async getTranscript(id: TranscriptionIdentifier): Promise<SonioxTranscript | null> {
        const transcription_id = getTranscriptionId(id);
        try {
            const response = await this.http.request<TranscriptResponse>({
                method: 'GET',
                path: `/v1/transcriptions/${transcription_id}/transcript`,
            });
            return new SonioxTranscript(response.data);
        } catch (error) {
            if (isNotFoundError(error)) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Waits for a transcription to complete
     *
     * @param id - The UUID of the transcription or a SonioxTranscription instance.
     * @param options - Wait options including polling interval, timeout, and callbacks.
     * @returns The completed or errored transcription.
     * @throws {Error} If the wait times out or is aborted.
     * @throws {SonioxHttpError} On API errors.
     *
     * @example
     * ```typescript
     * const completed = await client.transcriptions.wait('550e8400-e29b-41d4-a716-446655440000');
     *
     * // With progress callback
     * const completed = await client.transcriptions.wait('id', {
     *     interval_ms: 2000,
     *     on_status_change: (status) => console.log(`Status: ${status}`),
     * });
     * ```
     */
    async wait(id: TranscriptionIdentifier, options?: WaitOptions): Promise<SonioxTranscription> {
        const transcription = await this.get(id);
        if (!transcription) {
            throw new Error(`Transcription not found: ${getTranscriptionId(id)}`);
        }
        return transcription.wait(options);
    }

    /**
     * Wrapper to transcribe from a URL.
     *
     * @param audio_url - Publicly accessible audio URL
     * @param options - Transcription options (excluding audio_url)
     * @returns The transcription (completed if wait=true, otherwise in queued/processing state).
     */
    async transcribeFromUrl(
        audio_url: string,
        options: TranscribeFromUrlOptions,
    ): Promise<SonioxTranscription> {
        return this.transcribe({ ...options, audio_url });
    }

    /**
     * Wrapper to transcribe from an uploaded file ID.
     *
     * @param file_id - ID of a previously uploaded file
     * @param options - Transcription options (excluding file_id)
     * @returns The transcription (completed if wait=true, otherwise in queued/processing state).
     */
    async transcribeFromFileId(
        file_id: string,
        options: TranscribeFromFileIdOptions,
    ): Promise<SonioxTranscription> {
        return this.transcribe({ ...options, file_id });
    }

    /**
     * Wrapper to transcribe from raw file data.
     *
     * @param file - Buffer, Uint8Array, Blob, or ReadableStream
     * @param options - Transcription options (excluding file)
     * @returns The transcription (completed if wait=true, otherwise in queued/processing state).
     */
    async transcribeFromFile(
        file: UploadFileInput,
        options: TranscribeFromFileOptions,
    ): Promise<SonioxTranscription> {
        return this.transcribe({ ...options, file });
    }

    /**
     * Unified transcribe method - supports direct file upload
     *
     * When `file` is provided, uploads it first then creates a transcription
     * When `wait: true`, waits for completion before returning
     *
     * @param options - Transcribe options including model, audio source, and wait settings.
     * @returns The transcription (completed if wait=true, otherwise in queued/processing state).
     * @throws {SonioxHttpError} On API errors.
     * @throws {Error} On validation errors or wait timeout.
     *
     * @example
     * ```typescript
     * // Transcribe from URL and wait for completion
     * const result = await client.transcriptions.transcribe({
     *     model: 'stt-async-v3',
     *     audio_url: 'https://example.com/audio.mp3',
     *     wait: true,
     * });
     *
     * // Upload file and transcribe in one call
     * const result = await client.transcriptions.transcribe({
     *     model: 'stt-async-v3',
     *     file: buffer,  // or Blob, ReadableStream
     *     filename: 'meeting.mp3',
     *     enable_speaker_diarization: true,
     *     wait: true,
     * });
     *
     * // With wait progress callback
     * const result = await client.transcriptions.transcribe({
     *     model: 'stt-async-v3',
     *     file: buffer,
     *     wait: true,
     *     wait_options: {
     *         interval_ms: 2000,
     *         on_status_change: (status) => console.log(`Status: ${status}`),
     *     },
     * });
     * ```
     */
    async transcribe(options: TranscribeOptions): Promise<SonioxTranscription> {
        // Validate that exactly one audio source is provided
        const sourceCount = [
            options.file !== undefined,
            options.file_id !== undefined,
            options.audio_url !== undefined,
        ].filter(Boolean).length;

        if (sourceCount === 0) {
            throw new Error('One of file, file_id, or audio_url must be provided');
        }
        if (sourceCount > 1) {
            throw new Error('Only one of file, file_id, or audio_url can be provided');
        }

        // Validate audio_url format if provided
        if (options.audio_url !== undefined) {
            const urlPattern = /^https?:\/\/[^\s]+$/;
            if (!urlPattern.test(options.audio_url)) {
                throw new Error('audio_url must be a valid HTTP or HTTPS URL');
            }
        }

        // Validate webhook auth header - both must be provided together or neither
        const hasHeaderName = options.webhook_auth_header_name !== undefined;
        const hasHeaderValue = options.webhook_auth_header_value !== undefined;
        if (hasHeaderName !== hasHeaderValue) {
            throw new Error('webhook_auth_header_name and webhook_auth_header_value must be provided together');
        }

        // Create combined signal from timeout_ms and signal options
        const { signal: combinedSignal, cleanup } = createTimeoutSignal(options.timeout_ms, options.signal);

        try {
            let file_id = options.file_id;

            // If file data provided, upload first
            if (options.file) {
                const uploaded = await this.filesApi.upload(options.file, {
                    filename: options.filename,
                    client_reference_id: options.client_reference_id,
                    signal: combinedSignal,
                });
                file_id = uploaded.id;
            }

            // Process webhook_url with optional webhook_query
            let webhook_url = options.webhook_url;
            if (webhook_url && options.webhook_query) {
                const url = new URL(webhook_url);
                const params = options.webhook_query instanceof URLSearchParams
                    ? options.webhook_query
                    : typeof options.webhook_query === 'string'
                        ? new URLSearchParams(options.webhook_query)
                        : new URLSearchParams(options.webhook_query);

                params.forEach((value, key) => {
                    url.searchParams.append(key, value);
                });
                webhook_url = url.toString();
            }

            // Build create options (exclude file-upload specific fields)
            const createOptions: CreateTranscriptionOptions = {
                model: options.model,
                audio_url: options.audio_url,
                file_id,
                language_hints: options.language_hints,
                language_hints_strict: options.language_hints_strict,
                enable_language_identification: options.enable_language_identification,
                enable_speaker_diarization: options.enable_speaker_diarization,
                context: options.context,
                translation: options.translation,
                webhook_url,
                webhook_auth_header_name: options.webhook_auth_header_name,
                webhook_auth_header_value: options.webhook_auth_header_value,
                client_reference_id: options.client_reference_id,
            };

            // Create transcription
            const transcription = await this.create(createOptions, combinedSignal);

            // Wait if requested (defaults to false)
            if (options.wait) {
                // Merge the combined signal with any existing wait_options.signal
                const waitOptions: WaitOptions = {
                    ...options.wait_options,
                    signal: combinedSignal ?? options.wait_options?.signal,
                };
                return transcription.wait(waitOptions);
            }

            return transcription;
        } finally {
            cleanup();
        }
    }
}
