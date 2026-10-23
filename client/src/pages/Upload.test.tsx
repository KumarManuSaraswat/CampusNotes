// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Upload } from './Upload';
vi.mock('../services/api', () => ({ uploadNote: vi.fn() }));
afterEach(cleanup);
describe('Upload form', () => {
  it('keeps manual metadata available and labels AI as unconfigured', () => {
    render(
      <MemoryRouter>
        <Upload />
      </MemoryRouter>,
    );
    expect(screen.getByText('AI organization — not yet configured')).toBeTruthy();
    expect(
      (screen.getByLabelText('AI organization — not yet configured') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.getByLabelText('Subject')).toBeTruthy();
    expect(screen.getByLabelText('Description')).toBeTruthy();
  });
  it('rejects an unsupported file before submitting', () => {
    render(
      <MemoryRouter>
        <Upload />
      </MemoryRouter>,
    );
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByRole('alert').textContent).toContain('Choose a PDF, JPG, or PNG file.');
  });
});
