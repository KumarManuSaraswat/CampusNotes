// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { NoteDto } from '@campusnotes/shared';
import { SmartReview } from './SmartReview';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  API_BASE: 'http://localhost:5000/api',
  api: vi.fn(),
  json: (method: string, body: unknown) => ({ method, body: JSON.stringify(body) }),
}));
vi.mock('../services/studyGateApi', () => ({ processStudyNote: vi.fn() }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => vi.fn() }));

const asset = (id: string, index: number) => ({
  id,
  originalFilename: `page-${index + 1}.png`,
  mimeType: 'image/png',
  fileSize: 100,
  uploadIndex: index,
  confirmedPosition: index,
  extractionStatus: 'completed' as const,
  extractionWarnings: [],
  usedVision: true,
  previewUrl: `/notes/n/assets/${id}/file`,
  downloadUrl: `/notes/n/assets/${id}/file?download=1`,
});
const draft = {
  id: 'n',
  title: 'Calculus notes',
  subject: 'Mathematics',
  tags: ['limits'],
  description: '',
  instructor: '',
  lectureDate: null,
  semester: '',
  uploadedBy: { id: 'u', name: 'Student' },
  processingStatus: 'completed',
  processingStage: 'ready_for_review',
  studyGateStatus: 'approved',
  studyAssessment: {
    decision: 'academic',
    category: 'Mathematics',
    subject: 'Mathematics',
    tags: ['limits'],
    reason: 'Explains limits.',
    evidence: ['limits'],
    warnings: [],
  },
  publicationStatus: 'draft',
  assets: [asset('a', 0)],
  orderConfirmedAt: null,
  aiMetadata: {
    title: 'Limits lecture',
    category: 'Mathematics',
    subject: 'Mathematics',
    topics: ['limits'],
    keywords: ['limits'],
    documentType: 'lecture notes',
    instructor: null,
    lectureDate: null,
    description: 'Covers limits.',
    uncertaintyNotes: [],
  },
  studySummary: '',
  aiStudySummary: '',
  summarySources: [],
  generatedPdfUrl: null,
} as unknown as NoteDto;
const report = {
  fileCount: 1,
  files: [],
  studyGateStatus: 'approved',
  screening: { reason: 'Explains limits.', evidence: ['limits'], warnings: [] },
  metadataSuggested: true,
  pageOrderConfirmed: false,
  pdfReady: false,
  summaryReady: false,
  events: [
    {
      step: 'upload',
      status: 'completed',
      message: 'One file saved.',
      at: new Date().toISOString(),
    },
  ],
};

function setup(note = draft) {
  let current = note;
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === '/notes/n') return current as never;
    if (path === '/notes/n/ai-report') return report as never;
    if (path === '/notes/n/publish') {
      current = { ...current, publicationStatus: 'published' };
      return current as never;
    }
    if (path === '/notes/n/confirm-order') {
      current = { ...current, orderConfirmedAt: new Date().toISOString() };
      return current as never;
    }
    if (path === '/notes/n/suggest-order') {
      current = {
        ...current,
        aiPageOrder: { orderedAssetIds: ['b', 'a'], reasons: [], uncertainAssetIds: [] },
      };
      return current as never;
    }
    if (path === '/notes/n/review') return current as never;
    throw new Error(`Unexpected API call: ${path} ${options?.method || 'GET'}`);
  });
  render(
    <MemoryRouter initialEntries={['/notes/n/review']}>
      <Routes>
        <Route path="/notes/:id/review" element={<SmartReview />} />
        <Route path="/notes/:id" element={<p>Published page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(new Blob(['image'], { type: 'image/png' }), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
      ),
  );
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Smart Review', () => {
  it('shows factual processing and keeps publication behind explicit confirmations', async () => {
    setup();
    expect(await screen.findByText('AI Processing Report')).toBeTruthy();
    expect(screen.getByText(/One file saved/)).toBeTruthy();
    expect(screen.getByText(/AI suggestions awaiting your approval/)).toBeTruthy();
    const publish = screen.getByRole('button', { name: 'Publish note' }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/I have permission to share/));
    fireEvent.click(screen.getByLabelText(/I checked for personal information/));
    fireEvent.click(screen.getByLabelText(/I reviewed this note/));
    expect(publish.disabled).toBe(false);
    fireEvent.click(publish);
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        '/notes/n/publish',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('Published page')).toBeTruthy();
  });

  it('requires a separate confirmation after suggesting an image order', async () => {
    setup({ ...draft, assets: [asset('a', 0), asset('b', 1)], orderConfirmedAt: null } as NoteDto);
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest page order with AI' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use AI suggestion' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm final order' }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        '/notes/n/confirm-order',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ orderedAssetIds: ['b', 'a'] }),
        }),
      ),
    );
  });
});
