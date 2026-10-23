import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import mongoose from 'mongoose';
import request from 'supertest';
const { mockStorageRead } = vi.hoisted(() => ({ mockStorageRead: vi.fn() }));

vi.mock('../services/storage/cloudinary.js', () => ({
  storage: {
    upload: async (_buffer: Buffer, mime: string) => ({
      storagePublicId: mime === 'application/pdf' ? 'fixture.pdf' : 'fixture',
      storageResourceType: mime === 'application/pdf' ? 'raw' : 'image',
      storageProvider: 'cloudinary',
    }),
    remove: async () => {},
    read: (...args: unknown[]) => mockStorageRead(...args),
  },
}));
let mongod: ChildProcess;
let directory: string;
let app: any;
let port: number;
async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('No port'));
      const value = address.port;
      server.close(() => resolve(value));
    });
  });
}
async function waitForMongo(uri: string) {
  for (let i = 0; i < 60; i++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 500 });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('mongod did not start');
}
beforeAll(async () => {
  mockStorageRead.mockImplementation(async (_file: unknown, mime: string) =>
    mime === 'application/pdf' ? pdf : mime === 'image/jpeg' ? jpeg : png,
  );
  directory = await mkdtemp(join(tmpdir(), 'campusnotes-test-'));
  port = await freePort();
  mongod = spawn(
    'mongod',
    [
      '--dbpath',
      directory,
      '--port',
      String(port),
      '--bind_ip',
      '127.0.0.1',
      '--replSet',
      'rs0',
      '--quiet',
    ],
    { stdio: 'ignore' },
  );
  const direct = `mongodb://127.0.0.1:${port}/campusnotes_test?directConnection=true`;
  await waitForMongo(direct);
  await mongoose.connection
    .db!.admin()
    .command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
  await mongoose.disconnect();
  const uri = `mongodb://127.0.0.1:${port}/campusnotes_test?replicaSet=rs0`;
  await waitForMongo(uri);
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
  await Promise.all([User.init(), Note.init(), Vote.init(), NoteRequest.init(), Report.init()]);
}, 45000);
afterAll(async () => {
  await mongoose.disconnect();
  mongod?.kill();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const origin = (r: any) => r.set('Origin', 'http://localhost:5173');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=',
  'base64',
);
const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

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
      'file',
      Buffer.from('not a pdf'),
      'fake.pdf',
    );
    expect(invalid.status).toBe(400);
    const malformedPdf = await origin(alice.post('/api/notes')).attach(
      'file',
      Buffer.from('%PDF-1.7 this file has no end marker'),
      'broken.pdf',
    );
    expect(malformedPdf.status).toBe(400);
    const empty = await origin(alice.post('/api/notes')).attach(
      'file',
      Buffer.alloc(0),
      'empty.pdf',
    );
    expect(empty.status).toBe(400);
    const oversized = await origin(alice.post('/api/notes')).attach(
      'file',
      Buffer.alloc(10 * 1024 * 1024 + 1),
      'large.pdf',
    );
    expect(oversized.status).toBe(400);
    expect(
      (
        await origin(alice.post('/api/notes')).attach('file', png, {
          filename: 'wrong.pdf',
          contentType: 'image/png',
        })
      ).status,
    ).toBe(400);
    const uploaded = await origin(alice.post('/api/notes')).attach('file', png, {
      filename: 'linear-algebra.png',
      contentType: 'image/png',
    });
    expect(uploaded.status).toBe(201);
    const noteId = uploaded.body.data.id;
    expect(uploaded.body.data.title).toBe('linear algebra');
    expect(uploaded.body.data.processingStatus).toBe('not_requested');
    expect((await request(app).get('/api/notes?limit=5')).body.data.total).toBe(1);
    expect(
      (await alice.get('/api/users/me/notes')).body.data.map((note: any) => note.id),
    ).toContain(uploaded.body.data.id);
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
    expect((await origin(alice.post('/api/notes/' + noteId + '/ai-process'))).body.error.code).toBe(
      'AI_NOT_CONFIGURED',
    );
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
    const pdfUpload = await origin(alice.post('/api/notes')).attach('file', pdf, {
      filename: 'lecture notes.pdf',
      contentType: 'application/pdf',
    });
    expect(pdfUpload.status).toBe(201);
    const pdfPreview = await request(app).get(`/api/notes/${pdfUpload.body.data.id}/file`);
    expect(pdfPreview.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdfPreview.body)).toEqual(pdf);
    const jpgUpload = await origin(alice.post('/api/notes')).attach('file', jpeg, {
      filename: 'scan (final).jpg',
      contentType: 'image/jpeg',
    });
    expect(jpgUpload.status).toBe(201);
    const jpgDownload = await request(app).get(
      `/api/notes/${jpgUpload.body.data.id}/file?download=1`,
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
    const expendable = await origin(alice.post('/api/notes')).attach('file', png, {
      filename: 'temporary.png',
      contentType: 'image/png',
    });
    expect(expendable.status).toBe(201);
    expect((await origin(alice.delete('/api/notes/' + expendable.body.data.id))).status).toBe(200);
    expect((await request(app).get('/api/notes/' + expendable.body.data.id)).status).toBe(404);
    expect((await origin(alice.post('/api/auth/logout'))).status).toBe(200);
    expect((await alice.get('/api/auth/me')).status).toBe(401);
  });
});
