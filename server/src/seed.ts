import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { readEnv } from './config/env.js';
import { User } from './models/User.js';
import { Note } from './models/Note.js';
import { storage } from './services/storage/cloudinary.js';
function demoPdf(text: string): Buffer {
  const safe = text.replace(/[()\\]/g, '');
  const content = `BT /F1 18 Tf 72 720 Td (${safe}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
const env = readEnv();
const moderatorName = process.env.DEMO_MODERATOR_NAME;
const moderatorEmail = process.env.DEMO_MODERATOR_EMAIL;
const moderatorPassword = process.env.DEMO_MODERATOR_PASSWORD;
const studentPassword = process.env.DEMO_STUDENT_PASSWORD;
if (
  !moderatorName ||
  !moderatorEmail ||
  !moderatorPassword ||
  moderatorPassword.length < 12 ||
  !studentPassword ||
  studentPassword.length < 12
)
  throw new Error(
    'Set DEMO_MODERATOR_NAME, DEMO_MODERATOR_EMAIL, DEMO_MODERATOR_PASSWORD and DEMO_STUDENT_PASSWORD; passwords must be 12+ characters.',
  );
await mongoose.connect(env.MONGODB_URI);
async function ensureUser(
  name: string,
  email: string,
  password: string,
  role: 'student' | 'moderator',
) {
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== role)
      throw new Error(`Existing ${email} has a different role; refusing to promote it.`);
    return existing;
  }
  return User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role });
}
const moderator = await ensureUser(moderatorName, moderatorEmail, moderatorPassword, 'moderator');
const ada = await ensureUser(
  'Ada Demo',
  'ada.demo@campusnotes.example',
  studentPassword,
  'student',
);
const sam = await ensureUser(
  'Sam Demo',
  'sam.demo@campusnotes.example',
  studentPassword,
  'student',
);
for (const item of [
  {
    owner: ada,
    title: 'Introduction to Calculus',
    subject: 'Mathematics',
    filename: 'campusnotes-demo-calculus.pdf',
    text: 'CampusNotes demo: Introduction to Calculus',
  },
  {
    owner: sam,
    title: 'Cell Structure',
    subject: 'Biology',
    filename: 'campusnotes-demo-cells.pdf',
    text: 'CampusNotes demo: Cell Structure',
  },
]) {
  if (await Note.exists({ uploadedBy: item.owner.id, originalFilename: item.filename })) continue;
  const bytes = demoPdf(item.text);
  const stored = await storage.upload(bytes, 'application/pdf');
  try {
    await Note.create({
      title: item.title,
      subject: item.subject,
      originalFilename: item.filename,
      fileType: 'application/pdf',
      fileSize: bytes.length,
      uploadedBy: item.owner.id,
      metadataSource: 'manual',
      ...stored,
    });
  } catch (error) {
    await storage.remove(stored).catch(() => {});
    throw error;
  }
}
console.log(
  `Demo seed ready: moderator ${moderator.email}, two students, and two original PDF notes. No AI results.`,
);
await mongoose.disconnect();
