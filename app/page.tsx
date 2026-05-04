import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listCredentials } from "@/lib/credentials";

export const dynamic = "force-dynamic";

export default async function Home() {
  const items = await listCredentials();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Credentials</h1>
        <Button asChild>
          <Link href="/credentials/new">Add credential</Link>
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">No saved credentials yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((c) => (
            <Link key={c.id} href={`/credentials/${c.id}`}>
              <Card className="hover:bg-accent/50 transition-colors">
                <CardHeader>
                  <CardTitle>{c.label}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <div>{c.username}</div>
                  <div className="mt-1 text-xs">
                    Updated {new Date(c.updatedAt).toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
