import { api, data, pathId } from '../api/client';
import type { Page } from '../types';

export interface CatalogService {
  service_id: string;
  name: string;
  type: 'CARE' | 'BOARDING';
  allowed_species: ('DOG' | 'CAT')[];
  min_weight_kg: number;
  max_weight_kg: number;
  unit: 'SERVICE' | 'NIGHT';
  duration_minutes: number | null;
  price_version_id: string;
  unit_price: number;
  currency: string;
}

interface PriceVersion {
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
  update: (id: string, input: { unit_price: number; reason: string; expected_price_version: string }) =>
    data<{ price: PriceVersion }>(api.patch('/catalog/services/' + pathId(id) + '/price', input)),
};

export async function bookingServices() {
  const first = await catalog.list(1);
  const services = [...first.services];
  for (let page = 2; page <= Math.ceil(first.total / first.limit); page++) {
    services.push(...(await catalog.list(page)).services);
  }
  return services;
}
