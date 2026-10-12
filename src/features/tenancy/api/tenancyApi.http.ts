/**
 * Tenancy, against the real API.
 *
 * The language boundary lives here, as it does for users: the backend speaks
 * English and matches its own schema, the UI domain model is Indonesian. Mapping
 * in this file keeps the backend consistent with its published contract and
 * leaves every component unaware of which source it is running against.
 */
import { getList, getOne, send } from "@/lib/api";
import type { BranchEntity, ID, TenantEntity } from "@/types/domain";
import type {
  CreateTenantInput,
  CreateTenantResult,
  TenantDetail,
} from "./contract";

/** Mirrors the backend's tenant.Response exactly. */
interface TenantResponse {
  id: string;
  code: string;
  name: string;
  description?: string;
  /** Absolute, counted from the ROOT — not from the caller. */
  depth: number;
  tenant_kind: "group" | "operating";
  business_type_code?: string;
  business_type_name?: string;
  status: string;
  version: number;
}

interface AncestorResponse {
  id: string;
  code: string;
  name: string;
  distance: number;
}

interface DetailResponse extends TenantResponse {
  ancestors: AncestorResponse[];
  profile?: {
    legal_name: string;
    trade_name?: string;
    registration_number?: string;
    is_pkp: boolean;
    default_tax_percentage: number;
    address?: string;
    city?: string;
    province?: string;
    phone?: string;
    email?: string;
    timezone: string;
    latitude?: number;
    longitude?: number;
  };
}

interface CreateResponse extends TenantResponse {
  unit_term: string;
  outlet_term: string;
  supplier_term: string;
  accounts_created: number;
  document_sequences_created: number;
  founder_granted: boolean;
}

function toDomain(row: TenantResponse): TenantEntity {
  return {
    id: row.id,
    kode: row.code,
    nama: row.name,
    // The API does not return the parent id — the hierarchy reaches the client
    // as `depth` plus, on the detail endpoint, the ancestor list. A list is
    // therefore flat here and the tree is rebuilt from ancestors when needed.
    indukId: null,
    level: row.depth,
    jenisUsaha: row.business_type_code ?? "",
    jenis: row.tenant_kind === "group" ? "grup" : "operasional",
    aktif: row.status === "atv",
  };
}

export async function getTenants(): Promise<TenantEntity[]> {
  const page = await getList<TenantResponse>("/tenants", { pageSize: 100 });
  return page.items.map(toDomain);
}

export async function getTenant(id: ID): Promise<TenantDetail> {
  const row = await getOne<DetailResponse>(`/tenants/${id}`);
  return {
    ...toDomain(row),
    leluhur: row.ancestors.map((a) => ({
      id: a.id,
      kode: a.code,
      nama: a.name,
      jarak: a.distance,
    })),
    profil: row.profile && {
      namaLegal: row.profile.legal_name,
      namaDagang: row.profile.trade_name,
      nomorRegistrasi: row.profile.registration_number,
      pkp: row.profile.is_pkp,
      tarifPajakDefault: row.profile.default_tax_percentage,
      alamat: row.profile.address,
      kota: row.profile.city,
      provinsi: row.profile.province,
      telepon: row.profile.phone,
      email: row.profile.email,
      zonaWaktu: row.profile.timezone,
      lat: row.profile.latitude,
      lng: row.profile.longitude,
    },
  };
}

export async function createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
  const row = await send<CreateResponse>("post", "/tenants", {
    code: input.kode,
    name: input.nama,
    business_type_code: input.jenisUsaha,
    legal_name: input.namaLegal,
    registration_number: input.nomorRegistrasi,
    is_pkp: input.pkp,
    default_tax_percentage: input.tarifPajakDefault,
    city: input.kota,
    province: input.provinsi,
    phone: input.telepon,
    email: input.email,
    latitude: input.lat,
    longitude: input.lng,
    first_branch_code: input.cabangKode,
    first_branch_name: input.cabangNama,
    first_branch_city: input.cabangKota,
  });

  return {
    tenant: toDomain(row),
    istilah: {
      satuan: row.unit_term,
      outlet: row.outlet_term,
      pemasok: row.supplier_term,
    },
    jumlahAkun: row.accounts_created,
    jumlahPenomoran: row.document_sequences_created,
    pendiriDitunjuk: row.founder_granted,
  };
}

export async function deactivateTenant(id: ID): Promise<void> {
  await send<null>("delete", `/tenants/${id}`);
}

/** Mirrors the backend's branch.Response. */
interface BranchResponse {
  id: string;
  code: string;
  name: string;
  address?: string;
  city?: string;
  province?: string;
  manager_name?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  is_default: boolean;
  status: string;
}

export async function getBranches(actingTenantId: ID): Promise<BranchEntity[]> {
  const page = await getList<BranchResponse>("/branches", { pageSize: 100 });
  return page.items.map((row) => ({
    id: row.id,
    tenantId: actingTenantId,
    kode: row.code,
    nama: row.name,
    kota: row.city ?? "",
    provinsi: row.province ?? "",
    alamat: row.address ?? "",
    penanggungJawab: row.manager_name ?? "",
    telepon: row.phone ?? "",
    lat: row.latitude ?? 0,
    lng: row.longitude ?? 0,
    utama: row.is_default,
    aktif: row.status === "atv",
  }));
}
