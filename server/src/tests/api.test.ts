import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { Note } from '../models/Note.js';
import { User } from '../models/User.js';
import { Bookmark } from '../models/Bookmark.js';
import jwt from 'jsonwebtoken';
import { PDFDocument } from 'pdf-lib';
const {
  mockStorageRead,
  mockPrepare,
  mockVision,
  mockAssess,
  mockSuggestMetadata,
  mockSuggestSummary,
  mockSuggestOrder,
  mockGeneratedPdf,
} = vi.hoisted(() => ({
  mockStorageRead: vi.fn(),
  mockPrepare: vi.fn(),
  mockVision: vi.fn(),
  mockAssess: vi.fn(),
  mockSuggestMetadata: vi.fn(),
  mockSuggestSummary: vi.fn(),
  mockSuggestOrder: vi.fn(),
  mockGeneratedPdf: { bytes: null as Buffer | null },
}));
const { mockStorageUploadHook, mockStorageRemove } = vi.hoisted(() => ({
  mockStorageUploadHook: vi.fn(),
  mockStorageRemove: vi.fn(),
}));
vi.mock('../services/ai/document/prepareDocument.js', () => ({ prepareDocument: mockPrepare }));
vi.mock('../services/ai/vision/visionAnalyzer.js', () => ({ extractVisualText: mockVision }));
vi.mock('../services/ai/classification/studyGate.js', async (original) => ({
  ...(await original<typeof import('../services/ai/classification/studyGate.js')>()),
  assessStudyContent: mockAssess,
}));
vi.mock('../services/ai/suggestMetadata.js', () => ({ suggestMetadata: mockSuggestMetadata }));
vi.mock('../services/ai/suggestSummary.js', () => ({ suggestSummary: mockSuggestSummary }));
vi.mock('../services/ai/suggestPageOrder.js', () => ({ suggestPageOrder: mockSuggestOrder }));

vi.mock('../services/storage/cloudinary.js', () => ({
  storage: {
    upload: async (buffer: Buffer, mime: string) => {
      await mockStorageUploadHook(buffer, mime);
      const generated = mime === 'application/pdf' && buffer.length > 100;
      if (generated) mockGeneratedPdf.bytes = buffer;
      return {
        storagePublicId: generated
          ? 'generated.pdf'
          : mime === 'application/pdf'
            ? 'fixture.pdf'
            : 'fixture',
        storageResourceType: mime === 'application/pdf' ? 'raw' : 'image',
        storageProvider: 'cloudinary',
      };
    },
    remove: (...args: unknown[]) => mockStorageRemove(...args),
    read: (...args: unknown[]) =>
      (args[0] as { storagePublicId?: string })?.storagePublicId === 'generated.pdf'
        ? mockGeneratedPdf.bytes
        : mockStorageRead(...args),
  },
}));
let mongo: MongoMemoryReplSet;
let app: any;
const academic = {
  decision: 'academic',
  category: 'Mathematics',
  subject: 'Linear algebra',
  tags: ['eigenvectors'],
  reason: 'Explains eigenvectors.',
  evidence: ['eigenvectors'],
  warnings: [],
};
beforeAll(async () => {
  mockStorageRead.mockImplementation(async (_file: unknown, mime: string) =>
    mime === 'application/pdf' ? pdf : mime === 'image/jpeg' ? jpeg : png,
  );
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongo.getUri('campusnotes_test');
  await mongoose.connect(uri);
  process.env.AI_ENABLED = 'true';
  process.env.GEMINI_API_KEY = 'test-only-mocked-key';
  process.env.GEMINI_MODEL = 'mock-model';
  mockPrepare.mockResolvedValue({
    status: 'text',
    text: 'A lesson about eigenvectors.',
    pageCount: 1,
    warnings: [],
  });
  mockVision.mockResolvedValue({ text: 'A lesson about eigenvectors.', warnings: [] });
  mockAssess.mockResolvedValue(academic);
  mockSuggestMetadata.mockResolvedValue({
    title: 'Linear algebra notes',
    category: 'Mathematics',
    subject: 'Linear algebra',
    topics: ['eigenvectors'],
    keywords: ['eigenvectors'],
    documentType: 'lecture notes',
    instructor: null,
    lectureDate: null,
    description: 'A lesson about eigenvectors.',
    uncertaintyNotes: [],
  });
  mockSuggestOrder.mockImplementation(async (assets: Array<{ id: string }>) => ({
    orderedAssetIds: assets.map((asset) => asset.id).reverse(),
    reasons: [],
    uncertainAssetIds: [],
  }));
  mockSuggestSummary.mockImplementation(async (assets: Array<{ id: string }>) => [
    {
      text: 'The lesson explains eigenvectors.',
      sourceAssetId: assets[0].id,
      excerpt: 'eigenvectors',
    },
    {
      text: 'The notes discuss linear algebra.',
      sourceAssetId: assets[0].id,
      excerpt: 'eigenvectors',
    },
    {
      text: 'The pages cover study examples.',
      sourceAssetId: assets[0].id,
      excerpt: 'eigenvectors',
    },
  ]);
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = 'test-secret-longer-than-thirty-two-characters';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.CLOUDINARY_CLOUD_NAME = 'test';
  process.env.CLOUDINARY_API_KEY = 'test';
  process.env.CLOUDINARY_API_SECRET = 'test';
  app = (await import('../app.js')).default;
  const { User } = await import('../models/User.js');
  const { Note } = await import('../models/Note.js');
  const { Vote } = await import('../models/Vote.js');
  const { NoteRequest } = await import('../models/NoteRequest.js');
  const { Report } = await import('../models/Report.js');
  await Promise.all([
    User.init(),
    Note.init(),
    Vote.init(),
    NoteRequest.init(),
    Report.init(),
    Bookmark.init(),
  ]);
}, 180000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  mockGeneratedPdf.bytes = null;
  mockStorageUploadHook.mockReset().mockResolvedValue(undefined);
  mockStorageRemove.mockReset().mockResolvedValue(undefined);
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
  mockStorageRead
    .mockReset()
    .mockImplementation(async (_file: unknown, mime: string) =>
      mime === 'application/pdf' ? pdf : mime === 'image/jpeg' ? jpeg : png,
    );
  mockPrepare.mockReset().mockResolvedValue({
    status: 'text',
    text: 'A lesson about eigenvectors.',
    pageCount: 1,
    warnings: [],
  });
  mockVision.mockReset().mockResolvedValue({ text: 'A lesson about eigenvectors.', warnings: [] });
  mockAssess.mockReset().mockResolvedValue(academic);
  mockSuggestMetadata.mockReset().mockResolvedValue({
    title: 'Linear algebra notes',
    category: 'Mathematics',
    subject: 'Linear algebra',
    topics: ['eigenvectors'],
    keywords: ['eigenvectors'],
    documentType: 'lecture notes',
    instructor: null,
    lectureDate: null,
    description: 'A lesson about eigenvectors.',
    uncertaintyNotes: [],
  });
  mockSuggestOrder.mockReset().mockImplementation(async (assets: Array<{ id: string }>) => ({
    orderedAssetIds: assets.map((asset) => asset.id).reverse(),
    reasons: [],
    uncertainAssetIds: [],
  }));
  mockSuggestSummary.mockReset().mockImplementation(async (assets: Array<{ id: string }>) => [
    {
      text: 'The lesson explains eigenvectors.',
      sourceAssetId: assets[0].id,
      excerpt: 'eigenvectors',
    },
    {
      text: 'The notes discuss linear algebra.',
      sourceAssetId: assets[0].id,
      excerpt: 'eigenvectors',
    },
    {
      text: 'The pages cover study examples.',
      sourceAssetId: assets[0].id,
      excerpt: 'eigenvectors',
    },
  ]);
});
const origin = (r: any) => r.set('Origin', 'http://localhost:5173');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=',
  'base64',
);
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

let requestSequence = 1;
function hit(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, user?: any) {
  const call = request(app)
    [method]('/api' + path)
    .set('Origin', 'http://localhost:5173')
    .set('X-Forwarded-For', `192.0.2.${(requestSequence++ % 250) + 1}`);
  if (user)
    call.set(
      'Cookie',
      `campusnotes_session=${jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET!)}`,
    );
  return call;
}
async function actor(role: 'student' | 'moderator' = 'student') {
  return User.create({
    name: 'Test student',
    email: `${new mongoose.Types.ObjectId()}@example.test`,
    passwordHash: 'not-used-for-test-auth',
    role,
  });
}
async function privateNote(user: any, extra: Record<string, unknown> = {}) {
  return Note.create({
    title: 'Study fixture',
    originalFilename: 'notes.png',
    fileType: 'image/png',
    fileSize: png.length,
    storageProvider: 'cloudinary',
    storagePublicId: 'fixture',
    storageResourceType: 'image',
    uploadedBy: user._id,
    studyGateStatus: 'pending',
    ...extra,
  });
}

describe('Study gate integration and publication boundaries', () => {
  it('fails closed for every nonapproved status across discovery, detail, file and contributions', async () => {
    const owner = await actor(),
      other = await actor();
    for (const status of [
      'pending',
      'rejected',
      'needs_review',
      'failed',
      'legacy_unreviewed',
      'missing',
    ]) {
      const note = await privateNote(owner, {
        studyGateStatus: status === 'missing' ? 'pending' : status,
      });
      if (status === 'missing')
        await Note.collection.updateOne({ _id: note._id }, { $unset: { studyGateStatus: '' } });
      expect((await hit('get', `/notes/${note.id}`)).status).toBe(404);
      expect((await hit('get', `/notes/${note.id}/file?download=1`, other)).status).toBe(404);
      expect((await hit('get', `/notes/${note.id}`, owner)).status).toBe(200);
      expect((await hit('get', `/notes/${note.id}/file`, owner)).status).toBe(200);
      expect((await hit('post', `/notes/${note.id}/vote`, other).send({ value: 1 })).status).toBe(
        404,
      );
      expect(
        (await hit('post', `/notes/${note.id}/report`, other).send({ reason: 'spam' })).status,
      ).toBe(404);
      expect((await hit('put', `/notes/${note.id}/bookmark`, other)).status).toBe(404);
      const publicNotes = (await hit('get', '/notes?limit=30')).body.data.items;
      expect(publicNotes.some((n: any) => n.id === note.id)).toBe(false);
    }
    expect((await hit('get', '/users/me/profile', owner)).body.data.points).toBe(0);
  });
  it('keeps processing and status endpoints owner-only', async () => {
    const owner = await actor(),
      other = await actor();
    const note = await privateNote(owner);
    expect((await hit('post', `/notes/${note.id}/ai-process`)).status).toBe(401);
    expect((await hit('post', `/notes/${note.id}/ai-process`, other)).status).toBe(403);
    expect((await hit('get', `/notes/${note.id}/ai-status`, other)).status).toBe(403);
    expect((await hit('get', '/notes/not-an-id/ai-status', owner)).status).toBe(400);
  });
  it.each([
    ['academic', 'approved'],
    ['non_academic', 'rejected'],
    ['review', 'needs_review'],
  ])('persists %s as %s and gates original access', async (decision, status) => {
    const owner = await actor();
    const note = await privateNote(owner);
    mockAssess.mockResolvedValueOnce(
      decision === 'academic'
        ? academic
        : {
            decision,
            category: null,
            subject: null,
            tags: [],
            reason: 'Test-safe explanation.',
            evidence: decision === 'non_academic' ? ['Retail receipt'] : [],
            warnings: [],
          },
    );
    const response = await hit('post', `/notes/${note.id}/ai-process`, owner);
    expect(response.status).toBe(200);
    expect(response.body.data.studyGateStatus).toBe(status);
    expect((await Note.findById(note.id))?.studyGateStatus).toBe(status);
    expect((await hit('get', `/notes/${note.id}/file`)).status).toBe(
      status === 'approved' ? 200 : 404,
    );
    expect(
      (await hit('get', `/notes/${note.id}/ai-status`, owner)).body.data.assessment.decision,
    ).toBe(decision);
  });
  it('preserves manual fields until the owner explicitly accepts metadata suggestions', async () => {
    const owner = await actor();
    const note = await privateNote(owner, { subject: 'My subject', tags: ['my-topic'] });
    await hit('post', `/notes/${note.id}/ai-process`, owner);
    expect((await Note.findById(note.id))?.subject).toBe('My subject');
    const result = await hit('post', `/notes/${note.id}/apply-suggestions`, owner);
    expect(result.body.data.subject).toBe(academic.subject);
    expect(result.body.data.metadataSource).toBe('ai_reviewed');
  });
  it('routes images to vision and sends incomplete transcription for review', async () => {
    const owner = await actor();
    const note = await privateNote(owner);
    mockPrepare.mockResolvedValueOnce({
      status: 'vision_required',
      text: null,
      pageCount: null,
      warnings: [],
    });
    mockVision.mockResolvedValueOnce({
      text: 'incomplete fragment',
      warnings: ['Some content could not be read clearly.'],
    });
    const before = mockAssess.mock.calls.length;
    expect(
      (await hit('post', `/notes/${note.id}/ai-process`, owner)).body.data.studyGateStatus,
    ).toBe('needs_review');
    expect(mockAssess.mock.calls.length).toBe(before);
  });
  it.each(['storage', 'parser', 'provider', 'schema'])(
    'records %s failure without rejection or losing the original',
    async (stage) => {
      const owner = await actor();
      const note = await privateNote(owner);
      if (stage === 'storage')
        mockStorageRead.mockRejectedValueOnce(new Error('secret storage token'));
      if (stage === 'parser') mockPrepare.mockRejectedValueOnce(new Error('secret parser input'));
      if (stage === 'provider') mockAssess.mockRejectedValueOnce(new Error('secret provider key'));
      if (stage === 'schema')
        mockAssess.mockResolvedValueOnce({ decision: 'academic', reason: 'invalid' });
      const result = await hit('post', `/notes/${note.id}/ai-process`, owner);
      expect(result.body.data.studyGateStatus).toBe('failed');
      expect(result.body.data.processingError).toContain(
        stage === 'parser'
          ? '[document/'
          : stage === 'provider' || stage === 'schema'
            ? '[classification/'
            : '[storage/',
      );
      const refreshed = await hit('get', `/notes/${note.id}/ai-status`, owner);
      expect(refreshed.body.data.processingError).toBe(result.body.data.processingError);
      const detail = await hit('get', `/notes/${note.id}`, owner);
      expect(detail.body.data.processingError).toBe(result.body.data.processingError);
      expect(JSON.stringify(result.body)).not.toContain('secret');
      expect((await Note.findById(note.id))?.storagePublicId).toBe('fixture');
      expect((await hit('get', `/notes/${note.id}/file`)).status).toBe(404);
    },
  );
  it('rejects overlapping processing and discards a superseded result', async () => {
    const owner = await actor();
    const note = await privateNote(owner);
    let finish!: (value: unknown) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    mockAssess.mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const first = hit('post', `/notes/${note.id}/ai-process`, owner).then((r) => r);
    await started;
    try {
      expect((await hit('post', `/notes/${note.id}/ai-process`, owner)).status).toBe(429);
      await Note.updateOne(
        { _id: note.id },
        {
          $inc: { studyGateInputVersion: 1 },
          $set: {
            studyGateAttemptId: 'new-attempt',
            studyGateStatus: 'needs_review',
            processingStatus: 'completed',
          },
        },
      );
    } finally {
      finish(academic);
    }
    expect((await first).status).toBe(409);
    expect((await Note.findById(note.id))?.studyGateStatus).toBe('needs_review');
  });
  it('recovers interrupted attempts and allows retry', async () => {
    const owner = await actor();
    const note = await privateNote(owner, {
      processingStatus: 'pending',
      studyGateExpiresAt: new Date(Date.now() - 1000),
      studyGateAttemptId: 'crashed',
    });
    expect((await hit('get', `/notes/${note.id}/ai-status`, owner)).body.data.studyGateStatus).toBe(
      'failed',
    );
    expect(
      (await hit('post', `/notes/${note.id}/ai-process`, owner)).body.data.studyGateStatus,
    ).toBe('approved');
  });
  it('supports human review while AI is disabled, without self-approval', async () => {
    const owner = await actor('moderator'),
      reviewer = await actor('moderator'),
      outsider = await actor();
    const note = await privateNote(owner);
    process.env.AI_ENABLED = 'false';
    try {
      expect((await hit('post', `/notes/${note.id}/ai-process`, owner)).body.error.code).toBe(
        'AI_NOT_CONFIGURED',
      );
    } finally {
      process.env.AI_ENABLED = 'true';
    }
    expect((await hit('post', `/notes/${note.id}/request-review`, owner)).status).toBe(200);
    expect((await hit('get', `/notes/${note.id}/file`, reviewer)).status).toBe(200);
    expect((await hit('get', '/admin/study-reviews', outsider)).status).toBe(403);
    expect(
      (
        await hit('patch', `/admin/study-reviews/${note.id}`, owner).send({
          decision: 'approved',
          reason: 'Reviewed the original.',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await hit('patch', `/admin/study-reviews/${note.id}`, reviewer).send({
          decision: 'approved',
          reason: 'Reviewed the original study content.',
        })
      ).status,
    ).toBe(200);
    expect((await hit('get', `/notes/${note.id}/file`)).status).toBe(200);
    expect((await Note.findById(note.id))?.reviewedBy?.toString()).toBe(reviewer.id);
  });
  it('persists account-specific bookmarks idempotently and removes unavailable notes from the collection', async () => {
    const owner = await actor(),
      reader = await actor();
    const note = await privateNote(owner, { studyGateStatus: 'approved' });
    expect((await hit('put', `/notes/${note.id}/bookmark`, reader)).status).toBe(200);
    expect((await hit('put', `/notes/${note.id}/bookmark`, reader)).status).toBe(200);
    expect((await hit('get', '/users/me/saved-notes', reader)).body.data).toHaveLength(1);
    expect((await hit('get', '/users/me/saved-notes', owner)).body.data).toHaveLength(0);
    await Note.updateOne({ _id: note.id }, { $set: { studyGateStatus: 'rejected' } });
    expect((await hit('get', '/users/me/saved-notes', reader)).body.data).toHaveLength(0);
    expect((await hit('delete', `/notes/${note.id}/bookmark`, reader)).status).toBe(200);
    expect(await Bookmark.countDocuments({ user: reader._id })).toBe(0);
  });
  it('does not fulfill a request with a private note', async () => {
    const owner = await actor(),
      reader = await actor();
    const note = await privateNote(owner);
    const created = await hit('post', '/requests', reader).send({
      title: 'Need biology notes',
      subject: 'Biology',
    });
    expect(
      (
        await hit('patch', `/requests/${created.body.data.id}/fulfill`, owner).send({
          noteId: note.id,
        })
      ).status,
    ).toBe(404);
  });
});

describe('CampusNotes API', () => {
  it('runs the authenticated student and moderator journey with persisted data', async () => {
    const alice = request.agent(app),
      bob = request.agent(app),
      moderator = request.agent(app);
    const registration = await origin(alice.post('/api/auth/register')).send({
      name: 'Alice Student',
      email: 'alice@example.test',
      password: 'StrongPass123',
    });
    expect(registration.status).toBe(201);
    expect(registration.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(
      (
        await origin(bob.post('/api/auth/register')).send({
          name: 'Bob Student',
          email: 'bob@example.test',
          password: 'StrongPass123',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await origin(request(app).post('/api/auth/register')).send({
          name: 'Other',
          email: 'alice@example.test',
          password: 'StrongPass123',
        })
      ).body.error.code,
    ).toBe('EMAIL_EXISTS');
    expect(
      (
        await origin(request(app).post('/api/auth/login')).send({
          email: 'alice@example.test',
          password: 'wrong',
        })
      ).status,
    ).toBe(401);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await alice.get('/api/auth/me')).body.data.name).toBe('Alice Student');
    expect((await request(app).post('/api/notes')).status).toBe(403);
    const invalid = await origin(alice.post('/api/notes')).attach(
      'files',
      Buffer.from('not a pdf'),
      'fake.pdf',
    );
    expect(invalid.status).toBe(400);
    const malformedPdf = await origin(alice.post('/api/notes')).attach(
      'files',
      Buffer.from('%PDF-1.7 this file has no end marker'),
      'broken.pdf',
    );
    expect(malformedPdf.status).toBe(400);
    const empty = await origin(alice.post('/api/notes')).attach(
      'files',
      Buffer.alloc(0),
      'empty.pdf',
    );
    expect(empty.status).toBe(400);
    const oversized = await origin(alice.post('/api/notes')).attach(
      'files',
      Buffer.alloc(10 * 1024 * 1024 + 1),
      'large.pdf',
    );
    expect(oversized.status).toBe(400);
    expect(
      (
        await origin(alice.post('/api/notes')).attach('files', png, {
          filename: 'wrong.pdf',
          contentType: 'image/png',
        })
      ).status,
    ).toBe(400);
    const uploaded = await origin(alice.post('/api/notes')).attach('files', png, {
      filename: 'linear-algebra.png',
      contentType: 'image/png',
    });
    expect(uploaded.status).toBe(201);
    const noteId = uploaded.body.data[0].id;
    expect(uploaded.body.data[0].title).toBe('linear algebra');
    expect(uploaded.body.data[0].processingStatus).toBe('not_requested');
    expect(uploaded.body.data[0].studyGateStatus).toBe('pending');
    expect((await request(app).get('/api/notes?limit=5')).body.data.total).toBe(0);
    expect((await request(app).get('/api/notes/' + noteId + '/file')).status).toBe(404);
    expect(
      (await origin(alice.post('/api/notes/' + noteId + '/ai-process'))).body.data.studyGateStatus,
    ).toBe('pending');
    expect(
      (await origin(alice.post('/api/notes/' + noteId + '/ai-process'))).body.data.studyGateStatus,
    ).toBe('approved');
    expect(
      (await origin(alice.post('/api/notes/' + noteId + '/ai-process'))).body.data.processingStatus,
    ).toBe('completed');
    expect((await request(app).get('/api/notes?limit=5')).body.data.total).toBe(0);
    expect(
      (await alice.get('/api/users/me/notes')).body.data.map((note: any) => note.id),
    ).toContain(uploaded.body.data[0].id);
    expect(
      (await origin(bob.patch('/api/notes/' + noteId)).send({ subject: 'Physics' })).status,
    ).toBe(403);
    const corrected = await origin(alice.patch('/api/notes/' + noteId)).send({
      subject: 'Mathematics',
      tags: ['eigenvectors'],
      instructor: 'Dr Rao',
    });
    expect(corrected.body.data.subject).toBe('Mathematics');
    expect(corrected.body.data.title).toBe('linear algebra');
    expect(
      (
        await origin(alice.post('/api/notes/' + noteId + '/publish')).send({
          publishConfirmed: true,
          sharingRightsConfirmed: true,
          personalInfoChecked: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get('/api/notes?subject=Mathematics&tag=eigenvectors&instructor=Rao'))
        .body.data.total,
    ).toBe(1);
    expect((await request(app).get('/api/notes?q=algebra')).body.data.total).toBe(1);
    expect((await request(app).get('/api/notes?date=2026-02-30')).status).toBe(400);
    expect(
      (await origin(alice.post('/api/notes/' + noteId + '/vote')).send({ value: 1 })).body.error
        .code,
    ).toBe('SELF_VOTE');
    const simultaneous = await Promise.all(
      [1, 2, 3].map(() => origin(bob.post('/api/notes/' + noteId + '/vote')).send({ value: 1 })),
    );
    expect(simultaneous.every((r) => r.status === 200)).toBe(true);
    expect(simultaneous.at(-1)?.body.data.score).toBe(1);
    expect(
      (await origin(bob.post('/api/notes/' + noteId + '/vote')).send({ value: 1 })).body.data
        .upvoteCount,
    ).toBe(1);
    expect((await alice.get('/api/users/me/profile')).body.data.points).toBe(7);
    expect(
      (await origin(bob.post('/api/notes/' + noteId + '/vote')).send({ value: -1 })).body.data
        .score,
    ).toBe(-1);
    expect((await alice.get('/api/users/me/profile')).body.data.points).toBe(5);
    expect((await origin(bob.delete('/api/notes/' + noteId + '/vote'))).body.data.score).toBe(0);
    expect((await alice.get('/api/users/me/profile')).body.data.badges).toContain(
      'First Contribution',
    );
    for (let i = 0; i < 5; i++) {
      const created = await origin(bob.post('/api/requests')).send({
        title: `Lecture ${i + 1}`,
        subject: 'Mathematics',
      });
      expect(created.status).toBe(201);
      if (i === 0)
        expect(
          (
            await origin(bob.post('/api/requests')).send({
              title: 'lecture 1',
              subject: 'mathematics',
            })
          ).status,
        ).toBe(409);
      const fulfilled = await origin(
        alice.patch('/api/requests/' + created.body.data.id + '/fulfill'),
      ).send({ noteId });
      expect(fulfilled.status).toBe(200);
      expect(
        (
          await origin(alice.patch('/api/requests/' + created.body.data.id + '/fulfill')).send({
            noteId,
          })
        ).status,
      ).toBe(409);
    }
    expect((await alice.get('/api/users/me/profile')).body.data.points).toBe(55);
    expect((await alice.get('/api/users/me/profile')).body.data.badges).toContain(
      'Community Helper',
    );
    expect(
      (
        await origin(bob.post('/api/notes/' + noteId + '/report')).send({
          reason: 'misleading_metadata',
        })
      ).status,
    ).toBe(201);
    expect(
      (await origin(bob.post('/api/notes/' + noteId + '/report')).send({ reason: 'spam' })).body
        .error.code,
    ).toBe('ALREADY_REPORTED');
    expect((await bob.get('/api/admin/reports')).status).toBe(403);
    const { User } = await import('../models/User.js');
    const bcrypt = (await import('bcryptjs')).default;
    await User.create({
      name: 'Moderator',
      email: 'mod@example.test',
      passwordHash: await bcrypt.hash('StrongPass123', 10),
      role: 'moderator',
    });
    expect(
      (
        await origin(moderator.post('/api/auth/login')).send({
          email: 'mod@example.test',
          password: 'StrongPass123',
        })
      ).status,
    ).toBe(200);
    const reports = await moderator.get('/api/admin/reports');
    expect(reports.body.data).toHaveLength(1);
    expect(
      (
        await origin(moderator.patch('/api/admin/reports/' + reports.body.data[0].id)).send({
          status: 'resolved',
        })
      ).status,
    ).toBe(200);
    expect(
      (await origin(alice.post('/api/notes/' + noteId + '/ai-process'))).body.data.studyGateStatus,
    ).toBe('approved');
    expect((await origin(bob.delete('/api/notes/' + noteId))).status).toBe(403);
    expect((await origin(alice.delete('/api/notes/' + noteId))).body.error.code).toBe(
      'NOTE_IN_USE',
    );
    const preview = await request(app).get('/api/notes/' + noteId + '/file');
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toContain('image/png');
    expect(preview.headers['content-disposition']).toContain('inline');
    expect(preview.headers['x-content-type-options']).toBe('nosniff');
    const download = await request(app).get('/api/notes/' + noteId + '/file?download=1');
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['content-disposition']).toContain('linear-algebra.png');
    expect(Buffer.from(download.body)).toEqual(png);
    const pdfUpload = await origin(alice.post('/api/notes')).attach('files', pdf, {
      filename: 'lecture notes.pdf',
      contentType: 'application/pdf',
    });
    expect(pdfUpload.status).toBe(201);
    for (let step = 0; step < 3; step++)
      await origin(alice.post('/api/notes/' + pdfUpload.body.data[0].id + '/ai-process'));
    await origin(alice.patch('/api/notes/' + pdfUpload.body.data[0].id)).send({
      subject: 'Mathematics',
    });
    await origin(alice.post('/api/notes/' + pdfUpload.body.data[0].id + '/publish')).send({
      publishConfirmed: true,
      sharingRightsConfirmed: true,
      personalInfoChecked: true,
    });
    const pdfPreview = await request(app).get(`/api/notes/${pdfUpload.body.data[0].id}/file`);
    expect(pdfPreview.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdfPreview.body)).toEqual(pdf);
    const jpgUpload = await origin(alice.post('/api/notes')).attach('files', jpeg, {
      filename: 'scan (final).jpg',
      contentType: 'image/jpeg',
    });
    expect(jpgUpload.status).toBe(201);
    for (let step = 0; step < 3; step++)
      await origin(alice.post('/api/notes/' + jpgUpload.body.data[0].id + '/ai-process'));
    await origin(alice.patch('/api/notes/' + jpgUpload.body.data[0].id)).send({
      subject: 'Mathematics',
    });
    await origin(alice.post('/api/notes/' + jpgUpload.body.data[0].id + '/publish')).send({
      publishConfirmed: true,
      sharingRightsConfirmed: true,
      personalInfoChecked: true,
    });
    const jpgDownload = await request(app).get(
      `/api/notes/${jpgUpload.body.data[0].id}/file?download=1`,
    );
    expect(jpgDownload.headers['content-type']).toContain('image/jpeg');
    expect(jpgDownload.headers['content-disposition']).toContain('scan%20%28final%29.jpg');
    expect(Buffer.from(jpgDownload.body)).toEqual(jpeg);
    expect((await request(app).get('/api/notes?q=lecture')).body.data.total).toBe(1);
    const pagedNotes = await request(app).get('/api/notes?limit=1&page=3&sort=score');
    expect(pagedNotes.body.data.total).toBe(3);
    expect(pagedNotes.body.data.pages).toBe(3);
    expect(pagedNotes.body.data.items).toHaveLength(1);
    mockStorageRead.mockRejectedValueOnce(new Error('401 deny or ACL failure'));
    const failedProviderRead = await request(app).get('/api/notes/' + noteId + '/file');
    expect(failedProviderRead.status).toBe(502);
    expect(failedProviderRead.headers.location).toBeUndefined();
    expect(failedProviderRead.body.error.code).toBe('FILE_UNAVAILABLE');
    expect(JSON.stringify(failedProviderRead.body)).not.toContain('ACL');
    const expendable = await origin(alice.post('/api/notes')).attach('files', png, {
      filename: 'temporary.png',
      contentType: 'image/png',
    });
    expect(expendable.status).toBe(201);
    expect((await origin(alice.delete('/api/notes/' + expendable.body.data[0].id))).status).toBe(
      200,
    );
    expect((await request(app).get('/api/notes/' + expendable.body.data[0].id)).status).toBe(404);
    expect((await origin(alice.post('/api/auth/logout'))).status).toBe(200);
    expect((await alice.get('/api/auth/me')).status).toBe(401);
  });
});

describe('Grouped smart notes', () => {
  it('rejects mixed PDF/image groups before storage and cleans up partial storage failures', async () => {
    const owner = await actor();
    const mixed = await hit('post', '/notes', owner)
      .attach('files', pdf, 'notes.pdf')
      .attach('files', png, 'page.png');
    expect(mixed.status).toBe(400);
    expect(mixed.body.error.code).toBe('MIXED_FILES');
    expect(mockStorageUploadHook).not.toHaveBeenCalled();
    mockStorageUploadHook
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cloudinary unavailable'));
    const failed = await hit('post', '/notes', owner)
      .attach('files', png, 'one.png')
      .attach('files', png, 'two.png');
    expect(failed.status).toBe(503);
    expect(await Note.countDocuments({ uploadedBy: owner._id })).toBe(0);
    expect(mockStorageRemove).toHaveBeenCalledTimes(1);
  });

  it('enables Groq without Gemini and persists safe, owner-only grouped-upload diagnostics', async () => {
    const originalEnv = { ...process.env };
    try {
      process.env.AI_PROVIDER = 'groq';
      process.env.GROQ_API_KEY = 'test-only-groq-key';
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_MODEL;
      const owner = await actor();
      expect((await hit('get', '/ai/capabilities', owner)).body.data.enabled).toBe(true);
      const upload = await hit('post', '/notes', owner).attach('files', png, 'notes.png');
      const noteId = upload.body.data[0].id;
      mockPrepare.mockResolvedValueOnce({ status: 'vision_required', text: null, warnings: [] });
      mockVision.mockRejectedValueOnce({
        code: 'RATE_LIMITED',
        message: 'secret key and private source',
      });
      const failed = (await hit('post', `/notes/${noteId}/ai-process`, owner)).body.data;
      expect(failed.studyGateStatus).toBe('failed');
      expect(failed.processingError).toContain('[vision/RATE_LIMITED]');
      expect(failed.processingError).not.toMatch(/secret|private source|Gemini/);
      expect(
        (await hit('get', `/notes/${noteId}/ai-status`, owner)).body.data.processingError,
      ).toBe(failed.processingError);
      expect((await hit('get', `/notes/${noteId}/ai-status`, await actor())).status).toBe(403);
      expect(mockAssess).not.toHaveBeenCalled();
      delete process.env.GROQ_API_KEY;
      expect((await hit('get', '/ai/capabilities', owner)).body.data.enabled).toBe(false);
    } finally {
      for (const key of ['AI_PROVIDER', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL']) {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
      }
    }
  });

  it('retries failed metadata without repeating completed document extraction or screening', async () => {
    const owner = await actor();
    const upload = await hit('post', '/notes', owner).attach('files', png, 'notes.png');
    const noteId = upload.body.data[0].id;
    await hit('post', `/notes/${noteId}/ai-process`, owner);
    await hit('post', `/notes/${noteId}/ai-process`, owner);
    mockSuggestMetadata.mockRejectedValueOnce(new Error('provider unavailable'));
    const failed = await hit('post', `/notes/${noteId}/ai-process`, owner);
    expect(failed.body.data.studyGateStatus).toBe('approved');
    expect(failed.body.data.processingStatus).toBe('completed');
    expect((await hit('get', `/notes/${noteId}`, owner)).body.data.aiMetadata).toBeNull();
    const retried = await hit('post', `/notes/${noteId}/ai-process`, owner);
    expect(retried.body.data.processingStatus).toBe('completed');
    expect((await hit('get', `/notes/${noteId}`, owner)).body.data.aiMetadata.title).toBe(
      'Linear algebra notes',
    );
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockAssess).toHaveBeenCalledTimes(1);
  });

  it('suggests order without applying it, then generates and serves a verified PDF and editable summary', async () => {
    const owner = await actor();
    const upload = await hit('post', '/notes', owner)
      .attach('files', png, 'first.png')
      .attach('files', png, 'second.png');
    expect(upload.status).toBe(201);
    const noteId = upload.body.data[0].id;
    const [first, second] = upload.body.data[0].assets;
    for (let step = 0; step < 4; step++) await hit('post', `/notes/${noteId}/ai-process`, owner);
    const suggested = await hit('post', `/notes/${noteId}/suggest-order`, owner);
    expect(suggested.status).toBe(200);
    expect(suggested.body.data.aiPageOrder.orderedAssetIds).toEqual([second.id, first.id]);
    expect(suggested.body.data.assets.every((asset: any) => asset.confirmedPosition === null)).toBe(
      true,
    );
    expect((await hit('post', `/notes/${noteId}/generate-pdf`, owner)).body.error.code).toBe(
      'ORDER_REQUIRED',
    );
    const confirmed = await hit('post', `/notes/${noteId}/confirm-order`, owner).send({
      orderedAssetIds: [second.id, first.id],
    });
    expect(confirmed.status).toBe(200);
    const generated = await hit('post', `/notes/${noteId}/generate-pdf`, owner);
    expect(generated.status).toBe(200);
    expect(generated.body.data.generatedPdfUrl).toBe(`/notes/${noteId}/generated-pdf`);
    const download = await hit('get', `/notes/${noteId}/generated-pdf`, owner);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect((await PDFDocument.load(Buffer.from(download.body))).getPageCount()).toBe(2);
    expect(
      (
        await hit('post', `/notes/${noteId}/confirm-order`, owner).send({
          orderedAssetIds: [first.id, second.id],
        })
      ).body.error.code,
    ).toBe('ORDER_LOCKED');
    const summarized = await hit('post', `/notes/${noteId}/generate-summary`, owner);
    expect(summarized.status).toBe(200);
    expect(summarized.body.data.studySummary).toContain('eigenvectors');
    expect(summarized.body.data.summarySources).toHaveLength(3);
    const reviewed = await hit('patch', `/notes/${noteId}/review`, owner).send({
      title: 'Linear algebra',
      subject: 'Mathematics',
      studySummary: 'My corrected summary.',
    });
    expect(reviewed.body.data.studySummary).toBe('My corrected summary.');
    expect(
      (await hit('post', `/notes/${noteId}/generate-summary`, owner)).body.data.studySummary,
    ).toBe('My corrected summary.');
    const report = await hit('get', `/notes/${noteId}/ai-report`, owner);
    expect(report.body.data.pdfReady).toBe(true);
    expect(report.body.data.summaryReady).toBe(true);
    expect(
      report.body.data.events.some(
        (event: any) => event.step === 'page_order' && event.status === 'suggested',
      ),
    ).toBe(true);
    expect(
      (
        await hit('post', `/notes/${noteId}/publish`, owner).send({
          publishConfirmed: true,
          sharingRightsConfirmed: true,
          personalInfoChecked: true,
        })
      ).status,
    ).toBe(200);
    expect((await hit('get', `/notes/${noteId}/generated-pdf`)).status).toBe(200);
  });

  it('keeps a multi-image upload private until processing, review, order confirmation and publication', async () => {
    const owner = await actor(),
      reader = await actor();
    mockPrepare.mockResolvedValue({
      status: 'vision_required',
      text: null,
      pageCount: null,
      warnings: [],
    });
    const submissionKey = 'd08d3e32-d82e-4c72-918d-697d97370f72';
    const upload = () =>
      hit('post', '/notes', owner)
        .field('submissionKey', submissionKey)
        .attach('files', png, { filename: 'page-two.png', contentType: 'image/png' })
        .attach('files', jpeg, { filename: 'page-one.jpg', contentType: 'image/jpeg' });
    const first = await upload();
    expect(first.status).toBe(201);
    expect(first.body.data).toHaveLength(1);
    const noteId = first.body.data[0].id;
    const assets = first.body.data[0].assets;
    expect(assets).toHaveLength(2);
    expect((await upload()).body.data[0].id).toBe(noteId);
    const conflicting = await hit('post', '/notes', owner)
      .field('submissionKey', submissionKey)
      .field('title', 'Different content')
      .attach('files', png, { filename: 'page-two.png', contentType: 'image/png' })
      .attach('files', jpeg, { filename: 'page-one.jpg', contentType: 'image/jpeg' });
    expect(conflicting.body.error.code).toBe('SUBMISSION_CONFLICT');
    expect(await Note.countDocuments({ uploadedBy: owner._id })).toBe(1);
    expect((await hit('get', `/notes/${noteId}`, reader)).status).toBe(404);
    expect((await hit('get', `/notes/${noteId}/assets/${assets[1].id}/file`, reader)).status).toBe(
      404,
    );

    expect(
      (await hit('post', `/notes/${noteId}/ai-process`, owner)).body.data.processingStatus,
    ).toBe('pending');
    expect(
      (await hit('post', `/notes/${noteId}/ai-process`, owner)).body.data.processingStatus,
    ).toBe('pending');
    expect(
      (await hit('post', `/notes/${noteId}/ai-process`, owner)).body.data.studyGateStatus,
    ).toBe('approved');
    expect(
      (await hit('post', `/notes/${noteId}/ai-process`, owner)).body.data.processingStatus,
    ).toBe('completed');
    expect(mockVision).toHaveBeenCalledTimes(2);
    expect((await hit('get', `/notes/${noteId}`, reader)).status).toBe(404);
    expect(
      (
        await hit('post', `/notes/${noteId}/publish`, owner).send({
          publishConfirmed: true,
          sharingRightsConfirmed: true,
          personalInfoChecked: true,
          acknowledgeNoPdf: true,
        })
      ).body.error.code,
    ).toBe('METADATA_REQUIRED');
    expect(
      (
        await hit('post', `/notes/${noteId}/confirm-order`, owner).send({
          orderedAssetIds: [assets[0].id, assets[0].id],
        })
      ).body.error.code,
    ).toBe('INVALID_ORDER');
    expect(
      (
        await hit('post', `/notes/${noteId}/confirm-order`, owner).send({
          orderedAssetIds: [assets[1].id, assets[0].id],
        })
      ).status,
    ).toBe(200);
    const saved = await hit('patch', `/notes/${noteId}/review`, owner).send({
      title: 'Java OOP notes',
      subject: 'Computer Science',
      tags: ['Java', 'OOP'],
      description: 'Inheritance and classes',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.aiMetadata.title).toBe('Linear algebra notes');
    expect(
      (
        await hit('post', `/notes/${noteId}/publish`, owner).send({
          publishConfirmed: true,
          sharingRightsConfirmed: true,
          personalInfoChecked: true,
        })
      ).body.error.code,
    ).toBe('PDF_ACK_REQUIRED');
    expect(
      (
        await hit('post', `/notes/${noteId}/publish`, owner).send({
          publishConfirmed: true,
          sharingRightsConfirmed: true,
          personalInfoChecked: true,
          acknowledgeNoPdf: true,
        })
      ).status,
    ).toBe(200);
    expect((await hit('get', '/notes?q=Java')).body.data.total).toBe(1);
    const page = await hit('get', `/notes/${noteId}/assets/${assets[1].id}/file`, reader);
    expect(page.status).toBe(200);
    expect(Buffer.from(page.body)).toEqual(jpeg);
    const report = await hit('get', `/notes/${noteId}/ai-report`, owner);
    expect(report.body.data.fileCount).toBe(2);
    expect(report.body.data.pageOrderConfirmed).toBe(true);
    expect(report.body.data.pdfReady).toBe(false);
    expect((await hit('get', `/notes/${noteId}/ai-report`, reader)).status).toBe(403);

    const wanted = await hit('post', '/requests', reader).send({
      title: 'Java OOP',
      subject: 'Computer Science',
    });
    expect(
      (await hit('patch', `/requests/${wanted.body.data.id}/fulfill`, owner).send({ noteId }))
        .status,
    ).toBe(200);
    expect(
      (await hit('patch', `/requests/${wanted.body.data.id}/fulfill`, owner).send({ noteId }))
        .status,
    ).toBe(409);
  });

  it('holds a non-academic upload and an unreadable image out of public discovery', async () => {
    const owner = await actor();
    const receipt = await hit('post', '/notes', owner).attach('files', png, 'receipt.png');
    mockAssess.mockResolvedValueOnce({
      decision: 'non_academic',
      category: null,
      subject: null,
      tags: [],
      reason: 'A retail receipt.',
      evidence: ['receipt'],
      warnings: [],
    });
    await hit('post', `/notes/${receipt.body.data[0].id}/ai-process`, owner);
    expect(
      (await hit('post', `/notes/${receipt.body.data[0].id}/ai-process`, owner)).body.data
        .studyGateStatus,
    ).toBe('rejected');
    expect((await hit('get', `/notes/${receipt.body.data[0].id}`)).status).toBe(404);
    expect(
      (
        await hit('post', `/notes/${receipt.body.data[0].id}/publish`, owner).send({
          publishConfirmed: true,
          sharingRightsConfirmed: true,
          personalInfoChecked: true,
        })
      ).body.error.code,
    ).toBe('NOT_READY');

    const unclear = await hit('post', '/notes', owner).attach('files', jpeg, 'unclear.jpg');
    mockPrepare.mockResolvedValueOnce({
      status: 'vision_required',
      text: null,
      pageCount: null,
      warnings: [],
    });
    mockVision.mockResolvedValueOnce({
      text: null,
      warnings: ['No readable text could be extracted.'],
    });
    await hit('post', `/notes/${unclear.body.data[0].id}/ai-process`, owner);
    expect(
      (await hit('post', `/notes/${unclear.body.data[0].id}/ai-process`, owner)).body.data
        .studyGateStatus,
    ).toBe('needs_review');
    expect((await hit('get', `/notes/${unclear.body.data[0].id}`)).status).toBe(404);
  });
});
