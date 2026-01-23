import type { HttpClient } from "../http/client.js";
import type {
    FileIdentifier,
    ListFilesOptions,
    ListFilesResponse,
    SonioxFileData,
} from "../types/public/index.js";

/**
 * Uploaded file
 */
export class SonioxFile {
    readonly id: string;
    readonly filename: string;
    readonly size: number;
    readonly created_at: string;
    readonly client_reference_id: string | undefined;

    constructor(
        data: SonioxFileData,
        private readonly _http: HttpClient,
    ) {
        this.id = data.id;
        this.filename = data.filename;
        this.size = data.size;
        this.created_at = data.created_at;
        this.client_reference_id = data.client_reference_id;
    }

    /**
     * Permanently deletes this file
     * @throws {SonioxHttpError}
     *
     * @example
     * ```typescript
     * const file = await client.files.get('550e8400-e29b-41d4-a716-446655440000');
     * await file.delete();
     * ```
     */
    async delete(): Promise<void> {
        await this._http.request<null>({
            method: 'DELETE',
            path: `/files/${this.id}`,
        });
    }
}

/**
 * Result set for file listing
 */
export class FileListResult implements AsyncIterable<SonioxFile> {
    /**
     * Files from the first page of results
     */
    readonly files: SonioxFile[];

    /**
     * Pagination cursor for the next page. Null if no more pages
     */
    readonly next_page_cursor: string | null;

    constructor(
        initialResponse: ListFilesResponse<SonioxFileData>,
        private readonly _http: HttpClient,
        private readonly _limit: number | undefined,
    ) {
        this.files = initialResponse.files.map(data => new SonioxFile(data, _http));
        this.next_page_cursor = initialResponse.next_page_cursor;
    }

    /**
     * Returns true if there are more pages of results beyond the first page
     */
    isPaged(): boolean {
        return this.next_page_cursor !== null;
    }

    /**
     * Async iterator that automatically fetches all pages
     * Use with `for await...of` to iterate through all files
     */
    async *[Symbol.asyncIterator](): AsyncIterator<SonioxFile> {
        // Yield files from the first page
        for (const file of this.files) {
            yield file;
        }

        // Fetch and yield subsequent pages
        let cursor = this.next_page_cursor;
        while (cursor !== null) {
            const response = await this._http.request<ListFilesResponse<SonioxFileData>>({
                method: 'GET',
                path: '/files',
                query: {
                    limit: this._limit,
                    cursor,
                },
            });

            for (const data of response.data.files) {
                yield new SonioxFile(data, this._http);
            }

            cursor = response.data.next_page_cursor;
        }
    }
}

/**
 * Helper to extract file ID from a FileIdentifier
 */
function getFileId(file: FileIdentifier): string {
    return typeof file === 'string' ? file : file.id;
}

export class SonioxFilesAPI {
    constructor(private http: HttpClient) {}

    async upload(): Promise<void> {
        // TODO: Implement file upload
        void this.http;
        throw new Error('Not implemented');
    }

    /**
     * Retrieves list of uploaded files
     *
     * The returned result is async iterable - use `for await...of`
     *
     * @param options - Optional pagination parameters
     * @returns FileListResult
     * @throws {SonioxHttpError}
     *
     * @example
     * ```typescript
     * const result = await client.files.list();
     *
     * // Automatic paging - iterates through ALL files across all pages
     * for await (const file of result) {
     *     console.log(file.filename, file.size);
     * }
     *
     * // Or access just the first page
     * for (const file of result.files) {
     *     console.log(file.filename);
     * }
     *
     * // Check if there are more pages
     * if (result.isPaged()) {
     *     console.log('More pages available');
     * }
     *
     * // Manual paging using cursor
     * const page1 = await client.files.list({ limit: 10 });
     * if (page1.next_page_cursor) {
     *     const page2 = await client.files.list({ cursor: page1.next_page_cursor });
     * }
     * ```
     */
    async list(options: ListFilesOptions = {}): Promise<FileListResult> {
        const response = await this.http.request<ListFilesResponse<SonioxFileData>>({
            method: 'GET',
            path: '/files',
            query: {
                limit: options.limit,
                cursor: options.cursor,
            },
        });

        return new FileListResult(response.data, this.http, options.limit);
    }

    /**
     * Retrieve metadata for an uploaded file.
     *
     * @param file - The UUID of the file or a SonioxFile instance
     * @returns The file instance
     * @throws {SonioxHttpError}
     *
     * @example
     * ```typescript
     * const file = await client.files.get('550e8400-e29b-41d4-a716-446655440000');
     * console.log(file.filename, file.size);
     * ```
     */
    async get(file: FileIdentifier): Promise<SonioxFile> {
        const file_id = getFileId(file);
        const response = await this.http.request<SonioxFileData>({
            method: 'GET',
            path: `/files/${file_id}`,
        });
        return new SonioxFile(response.data, this.http);
    }

    /**
     * Permanently deletes a file
     *
     * @param file - The UUID of the file or a SonioxFile instance
     * @throws {SonioxHttpError}
     *
     * @example
     * ```typescript
     * // Delete by ID
     * await client.files.delete('550e8400-e29b-41d4-a716-446655440000');
     *
     * // Or delete a file instance
     * const file = await client.files.get('550e8400-e29b-41d4-a716-446655440000');
     * await client.files.delete(file);
     *
     * // Or just use the instance method
     * await file.delete();
     * ```
     */
    async delete(file: FileIdentifier): Promise<void> {
        const file_id = getFileId(file);
        await this.http.request<null>({
            method: 'DELETE',
            path: `/files/${file_id}`,
        });
    }
}