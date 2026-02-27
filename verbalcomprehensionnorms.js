export const CAIT_NORMS = {
  // Kelime Bilgisi: raw -> SS (mean=10, SD=3)
  // age corrections applied separately
  kb_raw_to_ss: {
    31:21, 30:20, 29:19, 28:18, 27:18, 26:17, 25:16, 24:16,
    23:15, 22:15, 21:14, 20:14, 19:13, 18:13, 17:12, 16:11,
    15:10, 14:10, 13:9,  12:9,  11:8,  10:8,  9:7,   8:6,
    7:5,   6:4,   5:4,   4:4,   3:4,   2:4,   1:4,   0:4
  },
  // age correction for KB SS
  kb_age_correction: [
    { min_age: 16, max_age: 17, delta: +1 },
    { min_age: 18, max_age: 34, delta:  0 },
    { min_age: 35, max_age: 99, delta: -1 }
  ],

  // Genel Kültür: raw -> SS
  gk_raw_to_ss: {
    32:22, 31:22, 30:21, 29:21, 28:21,
    27:20, 26:20, 25:19, 24:19, 23:18, 22:18,
    21:17, 20:17, 19:16, 18:15, 17:15, 16:14,
    15:13, 14:13, 13:12, 12:12, 11:11, 10:11,
    9:10,  8:9,   7:8,   6:7,   5:6,   4:5,
    3:4,   2:3,   1:2,   0:1
  },
  // age correction for GK SS
  gk_age_correction: [
    { min_age: 16, max_age: 17, delta: +2 },
    { min_age: 18, max_age: 19, delta: +1 },
    { min_age: 20, max_age: 29, delta:  0 },
    { min_age: 30, max_age: 99, delta: -1 }
  ],

  // VCI: kb_ss + gk_ss -> IQ (mean=100, SD=15), ci90 = ±10
  vci_ss_sum_to_iq: {
    45:168, 44:165, 43:162, 42:159, 41:157, 40:154,
    39:151, 38:149, 37:146, 36:143, 35:141, 34:138,
    33:135, 32:132, 31:130, 30:127, 29:124, 28:122,
    27:119, 26:116, 25:114, 24:111, 23:108, 22:105,
    21:103, 20:100, 19:97,  18:95,  17:92,  16:89,
    15:86,  14:84,  13:81,  12:78,  11:76,  10:73,
    9:70,   8:67,   7:64,   6:62,   5:59
  },
  vci_ci90: 10  // ±10 IQ points
};

// Convenience scoring function
export function scoreVCI(kb_raw, gk_raw, age_years) {
  // KB raw -> SS
  let kb_ss = CAIT_NORMS.kb_raw_to_ss[Math.min(kb_raw, 31)] ?? 4;
  const kb_corr = CAIT_NORMS.kb_age_correction.find(r => age_years >= r.min_age && age_years <= r.max_age);
  if (kb_corr) kb_ss = Math.max(1, Math.min(22, kb_ss + kb_corr.delta));

  // GK raw -> SS
  let gk_ss = CAIT_NORMS.gk_raw_to_ss[Math.min(gk_raw, 32)] ?? 1;
  const gk_corr = CAIT_NORMS.gk_age_correction.find(r => age_years >= r.min_age && age_years <= r.max_age);
  if (gk_corr) gk_ss = Math.max(1, Math.min(22, gk_ss + gk_corr.delta));

  const ss_sum = kb_ss + gk_ss;
  const clamped = Math.max(5, Math.min(45, ss_sum));
  const vci = CAIT_NORMS.vci_ss_sum_to_iq[clamped];

  return {
    kb_raw, gk_raw, age_years,
    kb_ss, gk_ss, ss_sum: clamped,
    vci,
    vci_ci90_lo: vci - 10,
    vci_ci90_hi: vci + 10
  };
}