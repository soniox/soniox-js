import {
    SonioxTranscription,
    SonioxTranscriptionsAPI,
    TranscriptionListResult,
} from '../../src/async/transcriptions';
import { SonioxFile, SonioxFilesAPI } from '../../src/async/files';
import type { HttpClient } from '../../src/http';
import type {
    ListTranscriptionsResponse,
    SonioxTranscriptionData,
    SonioxFileData,
} from '../../src/types/public';

// Helper to create mock transcription data
const createMockTranscriptionData = (
    overrides: Partial<SonioxTranscriptionData> = {}
): SonioxTranscriptionData => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    status: 'queued',
    model: 'soniox-precision',
    created_at: '2024-11-26T00:00:00Z',
    filename: 'test-audio.mp3',
    enable_speaker_diarization: false,
    enable_language_identification: false,
    ...overrides,
});

// Helper to create a mock HttpClient
const createMockHttpClient = (requestMock: jest.Mock = jest.fn()): HttpClient => ({
    request: requestMock,
});

// Helper to create a mock FilesAPI
const createMockFilesAPI = (uploadMock: jest.Mock = jest.fn()): SonioxFilesAPI => {
    const mockHttp = createMockHttpClient();
    const api = new SonioxFilesAPI(mockHttp);
    api.upload = uploadMock;
    return api;
};

describe('SonioxTranscription', () => {
    it('should create a transcription with correct properties', () => {
        const mockHttp = createMockHttpClient();
        const data = createMockTranscriptionData({
            audio_url: 'https://example.com/audio.mp3',
            client_reference_id: 'my-ref-123',
        });

        const transcription = new SonioxTranscription(data, mockHttp);

        expect(transcription.id).toBe('550e8400-e29b-41d4-a716-446655440000');
        expect(transcription.status).toBe('queued');
        expect(transcription.model).toBe('soniox-precision');
        expect(transcription.created_at).toBe('2024-11-26T00:00:00Z');
        expect(transcription.audio_url).toBe('https://example.com/audio.mp3');
        expect(transcription.client_reference_id).toBe('my-ref-123');
    });

    it('should handle undefined optional fields', () => {
        const mockHttp = createMockHttpClient();
        const data = createMockTranscriptionData();

        const transcription = new SonioxTranscription(data, mockHttp);

        expect(transcription.audio_url).toBeUndefined();
        expect(transcription.file_id).toBeUndefined();
        expect(transcription.client_reference_id).toBeUndefined();
    });

    it('should handle error status', () => {
        const mockHttp = createMockHttpClient();
        const data = createMockTranscriptionData({
            status: 'error',
        });

        const transcription = new SonioxTranscription(data, mockHttp);

        expect(transcription.status).toBe('error');
    });

    describe('delete()', () => {
        it('should call DELETE on the correct endpoint', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 204,
                headers: {},
                data: null,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const transcription = new SonioxTranscription(createMockTranscriptionData(), mockHttp);

            await transcription.delete();

            expect(requestMock).toHaveBeenCalledWith({
                method: 'DELETE',
                path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
            });
        });
    });

    describe('refresh()', () => {
        it('should fetch and return a new transcription instance', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: createMockTranscriptionData({ status: 'completed' }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const transcription = new SonioxTranscription(
                createMockTranscriptionData({ status: 'processing' }),
                mockHttp
            );

            const refreshed = await transcription.refresh();

            expect(requestMock).toHaveBeenCalledWith({
                method: 'GET',
                path: '/v1/transcriptions/550e8400-e29b-41d4-a716-446655440000',
            });
            expect(refreshed).toBeInstanceOf(SonioxTranscription);
            expect(refreshed.status).toBe('completed');
            expect(refreshed).not.toBe(transcription);
        });
    });

    describe('wait()', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should return immediately if already completed', async () => {
            const mockHttp = createMockHttpClient();
            const transcription = new SonioxTranscription(
                createMockTranscriptionData({ status: 'completed' }),
                mockHttp
            );

            const result = await transcription.wait();

            expect(result).toBe(transcription);
        });

        it('should return immediately if already errored', async () => {
            const mockHttp = createMockHttpClient();
            const transcription = new SonioxTranscription(
                createMockTranscriptionData({ status: 'error' }),
                mockHttp
            );

            const result = await transcription.wait();

            expect(result).toBe(transcription);
        });

        it('should poll until completed', async () => {
            const requestMock = jest.fn()
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: createMockTranscriptionData({ status: 'processing' }),
                })
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: createMockTranscriptionData({ status: 'completed' }),
                });
            const mockHttp = createMockHttpClient(requestMock);
            const transcription = new SonioxTranscription(
                createMockTranscriptionData({ status: 'queued' }),
                mockHttp
            );

            const waitPromise = transcription.wait({ interval_ms: 1000 });

            // First refresh returns processing
            await jest.advanceTimersByTimeAsync(1000);
            // Second refresh returns completed
            await jest.advanceTimersByTimeAsync(1000);

            const result = await waitPromise;

            expect(result.status).toBe('completed');
            expect(requestMock).toHaveBeenCalledTimes(2);
        });

        it('should enforce minimum polling interval of 1000ms', async () => {
            const requestMock = jest.fn()
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: createMockTranscriptionData({ status: 'completed' }),
                });
            const mockHttp = createMockHttpClient(requestMock);
            const transcription = new SonioxTranscription(
                createMockTranscriptionData({ status: 'queued' }),
                mockHttp
            );

            const waitPromise = transcription.wait({ interval_ms: 100 }); // Below minimum

            // Should use 1000ms instead of 100ms
            await jest.advanceTimersByTimeAsync(1000);

            await waitPromise;

            expect(requestMock).toHaveBeenCalledTimes(1);
        });

        it('should call on_status_change callback when status changes', async () => {
            const requestMock = jest.fn()
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: createMockTranscriptionData({ status: 'processing' }),
                })
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: createMockTranscriptionData({ status: 'completed' }),
                });
            const mockHttp = createMockHttpClient(requestMock);
            const transcription = new SonioxTranscription(
                createMockTranscriptionData({ status: 'queued' }),
                mockHttp
            );
            const onStatusChange = jest.fn();

            const waitPromise = transcription.wait({
                interval_ms: 1000,
                on_status_change: onStatusChange,
            });

            await jest.advanceTimersByTimeAsync(1000);
            await jest.advanceTimersByTimeAsync(1000);

            await waitPromise;

            expect(onStatusChange).toHaveBeenCalledTimes(2);
            expect(onStatusChange).toHaveBeenNthCalledWith(
                1,
                'processing',
                expect.objectContaining({ status: 'processing' })
            );
            expect(onStatusChange).toHaveBeenNthCalledWith(
                2,
                'completed',
                expect.objectContaining({ status: 'completed' })
            );
        });

        it('should throw on timeout', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: createMockTranscriptionData({ status: 'processing' }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const transcription = new SonioxTranscription(
                createMockTranscriptionData({ status: 'queued' }),
                mockHttp
            );

            const waitPromise = transcription.wait({
                interval_ms: 1000,
                timeout_ms: 2500,
            });

            // Set up the rejection expectation before advancing timers
            const expectPromise = expect(waitPromise).rejects.toThrow('Transcription wait timed out after 2500ms');

            // Advance past timeout
            await jest.advanceTimersByTimeAsync(3000);

            await expectPromise;
        });

        it('should throw when aborted', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: createMockTranscriptionData({ status: 'processing' }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const transcription = new SonioxTranscription(
                createMockTranscriptionData({ status: 'queued' }),
                mockHttp
            );
            const controller = new AbortController();

            const waitPromise = transcription.wait({
                interval_ms: 1000,
                signal: controller.signal,
            });

            // Set up the rejection expectation before advancing timers
            const expectPromise = expect(waitPromise).rejects.toThrow('Transcription wait aborted');

            await jest.advanceTimersByTimeAsync(1000);
            controller.abort();
            await jest.advanceTimersByTimeAsync(1000);

            await expectPromise;
        });
    });
});

describe('TranscriptionListResult', () => {
    it('should create result with transcriptions from initial response', () => {
        const mockHttp = createMockHttpClient();
        const response: ListTranscriptionsResponse<SonioxTranscriptionData> = {
            transcriptions: [
                createMockTranscriptionData({ id: 'trans-1' }),
                createMockTranscriptionData({ id: 'trans-2' }),
            ],
            next_page_cursor: null,
        };

        const result = new TranscriptionListResult(response, mockHttp, {});

        expect(result.transcriptions).toHaveLength(2);
        expect(result.transcriptions[0]?.id).toBe('trans-1');
        expect(result.transcriptions[1]?.id).toBe('trans-2');
        expect(result.next_page_cursor).toBeNull();
    });

    describe('isPaged()', () => {
        it('should return false when next_page_cursor is null', () => {
            const mockHttp = createMockHttpClient();
            const response: ListTranscriptionsResponse<SonioxTranscriptionData> = {
                transcriptions: [],
                next_page_cursor: null,
            };

            const result = new TranscriptionListResult(response, mockHttp, {});

            expect(result.isPaged()).toBe(false);
        });

        it('should return true when next_page_cursor exists', () => {
            const mockHttp = createMockHttpClient();
            const response: ListTranscriptionsResponse<SonioxTranscriptionData> = {
                transcriptions: [],
                next_page_cursor: 'cursor-abc',
            };

            const result = new TranscriptionListResult(response, mockHttp, {});

            expect(result.isPaged()).toBe(true);
        });
    });

    describe('async iteration', () => {
        it('should yield all transcriptions from single page', async () => {
            const mockHttp = createMockHttpClient();
            const response: ListTranscriptionsResponse<SonioxTranscriptionData> = {
                transcriptions: [
                    createMockTranscriptionData({ id: 'trans-1' }),
                    createMockTranscriptionData({ id: 'trans-2' }),
                ],
                next_page_cursor: null,
            };

            const result = new TranscriptionListResult(response, mockHttp, {});
            const transcriptions: SonioxTranscription[] = [];

            for await (const t of result) {
                transcriptions.push(t);
            }

            expect(transcriptions).toHaveLength(2);
            expect(transcriptions[0]?.id).toBe('trans-1');
            expect(transcriptions[1]?.id).toBe('trans-2');
        });

        it('should automatically fetch and yield transcriptions from multiple pages', async () => {
            const requestMock = jest.fn()
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: {
                        transcriptions: [createMockTranscriptionData({ id: 'trans-3' })],
                        next_page_cursor: 'cursor-page-3',
                    },
                })
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: {
                        transcriptions: [createMockTranscriptionData({ id: 'trans-4' })],
                        next_page_cursor: null,
                    },
                });

            const mockHttp = createMockHttpClient(requestMock);
            const initialResponse: ListTranscriptionsResponse<SonioxTranscriptionData> = {
                transcriptions: [
                    createMockTranscriptionData({ id: 'trans-1' }),
                    createMockTranscriptionData({ id: 'trans-2' }),
                ],
                next_page_cursor: 'cursor-page-2',
            };

            const result = new TranscriptionListResult(initialResponse, mockHttp, { limit: 10 });
            const transcriptions: SonioxTranscription[] = [];

            for await (const t of result) {
                transcriptions.push(t);
            }

            expect(transcriptions).toHaveLength(4);
            expect(transcriptions.map(t => t.id)).toEqual(['trans-1', 'trans-2', 'trans-3', 'trans-4']);

            expect(requestMock).toHaveBeenCalledTimes(2);
            expect(requestMock).toHaveBeenNthCalledWith(1, {
                method: 'GET',
                path: '/v1/transcriptions',
                query: { limit: 10, cursor: 'cursor-page-2', status: undefined },
            });
            expect(requestMock).toHaveBeenNthCalledWith(2, {
                method: 'GET',
                path: '/v1/transcriptions',
                query: { limit: 10, cursor: 'cursor-page-3', status: undefined },
            });
        });

        it('should not make additional requests when no more pages', async () => {
            const requestMock = jest.fn();
            const mockHttp = createMockHttpClient(requestMock);
            const response: ListTranscriptionsResponse<SonioxTranscriptionData> = {
                transcriptions: [createMockTranscriptionData({ id: 'trans-1' })],
                next_page_cursor: null,
            };

            const result = new TranscriptionListResult(response, mockHttp, {});
            const transcriptions: SonioxTranscription[] = [];

            for await (const t of result) {
                transcriptions.push(t);
            }

            expect(transcriptions).toHaveLength(1);
            expect(requestMock).not.toHaveBeenCalled();
        });
    });
});

describe('SonioxTranscriptionsAPI', () => {
    describe('create()', () => {
        it('should make POST request with options', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: createMockTranscriptionData(),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            await api.create({
                model: 'soniox-precision',
                audio_url: 'https://example.com/audio.mp3',
            });

            expect(requestMock).toHaveBeenCalledWith({
                method: 'POST',
                path: '/v1/transcriptions',
                body: {
                    model: 'soniox-precision',
                    audio_url: 'https://example.com/audio.mp3',
                },
            });
        });

        it('should return SonioxTranscription instance', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: createMockTranscriptionData({ status: 'queued' }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            const result = await api.create({
                model: 'soniox-precision',
                audio_url: 'https://example.com/audio.mp3',
            });

            expect(result).toBeInstanceOf(SonioxTranscription);
            expect(result.status).toBe('queued');
        });
    });

    describe('list()', () => {
        it('should make GET request to /v1/transcriptions', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: {
                    transcriptions: [createMockTranscriptionData()],
                    next_page_cursor: null,
                },
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            await api.list();

            expect(requestMock).toHaveBeenCalledWith({
                method: 'GET',
                path: '/v1/transcriptions',
                query: { limit: undefined, cursor: undefined, status: undefined },
            });
        });

        it('should pass limit, cursor, and status options', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: { transcriptions: [], next_page_cursor: null },
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            await api.list({ limit: 50, cursor: 'my-cursor' });

            expect(requestMock).toHaveBeenCalledWith({
                method: 'GET',
                path: '/v1/transcriptions',
                query: { limit: 50, cursor: 'my-cursor' },
            });
        });

        it('should return TranscriptionListResult', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: {
                    transcriptions: [createMockTranscriptionData()],
                    next_page_cursor: 'next-cursor',
                },
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            const result = await api.list();

            expect(result).toBeInstanceOf(TranscriptionListResult);
            expect(result.transcriptions).toHaveLength(1);
            expect(result.next_page_cursor).toBe('next-cursor');
            expect(result.isPaged()).toBe(true);
        });
    });

    describe('get()', () => {
        it('should make GET request with transcription ID string', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: createMockTranscriptionData(),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            await api.get('test-transcription-id');

            expect(requestMock).toHaveBeenCalledWith({
                method: 'GET',
                path: '/v1/transcriptions/test-transcription-id',
            });
        });

        it('should accept SonioxTranscription instance and use its id', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: createMockTranscriptionData({ id: 'refreshed-id' }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            const existing = new SonioxTranscription(
                createMockTranscriptionData({ id: 'existing-id' }),
                mockHttp
            );

            await api.get(existing);

            expect(requestMock).toHaveBeenCalledWith({
                method: 'GET',
                path: '/v1/transcriptions/existing-id',
            });
        });

        it('should return SonioxTranscription instance', async () => {
            const transcriptionData = createMockTranscriptionData({
                id: 'returned-id',
                status: 'completed',
            });
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: transcriptionData,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            const transcription = await api.get('returned-id');

            expect(transcription).toBeInstanceOf(SonioxTranscription);
            expect(transcription.id).toBe('returned-id');
            expect(transcription.status).toBe('completed');
        });
    });

    describe('delete()', () => {
        it('should make DELETE request with transcription ID string', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 204,
                headers: {},
                data: null,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            await api.delete('transcription-to-delete');

            expect(requestMock).toHaveBeenCalledWith({
                method: 'DELETE',
                path: '/v1/transcriptions/transcription-to-delete',
            });
        });

        it('should accept SonioxTranscription instance and use its id', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 204,
                headers: {},
                data: null,
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            const transcription = new SonioxTranscription(
                createMockTranscriptionData({ id: 'transcription-instance-id' }),
                mockHttp
            );

            await api.delete(transcription);

            expect(requestMock).toHaveBeenCalledWith({
                method: 'DELETE',
                path: '/v1/transcriptions/transcription-instance-id',
            });
        });
    });

    describe('wait()', () => {
        it('should get transcription and call its wait method', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: createMockTranscriptionData({ status: 'completed' }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            const result = await api.wait('transcription-id');

            expect(requestMock).toHaveBeenCalledWith({
                method: 'GET',
                path: '/v1/transcriptions/transcription-id',
            });
            expect(result.status).toBe('completed');
        });
    });

    describe('transcribe()', () => {
        it('should create transcription from audio_url', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: createMockTranscriptionData({ status: 'queued' }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            const result = await api.transcribe({
                model: 'soniox-precision',
                audio_url: 'https://example.com/audio.mp3',
            });

            expect(result).toBeInstanceOf(SonioxTranscription);
            expect(result.status).toBe('queued');
            expect(requestMock).toHaveBeenCalledWith({
                method: 'POST',
                path: '/v1/transcriptions',
                body: expect.objectContaining({
                    model: 'soniox-precision',
                    audio_url: 'https://example.com/audio.mp3',
                }),
            });
        });

        it('should upload file and create transcription when file provided', async () => {
            const mockFileData: SonioxFileData = {
                id: 'uploaded-file-id',
                filename: 'audio.mp3',
                size: 12345,
                created_at: '2024-11-26T00:00:00Z',
            };
            const uploadMock = jest.fn().mockResolvedValue(
                new SonioxFile(mockFileData, createMockHttpClient())
            );
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: createMockTranscriptionData({
                    status: 'queued',
                    file_id: 'uploaded-file-id',
                }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI(uploadMock);
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            const buffer = Buffer.from('test audio data');
            const result = await api.transcribe({
                model: 'soniox-precision',
                file: buffer,
                filename: 'audio.mp3',
            });

            expect(uploadMock).toHaveBeenCalledWith(buffer, {
                filename: 'audio.mp3',
                client_reference_id: undefined,
            });
            expect(requestMock).toHaveBeenCalledWith({
                method: 'POST',
                path: '/v1/transcriptions',
                body: expect.objectContaining({
                    model: 'soniox-precision',
                    file_id: 'uploaded-file-id',
                }),
            });
            expect(result.file_id).toBe('uploaded-file-id');
        });

        it('should wait for completion when wait=true', async () => {
            jest.useFakeTimers();

            const requestMock = jest.fn()
                .mockResolvedValueOnce({
                    status: 201,
                    headers: {},
                    data: createMockTranscriptionData({ status: 'queued' }),
                })
                .mockResolvedValueOnce({
                    status: 200,
                    headers: {},
                    data: createMockTranscriptionData({ status: 'completed' }),
                });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            const resultPromise = api.transcribe({
                model: 'soniox-precision',
                audio_url: 'https://example.com/audio.mp3',
                wait: true,
            });

            await jest.advanceTimersByTimeAsync(1000);

            const result = await resultPromise;

            expect(result.status).toBe('completed');

            jest.useRealTimers();
        });

        it('should not wait when wait=false or undefined', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: createMockTranscriptionData({ status: 'queued' }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            const result = await api.transcribe({
                model: 'soniox-precision',
                audio_url: 'https://example.com/audio.mp3',
            });

            expect(result.status).toBe('queued');
            expect(requestMock).toHaveBeenCalledTimes(1);
        });

        it('should pass webhook options through to create', async () => {
            const requestMock = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: createMockTranscriptionData({
                    status: 'queued',
                    webhook_url: 'https://example.com/webhook',
                    webhook_auth_header_name: 'X-Webhook-Auth',
                    webhook_auth_header_value: '***masked***',
                }),
            });
            const mockHttp = createMockHttpClient(requestMock);
            const mockFilesApi = createMockFilesAPI();
            const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

            await api.transcribe({
                model: 'soniox-precision',
                audio_url: 'https://example.com/audio.mp3',
                webhook_url: 'https://example.com/webhook',
                webhook_auth_header_name: 'X-Webhook-Auth',
                webhook_auth_header_value: 'secret-token',
            });

            expect(requestMock).toHaveBeenCalledWith({
                method: 'POST',
                path: '/v1/transcriptions',
                body: expect.objectContaining({
                    model: 'soniox-precision',
                    audio_url: 'https://example.com/audio.mp3',
                    webhook_url: 'https://example.com/webhook',
                    webhook_auth_header_name: 'X-Webhook-Auth',
                    webhook_auth_header_value: 'secret-token',
                }),
            });
        });

        describe('audio source validation', () => {
            it('should throw when no audio source is provided', async () => {
                const mockHttp = createMockHttpClient();
                const mockFilesApi = createMockFilesAPI();
                const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

                await expect(api.transcribe({
                    model: 'soniox-precision',
                })).rejects.toThrow('One of file, file_id, or audio_url must be provided');
            });

            it('should throw when both file and audio_url are provided', async () => {
                const mockHttp = createMockHttpClient();
                const mockFilesApi = createMockFilesAPI();
                const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

                await expect(api.transcribe({
                    model: 'soniox-precision',
                    file: Buffer.from('test'),
                    audio_url: 'https://example.com/audio.mp3',
                })).rejects.toThrow('Only one of file, file_id, or audio_url can be provided');
            });

            it('should throw when both file and file_id are provided', async () => {
                const mockHttp = createMockHttpClient();
                const mockFilesApi = createMockFilesAPI();
                const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

                await expect(api.transcribe({
                    model: 'soniox-precision',
                    file: Buffer.from('test'),
                    file_id: 'existing-file-id',
                })).rejects.toThrow('Only one of file, file_id, or audio_url can be provided');
            });

            it('should throw when both audio_url and file_id are provided', async () => {
                const mockHttp = createMockHttpClient();
                const mockFilesApi = createMockFilesAPI();
                const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

                await expect(api.transcribe({
                    model: 'soniox-precision',
                    audio_url: 'https://example.com/audio.mp3',
                    file_id: 'existing-file-id',
                })).rejects.toThrow('Only one of file, file_id, or audio_url can be provided');
            });

            it('should throw when all three audio sources are provided', async () => {
                const mockHttp = createMockHttpClient();
                const mockFilesApi = createMockFilesAPI();
                const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

                await expect(api.transcribe({
                    model: 'soniox-precision',
                    file: Buffer.from('test'),
                    audio_url: 'https://example.com/audio.mp3',
                    file_id: 'existing-file-id',
                })).rejects.toThrow('Only one of file, file_id, or audio_url can be provided');
            });
        });

        describe('audio_url validation', () => {
            it('should throw when audio_url is not a valid HTTP/HTTPS URL', async () => {
                const mockHttp = createMockHttpClient();
                const mockFilesApi = createMockFilesAPI();
                const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

                await expect(api.transcribe({
                    model: 'soniox-precision',
                    audio_url: 'ftp://example.com/audio.mp3',
                })).rejects.toThrow('audio_url must be a valid HTTP or HTTPS URL');
            });

            it('should throw when audio_url contains whitespace', async () => {
                const mockHttp = createMockHttpClient();
                const mockFilesApi = createMockFilesAPI();
                const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

                await expect(api.transcribe({
                    model: 'soniox-precision',
                    audio_url: 'https://example.com/audio file.mp3',
                })).rejects.toThrow('audio_url must be a valid HTTP or HTTPS URL');
            });

            it('should throw when audio_url is empty string', async () => {
                const mockHttp = createMockHttpClient();
                const mockFilesApi = createMockFilesAPI();
                const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

                await expect(api.transcribe({
                    model: 'soniox-precision',
                    audio_url: '',
                })).rejects.toThrow('audio_url must be a valid HTTP or HTTPS URL');
            });

            it('should accept valid HTTP URL', async () => {
                const requestMock = jest.fn().mockResolvedValue({
                    status: 201,
                    headers: {},
                    data: createMockTranscriptionData({ status: 'queued' }),
                });
                const mockHttp = createMockHttpClient(requestMock);
                const mockFilesApi = createMockFilesAPI();
                const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

                await api.transcribe({
                    model: 'soniox-precision',
                    audio_url: 'http://example.com/audio.mp3',
                });

                expect(requestMock).toHaveBeenCalled();
            });

            it('should accept valid HTTPS URL', async () => {
                const requestMock = jest.fn().mockResolvedValue({
                    status: 201,
                    headers: {},
                    data: createMockTranscriptionData({ status: 'queued' }),
                });
                const mockHttp = createMockHttpClient(requestMock);
                const mockFilesApi = createMockFilesAPI();
                const api = new SonioxTranscriptionsAPI(mockHttp, mockFilesApi);

                await api.transcribe({
                    model: 'soniox-precision',
                    audio_url: 'https://example.com/path/to/audio.mp3?token=abc123',
                });

                expect(requestMock).toHaveBeenCalled();
            });
        });
    });
});
