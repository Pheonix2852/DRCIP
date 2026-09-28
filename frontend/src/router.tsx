import { createHashRouter, createRoutesFromElements, Route } from "react-router-dom";
import { Layout } from "./pages/Layout";
import { PublicLayout } from "./pages/PublicLayout";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import {
  ReportIncidentPage,
  MyIncidentsPage,
  IncidentDetailsPage,
  NotificationsPage,
  ProfilePage,
} from "./pages/pages.shortcuts";
import {
  CoordinatorDashboard,
  FieldOperationsDashboard,
  RAGChatPage,
  AdminDashboard,
  ResourcesPage,
  TeamsPage,
  SheltersPage,
  AssignmentsPage,
  ReportsPage,
  SystemHealthPage,
  AllocateReviewPage,
  TeamStatusPage,
  FieldUpdatePage,
  UsersPage,
  AuditLogPage,
} from "./pages/admin.pages";
import { PrivateRoute, RoleRoute } from "./components";
import { AuthProvider } from "./contexts/AuthContext";

export const router = createHashRouter(
  createRoutesFromElements(
    <>
      {/* Public shell — homepage, login and password reset never render the
          authenticated sidebar/header. */}
      <Route
        path="/"
        element={
          <AuthProvider>
            <PublicLayout />
          </AuthProvider>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
      </Route>

      {/* Authenticated shell — URLs and role boundaries unchanged. */}
      <Route
        path="/"
        element={
          <AuthProvider>
            <Layout />
          </AuthProvider>
        }
      >
        <Route element={<PrivateRoute />}>
          <Route path="report" element={<ReportIncidentPage />} />
          <Route path="incidents" element={<MyIncidentsPage />} />
          <Route path="incidents/:id" element={<IncidentDetailsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<ProfilePage />} />

          <Route element={<RoleRoute allowedRoles={["DISASTER_COORDINATOR", "ADMINISTRATOR"]} />}>
            <Route path="dashboard" element={<CoordinatorDashboard />} />
            <Route path="incidents/:id/review" element={<AllocateReviewPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="shelters" element={<SheltersPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={["ADMINISTRATOR"]} />}>
            <Route path="admin" element={<AdminDashboard />} />
            <Route path="admin/rag" element={<RAGChatPage />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/health" element={<SystemHealthPage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={["DISASTER_COORDINATOR", "ADMINISTRATOR"]} />}>
            <Route path="admin/audit" element={<AuditLogPage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={["FIELD_OFFICER", "DISASTER_COORDINATOR", "ADMINISTRATOR"]} />}>
            <Route path="resources" element={<ResourcesPage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={["FIELD_OFFICER", "DISASTER_COORDINATOR", "ADMINISTRATOR"]} />}>
            <Route path="rag" element={<RAGChatPage />} />
          </Route>

          <Route element={<RoleRoute allowedRoles={["FIELD_OFFICER"]} />}>
            <Route path="field" element={<FieldOperationsDashboard />} />
            <Route path="field/team" element={<TeamStatusPage />} />
            <Route path="field/assignments" element={<AssignmentsPage />} />
            <Route path="field/update" element={<FieldUpdatePage />} />
          </Route>
        </Route>
      </Route>
    </>
  )
);