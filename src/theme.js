export const C = {
  bg: '#0B1020',
  surface: '#141B34',
  surface2: '#1B2340',
  border: '#232B4A',
  amber: '#F5B942',
  amberSoft: '#3A2E12',
  ink: '#E7EAF5',
  muted: '#8A93B2',
  dim: '#5B6488',
  red: '#FF6B6B',
  green: '#34D399',
};

export const RADIUS = 16;

export function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}
