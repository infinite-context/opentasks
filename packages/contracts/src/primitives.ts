export interface IdentityModel {
  id: string;
}

export interface AuditableModel extends IdentityModel {
  createdAt: string;
  updatedAt: string;
}
