import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, BookOpen, HeartHandshake, Star } from 'lucide-react';
import type { Profile as ProfileType } from '../types';
import { api } from '../services/api';
export function Profile() {
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<ProfileType>('/users/me/profile')
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="container page narrow">
      <div className="page-heading">
        <span className="eyebrow">Your place in the community</span>
        <h1>Profile</h1>
      </div>
      {error ? (
        <p className="form-error">{error}</p>
      ) : !profile ? (
        <div className="loading">Loading profile…</div>
      ) : (
        <>
          <div className="surface profile-hero">
            <div className="avatar">{profile.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <h2>{profile.name}</h2>
              <p>{profile.email}</p>
              <small>Member since {new Date(profile.createdAt).toLocaleDateString()}</small>
            </div>
          </div>
          <div className="profile-stats">
            <div className="surface">
              <Star size={23} />
              <strong>{profile.points}</strong>
              <span>Reputation points</span>
            </div>
            <div className="surface">
              <BookOpen size={23} />
              <strong>{profile.uploads}</strong>
              <span>Notes shared</span>
            </div>
            <div className="surface">
              <HeartHandshake size={23} />
              <strong>{profile.fulfilled}</strong>
              <span>Requests fulfilled</span>
            </div>
          </div>
          <div className="surface badge-panel">
            <h2>
              <Award size={20} /> Badges
            </h2>
            {profile.badges.length ? (
              <div className="badge-list">
                {profile.badges.map((b) => (
                  <span className="badge" key={b}>
                    <Award size={17} />
                    {b}
                  </span>
                ))}
              </div>
            ) : (
              <p>Share a note to earn your first badge.</p>
            )}
          </div>
          <Link className="button" to="/my-notes">
            View my notes
          </Link>
        </>
      )}
    </div>
  );
}
