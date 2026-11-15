const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const fmtAltitude = (ft: number | null): string =>
  ft === null ? "alt n/a" : `${INT.format(Math.round(ft))} ft`;

export const fmtSpeed = (kt: number | null): string =>
  kt === null ? "speed n/a" : `${INT.format(Math.round(kt))} kt`;

export const fmtHeading = (deg: number | null): string => {
  if (deg === null) return "hdg n/a";
  const wrapped = ((Math.round(deg) % 360) + 360) % 360;
  return `${String(wrapped).padStart(3, "0")}°`;
};

export const fmtVerticalRate = (fpm: number | null): string => {
  if (fpm === null) return "v/s n/a";
  const rounded = Math.round(fpm);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${INT.format(rounded)} fpm`;
};

export const fmtTcpa = (sec: number): string =>
  sec < 0.5 ? "now" : `${Math.round(sec)} s`;

export const fmtNm = (nm: number): string => `${nm.toFixed(1)} NM`;

export const fmtFeet = (ft: number): string => `${INT.format(Math.round(ft))} ft`;

export const fmtClock = (unix: number): string =>
  new Date(unix * 1000).toLocaleTimeString("en-US", { hour12: false });

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
