import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, FileText, Image, LockKeyhole } from 'lucide-react';
import { uploadNote } from '../services/api';
import { MetadataFields, blankMetadata, type Metadata } from '../components/upload/MetadataFields';
import { useToast } from '../contexts/ToastContext';
const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
const maxSize = 10 * 1024 * 1024;
export function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [metadata, setMetadata] = useState<Metadata>(blankMetadata);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const toast = useToast();
  const navigate = useNavigate();
  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function choose(selected?: File) {
    if (!selected) return;
    setError('');
    const extension = selected.name.toLowerCase().match(/\.[^.]+$/)?.[0];
    const supportedExtension = ['.pdf', '.jpg', '.jpeg', '.png'].includes(extension || '');
    const supportedType =
      allowed.includes(selected.type) ||
      selected.type === '' ||
      selected.type === 'application/octet-stream';
    if (!supportedExtension || !supportedType) {
      setFile(null);
      setError('Choose a PDF, JPG, or PNG file.');
      return;
    }
    if (selected.size > maxSize) {
      setFile(null);
      setError('File must be 10 MB or smaller.');
      return;
    }
    setFile(selected);
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    choose(e.dataTransfer.files[0]);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    setBusy(true);
    setError('');
    setProgress(0);
    const form = new FormData();
    form.append('file', file);
    Object.entries(metadata).forEach(([key, value]) => form.append(key, value));
    try {
      const note = await uploadNote(form, setProgress);
      toast('Notes uploaded successfully.');
      navigate('/notes/' + note.id);
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
          <label className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(e) => choose(e.target.files?.[0])}
            />
            <span className="drop-icon">
              <UploadCloud size={28} />
            </span>
            <strong>{file ? 'Change file' : 'Drop your file here or browse'}</strong>
            <small>
              {file
                ? `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB`
                : 'Original document will be preserved'}
            </small>
          </label>
          {file && (
            <div className="selected-file">
              {file.type === 'application/pdf' ? <FileText size={20} /> : <Image size={20} />}
              <span>{file.name}</span>
              {previewUrl && (
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  Preview
                </a>
              )}
            </div>
          )}
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
