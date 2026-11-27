import { api, data, idempotency, pathId } from '../api/client';
import type { Booking, BookingInput, CareSlot, Credentials, DemoCommand, History, Maintenance, Page, Payment, Pet, PetInput, Quote, RegistrationInput, Resource, StaffBookingDetails, User } from '../types';

export const auth = {
  login: (input: Credentials) => data<{ accessToken: string }>(api.post('/auth/login', input)),
  register: (input: RegistrationInput) => api.post('/auth/register', input),
  me: () => data<{ user: User }>(api.get('/auth/me')),
};

export const pets = {
  list: (page = 1, status = 'ACTIVE') => data<Page & { pets: Pet[] }>(api.get('/pets', { params: { page, status, limit: 20 } })),
  get: (id: string) => data<{ pet: Pet }>(api.get('/pets/' + pathId(id))),
  create: (input: PetInput) => data<{ pet: Pet }>(api.post('/pets', input)),
  update: (id: string, input: PetInput) => data<{ pet: Pet }>(api.patch('/pets/' + pathId(id), input)),
  archive: (id: string) => data<{ pet: Pet }>(api.post('/pets/' + pathId(id) + '/archive', {})),
};

export const bookings = {
  list: (page = 1, status?: string) => data<Page & { bookings: Booking[] }>(api.get('/bookings', { params: { page, status, limit: 10 } })),
  get: (id: string) => data<{ booking: Booking }>(api.get('/bookings/' + pathId(id))),
  petStatuses: (ids: string[]) => data<{ statuses: Record<string, string> }>(api.get('/bookings/pet-statuses', { params: { pet_ids: ids.join(',') } })),
  quote: (input: BookingInput) => data<{ quote: Quote }>(api.post('/bookings/quotes', input)),
  availability: (input: BookingInput) => data<{ available: Resource[] }>(api.get('/bookings/availability', { params: input })),
  careSlots: (date: string, pet_id: string, service_id: string) =>
    data<{ slots: CareSlot[] }>(api.get('/bookings/availability', { params: { date, pet_id, service_id } })),
  create: (input: BookingInput & { expected_price_version: string; expected_pet_version?: number }, key: string) =>
    data<{ booking: Booking }>(api.post('/bookings', input, idempotency(key))),
  history: (id: string, page: number) => data<Page & { history: History[] }>(api.get('/bookings/' + pathId(id) + '/history', { params: { page } })),
  cancel: (id: string, reason: string, key: string) =>
    api.post('/bookings/' + pathId(id) + '/cancel', { reason }, idempotency(key)),
};

export const staff = {
  schedule: (page: number, from?: string, to?: string) =>
    data<Page & { bookings: Booking[] }>(api.get('/staff/bookings', { params: { page, from, to } })),
  booking: (id: string) => data<StaffBookingDetails>(api.get('/staff/bookings/' + pathId(id))),
  advanceDemo: (id: string, command: DemoCommand, key: string) =>
    data<StaffBookingDetails>(api.post('/staff/bookings/' + pathId(id) + '/demo-clock', { command }, idempotency(key))),
  resources: (page: number, group?: string, state?: string) =>
    data<Page & { resources: Resource[] }>(api.get('/staff/resources', { params: { page, group, state } })),
  history: (id: string, page: number) =>
    data<Page & { history: History[] }>(api.get('/staff/resources/' + pathId(id) + '/history', { params: { page } })),
  maintenance: (id: string, page: number) =>
    data<Page & { maintenance: Maintenance[] }>(api.get('/staff/resources/' + pathId(id) + '/maintenance', { params: { page } })),
  clean: (id: string, reason: string) => api.post('/staff/resources/' + pathId(id) + '/cleaning-complete', { reason }),
  createMaintenance: (id: string, input: { reason: string; start_at: string; end_at: string }) =>
    api.post('/staff/resources/' + pathId(id) + '/maintenance', input),
  cancelMaintenance: (id: string, maintenanceId: string, reason: string) =>
    api.post('/staff/resources/' + pathId(id) + '/maintenance/' + pathId(maintenanceId) + '/cancel', { reason }),
};

export const payments = {
  create: async (booking_id: string, key: string, policyAccepted: boolean) =>
    (await api.post<Payment>('/payments', { booking_id, policy_accepted: policyAccepted }, idempotency(key))).data,
  get: async (id: string) => (await api.get<Payment>('/payments/' + pathId(id))).data,
};
