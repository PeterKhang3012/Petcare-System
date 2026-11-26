export type Role = 'USER' | 'STAFF';
export interface User { id: string; username: string; role: Role; permissions: string[]; full_name?: string; phone?: string }
export interface Credentials { username: string; password: string }
export interface RegistrationInput extends Credentials { full_name: string; phone: string; confirm_password: string }
export interface Page { page: number; limit: number; total: number }
export interface PetInput {
  name: string;
  species: 'DOG' | 'CAT';
  coat_type?: 'SHORT' | 'LONG';
  weight_kg: number;
  breed?: string;
  date_of_birth?: string;
  care_notes?: string;
}
export interface Pet extends PetInput {
  id: string;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
}
export type BookingInput = { pet_id: string; service_id: string } &
  ({ start_at: string } | { check_in_date: string; check_out_date: string });
export interface CareSlot {
  start_at: string;
  end_at: string;
  available: number;
  status: 'AVAILABLE' | 'FULL' | 'PET_BUSY' | 'OUTSIDE_BOOKING_WINDOW';
}
export interface Quote {
  pet_version?: number;
  price_version_id: string;
  total_amount: number;
  currency: string;
  start_at: string;
  end_at: string;
}
export interface Booking extends Quote {
  id: string;
  pet_id: string;
  service_id: string;
  status: string;
  expires_at?: string;
  accepted_payment_id?: string;
  pet_snapshot?: { name: string };
}
export interface History { id: string; at: string; action: string; reason?: string; from?: string; to?: string }
export interface Resource { id: string; code: string; group: 'CARE' | 'BOARDING'; state: string }
export interface Maintenance { id: string; reason: string; start_at: string; end_at: string; status: string }
export interface Payment {
  payment_id: string;
  booking_id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  expires_at?: string;
  payment_url?: string;
  verified_at?: string;
  booking_sync_status?: 'PENDING' | 'DELIVERED' | 'REJECTED' | 'DEAD_LETTER';
  booking_sync_outcome?: string;
}
