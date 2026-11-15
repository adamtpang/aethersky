// Exact SI conversions. See docs/tech-spec.md section 4.

export const METERS_PER_NM = 1852;
export const METERS_PER_FT = 0.3048;
export const MPS_PER_KT = 1852 / 3600;
export const MPS_PER_FPM = 0.3048 / 60;

export const nmToMeters = (nm: number): number => nm * METERS_PER_NM;
export const metersToNm = (m: number): number => m / METERS_PER_NM;

export const ftToMeters = (ft: number): number => ft * METERS_PER_FT;
export const metersToFt = (m: number): number => m / METERS_PER_FT;

export const ktToMps = (kt: number): number => kt * MPS_PER_KT;
export const mpsToKt = (mps: number): number => mps / MPS_PER_KT;

export const fpmToMps = (fpm: number): number => fpm * MPS_PER_FPM;
export const mpsToFpm = (mps: number): number => mps / MPS_PER_FPM;

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;
