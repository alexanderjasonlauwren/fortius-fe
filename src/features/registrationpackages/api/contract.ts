/**
 * What every registration package adapter must provide.
 *
 * Mirrors fortius-backend's internal/entities/registrationpackage package:
 * a reusable Pendaftaran Pangkalan template a registration invoice picks
 * a fee/kit-item set from (financial-statements plan P5). Gap-closing
 * plan, Phase C.
 */

export interface RegistrationPackageItem {
  productId: string;
  productCode: string;
  productName: string;
  qty: number;
}

export interface RegistrationPackage {
  id: string;
  name: string;
  feeAmount: number;
  isDefault: boolean;
  isActive: boolean;
  items: RegistrationPackageItem[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationPackageItemInput {
  productId: string;
  qty: number;
}

export interface CreateRegistrationPackageInput {
  name: string;
  feeAmount: number;
  isDefault?: boolean;
  items?: RegistrationPackageItemInput[];
}

/** Replaces a package's fields and kit items wholesale. */
export interface UpdateRegistrationPackageInput {
  id: string;
  version: number;
  name: string;
  feeAmount: number;
  isDefault: boolean;
  isActive: boolean;
  items?: RegistrationPackageItemInput[];
}

export interface RegistrationPackageApi {
  listPackages(): Promise<RegistrationPackage[]>;
  getPackage(id: string): Promise<RegistrationPackage>;
  createPackage(input: CreateRegistrationPackageInput): Promise<RegistrationPackage>;
  updatePackage(input: UpdateRegistrationPackageInput): Promise<RegistrationPackage>;
}
