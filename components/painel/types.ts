import type { AuthUser } from '@/lib/auth';

export interface ProvinceItem {
  id: number;
  code: string;
  name: string;
  is_active: number;
}

export interface MunicipalityItem {
  id: number;
  province_id: number;
  name: string;
}

export interface CategoryItem {
  id: number;
  code: string;
  name: string;
  monthly_quota_aoa: number;
  description: string;
}

export interface DepartmentItem {
  id: number;
  code: string;
  name: string;
}

export interface RoleItem {
  code: string;
  name: string;
  scope: 'NATIONAL' | 'PROVINCIAL' | 'MEMBER';
  rank: number;
}

export interface CatalogData {
  settings: {
    organization_name: string;
    acronym: string;
    slogan: string;
    logo_path: string;
    nif: string;
    headquarters_address: string;
    contact_email: string;
    contact_phone: string;
    last_backup_at: string | null;
  };
  provinces: ProvinceItem[];
  municipalities: MunicipalityItem[];
  categories: CategoryItem[];
  departments: DepartmentItem[];
  roles: RoleItem[];
}

export interface PanelProps {
  user: AuthUser;
  catalog: CatalogData;
  onNavigateTab: (tab: string) => void;
}
