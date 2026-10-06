/** How a stored title code is written on screens and tickets. */
export const TITLE_LABEL: Record<string, string> = {
  MR: 'Mr',
  MRS: 'Mrs',
  MS: 'Ms',
  MSTR: 'Master',
  MISS: 'Miss',
  MX: 'Mx',
  DR: 'Dr',
};

export const titleLabel = (code: string) => TITLE_LABEL[code] ?? code;
