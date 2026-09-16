import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listClubs, upsertClub } from "@/lib/club.functions";
import { PageHeader } from "@/components/bowls/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Building2, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/clubs/")({
  component: ClubsAdminPage,
});

function ClubsAdminPage() {
  const listClubsFn = useServerFn(listClubs);
  const upsertClubFn = useServerFn(upsertClub);
  const { data: clubs = [], refetch } = useQuery({
    queryKey: ["admin-clubs"],
    queryFn: () => listClubsFn({}),
  });

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [shortName, setShortName] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsertClubFn({ data: { name, slug, shortName } });
    setName("");
    setSlug("");
    setShortName("");
    setIsCreating(false);
    await refetch();
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Managed Clubs" subtitle="White-label branding & membership" />
      <main className="mx-auto max-w-md space-y-4 px-6 py-6">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => setIsCreating((s) => !s)}
        >
          <Plus className="h-4 w-4" />
          {isCreating ? "Cancel" : "Add club"}
        </Button>

        {isCreating && (
          <form onSubmit={handleCreate} className="space-y-3 rounded-2xl bg-card p-4 bt-shadow-card">
            <div>
              <Label htmlFor="club-name">Club name</Label>
              <Input
                id="club-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                }}
                placeholder="Bowls Tauranga South"
                required
              />
            </div>
            <div>
              <Label htmlFor="club-slug">Slug</Label>
              <Input id="club-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="club-short">Short name</Label>
              <Input
                id="club-short"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="BTS"
              />
            </div>
            <Button type="submit" className="w-full">Create club</Button>
          </form>
        )}

        {clubs.length === 0 && (
          <div className="rounded-2xl bg-card p-6 text-center text-muted-foreground">
            No clubs configured yet.
          </div>
        )}

        {clubs.map((club) => (
          <Link
            key={club.id}
            to="/admin/clubs/$clubId"
            params={{ clubId: club.id }}
            className="flex items-center justify-between rounded-2xl bg-card p-4 bt-shadow-card active:scale-[0.99] transition"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display font-bold">{club.name}</p>
                <p className="text-xs text-muted-foreground">{club.slug}</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        ))}
      </main>
    </div>
  );
}
