import { api, data, pathId } from '../api/client';
import type { Page } from '../types';

export interface PriceRule {
  price_rule_id: string;
  species: 'DOG' | 'CAT';
  coat_type?: 'SHORT' | 'LONG';
  min_weight_kg: number;
  max_weight_kg: number;
  max_inclusive?: boolean;
  unit_price: number;
}

export interface CatalogService {
  service_id: string;
  name: string;
  type: 'CARE' | 'BOARDING';
  room_tier?: import('../types').RoomTier;
  max_weight_inclusive?: boolean;
  allowed_species: ('DOG' | 'CAT')[];
  min_weight_kg: number;
  max_weight_kg: number;
  unit: 'SERVICE' | 'NIGHT' | 'DAY';
  duration_minutes: number | null;
  price_version_id: string;
  unit_price: number;
  price_rules?: PriceRule[];
  currency: string;
}

interface PriceVersion {
  price_rule_id?: string;
  price_version_id: string;
  currency: string;
  unit_price: number;
  old_unit_price: number | null;
  reason: string;
  created_at: string;
}

export const catalog = {
  list: (page: number, filters: { type?: string; species?: string } = {}) =>
    data<Page & { services: CatalogService[] }>(api.get('/catalog/services', { params: { page, ...filters } })),
  get: (id: string) => data<{ service: CatalogService }>(api.get('/catalog/services/' + pathId(id))),
  history: (id: string, page: number) =>
    data<Page & { history: PriceVersion[] }>(api.get('/catalog/services/' + pathId(id) + '/price-history', { params: { page } })),
  update: (id: string, input: { unit_price: number; reason: string; expected_price_version: string; price_rule_id?: string }) =>
    data<{ price: PriceVersion }>(api.patch('/catalog/services/' + pathId(id) + '/price', input)),
};

export function bookingPath(type: CatalogService['type'], serviceId?: string) {
  const path = type === 'BOARDING' ? '/bookings/boarding/new' : '/bookings/care/new';
  return serviceId ? path + '?service=' + pathId(serviceId) : path;
}

export async function bookingServices(type: CatalogService['type']) {
  const first = await catalog.list(1, { type });
  const services = [...first.services];
  for (let page = 2; page <= Math.ceil(first.total / first.limit); page++) {
    services.push(...(await catalog.list(page, { type })).services);
  }
  return services;
}
