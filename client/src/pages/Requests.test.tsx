// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Requests } from './Requests';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: vi.fn(),
  json: (method: string, body: unknown) => ({ method, body: JSON.stringify(body) }),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'requester' } }) }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../contexts/ToastContext', () => ({ useToast: () => toast }));
const request = {
  id: 'r1',
  title: 'SQL joins',
  subject: 'Databases',
  description: 'Worked examples needed',
  instructor: '',
  lectureDate: null,
  status: 'open',
  createdBy: { id: 'requester', name: 'Alex' },
  fulfilledNote: null,
};
const recommendation = {
  noteId: 'n1',
  title: 'SQL joins explained',
  subject: 'Databases',
  description: 'A study guide.',
  reason: 'These worked examples may help.',
  evidence: 'SQL joins',
};
let items: (typeof request)[];
let recommendations: (typeof recommendation)[];
let failure: string | null;
beforeEach(() => {
  vi.clearAllMocks();
  items = [request];
  recommendations = [recommendation];
  failure = null;
  vi.mocked(api).mockImplementation(async (path, options) => {
    if (path === '/users/me/notes') return [] as never;
    if (path.startsWith('/requests?')) return items as never;
    if (path === '/requests') {
      items = [request];
      return { id: 'r1' } as never;
    }
    if (path.endsWith('/recommendations')) {
      if (failure) throw new Error(failure);
      return { requestId: 'r1', recommendations, checkedAt: '2026-10-24T00:00:00Z' } as never;
    }
    if (path.endsWith('/accept-recommendation') && options?.method === 'PATCH') {
      items = [];
      return { id: 'r1', status: 'fulfilled', noteId: 'n1' } as never;
    }
    throw new Error('Unexpected API call: ' + path);
  });
});
afterEach(cleanup);
function setup() {
  render(
    <MemoryRouter>
      <Requests />
    </MemoryRouter>,
  );
}

describe('existing-note suggestions', () => {
  it('lets the requester preview then explicitly accept; never resolves merely by finding a match', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Find existing notes' }));
    expect(await screen.findByText('SQL joins explained')).toBeTruthy();
    const preview = screen.getByRole('link', {
      name: 'Preview SQL joins explained (opens in a new tab)',
    });
    expect(preview.getAttribute('href')).toBe('/notes/n1');
    expect(api).not.toHaveBeenCalledWith('/requests/r1/accept-recommendation', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Accept & resolve' }));
    expect(await screen.findByText('One less thing to chase. Request resolved!')).toBeTruthy();
    expect(api).toHaveBeenCalledWith('/requests/r1/accept-recommendation', {
      method: 'PATCH',
      body: JSON.stringify({ noteId: 'n1' }),
    });
    expect(
      screen.getByRole('link', { name: /Open SQL joins explained/ }).getAttribute('href'),
    ).toBe('/notes/n1');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Accept & resolve' })).toBeNull(),
    );
  });
  it('automatically checks existing notes after posting a request', async () => {
    items = [];
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'New request' }));
    fireEvent.change(screen.getByLabelText('Title or topic'), { target: { value: 'SQL joins' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Databases' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post request' }));
    expect(await screen.findByText('SQL joins explained')).toBeTruthy();
    expect(api).toHaveBeenCalledWith('/requests/r1/recommendations', {
      method: 'POST',
      body: '{}',
    });
    expect(api).not.toHaveBeenCalledWith('/requests/r1/accept-recommendation', expect.anything());
  });
  it('keeps the request open when no close match exists', async () => {
    recommendations = [];
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Find existing notes' }));
    expect(await screen.findByText('No close matches found in this search.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept & resolve' })).toBeNull();
    expect(screen.getByText('open')).toBeTruthy();
  });
  it('shows a recoverable provider failure without hiding the request', async () => {
    failure = 'Suggestions quota reached.';
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Find existing notes' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Suggestions quota reached.');
    expect(screen.getByText('Your request remains open for classmates to help.')).toBeTruthy();
    failure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Try suggestions again' }));
    expect(await screen.findByText('SQL joins explained')).toBeTruthy();
  });
  it('does not offer requester-only actions on someone else’s request', async () => {
    items = [{ ...request, createdBy: { id: 'someone-else', name: 'Sam' } }];
    setup();
    expect(await screen.findByRole('button', { name: 'Fulfill with my note' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Find existing notes' })).toBeNull();
  });
  it('refreshes suggestions when a note becomes unavailable before acceptance', async () => {
    const original = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path.endsWith('/accept-recommendation')) {
        recommendations = [];
        throw Object.assign(new Error('This note is no longer public.'), {
          code: 'NOTE_UNAVAILABLE',
        });
      }
      return original(path, options);
    });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Find existing notes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept & resolve' }));
    expect(await screen.findByText('No close matches found in this search.')).toBeTruthy();
    expect(screen.queryByText('One less thing to chase. Request resolved!')).toBeNull();
    expect(screen.getByText('open')).toBeTruthy();
  });
});
