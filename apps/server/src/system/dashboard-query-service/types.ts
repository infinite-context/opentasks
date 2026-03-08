import type { DashboardQuery, DashboardSnapshotDto } from "../../shared/dtos";

export interface DashboardQueryService {
  getSnapshot(query?: DashboardQuery): Promise<DashboardSnapshotDto>;
}
