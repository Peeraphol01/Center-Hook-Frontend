// /api/admins — จัดการบัญชีผู้ดูแล (อ้างอิง center-hook src/docs/openapi/admins.yaml)
import type { Account, AccountStatus, Permission, Role } from "@/app/types/api/auth";

// แถวในรายการบัญชี (can_manage = ผู้เรียกแก้/ลบบัญชีนี้ได้: role ต่ำกว่าและไม่ใช่ตัวเอง)
export interface AdminListItem extends Account {
  can_manage: boolean;
}

export interface AdminListResponse {
  data: AdminListItem[];
}

// body ของ POST /api/admins
export interface CreateAdminBody {
  username: string;
  password: string;
  full_name: string;
  role: Role;
  status: AccountStatus;
  permissions: Permission[];
}

// body ของ PATCH /api/admins/:id (permissions = แทนที่ทั้งชุด)
export type UpdateAdminBody = Partial<Omit<CreateAdminBody, "username" | "password">>;
