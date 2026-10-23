import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { NoteAssetDto, NoteDto } from '@campusnotes/shared';
import { API_BASE, api, json } from '../services/api';
import { processStudyNote } from '../services/studyGateApi';
import { MetadataFields, type Metadata } from '../components/upload/MetadataFields';
import { useToast } from '../contexts/ToastContext';

interface ProcessingReport {
  fileCount: number;
  files: Array<{
    id: string;
    name: string;
    readStatus: string;
    usedVision: boolean;
    warnings: string[];
  }>;
  studyGateStatus: string;
  screening: { reason: string; evidence: string[]; warnings: string[] } | null;
  metadataSuggested: boolean;
  metadataSuggestion: NoteDto['aiMetadata'];
  approvedMetadata: {
    title: string;
    subject: string;
    tags: string[];
    description: string;
    instructor: string;
    lectureDate: string | null;
  };
  unknownFields: string[];
  pageOrderSuggestion: NoteDto['aiPageOrder'];
  pageOrderConfirmed: boolean;
  pdfReady: boolean;
  summaryReady: boolean;
  events: Array<{ step: string; status: string; message: string; at: string }>;
}

const fields = (note: NoteDto): Metadata => ({
  title: note.title,
  subject: note.subject,
  tags: note.tags.join(', '),
  description: note.description,
  instructor: note.instructor,
  lectureDate: note.lectureDate || '',
  semester: note.semester,
});

function AssetPreview({ asset }: { asset: NoteAssetDto }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    fetch(API_BASE + asset.previewUrl, { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== asset.mimeType)
          throw new Error('Preview unavailable');
        objectUrl = URL.createObjectURL(await response.blob());
        setUrl(objectUrl);
      })
      .catch((failure: Error) => {
        if (failure.name !== 'AbortError') setUrl('');
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.previewUrl, asset.mimeType]);
  return url && asset.mimeType.startsWith('image/') ? (
    <img className="review-thumbnail" src={url} alt={asset.originalFilename} />
  ) : (
    <span className="review-thumbnail-placeholder">
      {asset.mimeType === 'application/pdf' ? 'PDF' : 'Preview unavailable'}
    </span>
  );
}

export function SmartReview() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const requestId = params.get('requestId');
  const navigate = useNavigate();
  const toast = useToast();
  const [note, setNote] = useState<NoteDto | null>(null);
  const [form, setForm] = useState<Metadata | null>(null);
  const [report, setReport] = useState<ProcessingReport | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sharingRights, setSharingRights] = useState(false);
  const [personalInfoChecked, setPersonalInfoChecked] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [acknowledgeNoPdf, setAcknowledgeNoPdf] = useState(false);
  const [requestMatch, setRequestMatch] = useState(false);

  async function refresh(resetForm = false) {
    const [current, details] = await Promise.all([
      api<NoteDto>(`/notes/${id}`),
      api<ProcessingReport>(`/notes/${id}/ai-report`),
    ]);
    setNote(current);
    if (resetForm) setForm(fields(current));
    if (resetForm) setSummary(current.studySummary || '');
    setOrder(
      current.assets
        ?.slice()
        .sort(
          (a, b) => (a.confirmedPosition ?? a.uploadIndex) - (b.confirmedPosition ?? b.uploadIndex),
        )
        .map((asset) => asset.id) || [],
    );
    setReport(details);
  }
  useEffect(() => {
    let active = true;
    Promise.all([api<NoteDto>(`/notes/${id}`), api<ProcessingReport>(`/notes/${id}/ai-report`)])
      .then(([current, details]) => {
        if (!active) return;
        setNote(current);
        setForm(fields(current));
        setSummary(current.studySummary || '');
        setReport(details);
        setOrder(
          current.assets
            ?.slice()
            .sort(
              (a, b) =>
                (a.confirmedPosition ?? a.uploadIndex) - (b.confirmedPosition ?? b.uploadIndex),
            )
            .map((asset) => asset.id) || [],
        );
      })
      .catch((failure) => {
        if (active) setError((failure as Error).message);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function runProcessing() {
    if (!note) return;
    setBusy(true);
    setError('');
    try {
      for (let step = 0; step < (note.assets?.length || 1) + 4; step++) {
        const result = await processStudyNote(note.id);
        setNote((current) =>
          current
            ? {
                ...current,
                processingStatus: result.processingStatus,
                studyGateStatus: result.studyGateStatus,
                studyAssessment: result.assessment,
                processingStage: result.processingStage,
              }
            : current,
        );
        if (result.processingStatus !== 'pending') break;
      }
      await refresh();
    } catch (failure) {
      setError((failure as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api<NoteDto>(
        `/notes/${id}/review`,
        json('PATCH', {
          ...form,
          tags: [
            ...new Set(
              form.tags
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            ),
          ],
          lectureDate: form.lectureDate || null,
          studySummary: summary,
        }),
      );
      setNote(updated);
      setForm(fields(updated));
      setSummary(updated.studySummary || '');
      toast('Review saved.');
      await refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function generateSummary() {
    setBusy(true);
    setError('');
    try {
      const updated = await api<NoteDto>(`/notes/${id}/generate-summary`, { method: 'POST' });
      setNote(updated);
      setSummary(updated.studySummary || '');
      await refresh();
      toast('Study summary is ready for review.');
    } catch (failure) {
      setError((failure as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function confirmOrder() {
    setBusy(true);
    setError('');
    try {
      setNote(
        await api<NoteDto>(`/notes/${id}/confirm-order`, json('POST', { orderedAssetIds: order })),
      );
      await refresh();
      toast('Page order confirmed.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function generatePdf() {
    setBusy(true);
    setError('');
    try {
      setNote(await api<NoteDto>(`/notes/${id}/generate-pdf`, { method: 'POST' }));
      await refresh();
      toast('Combined PDF is ready.');
    } catch (failure) {
      setError((failure as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function suggestOrder() {
    setBusy(true);
    setError('');
    try {
      setNote(await api<NoteDto>(`/notes/${id}/suggest-order`, { method: 'POST' }));
      await refresh();
    } catch (failure) {
      setError((failure as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    setError('');
    try {
      const published = await api<NoteDto>(
        `/notes/${id}/publish`,
        json('POST', {
          publishConfirmed,
          sharingRightsConfirmed: sharingRights,
          personalInfoChecked,
          acknowledgeNoPdf,
        }),
      );
      setNote(published);
      toast('Note published.');
      if (!requestId) navigate(`/notes/${id}`);
      else await refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function fulfillRequest() {
    if (!requestId || !requestMatch) return;
    setBusy(true);
    setError('');
    try {
      await api(`/requests/${requestId}/fulfill`, json('PATCH', { noteId: id }));
      toast('Request fulfilled with your published note.');
      navigate(`/notes/${id}`);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!note || !form)
    return (
      <div className="container page">
        <p role="status">{error || 'Loading review…'}</p>
      </div>
    );
  const assets = note.assets || [];
  const confirmedIds = assets
    .slice()
    .sort((a, b) => (a.confirmedPosition ?? a.uploadIndex) - (b.confirmedPosition ?? b.uploadIndex))
    .map((asset) => asset.id);
  const orderReady =
    assets.length <= 1 ||
    (!!note.orderConfirmedAt && order.every((assetId, index) => assetId === confirmedIds[index]));
  const metadataSaved =
    JSON.stringify(form) === JSON.stringify(fields(note)) && summary === (note.studySummary || '');
  const requiredMetadataValid = note.title.trim().length >= 3 && note.subject.trim().length >= 2;
  const move = (index: number, by: number) =>
    setOrder((current) => {
      const next = [...current];
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  return (
    <div className="container page smart-review">
      <div className="page-heading">
        <span className="eyebrow">Your private workspace</span>
        <h1>Review your note</h1>
        <p>Check the AI suggestions and your original pages before publishing.</p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="surface review-section">
        <h2>Processing</h2>
        <p>
          Status: {note.processingStatus.replaceAll('_', ' ')} ·{' '}
          {note.processingStage?.replaceAll('_', ' ') || 'upload'}
        </p>
        <p>
          Academic screening: <strong>{note.studyGateStatus.replaceAll('_', ' ')}</strong>
        </p>
        {note.studyAssessment && <p>{note.studyAssessment.reason}</p>}
        {note.studyGateStatus === 'rejected' && (
          <p>Publication is blocked. Your original files remain private.</p>
        )}
        {note.studyGateStatus === 'needs_review' && (
          <p>The result needs a human review before publication.</p>
        )}
        {(note.processingStatus !== 'completed' ||
          (note.studyGateStatus === 'approved' && !note.aiMetadata && !note.reviewMessage)) && (
          <button className="button small" disabled={busy} onClick={() => void runProcessing()}>
            {busy
              ? 'Processing…'
              : note.processingStatus === 'failed'
                ? 'Retry processing'
                : note.processingStatus === 'completed'
                  ? 'Retry metadata suggestion'
                  : 'Continue processing'}
          </button>
        )}
      </div>
      <div className="surface review-section">
        <h2>Original pages</h2>
        <p>
          {assets.length} file{assets.length === 1 ? '' : 's'} in this note. You control the final
          order.
        </p>
        <div className="review-assets">
          {order.map((assetId, index) => {
            const asset = assets.find((item) => item.id === assetId);
            if (!asset) return null;
            return (
              <div className="review-asset" key={asset.id}>
                <AssetPreview asset={asset} />
                <div>
                  <strong>
                    Page {index + 1}: {asset.originalFilename}
                  </strong>
                  <p>
                    {asset.extractionStatus.replaceAll('_', ' ')}
                    {asset.usedVision ? ' · vision read' : ''}
                  </p>
                  <a href={API_BASE + asset.downloadUrl} target="_blank" rel="noreferrer">
                    Download original
                  </a>
                </div>
                {assets.length > 1 &&
                  note.publicationStatus !== 'published' &&
                  !note.generatedPdfUrl && (
                    <div className="review-order-actions">
                      <button
                        type="button"
                        aria-label={`Move ${asset.originalFilename} earlier`}
                        disabled={busy || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        Earlier
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${asset.originalFilename} later`}
                        disabled={busy || index === order.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        Later
                      </button>
                    </div>
                  )}
              </div>
            );
          })}
        </div>
        {assets.length > 1 && note.publicationStatus !== 'published' && !note.generatedPdfUrl && (
          <div className="form-actions">
            {!note.aiPageOrder && (
              <button
                className="secondary-button"
                disabled={busy || note.processingStatus !== 'completed'}
                onClick={() => void suggestOrder()}
              >
                Suggest page order with AI
              </button>
            )}
            {note.aiPageOrder && (
              <button
                className="secondary-button"
                disabled={busy || note.aiPageOrder.uncertainAssetIds.length > 0}
                onClick={() => setOrder(note.aiPageOrder!.orderedAssetIds)}
              >
                Use AI suggestion
              </button>
            )}
            <button
              className="secondary-button"
              onClick={() =>
                setOrder(
                  assets
                    .slice()
                    .sort((a, b) => a.uploadIndex - b.uploadIndex)
                    .map((asset) => asset.id),
                )
              }
            >
              Restore upload order
            </button>
            <button className="button small" disabled={busy} onClick={() => void confirmOrder()}>
              Confirm final order
            </button>
          </div>
        )}
        {note.aiPageOrder && (
          <div className="soft-banner">
            <strong>Suggested order, awaiting your confirmation</strong>
            {note.aiPageOrder.reasons.map((item) => (
              <p key={item.assetId}>
                {assets.find((asset) => asset.id === item.assetId)?.originalFilename}: {item.reason}{' '}
                (“{item.evidence}”)
              </p>
            ))}
            {!!note.aiPageOrder.uncertainAssetIds.length && (
              <p>Some pages are uncertain. Set the order manually.</p>
            )}
          </div>
        )}
        {note.orderConfirmedAt && <p role="status">Final order confirmed.</p>}
        {assets.length > 1 &&
          note.publicationStatus !== 'published' &&
          note.orderConfirmedAt &&
          !note.generatedPdfUrl && (
            <button
              className="secondary-button"
              disabled={busy || !orderReady}
              onClick={() => void generatePdf()}
            >
              Generate combined PDF
            </button>
          )}
        {note.generatedPdfUrl && (
          <a href={API_BASE + note.generatedPdfUrl}>Download combined PDF</a>
        )}
      </div>
      <form className="surface review-section" onSubmit={save}>
        <h2>Metadata</h2>
        {note.aiMetadata && (
          <div className="soft-banner">
            <strong>AI suggestions awaiting your approval</strong>
            <p>
              Title: {note.aiMetadata.title || 'unknown'} · Subject:{' '}
              {note.aiMetadata.subject || 'unknown'}
            </p>
            <p>
              Topics: {note.aiMetadata.topics.join(', ') || 'none'} · Description:{' '}
              {note.aiMetadata.description || 'none'}
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setForm(
                  (current) =>
                    current && {
                      ...current,
                      title:
                        current.title && note.metadataSource !== 'filename'
                          ? current.title
                          : note.aiMetadata?.title || current.title,
                      subject: current.subject || note.aiMetadata?.subject || '',
                      tags: current.tags || note.aiMetadata?.topics.join(', ') || '',
                      description: current.description || note.aiMetadata?.description || '',
                    },
                )
              }
            >
              Fill empty fields from suggestions
            </button>
          </div>
        )}
        <MetadataFields value={form} onChange={setForm} />
        <h3>Study summary</h3>
        {note.publicationStatus !== 'published' &&
          note.studyGateStatus === 'approved' &&
          !note.aiStudySummary && (
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void generateSummary()}
            >
              Suggest grounded summary
            </button>
          )}
        {note.aiStudySummary && (
          <p className="hint">
            AI suggestion with source excerpts. Check and edit it before publication.
          </p>
        )}
        {note.summarySources?.map((source, index) => (
          <p className="hint" key={index}>
            Source page{' '}
            {assets.find((asset) => asset.id === source.sourceAssetId)?.originalFilename ||
              'unknown'}
            : “{source.excerpt}”
          </p>
        ))}
        <label className="field">
          Your approved summary
          <textarea
            rows={6}
            maxLength={3000}
            disabled={note.publicationStatus === 'published'}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <button className="button small" disabled={busy || note.publicationStatus === 'published'}>
          Save review
        </button>
      </form>
      <div className="surface review-section">
        <h2>AI Processing Report</h2>
        <p>
          {report?.fileCount || assets.length} files received · Screening:{' '}
          {report?.studyGateStatus || 'pending'}
        </p>
        <p>
          Metadata suggestions: {report?.metadataSuggested ? 'ready for review' : 'unavailable'} ·
          PDF: {report?.pdfReady ? 'ready' : 'not generated'} · Summary:{' '}
          {report?.summaryReady ? 'ready' : 'not generated'}
        </p>
        {report?.metadataSuggestion && (
          <p>
            Suggested: {report.metadataSuggestion.title || 'untitled'} ·{' '}
            {report.metadataSuggestion.subject || 'subject unknown'} ·{' '}
            {report.metadataSuggestion.topics.join(', ') || 'no topics'}
          </p>
        )}
        {report?.approvedMetadata && (
          <p>
            Current student metadata: {report.approvedMetadata.title} ·{' '}
            {report.approvedMetadata.subject || 'subject pending'}
          </p>
        )}
        {report?.pageOrderSuggestion && (
          <p>
            AI page sequence suggested.{' '}
            {report.pageOrderConfirmed
              ? 'Student confirmed an order.'
              : 'Student confirmation is pending.'}
          </p>
        )}
        {!!report?.unknownFields?.length && (
          <p>Unknown fields: {report.unknownFields.join(', ')}</p>
        )}
        {report?.screening && <p>{report.screening.reason}</p>}
        {report?.events.map((event, index) => (
          <p key={index}>
            <strong>{event.step.replaceAll('_', ' ')}:</strong> {event.status} — {event.message}
          </p>
        ))}
        {report?.files.flatMap((file) =>
          file.warnings.map((warning) => (
            <p key={file.id + warning}>
              ⚠ {file.name}: {warning}
            </p>
          )),
        )}
      </div>
      {note.publicationStatus !== 'published' ? (
        <div className="surface review-section">
          <h2>Publish</h2>
          <p>
            Only approved study notes with confirmed metadata and page order can enter the library.
          </p>
          <label>
            <input
              type="checkbox"
              checked={sharingRights}
              onChange={(event) => setSharingRights(event.target.checked)}
            />{' '}
            I have permission to share these files.
          </label>
          <label>
            <input
              type="checkbox"
              checked={personalInfoChecked}
              onChange={(event) => setPersonalInfoChecked(event.target.checked)}
            />{' '}
            I checked for personal information.
          </label>
          {assets.length > 1 && !note.generatedPdfUrl && (
            <label>
              <input
                type="checkbox"
                checked={acknowledgeNoPdf}
                onChange={(event) => setAcknowledgeNoPdf(event.target.checked)}
              />{' '}
              Publish with original pages while a combined PDF is unavailable.
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={publishConfirmed}
              onChange={(event) => setPublishConfirmed(event.target.checked)}
            />{' '}
            I reviewed this note and confirm publication.
          </label>
          <button
            className="button"
            disabled={
              busy ||
              note.studyGateStatus !== 'approved' ||
              note.processingStatus !== 'completed' ||
              !requiredMetadataValid ||
              !metadataSaved ||
              !orderReady ||
              !sharingRights ||
              !personalInfoChecked ||
              !publishConfirmed ||
              (assets.length > 1 && !note.generatedPdfUrl && !acknowledgeNoPdf)
            }
            onClick={() => void publish()}
          >
            Publish note
          </button>
        </div>
      ) : (
        <div className="surface review-section">
          <h2>Published</h2>
          <Link className="text-link" to={`/notes/${id}`}>
            View your note →
          </Link>
          {requestId && (
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={requestMatch}
                  onChange={(event) => setRequestMatch(event.target.checked)}
                />{' '}
                This note matches the selected request.
              </label>
              <button
                className="button small"
                disabled={busy || !requestMatch}
                onClick={() => void fulfillRequest()}
              >
                Confirm request fulfillment
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
