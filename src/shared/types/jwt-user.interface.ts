export interface JwtUser {
  id: number;
  email: string;
  name: string;
  role: string;
  id_company: number;
  driver_id?: number | null;
}
