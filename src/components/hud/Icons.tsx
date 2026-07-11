import React from 'react';

type P = { size?: number; className?: string };

function S({
  size = 18,
  className,
  children,
  fill,
}: P & { children: React.ReactNode; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconPlay = (p: P) => (
  <S {...p} fill>
    <path d="M7 4.5v15l13-7.5z" />
  </S>
);

export const IconPause = (p: P) => (
  <S {...p} fill>
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
  </S>
);

export const IconRestart = (p: P) => (
  <S {...p}>
    <path d="M6 5v14" />
    <path d="M19 5.5v13l-10-6.5z" fill="currentColor" stroke="none" />
  </S>
);

export const IconBack5 = (p: P) => (
  <S {...p}>
    <path d="M11 6.5v11l-8-5.5z" fill="currentColor" stroke="none" />
    <path d="M21 6.5v11l-8-5.5z" fill="currentColor" stroke="none" />
  </S>
);

export const IconFwd5 = (p: P) => (
  <S {...p}>
    <path d="M3 6.5v11l8-5.5z" fill="currentColor" stroke="none" />
    <path d="M13 6.5v11l8-5.5z" fill="currentColor" stroke="none" />
  </S>
);

export const IconBroadcast = (p: P) => (
  <S {...p}>
    <rect x="3" y="6" width="14" height="10" rx="1.6" />
    <path d="M8 20h4M10 16v4" />
    <path d="M19.2 8.6a4 4 0 0 1 0 4.8M21.4 6.8a7 7 0 0 1 0 8.4" />
  </S>
);

export const IconCinematic = (p: P) => (
  <S {...p}>
    <rect x="3" y="8" width="18" height="12" rx="1.6" />
    <path d="M3 8l3.4-3.4 3 3M9.4 8l3.4-3.4 3 3M15.8 8l3.4-3.4" />
  </S>
);

export const IconOrbit = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="4" />
    <ellipse cx="12" cy="12" rx="10" ry="4.4" transform="rotate(-28 12 12)" />
  </S>
);

export const IconFly = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="2.4" />
    <path d="M12 9.6V5m0 14v-4.6m2.4-2.4H19M5 12h4.6" />
    <circle cx="5" cy="5" r="1.6" />
    <circle cx="19" cy="5" r="1.6" />
    <circle cx="5" cy="19" r="1.6" />
    <circle cx="19" cy="19" r="1.6" />
    <path d="M6.1 6.1l4.2 4.2M17.9 6.1l-4.2 4.2M6.1 17.9l4.2-4.2M17.9 17.9l-4.2-4.2" />
  </S>
);

export const IconFollow = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </S>
);

export const IconFootage = (p: P) => (
  <S {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1.6" />
    <path d="M7 5v14M17 5v14M3 9.6h4M3 14.4h4M17 9.6h4M17 14.4h4" />
  </S>
);

export const IconClose = (p: P) => (
  <S {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);

export const IconArrowLeft = (p: P) => (
  <S {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </S>
);

export const IconSlow = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="13" r="7" />
    <path d="M12 13V9.5M12 4.5h0M9 3.5h6" />
  </S>
);

export const IconJump = (p: P) => (
  <S {...p}>
    <path d="M4 5v14l9-7zM15 5v14M20 5v14" />
  </S>
);

export const IconStats = (p: P) => (
  <S {...p}>
    <path d="M4 7h7M13 7h7M4 12h4M16 12h4M4 17h6M14 17h6" />
    <path d="M12 4v16" />
  </S>
);

export const IconPitch = (p: P) => (
  <S {...p}>
    <rect x="3" y="6" width="18" height="12" rx="1.6" />
    <path d="M12 6v12" />
    <circle cx="12" cy="12" r="2.4" />
  </S>
);

export const IconExpand = (p: P) => (
  <S {...p}>
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
  </S>
);

export const IconCollapse = (p: P) => (
  <S {...p}>
    <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
  </S>
);

export const IconHelp = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.1-2.6 3.6" />
    <circle cx="12" cy="17" r="0.4" fill="currentColor" stroke="none" />
  </S>
);

export const IconChevronUp = (p: P) => (
  <S {...p}>
    <path d="M6 14l6-6 6 6" />
  </S>
);

export const IconChevronDown = (p: P) => (
  <S {...p}>
    <path d="M6 10l6 6 6-6" />
  </S>
);
