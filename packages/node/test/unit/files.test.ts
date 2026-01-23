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
});
