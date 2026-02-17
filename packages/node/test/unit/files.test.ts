import { FileListResult, SonioxFile, SonioxFilesAPI } from '../../src/async/files';
import { SonioxHttpError } from '../../src/http/errors';
import type { HttpClient } from '../../src/http';
import type { ListFilesResponse, SonioxFileData } from '../../src/types/public';

// Helper to create a mock 404 error
const createMock404Error = () =>
  new SonioxHttpError({
    code: 'http_error',
    message: 'HTTP 404',
    url: 'https://api.soniox.com/v1/files/test',
    method: 'GET',
    statusCode: 404,
    headers: {},
    bodyText: 'Not found',
  });

// Helper to create mock file data
const createMockFileData = (overrides: Partial<SonioxFileData> = {}): SonioxFileData => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  filename: 'test-file.mp3',
  size: 123456,
  created_at: '2024-11-26T00:00:00Z',
  ...overrides,
});

// Helper to create a mock HttpClient
const createMockHttpClient = (requestMock: jest.Mock = jest.fn()): HttpClient => ({
  request: requestMock,
});

describe('SonioxFile', () => {
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
        path: '/v1/files/550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('should succeed silently on 404 (idempotent)', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const file = new SonioxFile(createMockFileData(), mockHttp);

      await expect(file.delete()).resolves.toBeUndefined();
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
        files: [createMockFileData({ id: 'file-1' }), createMockFileData({ id: 'file-2' })],
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
      const requestMock = jest
        .fn()
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
        files: [createMockFileData({ id: 'file-1' }), createMockFileData({ id: 'file-2' })],
        next_page_cursor: 'cursor-page-2',
      };

      const result = new FileListResult(initialResponse, mockHttp, 10);
      const files: SonioxFile[] = [];

      for await (const file of result) {
        files.push(file);
      }

      expect(files).toHaveLength(4);
      expect(files.map((f) => f.id)).toEqual(['file-1', 'file-2', 'file-3', 'file-4']);

      // Verify pagination requests
      expect(requestMock).toHaveBeenCalledTimes(2);
      expect(requestMock).toHaveBeenNthCalledWith(1, {
        method: 'GET',
        path: '/v1/files',
        query: { limit: 10, cursor: 'cursor-page-2' },
      });
      expect(requestMock).toHaveBeenNthCalledWith(2, {
        method: 'GET',
        path: '/v1/files',
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
        path: '/v1/files',
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
        path: '/v1/files',
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
        path: '/v1/files/test-file-id',
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

      const existingFile = new SonioxFile(createMockFileData({ id: 'existing-file-id' }), mockHttp);

      await api.get(existingFile);

      expect(requestMock).toHaveBeenCalledWith({
        method: 'GET',
        path: '/v1/files/existing-file-id',
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
      expect(file?.id).toBe('returned-id');
      expect(file?.filename).toBe('returned-file.mp3');
    });

    it('should return null on 404', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxFilesAPI(mockHttp);

      const file = await api.get('non-existent-id');

      expect(file).toBeNull();
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
        path: '/v1/files/file-to-delete',
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

      const file = new SonioxFile(createMockFileData({ id: 'file-instance-id' }), mockHttp);

      await api.delete(file);

      expect(requestMock).toHaveBeenCalledWith({
        method: 'DELETE',
        path: '/v1/files/file-instance-id',
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
        path: '/v1/files/plain-object-id',
      });
    });

    it('should succeed silently on 404 (idempotent)', async () => {
      const requestMock = jest.fn().mockRejectedValue(createMock404Error());
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxFilesAPI(mockHttp);

      await expect(api.delete('non-existent-id')).resolves.toBeUndefined();
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
      expect(callArgs?.path).toBe('/v1/files');
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

      await expect(api.upload(buffer, { client_reference_id: longRefId })).rejects.toThrow(
        'client_reference_id exceeds maximum length of 256 characters'
      );

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

    describe('stream uploads', () => {
      it('should upload a Web ReadableStream', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: mockUploadResponse,
        });
        const mockHttp = createMockHttpClient(requestMock);
        const api = new SonioxFilesAPI(mockHttp);

        const chunks = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])];
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          },
        });

        const file = await api.upload(stream);

        expect(file).toBeInstanceOf(SonioxFile);
        expect(requestMock).toHaveBeenCalledTimes(1);
      });

      it('should upload a Node.js-style async iterable stream', async () => {
        const requestMock = jest.fn().mockResolvedValue({
          status: 201,
          headers: {},
          data: mockUploadResponse,
        });
        const mockHttp = createMockHttpClient(requestMock);
        const api = new SonioxFilesAPI(mockHttp);

        // Create a mock Node.js-style stream with pipe and async iterator
        const chunks = [Buffer.from([1, 2, 3]), Buffer.from([4, 5, 6])];
        const mockNodeStream = {
          pipe: jest.fn(),
          [Symbol.asyncIterator]: async function* () {
            for (const chunk of chunks) {
              yield chunk;
            }
          },
        };

        const file = await api.upload(mockNodeStream as unknown as NodeJS.ReadableStream);

        expect(file).toBeInstanceOf(SonioxFile);
        expect(requestMock).toHaveBeenCalledTimes(1);
      });

      it('should reject streams with string chunks', async () => {
        const requestMock = jest.fn();
        const mockHttp = createMockHttpClient(requestMock);
        const api = new SonioxFilesAPI(mockHttp);

        // Create a mock stream that yields string chunks
        const mockNodeStream = {
          pipe: jest.fn(),
          [Symbol.asyncIterator]: async function* () {
            yield 'string chunk';
          },
        };

        await expect(api.upload(mockNodeStream as unknown as NodeJS.ReadableStream)).rejects.toThrow(
          'Stream returned string chunks. Use a binary stream'
        );

        expect(requestMock).not.toHaveBeenCalled();
      });
    });

    describe('size limit enforcement', () => {
      it('should reject Blob exceeding MAX_FILE_SIZE', async () => {
        const requestMock = jest.fn();
        const mockHttp = createMockHttpClient(requestMock);
        const api = new SonioxFilesAPI(mockHttp);

        // Create a small Blob but override its size property
        const oversizedBlob = new Blob([new ArrayBuffer(8)]);
        Object.defineProperty(oversizedBlob, 'size', {
          value: 1073741825, // 1 byte over 1GB
        });

        await expect(api.upload(oversizedBlob)).rejects.toThrow(
          'File size (1073741825 bytes) exceeds maximum allowed size (1073741824 bytes)'
        );

        expect(requestMock).not.toHaveBeenCalled();
      });

      it('should reject Uint8Array exceeding MAX_FILE_SIZE', async () => {
        const requestMock = jest.fn();
        const mockHttp = createMockHttpClient(requestMock);
        const api = new SonioxFilesAPI(mockHttp);

        // Create a small Uint8Array but override its length property
        const smallArray = new Uint8Array(8);
        const oversizedArray = Object.create(smallArray, {
          length: { value: 1073741825 },
        });

        await expect(api.upload(oversizedArray)).rejects.toThrow(
          'File size (1073741825 bytes) exceeds maximum allowed size (1073741824 bytes)'
        );

        expect(requestMock).not.toHaveBeenCalled();
      });

      it('should abort Node.js stream early when size exceeds limit', async () => {
        const requestMock = jest.fn();
        const mockHttp = createMockHttpClient(requestMock);
        const api = new SonioxFilesAPI(mockHttp);

        // Track how many chunks were consumed
        let chunksConsumed = 0;

        // Use small actual buffers but mock length to simulate large chunks
        const createLargeChunk = () => {
          const buf = Buffer.alloc(8);
          Object.defineProperty(buf, 'length', { value: 500 * 1024 * 1024 }); // 500MB
          return buf;
        };

        const mockNodeStream = {
          pipe: jest.fn(),
          [Symbol.asyncIterator]: async function* () {
            while (chunksConsumed < 10) {
              chunksConsumed++;
              yield createLargeChunk();
            }
          },
        };

        await expect(api.upload(mockNodeStream as unknown as NodeJS.ReadableStream)).rejects.toThrow(
          'File size exceeds maximum allowed size (1073741824 bytes)'
        );

        // Should abort after 3 chunks (3 * 500MB = 1.5GB > 1GB limit)
        expect(chunksConsumed).toBe(3);
        expect(requestMock).not.toHaveBeenCalled();
      });

      it('should abort Web ReadableStream early when size exceeds limit', async () => {
        const requestMock = jest.fn();
        const mockHttp = createMockHttpClient(requestMock);
        const api = new SonioxFilesAPI(mockHttp);

        // Use small actual arrays but mock length to simulate large chunks
        const createLargeChunk = () => {
          const arr = new Uint8Array(8);
          Object.defineProperty(arr, 'length', { value: 500 * 1024 * 1024 }); // 500MB
          return arr;
        };

        let chunksRead = 0;
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            chunksRead++;
            if (chunksRead <= 10) {
              controller.enqueue(createLargeChunk());
            } else {
              controller.close();
            }
          },
        });

        await expect(api.upload(stream)).rejects.toThrow('File size exceeds maximum allowed size (1073741824 bytes)');

        // Should abort early, not read all 10 chunks
        // (pull-based streams may buffer 1 chunk ahead, so 3-4 is expected)
        expect(chunksRead).toBeLessThanOrEqual(4);
        expect(requestMock).not.toHaveBeenCalled();
      });
    });
  });

  describe('delete_all()', () => {
    it('should delete all files across pages', async () => {
      const requestMock = jest
        .fn()
        // list() call - returns page 1
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: {
            files: [createMockFileData({ id: 'file-1' }), createMockFileData({ id: 'file-2' })],
            next_page_cursor: 'cursor-page-2',
          },
        })
        // delete file-1
        .mockResolvedValueOnce({ status: 204, headers: {}, data: null })
        // delete file-2
        .mockResolvedValueOnce({ status: 204, headers: {}, data: null })
        // pagination - page 2
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: {
            files: [createMockFileData({ id: 'file-3' })],
            next_page_cursor: null,
          },
        })
        // delete file-3
        .mockResolvedValueOnce({ status: 204, headers: {}, data: null });

      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxFilesAPI(mockHttp);

      const result = await api.delete_all();

      expect(result).toBeUndefined();
      expect(requestMock).toHaveBeenCalledTimes(5);
    });

    it('should return undefined when no files exist', async () => {
      const requestMock = jest.fn().mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: { files: [], next_page_cursor: null },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxFilesAPI(mockHttp);

      const result = await api.delete_all();

      expect(result).toBeUndefined();
      // Only the list() call
      expect(requestMock).toHaveBeenCalledTimes(1);
    });

    it('should respect abort signal and stop early', async () => {
      const requestMock = jest.fn().mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {
          files: [createMockFileData({ id: 'file-1' }), createMockFileData({ id: 'file-2' })],
          next_page_cursor: null,
        },
      });
      const mockHttp = createMockHttpClient(requestMock);
      const api = new SonioxFilesAPI(mockHttp);

      const controller = new AbortController();
      controller.abort();

      await expect(api.delete_all({ signal: controller.signal })).rejects.toThrow();
      // Only the list() call, no deletes
      expect(requestMock).toHaveBeenCalledTimes(1);
    });
  });
});
