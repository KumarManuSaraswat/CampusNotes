import mongoose from 'mongoose';
import { Note } from '../../models/Note.js';
import { NoteRequest } from '../../models/NoteRequest.js';
import { publicNoteQuery } from '../ai/noteVisibility.js';
export async function reputationFor(userId: string) {
  const [uploads, upvotes, fulfilled] = await Promise.all([
    Note.countDocuments({ uploadedBy: userId, ...publicNoteQuery }),
    Note.aggregate([
      { $match: { uploadedBy: new mongoose.Types.ObjectId(userId), ...publicNoteQuery } },
      { $group: { _id: null, total: { $sum: '$upvoteCount' } } },
    ]),
    NoteRequest.countDocuments({
      fulfilledBy: userId,
      status: 'fulfilled',
      fulfilledNote: { $in: await Note.find(publicNoteQuery).distinct('_id') },
    }),
  ]);
  const points = uploads * 5 + (upvotes[0]?.total || 0) * 2 + fulfilled * 10;
  const badges = [
    ...(uploads >= 1 ? ['First Contribution'] : []),
    ...(fulfilled >= 5 ? ['Community Helper'] : []),
  ];
  return { points, badges, uploads, fulfilled };
}
