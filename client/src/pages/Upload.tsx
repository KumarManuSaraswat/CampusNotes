import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  UploadCloud,
  FileText,
  Image,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Check,
  Trash2,
  X,
} from 'lucide-react';
import type { NoteDto } from '@campusnotes/shared';
import { StudyGateControls, mergeGate } from '../components/ai/StudyGateControls';
import { processStudyNote, getStudyGateStatus } from '../services/studyGateApi';
import { uploadNote } from '../services/api';
import { MetadataFields, blankMetadata, type Metadata } from '../components/upload/MetadataFields';
import { useToast } from '../contexts/ToastContext';

const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
const maxSize = 10 * 1024 * 1024;
const maxFiles = 10;
const maxTotal = 30 * 1024 * 1024;

type SelectedFile = {
  id: string;
  file: File;
  previewUrl: string;
};

let nextFileId = 0;

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
const formatSize = (size: number) => `${(size / 1024 / 1024).toFixed(2)} MB`;
const newSubmissionKey = () =>
  globalThis.crypto?.randomUUID?.() ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === 'x' ? value : (value & 3) | 8).toString(16);
  });

export function Upload() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('requestId');
  const submissionKey = useRef(newSubmissionKey());
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activePreviewUrls = useRef(new Map<string, string>());
  const [metadata, setMetadata] = useState<Metadata>(blankMetadata);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const toast = useToast();
  const [uploaded, setUploaded] = useState<NoteDto[]>([]);
  const [stage, setStage] = useState('');

  useEffect(() => {
    return () => {
      activePreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      activePreviewUrls.current.clear();
    };
  }, []);

  function choose(selected: File[]) {
    if (busy) return;

    setError('');

    const existingKeys = new Set(files.map(({ file }) => fileKey(file)));
    const selectedKeys = new Set(existingKeys);
    const validFiles: SelectedFile[] = [];
    const invalidMessages: string[] = [];
    const skippedNames: string[] = [];

    for (const file of selected) {
      const key = fileKey(file);

      if (selectedKeys.has(key)) {
        invalidMessages.push(`${file.name} was already selected.`);
        continue;
      }

      const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
      const supportedExtension = ['.pdf', '.jpg', '.jpeg', '.png'].includes(extension || '');
      const supportedType =
        allowed.includes(file.type) || file.type === '' || file.type === 'application/octet-stream';

      if (!supportedExtension || !supportedType) {
        invalidMessages.push(`${file.name} is not a PDF, JPG, JPEG, or PNG file.`);
        continue;
      }

      if (file.size === 0) {
        invalidMessages.push(`${file.name} is empty.`);
        continue;
      }

      if (file.size > maxSize) {
        invalidMessages.push(`${file.name} must be 10 MB or smaller.`);
        continue;
      }
      const group = [...files, ...validFiles].map((item) => item.file);
      if (group.reduce((sum, item) => sum + item.size, 0) + file.size > maxTotal) {
        invalidMessages.push('One note can contain at most 30 MB of files.');
        continue;
      }
      if (
        group.length &&
        (extension === '.pdf' || group.some((item) => item.name.toLowerCase().endsWith('.pdf')))
      ) {
        invalidMessages.push('Upload one PDF or up to ten images per note.');
        continue;
      }

      if (files.length + validFiles.length >= maxFiles) {
        skippedNames.push(file.name);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      const id = `${key}:${nextFileId++}`;
      activePreviewUrls.current.set(id, previewUrl);
      selectedKeys.add(key);
      validFiles.push({ id, file, previewUrl });
    }

    setFiles((current) => [...current, ...validFiles]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const messages = [...invalidMessages];
    if (skippedNames.length > 0) {
      messages.push(
        `${skippedNames.join(', ')} skipped. You can select a maximum of ${maxFiles} files.`,
      );
    }
    setError(messages.join(' '));
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    if (busy) return;
    choose(Array.from(e.dataTransfer.files));
  }

  function removeFile(id: string) {
    if (busy) return;

    const removed = files.find((item) => item.id === id);
    if (!removed) return;

    URL.revokeObjectURL(removed.previewUrl);
    activePreviewUrls.current.delete(id);
    setFiles(files.filter((item) => item.id !== id));
  }

  function clearFiles() {
    if (busy) return;

    files.forEach(({ id, previewUrl }) => {
      URL.revokeObjectURL(previewUrl);
      activePreviewUrls.current.delete(id);
    });
    setFiles([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError('Choose a file first.');
      return;
    }
    setBusy(true);
    setError('');
    setProgress(0);
    const form = new FormData();
    files.forEach(({ file }) => form.append('files', file));
    form.append('submissionKey', submissionKey.current);
    Object.entries(metadata).forEach(([key, value]) => form.append(key, value));

    try {
      setStage('Saving your originals');
      const notes = await uploadNote(form, setProgress);
      setUploaded(notes);
      toast('Originals saved. Checking your documents now.');
      for (const note of notes) {
        setStage('Reading and checking your note');
        setUploaded((current) =>
          current.map((n) =>
            n.id === note.id
              ? { ...n, processingStatus: 'pending', studyGateStatus: 'pending' }
              : n,
          ),
        );
        try {
          for (let step = 0; step < (note.assets?.length || 1) + 4; step++) {
            const result = await processStudyNote(note.id);
            setStage(result.processingStage?.replaceAll('_', ' ') || 'Checking academic relevance');
            setUploaded((current) =>
              current.map((n) => (n.id === note.id ? mergeGate(n, result) : n)),
            );
            if (result.processingStatus !== 'pending') break;
          }
        } catch (error) {
          setError((error as Error).message);
          try {
            const result = await getStudyGateStatus(note.id);
            setUploaded((current) =>
              current.map((n) => (n.id === note.id ? mergeGate(n, result) : n)),
            );
          } catch {
            setUploaded((current) => current.map((n) => (n.id === note.id ? note : n)));
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page upload-page">
      <div className="page-heading">
        <span className="eyebrow">A little knowledge. A big difference.</span>
        <h1>
          Share your notes<span className="purple-dot">.</span>
        </h1>
        <p>Your best explanation could be someone else’s breakthrough.</p>
      </div>
      {uploaded.length > 0 ? (
        <div className="upload-results">
          <div className="section-heading">
            <h2>{busy ? stage : 'Your upload results'}</h2>
            <Link className="text-link" to="/my-notes">
              My uploads <ArrowRight size={16} />
            </Link>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {uploaded.map((note) => (
            <article className="surface upload-result" key={note.id}>
              <div className="section-heading">
                <h3>{note.title}</h3>
                <Link
                  className="text-link"
                  to={`/notes/${note.id}/review${requestId ? `?requestId=${encodeURIComponent(requestId)}` : ''}`}
                >
                  Review and publish ↗
                </Link>
              </div>
              {busy ? (
                <p role="status">
                  {note.processingStatus === 'pending'
                    ? 'Checking whether your document is study-related...'
                    : note.studyGateStatus.replaceAll('_', ' ')}
                </p>
              ) : (
                <StudyGateControls
                  note={note}
                  onChange={(updated) =>
                    setUploaded((current) =>
                      current.map((n) => (n.id === updated.id ? updated : n)),
                    )
                  }
                />
              )}
            </article>
          ))}
          {!busy && (
            <button
              className="button"
              onClick={() => {
                setUploaded([]);
                clearFiles();
                submissionKey.current = newSubmissionKey();
                setError('');
              }}
            >
              Upload more notes
            </button>
          )}
        </div>
      ) : (
        <div className="upload-layout">
          <form onSubmit={submit} className="surface upload-form">
            <div className="form-section">
              <div className="step-heading">
                <span className="step">01</span>
                <div>
                  <h2>Choose a document</h2>
                  <p>One PDF or up to 10 images · 10 MB each · 30 MB total</p>
                </div>
              </div>
              <label
                className="dropzone"
                aria-disabled={busy}
                onDragOver={(e) => e.preventDefault()}
                onDrop={drop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  disabled={busy}
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(e) => choose(Array.from(e.target.files || []))}
                />
                <span className="drop-icon">
                  <UploadCloud size={28} />
                </span>
                <strong>{files.length > 0 ? 'Add more documents' : 'Drop your notes here'}</strong>
                <small>
                  {files.length > 0
                    ? `${files.length} file${files.length === 1 ? '' : 's'} selected • ${formatSize(
                        files.reduce((total, item) => total + item.file.size, 0),
                      )} total`
                    : 'or click to browse your files'}
                </small>
              </label>
              {files.length > 0 && (
                <button type="button" className="button" disabled={busy} onClick={clearFiles}>
                  <X size={16} />
                  Clear all
                </button>
              )}
              {files.map(({ id, file, previewUrl }) => (
                <div className="selected-file" key={id}>
                  {file.type === 'application/pdf' ? <FileText size={20} /> : <Image size={20} />}
                  <span>
                    {file.name} • {formatSize(file.size)}
                  </span>
                  <a href={previewUrl} target="_blank" rel="noreferrer">
                    Preview
                  </a>
                  <button
                    type="button"
                    className="button"
                    aria-label={`Remove ${file.name}`}
                    disabled={busy}
                    onClick={() => removeFile(id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <details className="form-section metadata-details">
              <summary>
                Add details <span>Optional, but helpful</span>
              </summary>
              <div className="step-heading">
                <span className="step">02</span>
                <div>
                  <h2>Describe your notes</h2>
                  <p>Everything here is optional. You can edit it later.</p>
                </div>
              </div>
              <MetadataFields value={metadata} onChange={setMetadata} />
            </details>
            <div className="ai-notice">
              <Sparkles size={20} />
              <div>
                <strong>Let the study check do the sorting</strong>
                <p>
                  We check study relevance and suggest a subject and topics. You stay in control of
                  your details.
                </p>
              </div>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {busy && (
              <div className="progress" aria-label={`Upload ${progress}% complete`}>
                <span style={{ width: progress + '%' }} />
              </div>
            )}
            <button className="button upload-button" disabled={busy}>
              {busy ? (
                `Uploading ${progress}%…`
              ) : (
                <>
                  Upload & check notes <ArrowRight size={18} />
                </>
              )}
            </button>
            <p className="upload-consent">
              <ShieldCheck size={14} /> Private until approved. Your original is always retained.
            </p>
          </form>
          <aside className="upload-guide">
            <div className="guide-card">
              <span className="eyebrow">FROM YOUR DESK TO THEIRS</span>
              <h2>
                A few pages.
                <br />A fresh perspective.
              </h2>
              <p>
                Lecture notes, worked examples, handwritten ideas. If it helps someone learn, it
                belongs here.
              </p>
              <div className="guide-note" aria-hidden="true">
                <BookNote />
              </div>
            </div>
            <div className="surface upload-checklist">
              <h3>Great notes start here</h3>
              {[
                'Clear, readable pages',
                'One subject per document',
                'Only materials you can share',
              ].map((text) => (
                <p key={text}>
                  <Check size={16} />
                  {text}
                </p>
              ))}
              <div className="privacy-note">
                <ShieldCheck size={22} />
                <div>
                  <strong>A thoughtful check, every time.</strong>
                  <p>
                    Uncertain results stay private. Ask for a human review whenever you need one.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
function BookNote() {
  return (
    <>
      <div className="paper-tab" />
      <span>NOTES WORTH SHARING</span>
      <strong>
        One idea can
        <br />
        change everything.
      </strong>
      <i />
      <i />
      <i />
      <div className="paper-check">
        <Check size={18} /> Made for learning
      </div>
    </>
  );
}
