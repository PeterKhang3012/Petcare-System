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
  ({ start_at: string } | { check_in_date: string; check_out_date: string; check_in_time?: string; check_out_time?: string });
export interface CareSlot {
  start_at: string;
  end_at: string;
  available: number;
  status: 'AVAILABLE' | 'FULL' | 'PET_BUSY' | 'OUTSIDE_BOOKING_WINDOW';
}
export interface Quote {
  nights?: number;
  quantity?: number;
  pet_version?: number;
  price_version_id: string;
  total_amount: number;
  currency: string;
  start_at: string;
  end_at: string;
}
export interface Booking extends Quote {
  service_snapshot?: { type?: Resource['group']; price_rule_id?: string; room_tier?: RoomTier; name?: string };
  id: string;
  pet_id: string;
  service_id: string;
  status: string;
  expires_at?: string;
  accepted_payment_id?: string;
  pet_snapshot?: { name: string };
}
export type DemoCommand = 'TO_APPOINTMENT' | 'TO_HANDOVER';
export interface DemoClock {
  enabled: boolean;
  is_demo: boolean;
  real_now: string;
  business_now: string;
  version: number;
  stage?: DemoCommand;
}
export interface StaffBookingDetails { booking: Booking; demo_clock?: DemoClock; resource?: Resource | null }
export interface History { id: string; at: string; action: string; reason?: string; from?: string; to?: string }
export type RoomTier = 'S' | 'M' | 'L' | 'XL';
export interface Resource {
  id: string; code: string; group: 'CARE' | 'BOARDING'; state: string;
  species?: ('DOG' | 'CAT')[];
  room_tier?: RoomTier;
  max_weight_kg?: number;
  max_weight_inclusive?: boolean;
  dimensions_cm?: number[];
}
export interface ResourceAllocation {
  id: string; booking_id?: string; type: 'BOOKING' | 'MAINTENANCE'; start_at: string; end_at: string;
}
export interface Maintenance { id: string; reason: string; start_at: string; end_at: string; status: string }
interface StaffPaymentSummary {
  payment_id: string;
  booking_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface StaffTransaction extends StaffPaymentSummary {
  sync_status: string | null;
  booking_outcome: string | null;
  reconciliation_result: string | null;
  response_code: string | null;
  transaction_status: string | null;
  requested_at: string | null;
}

export interface StaffRefund extends StaffPaymentSummary {
  event_id: string;
  reason: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  gateway_response_code: string | null;
  gateway_status: string | null;
  gateway_transaction_no: string | null;
  gateway_check: string | null;
}

export interface StaffTransactions extends Page { transactions: StaffTransaction[] }
export interface StaffRefunds extends Page { refunds: StaffRefund[] }

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
