import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ReportsPanel from "./ReportsPanel";
import { useAuthStore } from "@/store/auth";

vi.mock("@/api/endpoints", () => ({
  listReports: vi.fn(),
  readReport: vi.fn(),
  exportReport: vi.fn(),
  upgradeReportToDashboard: vi.fn(),
}));

import {
  exportReport,
  listReports,
  readReport,
  upgradeReportToDashboard,
} from "@/api/endpoints";

const report = {
  id: "report-1",
  title: "Food Sales Report",
  question: "Which food sells best?",
  owner: { type: "user", id: "user-1" },
  workspaceId: "ws-1",
  createdAt: "2026-05-03T00:00:00.000Z",
  updatedAt: "2026-05-03T00:00:00.000Z",
  status: "draft" as const,
  datasets: [{ id: "dataset-1", name: "food_sales", previewRows: 5, rowCount: 20 }],
  charts: [{ id: "chart-1", title: "Top items", datasetId: "dataset-1" }],
  sections: [],
  insights: [],
  caveats: [],
  exports: [],
};

const archivedReport = {
  ...report,
  id: "report-2",
  title: "Inventory Report",
  question: "What is low stock?",
  status: "archived" as const,
  datasets: [{ id: "dataset-2", name: "inventory", previewRows: 5, rowCount: 8 }],
  charts: [],
};

describe("ReportsPanel", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    useAuthStore.setState({ token: "test-token", connected: true });
    vi.mocked(listReports).mockResolvedValue({ reports: [report] });
    vi.mocked(readReport).mockResolvedValue({ report });
    vi.mocked(exportReport).mockResolvedValue({
      artifact: {
        path: "/tmp/report.md",
        kind: "markdown",
        createdAt: "2026-05-03T00:00:00.000Z",
      },
    });
    vi.mocked(upgradeReportToDashboard).mockResolvedValue({
      dashboard: {
        id: "dashboard-1",
        title: "Food Dashboard",
        owner: { type: "user", id: "user-1" },
        workspaceId: "ws-1",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:00:00.000Z",
        status: "draft",
        sourceReportId: "report-1",
        datasets: [],
        pages: [],
        filters: [],
        parameters: [],
        interactions: [],
        lifecycle: { version: 1 },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads reports, reads selected report, and builds authenticated iframe src", async () => {
    render(<ReportsPanel onError={() => undefined} />);

    expect(await screen.findByText("Food Sales Report")).toBeInTheDocument();
    expect(screen.getByText(/Which food sells best/)).toBeInTheDocument();
    expect(await screen.findByText("food_sales")).toBeInTheDocument();

    const iframe = screen.getByTitle("Report report-1") as HTMLIFrameElement;
    expect(iframe.src).toContain("/v1/web/reports/report-1/html");
    expect(iframe.src).toContain("token=test-token");
    expect(readReport).toHaveBeenCalledWith("report-1");
  });

  it("exports report and upgrades to dashboard", async () => {
    const onError = vi.fn();
    const onOpenDashboards = vi.fn();
    render(<ReportsPanel onError={onError} onOpenDashboards={onOpenDashboards} />);

    await screen.findByText("food_sales");
    fireEvent.click(screen.getByText("导出 MD"));
    await waitFor(() => expect(exportReport).toHaveBeenCalledWith("report-1", "markdown"));

    fireEvent.click(screen.getByText("升级 Dashboard"));
    await waitFor(() =>
      expect(upgradeReportToDashboard).toHaveBeenCalledWith("report-1", {
        title: "Food Sales Report Dashboard",
      })
    );
    expect(onOpenDashboards).toHaveBeenCalled();
  });

  it("filters reports by search text and status", async () => {
    vi.mocked(listReports).mockResolvedValue({ reports: [report, archivedReport] });
    vi.mocked(readReport).mockImplementation(async (id) => ({
      report: id === "report-2" ? archivedReport : report,
    }));

    render(<ReportsPanel onError={() => undefined} />);

    expect(await screen.findByText("Food Sales Report")).toBeInTheDocument();
    expect(screen.getByText("Inventory Report")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索标题、问题、workspace..."), {
      target: { value: "inventory" },
    });
    expect(screen.queryByText("Food Sales Report")).not.toBeInTheDocument();
    expect(screen.getByText("Inventory Report")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Report status filter"), { target: { value: "draft" } });
    expect(screen.getByText("没有匹配的 Report。试试清空搜索或切换状态筛选。")).toBeInTheDocument();
  });

  it("shows a retryable local error when report list loading fails", async () => {
    const onError = vi.fn();
    vi.mocked(listReports).mockRejectedValue(new Error("offline"));

    render(<ReportsPanel onError={onError} />);

    expect(await screen.findByText("Reports 加载失败：offline")).toBeInTheDocument();
    expect(screen.getByText("重试加载")).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith("Reports 加载失败：offline");
  });
});
