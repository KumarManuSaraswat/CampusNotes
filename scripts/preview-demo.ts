/** Local-only visual QA. Uses disposable MongoDB and synthetic documents, never production services. */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { testPdf } from '../server/src/services/ai/document/testPdf.js';

async function main() {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, {
    NODE_ENV: 'test',
    MONGODB_URI: mongo.getUri('campusnotes_preview'),
    JWT_SECRET: 'local-preview-only-not-a-production-secret',
    CLIENT_URL: 'http://127.0.0.1:5174',
    CLOUDINARY_CLOUD_NAME: 'preview',
    CLOUDINARY_API_KEY: 'preview',
    CLOUDINARY_API_SECRET: 'preview',
    AI_ENABLED: 'false',
    REQUEST_RECOMMENDATIONS_ENABLED: 'false',
  });
  await mongoose.connect(process.env.MONGODB_URI!);
  const { User } = await import('../server/src/models/User.js');
  const { Note } = await import('../server/src/models/Note.js');
  const { Bookmark } = await import('../server/src/models/Bookmark.js');
  const { NoteRequest } = await import('../server/src/models/NoteRequest.js');
  const { storage } = await import('../server/src/services/storage/cloudinary.js');
  const { default: app } = await import('../server/src/app.js');
  const student = await User.create({
    name: 'Alex Morgan',
    email: 'demo@example.test',
    passwordHash: await bcrypt.hash('CampusDemo123', 10),
    role: 'moderator',
  });
  const documents = new Map<string, Buffer>();
  const samples = [
    {
      title: 'Demo: Data structures, made simple',
      subject: 'Computer Science',
      tags: ['Stacks', 'Queues'],
      description:
        'A visual walkthrough of the structures behind your everyday code. Definitions, examples, and the little details that help it click.',
      name: 'Jamie Chen',
    },
    {
      title: 'Demo: A fresh look at linear algebra',
      subject: 'Mathematics',
      tags: ['Matrices', 'Vectors'],
      description:
        'From vectors to transformations: concise explanations and worked examples to keep your revision on track.',
      name: 'Priya Shah',
    },
    {
      title: 'Demo: The essentials of economics',
      subject: 'Economics',
      tags: ['Supply & demand', 'Markets'],
      description:
        'A thoughtful introduction to the choices, markets, and everyday trade-offs that shape the world around us.',
      name: 'Sam Taylor',
    },
  ];
  for (const [i, sample] of samples.entries()) {
    const author = await User.create({
      name: sample.name,
      email: `author${i}@example.test`,
      passwordHash: 'not-login-enabled',
    });
    const bytes = testPdf([
      {
        text: 'Synthetic demonstration document. Study concepts through definitions and worked examples.',
      },
    ]);
    documents.set(`demo-${i}`, bytes);
    const note = await Note.create({
      ...sample,
      originalFilename: `demo-${i}.pdf`,
      fileType: 'application/pdf',
      fileSize: bytes.length,
      storagePublicId: `demo-${i}`,
      storageResourceType: 'raw',
      uploadedBy: author._id,
      studyGateStatus: 'approved',
      metadataSource: 'manual',
    });
    if (i === 1) await Bookmark.create({ user: student._id, note: note._id });
    if (i === 0)
      await NoteRequest.create({
        createdBy: student._id,
        title: 'Looking for notes on stacks and queues',
        subject: 'Computer Science',
        normalizedKey: 'demo-stacks-and-queues',
        description:
          'I need clear definitions and examples to prepare for our data structures quiz.',
        recommendationsCheckedAt: new Date(),
        recommendations: [
          {
            noteId: note._id,
            reason:
              'Demo suggestion: this guide includes definitions and examples for stacks and queues.',
            evidence: 'Definitions, examples, and the little details that help it click.',
          },
        ],
      });
  }
  storage.read = async (file) => {
    const bytes = documents.get(file.storagePublicId);
    if (!bytes) throw new Error('Demo original unavailable');
    return bytes;
  };
  storage.upload = async (bytes, mime) => {
    const id = new mongoose.Types.ObjectId().toString();
    documents.set(id, Buffer.from(bytes));
    return {
      storagePublicId: id,
      storageResourceType: mime === 'application/pdf' ? 'raw' : 'image',
      storageProvider: 'cloudinary',
    };
  };
  storage.remove = async (file) => {
    documents.delete(file.storagePublicId);
  };
  const server = app.listen(5000, '127.0.0.1', () =>
    console.log(
      'Disposable preview API: http://127.0.0.1:5000. Login: demo@example.test / CampusDemo123. AI deliberately disabled; no live provider calls.',
    ),
  );
  async function stop() {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
    process.exit(0);
  }
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}
void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
