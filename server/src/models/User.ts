import mongoose, { Schema } from 'mongoose';
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['student', 'moderator'], default: 'student', immutable: true },
  },
  { timestamps: true },
);
export const User = mongoose.model('User', userSchema);
