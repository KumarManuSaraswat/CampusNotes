import { expectTypeOf, it } from 'vitest';
import type { StudyAssessment as ClassifierAssessment } from './classification/studyGateSchema.js';
import type { StudyAssessment } from './phase1Types.js';

it('keeps the shared assessment contract identical to Member 3 output', () => {
  expectTypeOf<StudyAssessment>().toEqualTypeOf<ClassifierAssessment>();
});
