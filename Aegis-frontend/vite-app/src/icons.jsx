import React from "react";

// Lightweight inline-SVG icons (Lucide-flavored, 1.6 stroke @ 18px).
// Hand-picked subset — we don't ship full Lucide so layouts stay deterministic.

const Icon = ({ name, size = 16, stroke = 1.6, className = "", style }) => {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true"
    >
      {paths}
    </svg>
  );
};

const ICONS = {
  // chrome / nav
  grid:    (<g><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></g>),
  factory: (<g><path d="M2 20V9l6 4V9l6 4V6l6 14H2z" /><path d="M9 20v-4" /><path d="M14 20v-4" /></g>),
  alert:   (<g><path d="M12 9v4" /><circle cx="12" cy="17" r=".5" /><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></g>),
  activity:(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />),
  events:  (<g><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></g>),
  report:  (<g><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M8 13h6M8 17h8" /></g>),
  layers:  (<g><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></g>),
  globe:   (<g><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20" /></g>),
  settings:(<g><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></g>),
  help:    (<g><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 3-3 3" /><circle cx="12" cy="17" r=".5" /></g>),
  // ui
  search:  (<g><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></g>),
  bell:    (<g><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></g>),
  chevDown:(<polyline points="6 9 12 15 18 9" />),
  chevRight:(<polyline points="9 6 15 12 9 18" />),
  chevLeft:(<polyline points="15 6 9 12 15 18" />),
  plus:    (<g><path d="M12 5v14M5 12h14" /></g>),
  arrowUp: (<g><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></g>),
  arrowDown:(<g><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></g>),
  arrowRight:(<g><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></g>),
  arrowLeft:(<g><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></g>),
  external:(<g><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></g>),
  more:    (<g><circle cx="5"  cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></g>),
  filter:  (<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />),
  refresh: (<g><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></g>),
  download:(<g><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></g>),
  expand:  (<g><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></g>),
  // status
  check:   (<polyline points="20 6 9 17 4 12" />),
  x:       (<g><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></g>),
  info:    (<g><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></g>),
  pulse:   (<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />),
  // domains
  thermo:  (<g><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z" /></g>),
  drop:    (<path d="M12 2.5s7 7.58 7 12.5a7 7 0 0 1-14 0c0-4.92 7-12.5 7-12.5z" />),
  wind:    (<g><path d="M9.59 4.59A2 2 0 1 1 11 8H2" /><path d="M12.59 14.59A2 2 0 1 0 14 18H2" /><path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" /></g>),
  vibe:    (<g><line x1="2" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="22" y2="12" /><polyline points="6 6 9 18 12 4 15 20 18 6" /></g>),
  power:   (<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />),
  server:  (<g><rect x="2" y="3" width="20" height="8" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" /><line x1="6" y1="7" x2="6.01" y2="7" /><line x1="6" y1="17" x2="6.01" y2="17" /></g>),
  net:     (<g><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" /></g>),
  cpu:     (<g><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="2" x2="9" y2="4" /><line x1="15" y1="2" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="22" /><line x1="15" y1="20" x2="15" y2="22" /><line x1="20" y1="9" x2="22" y2="9" /><line x1="20" y1="15" x2="22" y2="15" /><line x1="2" y1="9" x2="4" y2="9" /><line x1="2" y1="15" x2="4" y2="15" /></g>),
  // misc
  pin:     (<g><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" /></g>),
  shield:  (<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  clock:   (<g><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></g>),
  trend:   (<g><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></g>),
  user:    (<g><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></g>),
  doc:     (<g><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></g>),
  pi:      (<g><path d="M5 6h14" /><path d="M9 6v12" /><path d="M16 6v9a3 3 0 0 0 3 3" /></g>),
  zap:     (<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />),
  map:     (<g><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></g>),
};

export { Icon };
