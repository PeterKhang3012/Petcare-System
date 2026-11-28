import { api, data, pathId } from '../api/client';
import type { Page } from '../types';

export interface Intake { initial_condition: string; care_instructions?: string; belongings?: string[] }
export interface Handover { recipient_name: string; notes?: string; returned_belongings?: string[] }
export interface Visit {
  id: string;
  booking_id: string;
  state: 'PENDING' | 'IN_CARE' | 'COMPLETED';
  sync_state: 'PENDING' | 'SYNCED' | 'REJECTED';
  request_id?: string | null;
  snapshot: { pet: { name: string; species: string }; service: { name: string }; start_at: string; end_at: string };
  intake?: Intake;
  handover?: Handover;
  checked_in_at?: string;
  completed_at?: string;
  demo_clock?: { is_demo: boolean; version: number };
  checked_in_recorded_at?: string;
  completed_recorded_at?: string;
}

export interface CareRequest {
  request_id: string;
  visit_id: string;
  action: 'CHECK_IN' | 'CHECK_OUT';
  status: 'PENDING' | 'SUCCEEDED' | 'REJECTED';
  result?: { status?: number; code?: string; message?: string };
}

export const activities = {
  BATH: 'Tắm', FEED: 'Cho ăn', CLEAN: 'Vệ sinh', REST: 'Nghỉ ngơi',
  OBSERVE: 'Theo dõi', PREPARE_HANDOVER: 'Chuẩn bị bàn giao',
};
export type Activity = keyof typeof activities;
interface LogContent { activity: Activity; notes: string }
export interface CareLog extends LogContent {
  id: string;
  version: number;
  created_at: string;
  occurred_at?: string;
  edits: { before: LogContent; after: LogContent; reason: string; at: string; from_version: number }[];
}

const visits = '/care/visits';
const visitPath = (id: string) => visits + '/' + pathId(id);
const actionPath = (id: string, action: 'check-in' | 'check-out') => '/care/bookings/' + pathId(id) + '/' + action;

export const care = {
  list: (page: number, state?: string) =>
    data<Page & { visits: Visit[] }>(api.get(visits, { params: { page, state } })),
  get: (id: string) => data<{ visit: Visit }>(api.get(visitPath(id))),
  request: (id: string) => data<{ request: CareRequest }>(api.get('/care/requests/' + pathId(id))),
  checkIn: (id: string, input: Intake & { request_id: string; reason: string }) =>
    data<{ visit: Visit; request: CareRequest }>(api.post(actionPath(id, 'check-in'), input)),
  checkOut: (id: string, input: Handover & { request_id: string; reason: string }) =>
    data<{ visit: Visit; request: CareRequest }>(api.post(actionPath(id, 'check-out'), input)),
  logs: (id: string, page: number) => data<Page & { logs: CareLog[] }>(api.get(visitPath(id) + '/logs', { params: { page } })),
  addLog: (id: string, input: LogContent & { request_id: string }) =>
    data<{ log: CareLog }>(api.post(visitPath(id) + '/logs', input)),
  editLog: (id: string, logId: string, input: LogContent & { expected_version: number; reason: string }) =>
    data<{ log: CareLog }>(api.patch(visitPath(id) + '/logs/' + pathId(logId), input)),
};
