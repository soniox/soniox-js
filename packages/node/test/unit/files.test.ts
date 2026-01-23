import { FileListResult, SonioxFile, SonioxFilesAPI } from '../../src/async/files';
import type { HttpClient, HttpRequest, HttpResponse } from '../../src/http';
import type { ListFilesResponse, SonioxFileData } from '../../src/types/public';

// Helper to create mock file data
const createMockFileData = (overrides: Partial<SonioxFileData> = {}): SonioxFileData => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    filename: 'test-file.mp3',
    size: 123456,
    created_at: '2024-11-26T00:00:00Z',
    ...overrides,
});

// Helper to create a mock HttpClient
const createMockHttpClient = (
    requestMock: jest.Mock = jest.fn()
): HttpClient => ({
    request: requestMock,
});

describe('SonioxFile', () => {
    it('should create a file with correct properties', () => {
        const mockHttp = createMockHttpClient();
        const data = createMockFileData({
            client_reference_id: 'my-ref-123',
        });

        const file = new SonioxFile(data, mockHttp);

        expect(file.id).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(file.filename).toBe('test-file.mp3');
        expect(file.size).toBe(123456);
        expect(file.created_at).toBe('2024-11-26T00:00:00Z');
        expect(file.client_reference_id).toBe('my-ref-123');
    });

    it('should handle undefined client_reference_id', () => {
        const mockHttp = createMockHttpClient();
        const data = createMockFileData();

        const file = new SonioxFile(data, mockHttp);

        expect(file.client_reference_id).toBeUndefined();
    });

    describe('delete()', () => {
        it('should call DELETE on the correct endpoint', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 204,
                headers: {},
                data: null,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const file = new SonioxFile(createMockFileData(), mockHttp);

            await file.delete();

            expect(requestMock).toHaveBeenCalledWith({
                method: 'DELETE',
                path: '/files/550e8400-e29b-41d4-a716-446655440000',
            });
        });
    });
});

describe('FileListResult', () => {
    it('should create result with files from initial response', () => {
        const mockHttp = createMockHttpClient();
        const response: ListFilesResponse<SonioxFileData> = {
            files: [
                createMockFileData({ id: 'file-1', filename: 'file1.mp3' }),
                createMockFileData({ id: 'file-2', filename: 'file2.mp3' }),
            ],
            next_page_cursor: null,
        };

        const result = new FileListResult(response, mockHttp, undefined);

        expect(result.files).toHaveLength(2);
        expect(result.files[0]?.id).toBe('file-1');
        expect(result.files[1]?.id).toBe('file-2');
        expect(result.next_page_cursor).toBeNull();
    });

    describe('isPaged()', () => {
        it('should return false when next_page_cursor is null', () => {
            const mockHttp = createMockHttpClient();
            const response: ListFilesResponse<SonioxFileData> = {
                files: [],
                next_page_cursor: null,
            };

            const result = new FileListResult(response, mockHttp, undefined);

            expect(result.isPaged()).toBe(false);
        });

        it('should return true when next_page_cursor exists', () => {
            const mockHttp = createMockHttpClient();
            const response: ListFilesResponse<SonioxFileData> = {
                files: [],
                next_page_cursor: 'cursor-abc',
            };

            const result = new FileListResult(response, mockHttp, undefined);

            expect(result.isPaged()).toBe(true);
        });
    });

    describe('async iteration', () => {
        it('should yield all files from single page', async () => {
            const mockHttp = createMockHttpClient();
            const response: ListFilesResponse<SonioxFileData> = {
                files: [
                    createMockFileData({ id: 'file-1' }),
                    createMockFileData({ id: 'file-2' }),
                ],
                next_page_cursor: null,
            };

            const result = new FileListResult(response, mockHttp, undefined);
            const files: SonioxFile[] = [];

            for await (const file of result) {
                files.push(file);
            }

            expect(files).toHaveLength(2);
            expect(files[0]?.id).toBe('file-1');
            expect(files[1]?.id).toBe('file-2');
        });

        it('should automatically fetch and yield files from multiple pages', async () => {
            const requestMock = jest.fn()
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: {
                        files: [createMockFileData({ id: 'file-3' })],
                        next_page_cursor: 'cursor-page-3',
                    },
                })
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: {
                        files: [createMockFileData({ id: 'file-4' })],
                        next_page_cursor: null,
                    },
                });

            const mockHttp = createMockHttpClient(requestMock);
            const initialResponse: ListFilesResponse<SonioxFileData> = {
                files: [
                    createMockFileData({ id: 'file-1' }),
                    createMockFileData({ id: 'file-2' }),
                ],
                next_page_cursor: 'cursor-page-2',
            };

            const result = new FileListResult(initialResponse, mockHttp, 10);
            const files: SonioxFile[] = [];

            for await (const file of result) {
                files.push(file);
            }

            expect(files).toHaveLength(4);
            expect(files.map(f => f.id)).toEqual(['file-1', 'file-2', 'file-3', 'file-4']);

            // Verify pagination requests
            expect(requestMock).toHaveBeenCalledTimes(2);
            expect(requestMock).toHaveBeenNthCalledWith(1, {
                method: 'GET',
                path: '/files',
                query: { limit: 10, cursor: 'cursor-page-2' },
            });
            expect(requestMock).toHaveBeenNthCalledWith(2, {
                method: 'GET',
                path: '/files',
                query: { limit: 10, cursor: 'cursor-page-3' },
            });
        });

        it('should not make additional requests when no more pages', async () => {
            const requestMock = jest.fn();
            const mockHttp = createMockHttpClient(requestMock);
            const response: ListFilesResponse<SonioxFileData> = {
                files: [createMockFileData({ id: 'file-1' })],
                next_page_cursor: null,
            };

            const result = new FileListResult(response, mockHttp, undefined);
            const files: SonioxFile[] = [];

            for await (const file of result) {
                files.push(file);
            }

            expect(files).toHaveLength(1);
            expect(requestMock).not.toHaveBeenCalled();
        });
    });
});

describe('SonioxFilesAPI', () => {
    describe('list()', () => {
        it('should make GET request to /files', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: {
                    files: [createMockFileData()],
                    next_page_cursor: null,
                },
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            await api.list();

            expect(requestMock).toHaveBeenCalledWith({
                method: 'GET',
                path: '/files',
                query: { limit: undefined, cursor: undefined },
            });
        });

        it('should pass limit and cursor options', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: { files: [], next_page_cursor: null },
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            await api.list({ limit: 50, cursor: 'my-cursor' });

            expect(requestMock).toHaveBeenCalledWith({
                method: 'GET',
                path: '/files',
                query: { limit: 50, cursor: 'my-cursor' },
            });
        });

        it('should return FileListResult', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: {
                    files: [createMockFileData()],
                    next_page_cursor: 'next-cursor',
                },
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const result = await api.list();

            expect(result).toBeInstanceOf(FileListResult);
            expect(result.files).toHaveLength(1);
            expect(result.next_page_cursor).toBe('next-cursor');
            expect(result.isPaged()).toBe(true);
        });
    });

    describe('get()', () => {
        it('should make GET request with file ID string', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: createMockFileData(),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            await api.get('test-file-id');

            expect(requestMock).toHaveBeenCalledWith({
                method: 'GET',
                path: '/files/test-file-id',
            });
        });

        it('should accept SonioxFile instance and use its id', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: createMockFileData({ id: 'refreshed-file-id' }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const existingFile = new SonioxFile(
                createMockFileData({ id: 'existing-file-id' }),
                mockHttp
            );

            await api.get(existingFile);

            expect(requestMock).toHaveBeenCalledWith({
                method: 'GET',
                path: '/files/existing-file-id',
            });
        });

        it('should return SonioxFile instance', async () => {
            const fileData = createMockFileData({
                id: 'returned-id',
                filename: 'returned-file.mp3',
            });
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: fileData,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const file = await api.get('returned-id');

            expect(file).toBeInstanceOf(SonioxFile);
            expect(file.id).toBe('returned-id');
            expect(file.filename).toBe('returned-file.mp3');
        });
    });

    describe('delete()', () => {
        it('should make DELETE request with file ID string', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 204,
                headers: {},
                data: null,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            await api.delete('file-to-delete');

            expect(requestMock).toHaveBeenCalledWith({
                method: 'DELETE',
                path: '/files/file-to-delete',
            });
        });

        it('should accept SonioxFile instance and use its id', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 204,
                headers: {},
                data: null,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const file = new SonioxFile(
                createMockFileData({ id: 'file-instance-id' }),
                mockHttp
            );

            await api.delete(file);

            expect(requestMock).toHaveBeenCalledWith({
                method: 'DELETE',
                path: '/files/file-instance-id',
            });
        });

        it('should accept object with id property', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 204,
                headers: {},
                data: null,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            await api.delete({ id: 'plain-object-id' });

            expect(requestMock).toHaveBeenCalledWith({
                method: 'DELETE',
                path: '/files/plain-object-id',
            });
        });
    });

    describe('upload()', () => {
        const mockUploadResponse: SonioxFileData = {
            id: 'uploaded-file-id',
            filename: 'audio.mp3',
            size: 12345,
            created_at: '2024-11-26T00:00:00Z',
            client_reference_id: undefined,
        };

        it('should upload a Buffer and return SonioxFile', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: mockUploadResponse,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const buffer = Buffer.from('test audio data');
            const file = await api.upload(buffer);

            expect(file).toBeInstanceOf(SonioxFile);
            expect(file.id).toBe('uploaded-file-id');
            expect(file.filename).toBe('audio.mp3');
            expect(requestMock).toHaveBeenCalledTimes(1);

            const callArgs = requestMock.mock.calls[0]?.[0];
            expect(callArgs?.method).toBe('POST');
            expect(callArgs?.path).toBe('/files');
            expect(callArgs?.body).toBeInstanceOf(FormData);
        });

        it('should upload a Uint8Array', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: mockUploadResponse,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const uint8Array = new Uint8Array([1, 2, 3, 4, 5]);
            const file = await api.upload(uint8Array);

            expect(file).toBeInstanceOf(SonioxFile);
            expect(requestMock).toHaveBeenCalledTimes(1);
        });

        it('should upload a Blob', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: mockUploadResponse,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const blob = new Blob(['test data'], { type: 'audio/mpeg' });
            const file = await api.upload(blob);

            expect(file).toBeInstanceOf(SonioxFile);
            expect(requestMock).toHaveBeenCalledTimes(1);
        });

        it('should use custom filename when provided', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: { ...mockUploadResponse, filename: 'custom-name.mp3' },
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const buffer = Buffer.from('test audio data');
            await api.upload(buffer, { filename: 'custom-name.mp3' });

            const callArgs = requestMock.mock.calls[0]?.[0];
            const formData = callArgs?.body as FormData;
            const fileField = formData.get('file') as File;
            expect(fileField.name).toBe('custom-name.mp3');
        });

        it('should use default filename for Buffer when not provided', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: mockUploadResponse,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const buffer = Buffer.from('test audio data');
            await api.upload(buffer);

            const callArgs = requestMock.mock.calls[0]?.[0];
            const formData = callArgs?.body as FormData;
            const fileField = formData.get('file') as File;
            expect(fileField.name).toBe('file');
        });

        it('should include client_reference_id in FormData when provided', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: { ...mockUploadResponse, client_reference_id: 'my-ref-123' },
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const buffer = Buffer.from('test audio data');
            await api.upload(buffer, { client_reference_id: 'my-ref-123' });

            const callArgs = requestMock.mock.calls[0]?.[0];
            const formData = callArgs?.body as FormData;
            expect(formData.get('client_reference_id')).toBe('my-ref-123');
        });

        it('should not include client_reference_id when not provided', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: mockUploadResponse,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const buffer = Buffer.from('test audio data');
            await api.upload(buffer);

            const callArgs = requestMock.mock.calls[0]?.[0];
            const formData = callArgs?.body as FormData;
            expect(formData.get('client_reference_id')).toBeNull();
        });

        it('should throw error when client_reference_id exceeds 256 characters', async () => {
            const requestMock = jest.fn();
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const buffer = Buffer.from('test audio data');
            const longRefId = 'a'.repeat(257);

            await expect(
                api.upload(buffer, { client_reference_id: longRefId })
            ).rejects.toThrow('client_reference_id exceeds maximum length of 256 characters');

            expect(requestMock).not.toHaveBeenCalled();
        });

        it('should accept client_reference_id of exactly 256 characters', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: mockUploadResponse,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const buffer = Buffer.from('test audio data');
            const maxRefId = 'a'.repeat(256);

            await api.upload(buffer, { client_reference_id: maxRefId });

            expect(requestMock).toHaveBeenCalledTimes(1);
        });

        it('should pass signal option to request', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: mockUploadResponse,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const controller = new AbortController();
            const buffer = Buffer.from('test audio data');
            await api.upload(buffer, { signal: controller.signal });

            const callArgs = requestMock.mock.calls[0]?.[0];
            expect(callArgs?.signal).toBe(controller.signal);
        });

        it('should pass timeout_ms option to request as timeoutMs', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: mockUploadResponse,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const buffer = Buffer.from('test audio data');
            await api.upload(buffer, { timeout_ms: 60000 });

            const callArgs = requestMock.mock.calls[0]?.[0];
            expect(callArgs?.timeoutMs).toBe(60000);
        });

        it('should not include signal and timeoutMs when not provided', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: mockUploadResponse,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            const buffer = Buffer.from('test audio data');
            await api.upload(buffer);

            const callArgs = requestMock.mock.calls[0]?.[0];
            expect(callArgs?.signal).toBeUndefined();
            expect(callArgs?.timeoutMs).toBeUndefined();
        });

        it('should throw error for invalid input type', async () => {
            const requestMock = jest.fn();
            const mockHttp = createMockHttpClient(requestMock);
            const api = new SonioxFilesAPI(mockHttp);

            // @ts-expect-error - Testing invalid input type
            await expect(api.upload(12345)).rejects.toThrow(
                'Invalid file input. Expected Buffer, Uint8Array, Blob, or ReadableStream.'
            );

            expect(requestMock).not.toHaveBeenCalled();
        });
    });
});
