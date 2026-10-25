/**
 * What every tenancy adapter must provide.
 *
 * The contract exists so the two implementations cannot drift — the same reason
 * `features/users/api/contract.ts` does. Without one, the mock returned a domain
 * entity and the HTTP adapter returned the wire shape, and the build broke only
 * in the pages that happened to read a field present in one and not the other.
 *
 * **Adapters return domain types.** The wire shape never escapes the HTTP
 * adapter: mapping there is what keeps every component unaware of which source
 * it is running against.
 */
import type { BranchEntity, ID, TenantEntity } from "@/types/domain";

/** One step of a tenant's breadcrumb, root first. */
export interface TenantAncestor {
  id: ID;
  kode: string;
  nama: string;
  /** How many levels up: 1 is the immediate parent. */
  jarak: number;
}

/**
 * A tenant's legal identity. Never inherited — a subsidiary that is its own PT
 * has its own NPWP, and falling back to its parent's would put the wrong tax
 * identity on an invoice.
 */
export interface TenantProfile {
  namaLegal: string;
  namaDagang?: string;
  nomorRegistrasi?: string;
  /** Registered for VAT. A non-PKP entity must not carry a tax rate at all. */
  pkp: boolean;
  tarifPajakDefault: number;
  alamat?: string;
  kota?: string;
  provinsi?: string;
  telepon?: string;
  email?: string;
  zonaWaktu: string;
  /** The registered OFFICE — not the distribution origin, which branches carry. */
  lat?: number;
  lng?: number;
}

export interface TenantDetail extends TenantEntity {
  /** Root first, and stopping at the deepest ancestor the caller may see. */
  leluhur: TenantAncestor[];
  profil?: TenantProfile;
}

/**
 * What creating a sub-tenant needs.
 *
 * The parent is absent on purpose: it is the tenant the caller is acting as.
 * Letting a client name it would move the decision from the session to the
 * payload, and the backend's row-level security reads the session either way.
 *
 * The first branch is required. `branch_id` is NOT NULL on nine operational
 * tables and document number series are issued per branch, so a tenant created
 * without one exists and can record nothing.
 */
export interface CreateTenantInput {
  kode: string;
  nama: string;
  jenisUsaha: string;

  namaLegal: string;
  nomorRegistrasi?: string;
  pkp: boolean;
  tarifPajakDefault: number;
  kota?: string;
  provinsi?: string;
  telepon?: string;
  email?: string;
  lat?: number;
  lng?: number;

  cabangKode: string;
  cabangNama: string;
  cabangKota?: string;
}

/** What provisioning built, so the caller can say it rather than imply it. */
export interface CreateTenantResult {
  tenant: TenantEntity;
  /** The vocabulary it starts with, from its business type. */
  istilah: { satuan: string; outlet: string; pemasok: string };
  /** Size of the starting chart of accounts. Zero means it cannot post. */
  jumlahAkun: number;
  /** Number series the new branch received. Zero means it cannot issue a document. */
  jumlahPenomoran: number;
  /** Whether the creator was made this tenant's first administrator. */
  pendiriDitunjuk: boolean;
}

export interface TenancyApi {
  /** The visible subtree: the acting tenant, its descendants and its ancestors. */
  getTenants(): Promise<TenantEntity[]>;
  getTenant(id: ID): Promise<TenantDetail>;
  createTenant(input: CreateTenantInput): Promise<CreateTenantResult>;
  /** Marks a tenant deleted. Never removes the row. */
  deactivateTenant(id: ID): Promise<void>;
  /**
   * Branches of the session's acting tenant, as row-level security scopes
   * them. `tenantId` is stamped with `actingTenantId`: the wire carries no
   * tenant, because the session already names it.
   */
  getBranches(actingTenantId: ID): Promise<BranchEntity[]>;
}
