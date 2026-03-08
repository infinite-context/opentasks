import type { DashboardQuery, DashboardSnapshotDto } from "@opentasks/contracts";

export interface DashboardQueryService {
  getSnapshot(query?: DashboardQuery): Promise<DashboardSnapshotDto>;
}
