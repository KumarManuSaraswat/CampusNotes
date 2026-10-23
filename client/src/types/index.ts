export type { NoteDto, ApiResponse, ApiError } from '@campusnotes/shared';
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'moderator';
  createdAt: string;
}
export interface Profile extends User {
  points: number;
  badges: string[];
  uploads: number;
  fulfilled: number;
}
export interface NoteRequest {
  id: string;
  title: string;
  subject: string;
  instructor: string;
  lectureDate: string | null;
  description: string;
  status: 'open' | 'fulfilled';
  createdAt: string;
  createdBy: { id: string; name: string };
  fulfilledBy: { id: string; name: string } | null;
  fulfilledNote: { id: string; title: string } | null;
}
export interface Report {
  id: string;
  note: { id: string; title: string } | null;
  reportedBy: string;
  reason: string;
  description: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
