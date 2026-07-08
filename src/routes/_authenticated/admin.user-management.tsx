import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getAdminUsers,
  getAdminUserStats,
  setUserStatus,
  changeUserRole,
  type AdminUser,
  type UserRole,
  type UserStatus,
} from "@/lib/admin.functions";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, ShieldCheck, UserX, UserCheck, Trash2, Pencil, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/user-management")({
  component: UserManagementPage,
});

type FilterValue = "all" | UserStatus | UserRole;

function UserManagementPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(getAdminUsers);
  const statsFn = useServerFn(getAdminUserStats);
  const setStatusFn = useServerFn(setUserStatus);
  const changeRoleFn = useServerFn(changeUserRole);

  const { data: users = [] } = useQuery({ queryKey: ["admin-users"], queryFn: listFn });
  const { data: stats } = useQuery({ queryKey: ["admin-user-stats"], queryFn: statsFn });

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");

  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [roleChoice, setRoleChoice] = useState<UserRole>("player");
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q) {
        const hay = `${u.full_name ?? ""} ${u.email ?? ""} ${u.club ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "all") return true;
      if (["active", "suspended", "deleted"].includes(filter)) return u.status === filter;
      return (u.roles ?? []).includes(filter as UserRole);
    });
  }, [users, search, filter]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-user-stats"] });
  };

  async function doSetStatus(userId: string, status: UserStatus) {
    try {
      await setStatusFn({ data: { userId, status } });
      toast.success(`User ${status === "active" ? "reactivated" : status}`);
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    }
  }

  async function doChangeRole() {
    if (!roleTarget) return;
    try {
      await changeRoleFn({ data: { userId: roleTarget.id, role: roleChoice } });
      toast.success("Role updated");
      setRoleTarget(null);
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not change role");
    }
  }

  return (
    <>
      <PageHeader
        title="User Management"
        subtitle="Search, filter and manage all users"
        action={
          <Link to="/admin" className="rounded-full bg-white/20 p-2 text-white">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
      />
      <main className="mx-auto -mt-4 max-w-md space-y-4 px-5 pb-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Total Users" value={stats?.total ?? 0} />
          <Stat label="Active" value={stats?.active ?? 0} />
          <Stat label="Suspended" value={stats?.suspended ?? 0} />
          <Stat label="Deleted" value={stats?.deleted ?? 0} />
          <Stat label="Coaches" value={stats?.coaches ?? 0} />
          <Stat label="Admins" value={stats?.admins ?? 0} />
          <Stat label="New this month" value={stats?.new_this_month ?? 0} />
          <Stat label="Pending invites" value={stats?.invitations_pending ?? 0} />
        </div>

        {/* Filters */}
        <div className="space-y-2 rounded-2xl bg-card p-4 bt-shadow-elevated">
          <Input
            placeholder="Search name, email or club…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
            <SelectTrigger>
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              <SelectItem value="active">Status: Active</SelectItem>
              <SelectItem value="suspended">Status: Suspended</SelectItem>
              <SelectItem value="deleted">Status: Deleted</SelectItem>
              <SelectItem value="player">Role: Player</SelectItem>
              <SelectItem value="coach">Role: Coach</SelectItem>
              <SelectItem value="admin">Role: Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* User list */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Users ({filtered.length})
          </p>
          {filtered.map((u) => (
            <div key={u.id} className="rounded-2xl bg-card p-4 bt-shadow-elevated">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{u.full_name ?? "—"}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email ?? ""}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.club ?? "No club"}</p>
                </div>
                <StatusPill status={u.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                {(u.roles ?? []).length === 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 uppercase">player</span>
                )}
                {(u.roles ?? []).map((r) => (
                  <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 uppercase text-primary">
                    {r}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>Joined {fmtDate(u.created_at)}</span>
                <span>Last {fmtDate(u.last_sign_in_at)}</span>
              </div>

              {/* Actions */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to="/admin/users/$userId"
                  params={{ userId: u.id }}
                  className="flex items-center justify-center gap-1 rounded-lg bg-secondary px-2 py-1.5 text-xs font-semibold"
                >
                  <Users className="h-3.5 w-3.5" /> View
                </Link>
                <button
                  onClick={() => {
                    setRoleTarget(u);
                    setRoleChoice((u.roles?.[0] as UserRole) ?? "player");
                  }}
                  className="flex items-center justify-center gap-1 rounded-lg bg-secondary px-2 py-1.5 text-xs font-semibold"
                >
                  <Pencil className="h-3.5 w-3.5" /> Change Role
                </button>
                {u.status === "active" ? (
                  <button
                    onClick={() => doSetStatus(u.id, "suspended")}
                    className="flex items-center justify-center gap-1 rounded-lg bg-amber-100 px-2 py-1.5 text-xs font-semibold text-amber-900"
                  >
                    <UserX className="h-3.5 w-3.5" /> Suspend
                  </button>
                ) : (
                  <button
                    onClick={() => doSetStatus(u.id, "active")}
                    className="flex items-center justify-center gap-1 rounded-lg bg-emerald-100 px-2 py-1.5 text-xs font-semibold text-emerald-900"
                  >
                    <UserCheck className="h-3.5 w-3.5" /> Reactivate
                  </button>
                )}
                <button
                  disabled={u.status === "deleted"}
                  onClick={() => setDeleteTarget(u)}
                  className="flex items-center justify-center gap-1 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs font-semibold text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground">
              No users match.
            </p>
          )}
        </div>
      </main>

      {/* Change role dialog */}
      <Dialog open={!!roleTarget} onOpenChange={(o) => !o && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Change Role
            </DialogTitle>
            <DialogDescription>
              {roleTarget?.full_name ?? roleTarget?.email}
            </DialogDescription>
          </DialogHeader>
          <Select value={roleChoice} onValueChange={(v) => setRoleChoice(v as UserRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="player">Player</SelectItem>
              <SelectItem value="coach">Coach</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>Cancel</Button>
            <Button onClick={doChangeRole}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              The account will be marked as <strong>Deleted</strong> and the user can no longer
              sign in. Historical records (BSI, drills, challenges, sessions, coach notes) are
              retained for reporting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return;
                await doSetStatus(deleteTarget.id, "deleted");
                setDeleteTarget(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-card p-3 bt-shadow-elevated">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: UserStatus }) {
  const styles: Record<UserStatus, string> = {
    active: "bg-emerald-100 text-emerald-900",
    suspended: "bg-amber-100 text-amber-900",
    deleted: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}
