/** A traveller saved on the profile (SOP §6.3), offered on every checkout form. */
export interface SavedTraveller {
  id: string;
  title: 'MR' | 'MRS' | 'MS' | 'MISS' | 'MSTR' | 'DR' | null;
  firstName: string;
  lastName: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  /** YYYY-MM-DD */
  dob: string | null;
  updatedAt: string;
}
