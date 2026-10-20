import React, { useEffect, useState } from 'react';
import logoImg from '../../assets/astrosivam_logo.png';

/**
 * Placeholder photos seeded by the original install point at Unsplash stock
 * portraits — real pictures of people who are not on this team. They must never
 * be shown as an astrologer, so they are treated exactly like "no photo".
 */
export function isUsableTeamPhoto(url?: string | null): boolean {
  const value = (url || '').trim();
  if (!value) return false;
  if (/unsplash\.com/i.test(value)) return false;
  return true;
}

interface TeamMemberAvatarProps {
  /** Uploaded (/api/uploads/team/…) or externally hosted portrait URL. */
  photoUrl?: string | null;
  /** Used as the image alt text, so screen readers name the scholar. */
  name: string;
  className?: string;
  imageClassName?: string;
  emblemClassName?: string;
}

/**
 * One team portrait, with a graceful fall back to the ASTRO SIVAM emblem when
 * there is no photo or the URL does not load. Errors are handled per card so a
 * single broken link can never leave a blank square on the team page.
 */
export const TeamMemberAvatar: React.FC<TeamMemberAvatarProps> = ({
  photoUrl,
  name,
  className = '',
  imageClassName = 'w-full h-full object-cover',
  emblemClassName = 'w-full h-full object-contain'
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [photoUrl]);

  const showPhoto = isUsableTeamPhoto(photoUrl) && !failed;

  return (
    <div className={className}>
      {showPhoto ? (
        <img
          src={String(photoUrl).trim()}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={imageClassName}
        />
      ) : (
        <img src={logoImg} alt="ASTRO SIVAM Emblem" className={emblemClassName} />
      )}
    </div>
  );
};
