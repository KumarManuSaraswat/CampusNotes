import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, Image, LockKeyhole, Trash2, X } from 'lucide-react';
import { uploadNote } from '../services/api';
import { MetadataFields, blankMetadata, type Metadata } from '../components/upload/MetadataFields';
import { useToast } from '../contexts/ToastContext';

const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
const maxSize = 10 * 1024 * 1024;
const maxFiles = 10;

type SelectedFile = {
  id: string;
  file: File;
  previewUrl: string;
};

let nextFileId = 0;

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
const formatSize = (size: number) => `${(size / 1024 / 1024).toFixed(2)} MB`;

export function Upload() {
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activePreviewUrls = useRef(new Map<string, string>());
  const [metadata, setMetadata] = useState<Metadata>(blankMetadata);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const toast = useToast();
  const navigate = useNavigate();

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
        allowed.includes(file.type) ||
        file.type === '' ||
        file.type === 'application/octet-stream';

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
    Object.entries(metadata).forEach(([key, value]) => form.append(key, value));

    try {
      await uploadNote(form, setProgress);
      toast('Notes uploaded successfully.');
      navigate('/my-notes');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page narrow">
      <div className="page-heading">
        <span className="eyebrow">Contribute to the library</span>
        <h1>Share your notes</h1>
        <p>Upload once. Help every student who needs them.</p>
      </div>
      <form onSubmit={submit} className="surface upload-form">
        <div className="form-section">
          <div className="step-heading">
            <span className="step">01</span>
            <div>
              <h2>Choose a document</h2>
              <p>PDF, JPG, or PNG • Up to 10 MB</p>
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
            <strong>
              {files.length > 0 ? 'Add or change files' : 'Drop your files here or browse'}
            </strong>
            <small>
              {files.length > 0
                ? `${files.length} file${files.length === 1 ? '' : 's'} selected • ${formatSize(
                    files.reduce((total, item) => total + item.file.size, 0),
                  )} total`
                : 'Original document will be preserved'}
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
        <div className="form-section">
          <div className="step-heading">
            <span className="step">02</span>
            <div>
              <h2>Describe your notes</h2>
              <p>Everything here is optional. You can edit it later.</p>
            </div>
          </div>
          <MetadataFields value={metadata} onChange={setMetadata} />
        </div>
        <div className="ai-notice">
          <LockKeyhole size={18} />
          <div>
            <label>
              <input type="checkbox" disabled />
              <strong>AI organization — not yet configured</strong>
            </label>
            <p>
              Manual details work now. Automated suggestions will be available after the team
              integrates them.
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
          {busy ? `Uploading ${progress}%…` : 'Publish notes'}
        </button>
      </form>
    </div>
  );
}
