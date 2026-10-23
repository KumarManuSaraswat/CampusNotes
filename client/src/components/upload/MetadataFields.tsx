import type { ChangeEvent } from 'react';
export interface Metadata {
  title: string;
  subject: string;
  tags: string;
  instructor: string;
  lectureDate: string;
  semester: string;
  description: string;
}
export const blankMetadata: Metadata = {
  title: '',
  subject: '',
  tags: '',
  instructor: '',
  lectureDate: '',
  semester: '',
  description: '',
};
export function MetadataFields({
  value,
  onChange,
}: {
  value: Metadata;
  onChange: (value: Metadata) => void;
}) {
  function change(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChange({ ...value, [e.target.name]: e.target.value });
  }
  return (
    <div className="fields-grid">
      <label className="field full">
        Title{' '}
        <input
          name="title"
          value={value.title}
          onChange={change}
          maxLength={160}
          placeholder="e.g. Linear algebra — eigenvalues"
        />
      </label>
      <label className="field">
        Subject{' '}
        <input
          name="subject"
          value={value.subject}
          onChange={change}
          maxLength={100}
          placeholder="e.g. Mathematics"
        />
      </label>
      <label className="field">
        Topics{' '}
        <input
          name="tags"
          value={value.tags}
          onChange={change}
          placeholder="Comma-separated topics"
        />
      </label>
      <label className="field">
        Instructor{' '}
        <input
          name="instructor"
          value={value.instructor}
          onChange={change}
          maxLength={100}
          placeholder="Optional"
        />
      </label>
      <label className="field">
        Lecture date{' '}
        <input name="lectureDate" type="date" value={value.lectureDate} onChange={change} />
      </label>
      <label className="field">
        Semester{' '}
        <input
          name="semester"
          value={value.semester}
          onChange={change}
          maxLength={40}
          placeholder="e.g. Semester 3"
        />
      </label>
      <label className="field full">
        Description{' '}
        <textarea
          name="description"
          value={value.description}
          onChange={change}
          maxLength={2000}
          rows={4}
          placeholder="What is covered in these notes?"
        />
      </label>
    </div>
  );
}
